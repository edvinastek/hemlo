import { format } from 'date-fns'
import { db, getMeta, setMeta } from './db'
import { push } from './sync'
import { blankTask, deleteTask, saveTask } from './tasks'
import { edit } from './write'
import type { PendingChange, Series, SeriesException, Task } from './types'
import {
  addDays, nextAfterDone, occurrenceId, plan, planRuleChange, ruleFromChoice, seriesBounds, seriesRuleFields, sortAfterRuleChange,
  WINDOW_DAYS, type RepeatKind, type RepeatShape, type RuleFields,
} from './series-rules'
import { looseOf } from './schedule-rules'

/** The fields a series copies onto every task it makes, and the ones "this and
 *  following" carries forward. Date is never among them: moving one day is
 *  always a change to that day alone. */
const TEMPLATE_FIELDS = ['category', 'duration_min', 'locked', 'notes'] as const
const SERIES_FIELDS = ['title', 'planned_time', ...TEMPLATE_FIELDS] as const
type SeriesField = (typeof SERIES_FIELDS)[number]

const dayOf = (d: Date) => format(d, 'yyyy-MM-dd')
/** Postgres hands times back as '07:30:00'; the task rows and the time input use '07:30'. */
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)
/** Where this device has already filled a series up to. See materializeSeries. */
const throughKey = (seriesId: string) => `series-through:${seriesId}`

type Write =
  | { table: 'task'; row: Task; fields: (keyof Task & string)[] }
  | { table: 'series'; row: Series; fields: (keyof Series & string)[] }

/** Many rows at once, sent in one push. queueChange starts a push per call,
 *  and fifty-six pushes racing each other would each try to insert the same
 *  new rows, and all but one would be refused as duplicates. Rows are queued
 *  in the order given, and a push sends them in that order, so a series goes
 *  up before the tasks that point at it. `send: false` leaves the push to a
 *  write that follows straight after. */
async function writeRows(rows: Write[], send = true) {
  if (rows.length === 0) return
  const now = new Date().toISOString()
  const stamped = rows.map((r) => ({ ...r, row: { ...r.row, updated_at: now } }))
  const pending: PendingChange[] = stamped.map((r) => ({
    table: r.table,
    row_id: r.row.id,
    op: 'upsert',
    payload: Object.fromEntries(r.fields.map((f) => [f, (r.row as unknown as Record<string, unknown>)[f]])),
    fields: r.fields,
    changed_at: now,
  }))
  const tasks = stamped.filter((r) => r.table === 'task').map((r) => r.row as Task)
  const series = stamped.filter((r) => r.table === 'series').map((r) => r.row as Series)
  await db.transaction('rw', db.task, db.series, db.pending, async () => {
    if (series.length) await db.series.bulkPut(series)
    if (tasks.length) await db.task.bulkPut(tasks)
    await db.pending.bulkAdd(pending)
  })
  if (send && navigator.onLine) void push()
}

const writeTasks = (rows: { task: Task; fields: (keyof Task & string)[] }[]) =>
  writeRows(rows.map((r) => ({ table: 'task' as const, row: r.task, fields: r.fields })))

const everyTaskField = (t: Task) =>
  (Object.keys(t) as (keyof Task & string)[]).filter((k) => k !== 'id' && k !== 'updated_at')

async function liveExceptions(seriesId: string): Promise<SeriesException[]> {
  const rows = await db.series_exception.where('series_id').equals(seriesId).toArray()
  return rows.filter((e) => !e.deleted_at)
}

async function seriesTasks(seriesId: string, profileId: string): Promise<Task[]> {
  return db.task.where('profile_id').equals(profileId).filter((t) => t.series_id === seriesId).toArray()
}

/** Only one fill runs at a time. It is started after every sync and after a
 *  series is saved, and two running together would both see a day as empty
 *  and both fill it. */
let running: Promise<unknown> = Promise.resolve()

