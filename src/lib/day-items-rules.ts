/** Everything that belongs on a day, from every module, as one list
 *  (GEN-04): tasks, due habits, chores, supplement slots, the person's own
 *  events, events of calendars they follow, and dated records of modules
 *  that keep them. Today and Plan both draw this list, so they can never
 *  disagree about what a day holds. Pure: rows in, items out. */
import { habitDay, habitSchedule, choreState, choreAssignee, describeChore, describeSchedule, occursOn, addDays, type HabitDay } from './schedule-rules.ts'
import { moduleView, type ModuleView } from './module-view-rules.ts'
import { checklistProgress } from './notes.ts'
import type { Task, Habit, HabitLog, Chore, ChoreLog, Supplement, SupplementLog, CalendarEvent, ModuleRecord } from './types'
// Habits, chores and supplements (engineer B): the person's supplement slots
// and schedules, flexible chores held back on light days or past a cap, and a
// habit's part of the day.
import { supplementGroups, DEFAULT_SLOTS, habitWhen, type SupplementSlotDef } from './tracking-rules.ts'
import { heldBack, type ChorePrefs } from './chore-rules.ts'

export type DayItemKind = 'task' | 'habit' | 'chore' | 'supplements' | 'event' | 'record'

export interface DayItem {
  /** Unique within a range: kind, id and day. */
  key: string
  kind: DayItemKind
  day: string
  /** 'HH:MM', or null for "any time". */
  time: string | null
  minutes: number | null
  title: string
  /** The module it belongs to, for its colour, its switches and its tab. */
  module_key: string | null
  done: boolean
  /** A habit's or chore's standing that day. */
  state: HabitDay | 'overdue' | null
  /** One line under the title: schedule, progress, who, where. */
  meta: string
  /** The row behind it, to tick, open or edit. */
  ref: { table: string; id: string }
  /** Read-only on the planner (a followed calendar's event). */
  readonly: boolean
  task?: Task
  /** The note pinned to a habit or chore, to show when expanded. */
  note?: string | null
  /** A supplement slot's items, each with its tick. */
  parts?: { id: string; name: string; dose: string | null; done: boolean }[]
  /** Chores: days overdue, how due a flexible one is, who it goes to. */
  overdueDays?: number
  dueness?: number
  assignees?: string[]
  /** A habit's count to reach and how far it got. */
  target?: number | null
  amount?: number | null
  unit?: string | null
  /** A habit's pinned checklist: which lines were ticked that day, by their
   *  index among the checklist items. */
  checks?: number[]
  /** An event that fills the day (all day, or the middle days of a long
   *  one): it sits at the very top of the day. */
  allDay?: boolean
  /** A followed calendar's colour, for its event's mark. */
  colour?: string | null
}

export type Where = 'today' | 'plan' | 'widget'

export interface DayItemSources {
  /** The person's today: days after it show chores where they are expected
   *  to fall, not as overdue. */
  today: string
  enabled: string[]
  views: Record<string, Partial<ModuleView>>
  tasks: Task[]
  habits: Habit[]
  habitLogs: HabitLog[]
  chores: Chore[]
  choreLogs: ChoreLog[]
  supplements: Supplement[]
  supplementLogs: SupplementLog[]
  /** The person's own events and those of calendars they follow. */
  events: (CalendarEvent & { calendar_name?: string | null; calendar_colour?: string | null })[]
  records: ModuleRecord[]
  /** Module key to its record's title field, for dated records. */
  recordTitle?: (r: ModuleRecord) => string
  /** Household member id to their name, for chores. */
  memberName?: (id: string) => string
  /** The person's supplement slots (default Morning, Midday, Evening). */
  supplementSlots?: SupplementSlotDef[]
  /** Light days and a daily cap for flexible chores. */
  chorePrefs?: ChorePrefs
}

