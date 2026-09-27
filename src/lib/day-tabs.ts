import { isScheduled, weekday, type HabitSchedule } from './tracking-rules.ts'
import { moduleLabel, taskModule } from './colours-rules.ts'

/** Which tabs Today shows for a day. Pure: no database, no React, so every
 *  rule is checked in src/test/daytabs.check.mjs; the reading is in day.ts.
 *
 *  Today is always there. Every other tab needs two things: its part of the
 *  app switched on, and something on that day for it. A tab with nothing
 *  behind it is a tab that is opened once, found empty, and then ignored,
 *  which teaches the person to ignore the others too.
 *
 *  The rules, one per tab:
 *  - Body (weigh-in, habits, supplements; named after the one part when only
 *    one applies, so "Habits" on a planner with only habits on):
 *      health on and (a weigh-in logged that day, or the day is today, the
 *      only day a weigh-in is taken); habits on and at least one active habit
 *      due that day; supplements on and at least one active supplement.
 *  - Work: work hours on and that weekday is a work day, or tasks in the
 *    Work section that day (a Saturday shift typed in by hand still counts).
 *  - Training: training on and tasks that belong to it that day (module_key
 *    training or the Training section).
 *  - A module on the shared record store (Learning, Projects, Finance,
 *    Household) or one the person built: on, and records dated that day or
 *    tasks that belong to it. The tab carries the module's name.
 *  - Evening: the review has something for the day (only on today or a day
 *    gone by: a day ahead has nothing to look back on yet), or tasks from
 *    18:00 or in the Night section.
 *  - Sleep: sleep on and a sleep log for that day, or the day is today (last
 *    night can be logged this morning).
 *
 *  Order follows a day: Today, Body, Work, Training, the other modules,
 *  Evening, then Sleep. */

export type BodyPart = 'health' | 'habits' | 'supplements'

export interface DayTab {
  /** Stable across days: the selection is kept by key while the label may
   *  change ("Habits" one day, "Body" the next). */
  key: string
  label: string
  /** The Body tab's parts, in the order they are shown. */
  parts?: BodyPart[]
  /** The module a module tab lists. */
  module?: string
}

export interface DayTask {
  category: string | null
  module_key: string | null
  planned_time: string | null
  deleted_at?: string | null
}

export interface DayInput {
  day: string
  today: string
  /** Module keys switched on for the profile, built modules included. */
  enabled: Iterable<string>
  work: { on: boolean; days: number[] }
  /** The day's tasks. */
  tasks: DayTask[]
  habits: { schedule: HabitSchedule; active: boolean; deleted_at?: string | null }[]
  supplements: { active: boolean; deleted_at?: string | null }[]
  weighIn: boolean
  sleepLog: boolean
  /** How many open tasks the evening review lists for the day. */
  review: number
  /** Module keys of records dated that day (one entry per record is fine). */
  records: string[]
  /** Names of built modules, by key. */
  names?: Record<string, string> | Map<string, string>
}

/** Modules with a tab or page of their own elsewhere, or no day to show:
 *  their tasks stay on the Today rail and never make a module tab. */
const NO_MODULE_TAB = new Set([
  'nutrition', 'shopping', 'health', 'habits', 'supplements', 'sleep', 'agenda', 'training', 'work', 'evening', 'stats',
])

/** Record-store modules in the order they come after Training; built
 *  modules follow in name order. */
const MODULE_ORDER = ['learning', 'projects', 'finance', 'household', 'custom']

const live = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)

export function isEvening(t: Pick<DayTask, 'category' | 'planned_time'>): boolean {
  return t.category === 'Night' || (t.planned_time ?? '').slice(0, 5) >= '18:00'
}

export function isWork(t: Pick<DayTask, 'category'>): boolean {
  return t.category === 'Work'
}

export function bodyParts(input: DayInput): BodyPart[] {
  const on = new Set(input.enabled)
  const parts: BodyPart[] = []
  if (on.has('health') && (input.weighIn || input.day === input.today)) parts.push('health')
  if (on.has('habits') && input.habits.some((h) => h.active && !h.deleted_at && isScheduled(h.schedule, input.day))) {
    parts.push('habits')
  }
  if (on.has('supplements') && input.supplements.some((s) => s.active && !s.deleted_at)) parts.push('supplements')
  return parts
}

const BODY_LABEL: Record<BodyPart, string> = { health: 'Body', habits: 'Habits', supplements: 'Supplements' }