/** Turn every running series into tasks from today to eight weeks ahead.
 *  Returns how many tasks it made.
 *
 *  It never makes a second task for a series and day that already has one,
 *  including a deleted one: deleting an occurrence is how a person skips a
 *  day, and it must not come back on the next sync.
 *
 *  It also never refills a day this device has already filled. A task moved
 *  to another day by some other screen leaves its old day empty, and without
 *  this the old day would get a fresh copy on the next sync. */
export async function materializeSeries(profileId: string, today: Date = new Date()): Promise<number> {
  const next = running.then(() => fill(profileId, dayOf(today)))
  running = next.catch(() => undefined)
  return next
}

async function fill(profileId: string, from: string): Promise<number> {
  const to = addDays(from, WINDOW_DAYS)
  const all = await db.series.where('profile_id').equals(profileId).toArray()
  const live = all.filter((s) => !s.deleted_at && s.active)
  if (live.length === 0) return 0

  // Every day that already has a task, per series, deleted ones included.
  const taken = new Map<string, Set<string>>()
  const tasks = await db.task.where('profile_id').equals(profileId).filter((t) => !!t.series_id).toArray()
  for (const t of tasks) {
    if (!t.planned_date) continue
    const set = taken.get(t.series_id!) ?? new Set<string>()
    set.add(t.planned_date)
    taken.set(t.series_id!, set)
  }

  const made: { task: Task; fields: (keyof Task & string)[] }[] = []
  for (const s of live) {
    const exceptions = await liveExceptions(s.id)
    const through = await getMeta<string | null>(throughKey(s.id), null)
    const days = taken.get(s.id) ?? new Set<string>()
    for (const occ of plan(s, from, to, exceptions)) {
      if (through && occ.base <= through && occ.date <= through) continue
      // A task on the base day means the move has not reached this device yet;
      // leave it for the sync rather than make a second one.
      if (days.has(occ.date) || days.has(occ.base)) continue
      // A row with this day's id already exists when the occurrence was moved
      // somewhere without a move being written down: it is still that day's task.
      const id = await occurrenceId(s.id, occ.base)
      if (await db.task.get(id)) continue
      const change = exceptions.find((e) => e.exception_date === occ.base && e.action === 'change')?.changes ?? {}
      const task = taskOf(s, occ.date, id, pick(change, SERIES_FIELDS))
      made.push({ task, fields: everyTaskField(task) })
      days.add(occ.date)
    }
    taken.set(s.id, days)
  }
  await writeTasks(made)
  for (const s of live) await setMeta(throughKey(s.id), to)
  return made.length
}

/** A series' task for one day, from its template. */
function taskOf(s: Series, day: string, id: string, extra: Partial<Task> = {}): Task {
  return blankTask(s.profile_id, day, {
    id,
    title: s.title,
    series_id: s.id,
    module_key: s.module_key,
    planned_time: hhmm(s.time_of_day),
    category: s.task_template?.category ?? null,
    duration_min: s.task_template?.duration_min ?? null,
    locked: s.task_template?.locked ?? false,
    notes: s.task_template?.notes ?? null,
    ...extra,
  })
}

/** After completion and flexible repeats (GEN-22): ticking a task of such a
 *  series makes the next one, its number of days after the day it was done.
 *  Only one is ever open: nothing is made while another of the series still
 *  waits. The new task takes the shared id of its series and day, so two
 *  phones ticking the same task make one row between them. Returns the task
 *  made, or null. */
export async function followDone(task: Task, doneOn: string = dayOf(new Date())): Promise<Task | null> {
  if (!task.series_id) return null
  const series = await db.series.get(task.series_id)
  if (!series || !looseOf(series)) return null
  const all = await seriesTasks(series.id, series.profile_id)
  if (all.some((t) => t.id !== task.id && !t.deleted_at && t.status !== 'done' && t.status !== 'dropped' && !!t.planned_date)) return null
  const day = nextAfterDone(series, doneOn, all.length)
  if (!day) return null
  const id = await occurrenceId(series.id, day)
  const had = await db.task.get(id)
  if (had && !had.deleted_at) return null
  // Ticked, unticked and ticked again: the same row comes back.
  const next = had ? { ...taskOf(series, day, id), sort_order: had.sort_order } : taskOf(series, day, id)
  await writeTasks([{ task: next, fields: everyTaskField(next) }])
  return next
}