/** Section to module, the same mapping the colours use. */
const SECTION_MODULE: Record<string, string> = {
  Work: 'work', Meal: 'nutrition', Training: 'training', Learning: 'learning', Home: 'household', Body: 'health', Night: 'evening',
}
export const taskModule = (t: Pick<Task, 'module_key' | 'category'>): string | null =>
  t.module_key ?? (t.category ? SECTION_MODULE[t.category] ?? null : null)

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)
/** The person's slots in their order, then the slot-less ones. */
const slotRank = (slot: string, order: readonly string[]) => { const i = order.indexOf(slot); return i === -1 ? order.length : i }

/** Is a module allowed here? Off modules never show (GEN-01); on ones
 *  follow the person's switch for this place (GEN-03). Tasks of no module,
 *  and work, evening and core, always show: they are the planner itself. */
export function shows(moduleKey: string | null, where: Where, s: Pick<DayItemSources, 'enabled' | 'views'>): boolean {
  if (!moduleKey || moduleKey === 'work' || moduleKey === 'evening' || moduleKey === 'core') return true
  if (!s.enabled.includes(moduleKey)) return false
  return moduleView(s.views, moduleKey)[where === 'widget' ? 'widget' : where]
}

/** The items for each day from `from` to `to` (both included), in the order a
 *  day is read: timed items by time, then the rest. */