export function dayTabs(input: DayInput): DayTab[] {
  const on = new Set(input.enabled)
  const tasks = live(input.tasks)
  const tabs: DayTab[] = [{ key: 'today', label: 'Today' }]

  const parts = bodyParts(input)
  if (parts.length) tabs.push({ key: 'body', label: parts.length === 1 ? BODY_LABEL[parts[0]] : 'Body', parts })

  const workDay = input.work.on && input.work.days.includes(weekday(input.day))
  if (workDay || tasks.some(isWork)) tabs.push({ key: 'work', label: 'Work' })

  if (on.has('training') && tasks.some((t) => taskModule(t) === 'training')) {
    tabs.push({ key: 'm:training', label: moduleLabel('training'), module: 'training' })
  }

  const present = new Set<string>(input.records)
  for (const t of tasks) {
    const k = taskModule(t)
    if (k) present.add(k)
  }
  const modules = [...present]
    .filter((k) => on.has(k) && !NO_MODULE_TAB.has(k))
    .map((k) => ({ k, label: moduleLabel(k, input.names) }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.label.localeCompare(b.label))
  for (const { k, label } of modules) tabs.push({ key: `m:${k}`, label, module: k })

  const review = input.day <= input.today ? input.review : 0
  if (review > 0 || tasks.some(isEvening)) tabs.push({ key: 'evening', label: 'Evening' })

  if (on.has('sleep') && (input.sleepLog || input.day === input.today)) tabs.push({ key: 'sleep', label: 'Sleep' })

  return uniqueLabels(tabs)
}

function rank(key: string): number {
  const i = MODULE_ORDER.indexOf(key)
  return i === -1 ? MODULE_ORDER.length : i
}

/** The header finds a tab by its label, so two may not share one (a module
 *  someone built and called "Work"). The later one gets a number. */
function uniqueLabels(tabs: DayTab[]): DayTab[] {
  const seen = new Map<string, number>()
  return tabs.map((t) => {
    const n = (seen.get(t.label) ?? 0) + 1
    seen.set(t.label, n)
    return n === 1 ? t : { ...t, label: `${t.label} (${n})` }
  })
}

/** The tab to show: the one chosen, if the day still has it, else Today. */
export function activeTab(tabs: DayTab[], chosen: string): DayTab {
  return tabs.find((t) => t.key === chosen) ?? tabs[0]
}

/** The tasks a tab lists on the rail. Body and Sleep have their own sections
 *  instead of a rail. */
export function tabTasks<T extends DayTask>(tab: DayTab, tasks: T[]): T[] | null {
  if (tab.key === 'body' || tab.key === 'sleep') return null
  if (tab.key === 'work') return tasks.filter(isWork)
  if (tab.key === 'evening') return tasks.filter(isEvening)
  if (tab.module) return tasks.filter((t) => taskModule(t) === tab.module)
  return tasks
}

/** Hours from going to bed to waking, across midnight, to two decimals (the
 *  server keeps numeric(4,2)). The same arithmetic as the Sleep module's
 *  hours_between formula. */
export function hoursBetween(bed: string, woke: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const mins = (m(woke) - m(bed) + 1440) % 1440
  return Math.round((mins / 60) * 100) / 100
}

/* ---------- a module record as one line ---------------------------------- */

interface FieldLike { name: string; type: string }

/** The fields of a module's entity, from a registry definition or a built
 *  module's definition JSON, whichever shape it has. Anything unreadable is
 *  no fields, never an error. */
export function entityFields(definition: unknown, entity: string): FieldLike[] {
  const d = definition as { entities?: unknown; fields?: unknown } | null | undefined
  const ok = (f: unknown): f is FieldLike =>
    !!f && typeof (f as FieldLike).name === 'string' && typeof (f as FieldLike).type === 'string'
  if (Array.isArray(d?.entities)) {
    const list = d.entities as { name?: unknown; fields?: unknown }[]
    const e = list.find((x) => x?.name === entity) ?? list[0]
    if (e && Array.isArray(e.fields)) return e.fields.filter(ok)
  }
  if (Array.isArray(d?.fields)) return d.fields.filter(ok)
  return []
}

/** One record as a title and a time: the title from the first text field
 *  (else the first piece of text in the record), the time from the first
 *  time or date-and-time field. */
export function recordLine(data: Record<string, unknown>, fields: FieldLike[]): { title: string; time: string | null } {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  let title: string | null = null
  for (const f of fields) {
    if (f.type === 'text' && (title = text(data[f.name]))) break
  }
  // A date is not a title; a module whose first text is its date would
  // otherwise list every record as that date.
  if (!title) title = Object.values(data ?? {}).map(text).find((v) => v && !/^\d{4}-\d{2}-\d{2}/.test(v)) ?? null
  let time: string | null = null
  for (const f of fields) {
    const v = text(data[f.name])
    if (!v) continue
    if (f.type === 'time' && /^\d{2}:\d{2}/.test(v)) { time = v.slice(0, 5); break }
    if (f.type === 'datetime') {
      const m = /T(\d{2}:\d{2})/.exec(v)
      if (m) { time = m[1]; break }
    }
  }
  return { title: title ?? 'Untitled', time }
}