/** The person's flexible series (GEN-22), whose tasks are never late: the
 *  carry-over and the evening review leave them out. */
export async function flexibleSeriesIds(profileId: string): Promise<Set<string>> {
  const rows = await db.series.where('profile_id').equals(profileId).filter((x) => !x.deleted_at).toArray()
  return new Set(rows.filter((x) => looseOf(x)?.mode === 'flexible').map((x) => x.id))
}

/** Unticked again: the next task that the tick made goes, if it is still
 *  open (one already done stays: it happened). `doneOn` is the day the tick
 *  was made. */
export async function unfollowDone(task: Task, doneOn: string): Promise<void> {
  if (!task.series_id) return
  const series = await db.series.get(task.series_id)
  const loose = series ? looseOf(series) : null
  if (!series || !loose) return
  const id = await occurrenceId(series.id, addDays(doneOn, loose.every))
  const next = await db.task.get(id)
  if (next && !next.deleted_at && next.status !== 'done') await deleteTask(next)
}

function pick(from: Record<string, unknown>, keys: readonly string[]): Partial<Task> {
  return Object.fromEntries(Object.entries(from).filter(([k]) => keys.includes(k))) as Partial<Task>
}

export interface RepeatChoice {
  kind: Exclude<RepeatKind, 'never'>
  weekdays: number[]
  endDate: string | null
  /** "Every N days": the N. */
  n?: number
  /** Days picked by hand. */
  dates?: string[]
}

/** Start repeating a task. The task becomes the first occurrence when its day
 *  is one the rule produces. When it is not (a Tuesday task set to repeat on
 *  Mondays and Wednesdays), a new task is not saved on the Tuesday, because
 *  the person asked for Mondays and Wednesdays; an existing task stays where
 *  it was, as a one-off.
 *
 *  `changed` is what the person edited on an existing task; only those fields
 *  (and the link to the series) are sent, so a tick made on another device in
 *  the meantime is not overwritten. A new task is sent whole. */
export async function startSeries(
  task: Task, choice: RepeatChoice, isNew: boolean, changed: (keyof Task & string)[] = [],
): Promise<Series> {
  const start = task.planned_date ?? dayOf(new Date())
  const rule = ruleFromChoice(choice.kind, start, choice.weekdays, { n: choice.n, dates: choice.dates })
  // Days picked by hand run from the first of them to the last, whatever
  // day the task itself is on.
  return startWith(task, { ...rule, ...seriesBounds(rule, start, choice.endDate), occurrence_count: null }, isNew, changed)
}

/** Start repeating a task with a rule from the one repeat control
 *  (RepeatPicker): every kind it offers a task, and "after N times". The
 *  same as startSeries otherwise. Null when the control does not repeat. */
export async function startSeriesWith(
  task: Task, value: RepeatShape, isNew: boolean, changed: (keyof Task & string)[] = [],
): Promise<Series | null> {
  const start = task.planned_date ?? dayOf(new Date())
  const rule = seriesRuleFields(value, start)
  return rule ? startWith(task, rule, isNew, changed) : null
}