export function dayItems(days: string[], where: Where, s: DayItemSources): DayItem[] {
  const out: DayItem[] = []
  // One log decides each habit's day: the newest, as the writers keep it.
  // Logs that are not done still count: they carry a count habit's "3 of 8"
  // and a checklist's ticks.
  const logByHabitDay = new Map<string, HabitLog>()
  for (const l of s.habitLogs) {
    const k = `${l.habit_id}|${l.log_date}`
    const had = logByHabitDay.get(k)
    if (!had || l.updated_at > had.updated_at) logByHabitDay.set(k, l)
  }
  const doneByHabit = new Map<string, Set<string>>()
  for (const l of logByHabitDay.values()) {
    if (!l.done) continue
    const set = doneByHabit.get(l.habit_id) ?? new Set<string>()
    set.add(l.log_date)
    doneByHabit.set(l.habit_id, set)
  }
  const choreLogs = new Map<string, ChoreLog[]>()
  for (const l of s.choreLogs) {
    if (l.deleted_at) continue
    choreLogs.set(l.chore_id, [...(choreLogs.get(l.chore_id) ?? []), l])
  }
  const suppDone = new Set(s.supplementLogs.filter((l) => l.done).map((l) => `${l.supplement_id}|${l.log_date}`))
  const taskRecordRefs = new Set(s.tasks.filter((t) => t.source === 'module' && t.source_ref).map((t) => t.source_ref as string))

  for (const day of days) {
    for (const t of s.tasks) {
      if (t.deleted_at || t.planned_date !== day) continue
      const mk = taskModule(t)
      if (!shows(mk, where, s)) continue
      out.push({
        key: `task:${t.id}:${day}`, kind: 'task', day, time: hhmm(t.planned_time), minutes: t.duration_min,
        title: t.title, module_key: mk, done: t.status === 'done', state: null, meta: '',
        ref: { table: 'task', id: t.id }, readonly: false, task: t, note: t.notes,
      })
    }
    if (shows('habits', where, s)) {
      for (const h of s.habits) {
        if (h.deleted_at || !h.active) continue
        const doneDays = doneByHabit.get(h.id) ?? new Set<string>()
        const state = habitDay(h, day, doneDays)
        if (state === 'off') continue
        const log = logByHabitDay.get(`${h.id}|${day}`)
        out.push({
          key: `habit:${h.id}:${day}`, kind: 'habit', day, time: hhmm(h.time_of_day), minutes: null,
          title: h.name, module_key: 'habits', done: state === 'done' || state === 'met', state,
          meta: [describeSchedule(habitSchedule(h)), !h.time_of_day && habitWhen(h).label !== 'Any time' ? habitWhen(h).label : '',
            state === 'met' ? 'done this week' : ''].filter(Boolean).join(' · '),
          ref: { table: 'habit', id: h.id }, readonly: false, note: h.note ?? null,
          target: h.target ?? null, amount: log?.amount ?? null, unit: h.unit ?? null,
          checks: log?.checks ?? [],
        })
      }
    }
    if (shows('household', where, s)) {
      const choreItems: DayItem[] = []
      const modes = new Map(s.chores.map((c) => [c.id, c.mode]))
      for (const c of s.chores) {
        if (c.deleted_at) continue
        const logs = choreLogs.get(c.id) ?? []
        let st = choreState(c, day, logs)
        if (day > s.today) {
          // Ahead of today: where it is expected to fall, nothing overdue.
          const now = choreState(c, s.today, logs)
          const expected = c.mode === 'fixed'
            ? !!c.rule && !c.paused && occursOn({ rule: c.rule, rule_config: c.rule_config ?? {}, start_date: c.start_date ?? s.today, end_date: c.end_date }, day)
            : now.next === day
          st = { ...st, shows: expected, doneToday: false, overdueDays: 0 }
        }
        if (!st.shows) continue
        const who = choreAssignee(c, day, logs).map((id) => s.memberName?.(id) ?? '').filter(Boolean)
        const overdue = st.overdueDays > 0 ? `${st.overdueDays} ${st.overdueDays === 1 ? 'day' : 'days'} waiting` : ''
        choreItems.push({
          key: `chore:${c.id}:${day}`, kind: 'chore', day, time: hhmm(c.time_of_day), minutes: c.minutes,
          title: c.name, module_key: 'household', done: st.doneToday, state: st.overdueDays > 0 ? 'overdue' : (st.doneToday ? 'done' : 'due'),
          meta: [c.room, describeChore(c), overdue, who.join(', ')].filter(Boolean).join(' · '),
          ref: { table: 'chore', id: c.id }, readonly: false, note: c.note,
          overdueDays: st.overdueDays, dueness: st.dueness, assignees: who,
        })
      }
      // Flexible chores wait on a light day, and past the day's cap only the
      // most due are kept (HSE-09).
      const held = s.chorePrefs ? heldBack(choreItems.map((i) => ({ id: i.ref.id, mode: modes.get(i.ref.id) ?? 'fixed', dueness: i.dueness ?? 0, doneToday: i.done })), day, s.chorePrefs) : new Set<string>()
      out.push(...choreItems.filter((i) => !held.has(i.ref.id)))
    }
    if (shows('supplements', where, s)) {
      // The person's own slots, each at its time; only what is due that day.
      for (const g of supplementGroups(s.supplements, s.supplementSlots ?? DEFAULT_SLOTS, day)) {
        const parts = g.rows.map((x) => ({ id: x.id, name: x.name, dose: x.dose_text, done: suppDone.has(`${x.id}|${day}`) }))
        const n = parts.filter((p) => p.done).length
        const key = g.slot?.key ?? 'any'
        out.push({
          key: `supplements:${key}:${day}`, kind: 'supplements', day, time: g.slot?.time ?? null, minutes: null,
          title: `${g.label} supplements`, module_key: 'supplements',
          done: n === parts.length, state: null, meta: `${n} of ${parts.length}`,
          ref: { table: 'supplement', id: key }, readonly: false, parts,
        })
      }
    }
    for (const e of s.events) {
      if (e.deleted_at) continue
      const followed = !!e.subscription_id
      if (!shows(followed ? null : 'agenda', where, s)) continue
      const span = eventDays(e)
      if (!span || day < span.first || day > span.last) continue
      // Its own clock time on its first day; on the days after, a long event
      // fills the day and sits at the top with the all-day ones.
      const allDay = e.all_day || day !== span.first
      const time = allDay ? null : span.time
      let minutes: number | null = null
      if (!allDay && e.ends_at) minutes = Math.max(0, Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000))
      out.push({
        key: `event:${e.id}:${day}`, kind: 'event', day, time, minutes, title: e.title,
        module_key: followed ? null : 'agenda', done: false, state: null,
        meta: [allDay ? 'All day' : '', e.location, followed ? e.calendar_name ?? 'Followed calendar' : ''].filter(Boolean).join(' · '),
        ref: { table: 'calendar_event', id: e.id }, readonly: followed,
        allDay, colour: followed ? e.calendar_colour ?? null : null,
      })
    }
    for (const r of s.records) {
      if (r.deleted_at || r.record_date !== day || taskRecordRefs.has(r.id)) continue
      if (!shows(r.module_key, where, s)) continue
      out.push({
        key: `record:${r.id}:${day}`, kind: 'record', day, time: null, minutes: null,
        title: s.recordTitle?.(r) ?? r.module_key, module_key: r.module_key, done: false, state: null, meta: '',
        ref: { table: 'module_record', id: r.id }, readonly: false,
      })
    }
  }
  const kindOrder: Record<DayItemKind, number> = { event: 0, task: 1, habit: 2, chore: 3, supplements: 4, record: 5 }
  const slotOrder = (s.supplementSlots ?? DEFAULT_SLOTS).map((x) => x.key)
  return out.sort((a, b) => a.day.localeCompare(b.day)
    || Number(!!b.allDay) - Number(!!a.allDay)
    || (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
    || kindOrder[a.kind] - kindOrder[b.kind]
    || (a.task && b.task ? a.task.sort_order - b.task.sort_order : 0)
    || (a.kind === 'supplements' && b.kind === 'supplements' ? slotRank(a.ref.id, slotOrder) - slotRank(b.ref.id, slotOrder) : 0)
    || a.title.localeCompare(b.title))
}

