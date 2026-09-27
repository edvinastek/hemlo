import { format } from 'date-fns'
import { db, getMeta, setMeta } from './db'
import { push } from './sync'
import { blankTask, deleteTask, saveTask } from './tasks'
import { edit } from './write'
import type { PendingChange, Series, SeriesException, Task } from './types'
import { addDays, occurrenceId, plan, ruleFromChoice, seriesBounds, WINDOW_DAYS, type RepeatKind } from './series-rules'

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
      const task = blankTask(profileId, occ.date, {
        id,
        title: s.title,
        series_id: s.id,
        module_key: s.module_key,
        planned_time: hhmm(s.time_of_day),
        category: s.task_template?.category ?? null,
        duration_min: s.task_template?.duration_min ?? null,
        locked: s.task_template?.locked ?? false,
        notes: s.task_template?.notes ?? null,
        ...pick(change, SERIES_FIELDS),
      })
      made.push({ task, fields: everyTaskField(task) })
      days.add(occ.date)
    }
    taken.set(s.id, days)
  }
  await writeTasks(made)
  for (const s of live) await setMeta(throughKey(s.id), to)
  return made.length
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
  const now = new Date().toISOString()
  const rule = ruleFromChoice(choice.kind, start, choice.weekdays, { n: choice.n, dates: choice.dates })
  const fields: Omit<Series, 'id' | 'updated_at'> = {
    profile_id: task.profile_id,
    title: task.title,
    ...rule,
    // Days picked by hand run from the first of them to the last, whatever
    // day the task itself is on.
    ...seriesBounds(rule, start, choice.endDate),
    occurrence_count: null,
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