async function startWith(task: Task, rule: RuleFields, isNew: boolean, changed: (keyof Task & string)[]): Promise<Series> {
  const start = task.planned_date ?? dayOf(new Date())
  const now = new Date().toISOString()
  const fields: Omit<Series, 'id' | 'updated_at'> = {
    profile_id: task.profile_id,
    title: task.title,
    ...rule,
    time_of_day: hhmm(task.planned_time),
    task_template: {
      category: task.category, duration_min: task.duration_min, locked: task.locked, notes: task.notes,
    },
    module_key: task.module_key,
    active: true,
    deleted_at: null,
  }
  // A new row is sent whole: the sync inserts it because the server has no row with this id.
  const series: Series = { id: crypto.randomUUID(), updated_at: now, ...fields }
  const rows: Write[] = [{ table: 'series', row: series, fields: Object.keys(fields) as (keyof Series & string)[] }]

  const first = plan(series, start, start).length > 0
  if (first) {
    // A new task takes its day's shared id, like every task the fill makes;
    // an existing one keeps its own, since other rows may already point at it.
    const id = isNew ? await occurrenceId(series.id, start) : task.id
    const row: Task = { ...task, id, planned_date: start, series_id: series.id }
    const sent = isNew ? everyTaskField(row) : [...new Set([...changed, 'planned_date', 'series_id'] as (keyof Task & string)[])]
    rows.push({ table: 'task', row, fields: sent })
  } else if (!isNew && changed.length) {
    rows.push({ table: 'task', row: task, fields: changed })
  }
  // The series, its first task and the weeks the fill adds go up in one push.
  // Separate pushes run side by side, and each would try to insert the new
  // series, the second being refused as a duplicate and logged as a conflict.
  await writeRows(rows, false)
  const made = await materializeSeries(task.profile_id)
  if (made === 0 && navigator.onLine) void push()
  return series
}

/** The fields the person changed that a series carries. */
export function seriesChanges(before: Task, after: Task): SeriesField[] {
  return SERIES_FIELDS.filter((f) => (f === 'planned_time' ? hhmm(before[f]) !== hhmm(after[f]) : before[f] !== after[f]))
}

/** The day a series occurrence was made for, which is its planned day unless
 *  it was moved. The move is recorded against the original day, so moving it
 *  twice updates the one record rather than leaving two. */
async function baseDayOf(task: Task): Promise<string | null> {
  if (!task.series_id || !task.planned_date) return null
  const moved = (await liveExceptions(task.series_id))
    .find((e) => e.action === 'move' && e.moved_to === task.planned_date)
  return moved ? moved.exception_date : task.planned_date
}

/** Record that one occurrence now lives on another day, or on none. The
 *  server allows one exception per series and day, deleted or not, so an
 *  earlier row for that day is reused rather than a second one made. */
async function recordMove(seriesId: string, base: string, to: string | null) {
  // An exception for a series this device does not hold would be refused by
  // the server's reference to it, and there is nothing here for it to steer.
  const series = await db.series.get(seriesId)
  if (!series || series.deleted_at) return
  const existing = await db.series_exception.where('[series_id+exception_date]').equals([seriesId, base]).first()
  if (to === base) {
    if (existing && !existing.deleted_at) await edit('series_exception', existing, { deleted_at: new Date().toISOString() })
    return
  }
  const changes: Partial<SeriesException> = {
    series_id: seriesId, exception_date: base,
    action: to ? 'move' : 'skip', moved_to: to, changes: existing?.changes ?? {}, deleted_at: null,
  }
  await edit<SeriesException>('series_exception',
    existing ?? ({ id: crypto.randomUUID(), updated_at: new Date().toISOString() } as SeriesException), changes)
}

/** "Only this one": the task changes, the series does not. A new day is
 *  written down as a move, so the old day is not filled again later. */
export async function editOccurrence(before: Task, after: Task, fields: (keyof Task & string)[]) {
  if (after.series_id && before.planned_date !== after.planned_date) {
    const base = await baseDayOf(before)
    if (base) await recordMove(after.series_id, base, after.planned_date)
  }
  await saveTask(after, fields)
}

/** Delete one day of a series. The task row stays, marked deleted, which is
 *  enough for this device. A skip is also written down against the series,
 *  because the series and its exceptions are what another device fills from:
 *  one that has not pulled this deletion yet must not fill the day again. */