/** Unfinished tasks from before the day, newest first, for Today's carry-over
 *  row. Dropped, locked and meal tasks stay out, as in the evening review. */
export function carryOver(tasks: Task[], day: string): Task[] {
  return tasks
    .filter((t) => !t.deleted_at && t.planned_date && t.planned_date < day && t.status !== 'done' && t.status !== 'dropped'
      && !t.locked && t.source !== 'meal')
    .sort((a, b) => (b.planned_date ?? '').localeCompare(a.planned_date ?? '') || (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99'))
}

/** Tasks without a day: the Inbox (PLN-07). */
export const inbox = (tasks: Task[]) =>
  tasks.filter((t) => !t.deleted_at && !t.planned_date && t.status !== 'done' && t.status !== 'dropped')
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))

/* ---------- the rail: how a day's items are laid out (TOD-02, PLN-02) ---------- */

const pad2 = (n: number) => String(n).padStart(2, '0')

/** A stored moment ('2026-10-03T07:30:00.000Z') as the phone's own day and
 *  clock time. Events are kept in UTC; the person lives in local time, so an
 *  event at 00:30 in Amsterdam belongs to that night, not the day before. */
export function localParts(iso: string): { day: string; time: string } | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return {
    day: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  }
}

/** The local days an event covers, first to last, and its starting time.
 *  An all-day event's end day is part of it (as the calendar readers keep
 *  it); a timed event that ends at midnight does not reach the next day. */
export function eventDays(e: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>): { first: string; last: string; time: string } | null {
  const start = localParts(e.starts_at)
  if (!start) return null
  const end = e.ends_at ? localParts(e.ends_at) : null
  let last = start.day
  if (end && end.day > start.day) {
    last = !e.all_day && end.time === '00:00' ? addDays(end.day, -1) : end.day
  }
  // A broken end, or one before the start, is just the first day.
  if (last < start.day) last = start.day
  return { first: start.day, last, time: start.time }
}

/** How the person reads a day: one timeline by the clock, or grouped into
 *  morning, afternoon and evening. Either way the all-day events come
 *  first and the untimed things last, in "Any time". */
export type RailLayout = 'time' | 'parts'

export interface RailGroup {
  key: 'allday' | 'timed' | 'morning' | 'afternoon' | 'evening' | 'any'
  /** The heading over the group; the plain timeline has none. */
  label: string | null
  items: DayItem[]
}

