/** Everything that belongs on a day, from every module, as one list
 *  (GEN-04): tasks, due habits, chores, supplement slots, the person's own
 *  events, events of calendars they follow, and dated records of modules
 *  that keep them. Today and Plan both draw this list, so they can never
 *  disagree about what a day holds. Pure: rows in, items out. */
import { habitDay, habitSchedule, choreState, choreAssignee, describeChore, describeSchedule, occursOn, type HabitDay } from './schedule-rules.ts'
import { moduleView, type ModuleView } from './module-view-rules.ts'
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
  events: (CalendarEvent & { calendar_name?: string | null })[]
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
  const doneByHabit = new Map<string, Set<string>>()
  const logByHabitDay = new Map<string, HabitLog>()
  for (const l of s.habitLogs) {
    if (!l.done) continue
    const set = doneByHabit.get(l.habit_id) ?? new Set<string>()
    set.add(l.log_date)
    doneByHabit.set(l.habit_id, set)
    logByHabitDay.set(`${l.habit_id}|${l.log_date}`, l)
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
      const startDay = e.starts_at.slice(0, 10)
      const endDay = (e.ends_at ?? e.starts_at).slice(0, 10)
      if (day < startDay || day > endDay) continue
      const time = e.all_day || day !== startDay ? null : e.starts_at.slice(11, 16)
      let minutes: number | null = null
      if (!e.all_day && e.ends_at) minutes = Math.max(0, Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000))
      out.push({
        key: `event:${e.id}:${day}`, kind: 'event', day, time, minutes, title: e.title,
        module_key: followed ? null : 'agenda', done: false, state: null,
        meta: [e.all_day ? 'All day' : '', e.location, followed ? e.calendar_name ?? 'Followed calendar' : ''].filter(Boolean).join(' · '),
        ref: { table: 'calendar_event', id: e.id }, readonly: followed,
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
  return out.sort((a, b) => a.day.localeCompare(b.day)
    || (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
    || kindOrder[a.kind] - kindOrder[b.kind]
    || (a.task && b.task ? a.task.sort_order - b.task.sort_order : 0)
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