export async function deleteOccurrence(task: Task) {
  const base = await baseDayOf(task)
  if (task.series_id && base) await recordMove(task.series_id, base, null)
  await deleteTask(task)
}

/** "This and following": the series takes the change, and so does every
 *  occurrence from this one on that is not done. Only the fields the person
 *  changed are carried, so a note added to one later day by hand survives a
 *  new title. A new day still applies to this occurrence alone. */
export async function editFollowing(before: Task, after: Task, fields: (keyof Task & string)[]) {
  const series = after.series_id ? await db.series.get(after.series_id) : undefined
  if (!series) return editOccurrence(before, after, fields)

  const changed = seriesChanges(before, after)
  if (changed.length) {
    const patch: Partial<Series> = {}
    if (changed.includes('title')) patch.title = after.title
    if (changed.includes('planned_time')) patch.time_of_day = hhmm(after.planned_time)
    const template = { ...series.task_template }
    let templateChanged = false
    for (const f of TEMPLATE_FIELDS) {
      if (changed.includes(f)) { (template as Record<string, unknown>)[f] = after[f]; templateChanged = true }
    }
    if (templateChanged) patch.task_template = template
    await edit('series', series, patch)

    const from = before.planned_date ?? dayOf(new Date())
    const later = (await seriesTasks(series.id, series.profile_id)).filter((t) =>
      t.id !== after.id && !t.deleted_at && t.status !== 'done' && !!t.planned_date && t.planned_date >= from)
    await writeTasks(later.map((t) => ({ task: { ...t, ...pick(after as unknown as Record<string, unknown>, changed) }, fields: [...changed] })))
  }
  await editOccurrence(before, after, fields)
}

/** How many occurrences Stop repeating would remove, to say so before it does. */
export async function upcomingCount(series: Series, today: Date = new Date()): Promise<number> {
  const day = dayOf(today)
  return (await seriesTasks(series.id, series.profile_id))
    .filter((t) => !t.deleted_at && t.status !== 'done' && !!t.planned_date && t.planned_date > day).length
}

/** End the series today. Today's occurrence stays, done or not; every later
 *  one that is not done is deleted. Done ones are kept: they happened. */
export async function stopSeries(series: Series, today: Date = new Date()) {
  const day = dayOf(today)
  await edit('series', series, { end_date: day })
  const now = new Date().toISOString()
  const later = (await seriesTasks(series.id, series.profile_id))
    .filter((t) => !t.deleted_at && t.status !== 'done' && !!t.planned_date && t.planned_date > day)
  await writeTasks(later.map((t) => ({ task: { ...t, deleted_at: now }, fields: ['deleted_at'] })))
}

/** Move tasks to other days, each keeping its time: Plan's week, when two
 *  days are swapped or one task is moved, and the Inbox (a day of null is
 *  no day: the task goes to the Inbox, PLN-07). A repeating task is moved for that
 *  day alone, written down against its series as a move, the same as
 *  changing its day on its sheet.
 *
 *  Every task's original day is worked out before anything is written. A
 *  swap moves one day's occurrence onto the day another is leaving, and once
 *  the first move is written the second would be taken for the first. The
 *  tasks go up in one push. */
export async function moveToDays(moves: { task: Task; to: string | null }[]) {
  const todo = moves.filter((m) => m.task.planned_date !== m.to)
  const bases = await Promise.all(todo.map((m) => baseDayOf(m.task)))
  for (let i = 0; i < todo.length; i++) {
    const { task, to } = todo[i]
    if (task.series_id && bases[i]) await recordMove(task.series_id, bases[i]!, to)
  }
  await writeTasks(todo.map((m) => ({ task: { ...m.task, planned_date: m.to }, fields: ['planned_date'] })))
}

/** Moves with a way back: the same moves, then an undo that puts every
 *  task back on the day it came from (GEN-54). */