/** Noon and six o'clock split the day; six matches the Evening tab. */
export const PART_EDGES = { afternoon: '12:00', evening: '18:00' }

function partOf(time: string): 'morning' | 'afternoon' | 'evening' {
  return time < PART_EDGES.afternoon ? 'morning' : time < PART_EDGES.evening ? 'afternoon' : 'evening'
}

/** A supplement slot belongs to its part of the day when the day is shown in
 *  parts: the morning ones in the morning, the evening ones in the evening. */
function slotPart(item: DayItem): 'morning' | 'afternoon' | 'evening' | null {
  if (item.kind !== 'supplements') return null
  const slot = item.ref.id
  return slot === 'morning' ? 'morning' : slot === 'midday' ? 'afternoon' : slot === 'evening' ? 'evening' : null
}

/** The day's items in groups, in the order they are read. Empty groups are
 *  left out. The order inside a group is the order dayItems gave. */
export function railGroups(items: DayItem[], layout: RailLayout): RailGroup[] {
  const allday = items.filter((i) => i.allDay)
  const rest = items.filter((i) => !i.allDay)
  const groups: RailGroup[] = [{ key: 'allday', label: 'All day', items: allday }]
  if (layout === 'time') {
    groups.push(
      { key: 'timed', label: null, items: rest.filter((i) => i.time) },
      { key: 'any', label: 'Any time', items: rest.filter((i) => !i.time) },
    )
  } else {
    const where = (i: DayItem) => (i.time ? partOf(i.time) : slotPart(i) ?? 'any')
    groups.push(
      { key: 'morning', label: 'Morning', items: rest.filter((i) => where(i) === 'morning') },
      { key: 'afternoon', label: 'Afternoon', items: rest.filter((i) => where(i) === 'afternoon') },
      { key: 'evening', label: 'Evening', items: rest.filter((i) => where(i) === 'evening') },
      { key: 'any', label: 'Any time', items: rest.filter((i) => where(i) === 'any') },
    )
  }
  return groups.filter((g) => g.items.length > 0)
}

/** Where the "now" line goes in a group: before the first timed item that
 *  starts after the clock, or after the last one (its length); null when the
 *  group has no times. */
export function nowSlot(items: DayItem[], now: string): number | null {
  const timed = items.map((i, k) => ({ i, k })).filter(({ i }) => i.time)
  if (timed.length === 0) return null
  const next = timed.find(({ i }) => (i.time as string) > now)
  return next ? next.k : timed[timed.length - 1].k + 1
}

/* ---------- ticking inside an expanded row (TOD-12, TOD-13) --------------- */

/** Did this tick finish the checklist? Only a tick that adds the last one
 *  counts: unticking, or a list that was already complete, asks nothing. */
export function finishedChecklist(before: { done: number; total: number }, after: { done: number; total: number }): boolean {
  return after.total > 0 && after.done === after.total && after.done > before.done
}

/** For a task: the note before and after one tick. */
export function noteFinished(before: string | null | undefined, after: string | null | undefined): boolean {
  return finishedChecklist(checklistProgress(before), checklistProgress(after))
}

/** A habit's pinned checklist for one day: the items of the note (in order)
 *  ticked by that day's log, not by the note itself, which is the same every
 *  day. */
export function habitChecklistCount(note: string | null | undefined): number {
  return checklistProgress(note).total
}

/** The day's ticks with one item flipped, kept sorted and inside the list. */
export function flipCheck(checks: number[], index: number, total: number): number[] {
  const set = new Set(checks.filter((n) => Number.isInteger(n) && n >= 0 && n < total))
  if (set.has(index)) set.delete(index)
  else if (index >= 0 && index < total) set.add(index)
  return [...set].sort((a, b) => a - b)
}

/** A supplement slot's one tick: everything not yet taken is ticked; when
 *  all were taken, all are unticked again. The ids to flip. */
export function slotFlips(parts: { id: string; done: boolean }[]): string[] {
  const open = parts.filter((p) => !p.done)
  return (open.length ? open : parts).map((p) => p.id)
}