export async function moveWithUndo(moves: { task: Task; to: string | null }[]): Promise<() => Promise<void>> {
  const todo = moves.filter((m) => m.task.planned_date !== m.to)
  await moveToDays(todo)
  return async () => {
    const now = await db.task.bulkGet(todo.map((m) => m.task.id))
    await moveToDays(todo.map((m, i) => ({ task: now[i] ?? { ...m.task, planned_date: m.to }, to: m.task.planned_date })))
  }
}

/** Delete several tasks at once (one day of a series each, for a repeating
 *  one, written down as a skip as deleteOccurrence does). Returns an undo
 *  that brings every one back where it was, and the series day with it. */
export async function deleteTasks(tasks: Task[]): Promise<() => Promise<void>> {
  const live = tasks.filter((t) => !t.deleted_at)
  const bases = await Promise.all(live.map((t) => baseDayOf(t)))
  for (let i = 0; i < live.length; i++) {
    const t = live[i]
    if (t.series_id && bases[i]) await recordMove(t.series_id, bases[i]!, null)
  }
  const now = new Date().toISOString()
  await writeTasks(live.map((t) => ({ task: { ...t, deleted_at: now }, fields: ['deleted_at'] })))
  return async () => {
    for (let i = 0; i < live.length; i++) {
      const t = live[i]
      if (t.series_id && bases[i]) await recordMove(t.series_id, bases[i]!, t.planned_date)
    }
    const rows = await db.task.bulkGet(live.map((t) => t.id))
    await writeTasks(live.map((t, i) => ({ task: { ...(rows[i] ?? t), deleted_at: null }, fields: ['deleted_at'] })))
  }
}

/** New tasks written in one push (a copy, a template dropped on a day). */
export async function addTasks(tasks: Task[]) {
  await writeTasks(tasks.map((t) => ({ task: t, fields: everyTaskField(t) })))
}

/** Change the rule of a running series without stopping it (GEN-23).
 *
 *  `before` is the day's task as it was, `after` as the sheet now has it
 *  (other changes, such as a new title, go along as "this and following"
 *  would take them). `scope`:
 *  - 'all': the series keeps its start and takes the new rule; every day
 *    still to come that the new rule does not land on loses its task, the
 *    ones it does keep theirs, and the gaps are filled.
 *  - 'following': the series ends the day before this one, and a new series
 *    with the new rule carries on from this day, this task its first day.
 *  Done tasks are never touched: they happened. */
export async function changeSeriesRule(
  before: Task, after: Task, fields: (keyof Task & string)[], value: RepeatShape, scope: 'all' | 'following',
  today: Date = new Date(),
) {
  const series = after.series_id ? await db.series.get(after.series_id) : undefined
  if (!series) return editOccurrence(before, after, fields)
  const day = dayOf(today)
  const base = (await baseDayOf(before)) ?? before.planned_date ?? day
  const changed = seriesChanges(before, after)
  const carry = pick(after as unknown as Record<string, unknown>, changed)
  const template = { ...series.task_template }
  for (const f of TEMPLATE_FIELDS) if (changed.includes(f)) (template as Record<string, unknown>)[f] = after[f]
  const named: Partial<Series> = {
    ...(changed.includes('title') ? { title: after.title } : {}),
    ...(changed.includes('planned_time') ? { time_of_day: hhmm(after.planned_time) } : {}),
    task_template: template,
  }
  const { split, oldEnd } = planRuleChange(series.start_date, base, scope)
  const exceptions = await liveExceptions(series.id)
  const baseOf = (t: Task) => exceptions.find((e) => e.action === 'move' && e.moved_to === t.planned_date)?.exception_date ?? t.planned_date
  const others = (await seriesTasks(series.id, series.profile_id))
    .filter((t) => t.id !== after.id && !t.deleted_at && !!t.planned_date)
  const now = new Date().toISOString()

  if (!split) {
    const rule = seriesRuleFields(value, series.start_date)
    if (!rule) return
    const patch: Partial<Series> = { ...named, ...rule, start_date: rule.rule === 'dates' ? rule.start_date : series.start_date }
    const next = await edit('series', series, patch)
    const from = day
    const { keep, drop } = sortAfterRuleChange(next, others.map((t) => ({ id: t.id, base: baseOf(t)!, done: t.status === 'done' })), from)
    const rows: { task: Task; fields: (keyof Task & string)[] }[] = []
    for (const t of others) {
      if (drop.includes(t.id)) rows.push({ task: { ...t, deleted_at: now }, fields: ['deleted_at'] })
      else if (keep.includes(t.id) && changed.length) rows.push({ task: { ...t, ...carry }, fields: [...changed] })
    }
    // This day itself: if the new rule no longer lands on it, it stays
    // where it is, as a one-off, rather than vanish under the person's eyes.
    // Under "after" or "flexible" it is the one open time of the series.
    const own = !!looseOf(next) || sortAfterRuleChange(next, [{ id: after.id, base, done: false }], base).keep.length > 0
    const self: Task = own ? after : { ...after, series_id: null }
    rows.push({ task: self, fields: [...new Set([...fields, ...(own ? [] : ['series_id' as const])])] })
    await writeTasks(rows)
    // The fill must look at every day again, from today, under the new rule.
    await setMeta(throughKey(series.id), null)
    await materializeSeries(series.profile_id)
    return
  }

  // "This and following": the old series stops the day before.
  await edit('series', series, { end_date: oldEnd })
  const later = others.filter((t) => t.status !== 'done' && ((t.planned_date ?? '') >= base || (baseOf(t) ?? '') >= base))
  const start = after.planned_date ?? base
  const rule = seriesRuleFields(value, start)
  if (!rule) return
  const fresh: Series = {
    ...series, ...named, ...rule,
    id: crypto.randomUUID(), updated_at: now, active: true, deleted_at: null,
  }
  const own = plan(fresh, start, start).length > 0
  const self: Task = { ...after, series_id: own ? fresh.id : null }
  const sent = Object.keys(fresh).filter((k) => k !== 'id' && k !== 'updated_at') as (keyof Series & string)[]
  await writeRows([
    { table: 'series', row: fresh, fields: sent },
    ...later.map((t) => ({ table: 'task' as const, row: { ...t, deleted_at: now }, fields: ['deleted_at'] as (keyof Task & string)[] })),
    { table: 'task', row: self, fields: [...new Set([...fields, 'series_id' as const])] },
  ], false)
  const made = await materializeSeries(series.profile_id)
  if (made === 0 && navigator.onLine) void push()
}

/** "Change repeat" on several tasks at once (GEN-53). A task without a day
 *  cannot repeat and is left as it is. A one-off starts a series from its
 *  own day; a task in a series changes that whole series (as "all days" on
 *  its sheet: what is past or done stays), once per series however many of
 *  its days were picked; "does not repeat" stops a series today. */
export async function repeatMany(tasks: Task[], value: RepeatShape, today: Date = new Date()): Promise<{ changed: number; noDay: number }> {
  let changed = 0
  let noDay = 0
  const seen = new Set<string>()
  for (const t of tasks) {
    if (!t.planned_date) { noDay++; continue }
    const now = (await db.task.get(t.id)) ?? t
    if (now.series_id) {
      // One change per series, however many of its days were picked.
      if (seen.has(now.series_id)) { changed++; continue }
      seen.add(now.series_id)
      const series = await db.series.get(now.series_id)
      if (series && !series.deleted_at) {
        if (!value.rule) await stopSeries(series, today)
        else await changeSeriesRule(now, now, [], value, 'all', today)
        changed++
        continue
      }
    }
    if (!value.rule) continue
    if (await startSeriesWith(now, value, false, [])) changed++
  }
  return { changed, noDay }
}
