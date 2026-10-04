/** One way of saying when something happens, for everything that repeats:
 *  tasks (through their series), habits, chores, supplements and built
 *  modules. Pure: no database, no React, no clock.
 *
 *  Days are local calendar days, 'yyyy-MM-dd', counted in whole UTC days so
 *  daylight saving never shifts one. Weekdays are 0 (Sunday) to 6. Weeks
 *  start on Monday, as they are drawn everywhere in the app. */

export type RuleKind =
  | 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'every_n_weeks'
  | 'monthly' | 'monthly_nth' | 'yearly' | 'dates' | 'times_per_week'

export const RULE_KINDS: RuleKind[] = ['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks',
  'monthly', 'monthly_nth', 'yearly', 'dates', 'times_per_week']

export interface RuleConfig {
  /** Every n days (daily), weeks (every_n_weeks), months (monthly,
   *  monthly_nth) or years (yearly). 1 when missing. */
  n?: number
  /** Days of the week for weekly and every_n_weeks. */
  weekdays?: number[]
  /** Monthly on this day; past a short month's end it means the last day. */
  day_of_month?: number
  /** monthly_nth: the 1st to 5th, or -1 for the last, `weekday` of the month. */
  nth?: number
  weekday?: number
  /** yearly: the month (1 to 12) and day; from the start day when missing. */
  month?: number
  day?: number
  /** Days picked by hand. */
  dates?: string[]
  /** times_per_week: how many times in each Monday-to-Sunday week. */
  times?: number
  /** GEN-22: not on fixed days but counted from the last time it was done.
   *  Stored on a 'daily' rule whose `n` is the number of days, so every
   *  table that keeps a rule keeps these too, and an app that does not know
   *  them still reads "every n days".
   *  - 'after': due n days after it was last done ("7 days after");
   *  - 'flexible': about every n days, growing more due, never "late". */
  mode?: LooseMode
}

export type LooseMode = 'after' | 'flexible'

export interface Schedule {
  rule: RuleKind
  rule_config: RuleConfig
  start_date: string
  end_date?: string | null
  occurrence_count?: number | null
}

const DAY_MS = 86_400_000
export const MAX_PICKED_DATES = 366
const MAX_DAYS = 366 * 20

export function toDayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}
export function fromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
export const addDays = (day: string, n: number) => fromDayNumber(toDayNumber(day) + n)
export const weekdayOf = (day: string) => new Date(toDayNumber(day) * DAY_MS).getUTCDay()
export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromDayNumber(toDayNumber(value)) === value
}
export function cleanDates(dates: unknown): string[] {
  if (!Array.isArray(dates)) return []
  return [...new Set(dates.filter(isDay))].sort().slice(0, MAX_PICKED_DATES)
}
const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate()
/** Monday of the week the day (as a day number) falls in. */
export function mondayOf(dayNum: number): number {
  const wd = new Date(dayNum * DAY_MS).getUTCDay()
  return dayNum - ((wd + 6) % 7)
}
const whole = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

function chosenWeekdays(s: Schedule): number[] {
  const picked = (s.rule_config?.weekdays ?? []).filter((w) => Number.isInteger(w) && w >= 0 && w <= 6)
  return picked.length ? picked : [weekdayOf(s.start_date)]
}

/** Months between two dates' months: Jan 2026 to Mar 2026 is 2. */
const monthsBetween = (a: Date, b: Date) =>
  (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())

/** Does the rule, before any end or count, produce this day? A
 *  times_per_week rule has no fixed days: every day is a day it may happen,
 *  so it matches every day (habitStatus decides what a day means for it). */
export function ruleMatches(s: Schedule, dayNum: number, startNum: number = toDayNumber(s.start_date)): boolean {
  if (dayNum < startNum) return false
  const date = new Date(dayNum * DAY_MS)
  const start = new Date(startNum * DAY_MS)
  const wd = date.getUTCDay()
  const cfg = s.rule_config ?? {}
  switch (s.rule) {
    case 'daily': return (dayNum - startNum) % whole(cfg.n, 1, 3650, 1) === 0
    case 'weekdays': return wd >= 1 && wd <= 5
    case 'weekends': return wd === 0 || wd === 6
    case 'weekly': return chosenWeekdays(s).includes(wd)
    case 'every_n_weeks': {
      const n = whole(cfg.n, 1, 520, 2)
      return ((mondayOf(dayNum) - mondayOf(startNum)) / 7) % n === 0 && chosenWeekdays(s).includes(wd)
    }
    case 'monthly': {
      if (monthsBetween(start, date) % whole(cfg.n, 1, 120, 1) !== 0) return false
      // "The 31st" in a shorter month means that month's last day.
      const want = whole(cfg.day_of_month ?? Number(s.start_date.slice(8, 10)), 1, 31, 1)
      const last = daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)
      return date.getUTCDate() === Math.min(want, last)
    }
    case 'monthly_nth': {
      if (monthsBetween(start, date) % whole(cfg.n, 1, 120, 1) !== 0) return false
      const weekday = whole(cfg.weekday ?? weekdayOf(s.start_date), 0, 6, 1)
      if (wd !== weekday) return false
      const nth = cfg.nth === -1 ? -1 : whole(cfg.nth ?? Math.ceil(Number(s.start_date.slice(8, 10)) / 7), 1, 5, 1)
      const dom = date.getUTCDate()
      if (nth === -1) return dom + 7 > daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)
      return Math.ceil(dom / 7) === nth
    }
    case 'yearly': {
      if ((date.getUTCFullYear() - start.getUTCFullYear()) % whole(cfg.n, 1, 100, 1) !== 0) return false
      const month = whole(cfg.month ?? Number(s.start_date.slice(5, 7)), 1, 12, 1)
      const want = whole(cfg.day ?? Number(s.start_date.slice(8, 10)), 1, 31, 1)
      if (date.getUTCMonth() + 1 !== month) return false
      // 29 February in a year without one falls on the 28th.
      return date.getUTCDate() === Math.min(want, daysInMonth(date.getUTCFullYear(), month))
    }
    case 'dates': return cleanDates(cfg.dates).includes(fromDayNumber(dayNum))
    case 'times_per_week': return true
    default: return false
  }
}

/** Is the day one the schedule produces, within its start and end? The
 *  count limit, if any, is honoured by datesOf, which walks from the start. */
export function occursOn(s: Schedule, day: string): boolean {
  if (!isDay(day) || !isDay(s.start_date) || day < s.start_date) return false
  if (s.end_date && day > s.end_date) return false
  if (s.occurrence_count != null) return datesOf(s, day).at(-1) === day
  return ruleMatches(s, toDayNumber(day))
}

/** Every day the schedule produces from its start up to `until`. */
export function datesOf(s: Schedule, until: string): string[] {
  const startNum = toDayNumber(s.start_date)
  let last = Math.min(toDayNumber(until), startNum + MAX_DAYS)
  if (s.end_date) last = Math.min(last, toDayNumber(s.end_date))
  const limit = s.occurrence_count != null && s.occurrence_count >= 0 ? s.occurrence_count : Infinity
  if (s.rule === 'dates') {
    const lastDay = fromDayNumber(last)
    return cleanDates(s.rule_config?.dates).filter((d) => d >= s.start_date && d <= lastDay).slice(0, limit)
  }
  const out: string[] = []
  for (let n = startNum; n <= last && out.length < limit; n++) if (ruleMatches(s, n, startNum)) out.push(fromDayNumber(n))
  return out
}

/** The days between from and to (both included) the schedule lands on. */
export function daysIn(s: Schedule, from: string, to: string): string[] {
  if (s.occurrence_count != null) return datesOf(s, to).filter((d) => d >= from)
  const out: string[] = []
  const a = Math.max(toDayNumber(from), toDayNumber(s.start_date))
  let b = toDayNumber(to)
  if (s.end_date) b = Math.min(b, toDayNumber(s.end_date))
  if (s.rule === 'dates') return cleanDates(s.rule_config?.dates).filter((d) => d >= fromDayNumber(a) && d <= fromDayNumber(b))
  for (let n = a; n <= b; n++) if (ruleMatches(s, n)) out.push(fromDayNumber(n))
  return out
}

/** The first day on or after `from` the schedule lands on, within a year
 *  and a bit; null when there is none (it has ended). */
export function nextOn(s: Schedule, from: string): string | null {
  const days = daysIn(s, from, addDays(from, 400))
  return days[0] ?? null
}

/** A rule as it is stored, cleaned: unknown kinds become null, numbers are
 *  kept in range, lists hold only what they may. */
export function cleanRule(rule: unknown, cfg: unknown): { rule: RuleKind | null; rule_config: RuleConfig } {
  const kind = RULE_KINDS.includes(rule as RuleKind) ? (rule as RuleKind) : null
  const c = (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>
  const out: RuleConfig = {}
  const num = (k: keyof RuleConfig, lo: number, hi: number) => {
    const v = Number(c[k])
    if (c[k] != null && Number.isFinite(v)) (out as Record<string, number>)[k] = Math.min(hi, Math.max(lo, Math.floor(v)))
  }
  num('n', 1, 3650); num('day_of_month', 1, 31); num('weekday', 0, 6); num('month', 1, 12); num('day', 1, 31); num('times', 1, 7)
  if (c.nth != null) out.nth = Number(c.nth) === -1 ? -1 : whole(c.nth, 1, 5, 1)
  if (Array.isArray(c.weekdays)) out.weekdays = [...new Set(c.weekdays.filter((w) => Number.isInteger(w) && (w as number) >= 0 && (w as number) <= 6) as number[])].sort()
  if (Array.isArray(c.dates)) out.dates = cleanDates(c.dates)
  if (kind === 'daily' && (c.mode === 'after' || c.mode === 'flexible')) out.mode = c.mode
  return { rule: kind, rule_config: out }
}

/* ---------- after completion and flexible (GEN-22) -------------------- */

export interface Loose { mode: LooseMode; every: number }

/** The longest gap "after" and "flexible" take, as for chores. */
export const MAX_LOOSE_DAYS = 730

/** An "after completion" or "flexible" rule, or null for a rule on fixed
 *  days. Both are a daily rule with a mode; `every` is its number of days. */
export function looseOf(s: { rule?: RuleKind | string | null; rule_config?: RuleConfig | null } | null | undefined): Loose | null {
  const mode = s?.rule === 'daily' ? s.rule_config?.mode : undefined
  if (mode !== 'after' && mode !== 'flexible') return null
  return { mode, every: whole(s?.rule_config?.n, 1, MAX_LOOSE_DAYS, 7) }
}

/** Where an "after" or flexible thing stands on a day, from the days it was
 *  done: the chores' engine (choreState), so a habit, a task and a chore
 *  that come round "about every 7 days" are due on the same day. */
export function looseState(loose: Loose, start: string | null, end: string | null, day: string, doneDays: Iterable<string>): ChoreState {
  const logs: ChoreDone[] = [...doneDays].map((d) => ({ done_on: d, done_by: null }))
  return choreState({ mode: loose.mode, rule: null, rule_config: {}, every_days: loose.every, start_date: start, end_date: end }, day, logs)
}

/** A loose rule in words: "7 days after it was last done", "About every 7 days". */
export function describeLoose(l: Loose): string {
  return l.mode === 'after' ? `${l.every} ${l.every === 1 ? 'day' : 'days'} after it was last done` : `About every ${l.every} ${l.every === 1 ? 'day' : 'days'}`
}

/* ---------- habits ---------------------------------------------------- */

export interface HabitLike {
  schedule?: 'daily' | 'weekdays' | 'weekly' | string | null
  rule?: RuleKind | null
  rule_config?: RuleConfig | null
  start_date?: string | null
  end_date?: string | null
}

/** A habit's schedule. Habits from before 026 keep their old meaning:
 *  daily, weekdays, and "weekly" = once in each week. With no start day a
 *  habit has always been running. */
export function habitSchedule(h: HabitLike): Schedule {
  const start = isDay(h.start_date) ? h.start_date : '2000-01-03'
  const end = isDay(h.end_date) ? h.end_date : null
  if (h.rule && RULE_KINDS.includes(h.rule)) {
    return { rule: h.rule, rule_config: cleanRule(h.rule, h.rule_config).rule_config, start_date: start, end_date: end }
  }
  if (h.schedule === 'weekdays') return { rule: 'weekdays', rule_config: {}, start_date: start, end_date: end }
  if (h.schedule === 'weekly') return { rule: 'times_per_week', rule_config: { times: 1 }, start_date: start, end_date: end }
  return { rule: 'daily', rule_config: {}, start_date: start, end_date: end }
}

export type HabitDay =
  /** It is meant to happen today and has not. */
  | 'due'
  /** Ticked that day. */
  | 'done'
  /** A times-a-week habit whose week is already met. */
  | 'met'
  /** Not a day it happens. */
  | 'off'

/** What a day means for a habit, given the days it was ticked. For a
 *  times-a-week habit a day is due until the week has its ticks. */
export function habitDay(h: HabitLike, day: string, doneDays: Iterable<string>): HabitDay {
  const done = new Set(doneDays)
  if (done.has(day)) return 'done'
  const s = habitSchedule(h)
  if (day < s.start_date || (s.end_date && day > s.end_date)) return 'off'
  // After completion or flexible (GEN-22): due once its days have passed
  // since it was last done, and due until it is done again.
  const loose = looseOf(s)
  if (loose) return looseState(loose, isDay(h.start_date) ? h.start_date : null, s.end_date ?? null, day, done).shows ? 'due' : 'off'
  if (s.rule === 'times_per_week') {
    const mon = fromDayNumber(mondayOf(toDayNumber(day)))
    let n = 0
    for (let i = 0; i < 7; i++) if (done.has(addDays(mon, i))) n++
    return n >= whole(s.rule_config.times, 1, 7, 1) ? 'met' : 'due'
  }
  return occursOn(s, day) ? 'due' : 'off'
}

/** Is the habit something to show on that day (due, done or met)? */
export const habitShows = (h: HabitLike, day: string, doneDays: Iterable<string>) => habitDay(h, day, doneDays) !== 'off'

/* ---------- chores ---------------------------------------------------- */

export interface ChoreLike {
  mode: 'fixed' | 'after' | 'flexible'
  rule: RuleKind | null
  rule_config: RuleConfig
  every_days: number | null
  start_date: string | null
  end_date: string | null
  paused?: boolean
  /** A pause with dates (030): a holiday from one day to another. Off by
   *  itself after its last day; the days in between are not counted. */
  paused_from?: string | null
  paused_until?: string | null
  assignees?: string[]
  rotation?: 'none' | 'each_time' | 'each_week' | 'least_recent'
}
export interface ChoreDone { done_on: string; done_by: string | null; deleted_at?: string | null }

export interface ChoreState {
  /** Shown on this day: it is due, overdue, or was done that day. */
  shows: boolean
  /** Done on this day. */
  doneToday: boolean
  /** The day it is next due (today when due now); null when it has ended or is paused. */
  next: string | null
  /** Days since it fell due and was not done (0 when on time). */
  overdueDays: number
  /** How due a flexible chore is: 0 just done, 1 due, above 1 overdue. Never "failed". */
  dueness: number
  lastDone: string | null
  /** Paused on this day, for good or until a date. */
  paused?: boolean
}

/** Is the chore paused on this day: switched to paused, or inside a pause
 *  with dates? */
export function chorePausedOn(c: Pick<ChoreLike, 'paused' | 'paused_from' | 'paused_until'>, day: string): boolean {
  if (c.paused) return true
  if (!isDay(c.paused_until) || day > c.paused_until) return false
  return !isDay(c.paused_from) || day >= c.paused_from
}

/** Where a chore stands on a day. Fixed chores fall due on their rule's
 *  days and stay due until done; "after" chores fall due a set number of
 *  days after they were last done; flexible ones grow more due over time. */
export function choreState(c: ChoreLike, day: string, logs: ChoreDone[]): ChoreState {
  const done = logs.filter((l) => !l.deleted_at && l.done_on <= day).map((l) => l.done_on).sort()
  const lastDone = done.at(-1) ?? null
  const doneToday = lastDone === day
  const start = isDay(c.start_date) ? c.start_date : (lastDone ?? day)
  const empty: ChoreState = { shows: doneToday, doneToday, next: null, overdueDays: 0, dueness: 0, lastDone }
  if (chorePausedOn(c, day)) return { ...empty, paused: true, next: isDay(c.paused_until) && !c.paused ? addDays(c.paused_until, 1) : null }
  if (c.end_date && day > c.end_date) return empty
  // A holiday that is over: what fell due during it is let go (fixed), and
  // the clock of an "after" or flexible chore stood still while it lasted.
  const pauseEnd = isDay(c.paused_until) && c.paused_until < day ? c.paused_until : null
  if (c.mode === 'fixed') {
    if (!c.rule) return empty
    const s: Schedule = { rule: c.rule, rule_config: c.rule_config ?? {}, start_date: start, end_date: c.end_date }
    // The most recent day it fell due, up to today, and whether it was done since.
    const lookFrom = addDays(day, -60)
    const back = daysIn(s, pauseEnd && pauseEnd >= lookFrom ? addDays(pauseEnd, 1) : lookFrom, day)
    const lastDue = back.at(-1) ?? null
    const open = lastDue != null && !(lastDone != null && lastDone >= lastDue)
    const next = open ? lastDue : nextOn(s, addDays(day, 1))
    const overdue = open && lastDue! < day ? toDayNumber(day) - toDayNumber(lastDue!) : 0
    return { shows: open || doneToday, doneToday, next: open ? day : next, overdueDays: overdue, dueness: open ? 1 : 0, lastDone }
  }
  const every = Math.max(1, Math.floor(c.every_days ?? 7))
  let from = lastDone ?? addDays(start, -every)
  if (pauseEnd && isDay(c.paused_from) && from < c.paused_from) {
    from = addDays(from, toDayNumber(pauseEnd) - toDayNumber(c.paused_from) + 1)
  }
  const dueOn = addDays(from, every)
  const late = toDayNumber(day) - toDayNumber(dueOn)
  const dueness = Math.max(0, (toDayNumber(day) - toDayNumber(from)) / every)
  const isDue = dueOn <= day && !doneToday
  return {
    shows: isDue || doneToday, doneToday,
    next: isDue ? day : (doneToday ? addDays(day, every) : dueOn),
    overdueDays: isDue && c.mode === 'after' ? Math.max(0, late) : 0,
    dueness: doneToday ? 0 : Math.round(dueness * 100) / 100,
    lastDone,
  }
}

/** Who a chore goes to on a day, by its rotation: everyone listed (none),
 *  the next person after whoever did it last (each_time), one person per
 *  week counted from its start (each_week), or whoever did it least
 *  recently (least_recent). Empty when nobody is listed. */
export function choreAssignee(c: ChoreLike, day: string, logs: ChoreDone[]): string[] {
  const people = c.assignees ?? []
  if (people.length <= 1 || !c.rotation || c.rotation === 'none') return people
  const live = logs.filter((l) => !l.deleted_at && l.done_on < day).sort((a, b) => a.done_on.localeCompare(b.done_on))
  if (c.rotation === 'each_time') {
    const last = live.at(-1)?.done_by
    const i = last ? people.indexOf(last) : -1
    return [people[(i + 1) % people.length]]
  }
  if (c.rotation === 'each_week') {
    const start = isDay(c.start_date) ? c.start_date : day
    const weeks = Math.floor((mondayOf(toDayNumber(day)) - mondayOf(toDayNumber(start))) / 7)
    return [people[((weeks % people.length) + people.length) % people.length]]
  }
  const lastBy = new Map<string, string>()
  for (const l of live) if (l.done_by) lastBy.set(l.done_by, l.done_on)
  const ranked = [...people].sort((a, b) => (lastBy.get(a) ?? '').localeCompare(lastBy.get(b) ?? '') || people.indexOf(a) - people.indexOf(b))
  return [ranked[0]]
}

/* ---------- words --------------------------------------------------------- */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const dayName = (wd: number) => DAY_NAMES[wd]
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}
export function shortDate(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
}

/** The rule as a sentence a person would write. */
export function describeSchedule(s: Schedule): string {
  const days = (ws: number[]) => WEEK_ORDER.filter((w) => ws.includes(w)).map(dayName).join(', ')
  const cfg = s.rule_config ?? {}
  const loose = looseOf(s)
  if (loose) {
    return describeLoose(loose) + (s.end_date ? ` until ${shortDate(s.end_date)}` : '') + (s.occurrence_count != null ? `, ${s.occurrence_count} times` : '')
  }
  const every = (n: number | undefined, one: string, many: string) => (n && n > 1 ? `Every ${n} ${many}` : one)
  let text: string
  switch (s.rule) {
    case 'daily': text = every(cfg.n, 'Every day', 'days'); break
    case 'weekdays': text = 'Weekdays'; break
    case 'weekends': text = 'Weekends'; break
    case 'weekly': text = `Weekly on ${days(chosenWeekdays(s))}`; break
    case 'every_n_weeks': text = `Every ${cfg.n ?? 2} weeks on ${days(chosenWeekdays(s))}`; break
    case 'monthly': {
      const d = cfg.day_of_month ?? Number(s.start_date.slice(8, 10))
      text = `${every(cfg.n, 'Monthly', 'months')} on the ${ordinal(d)}${d > 28 ? ', or the last day of a shorter month' : ''}`
      break
    }
    case 'monthly_nth': {
      const wd = cfg.weekday ?? weekdayOf(s.start_date)
      const nth = cfg.nth ?? Math.ceil(Number(s.start_date.slice(8, 10)) / 7)
      text = `${every(cfg.n, 'Monthly', 'months')} on the ${nth === -1 ? 'last' : ordinal(nth)} ${LONG_DAYS[wd]}`
      break
    }
    case 'yearly': {
      const m = cfg.month ?? Number(s.start_date.slice(5, 7))
      const d = cfg.day ?? Number(s.start_date.slice(8, 10))
      text = `${every(cfg.n, 'Every year', 'years')} on ${d} ${MONTH_NAMES[m - 1]}`
      break
    }
    case 'times_per_week': {
      const t = cfg.times ?? 1
      text = t === 1 ? 'Once a week' : `${t} times a week`
      break
    }
    case 'dates': {
      const dates = cleanDates(cfg.dates)
      if (dates.length === 0) return 'No days picked'
      if (dates.length === 1) return `On ${shortDate(dates[0])}`
      return `On ${dates.length} picked days, ${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])}`
    }
    default: text = 'Repeats'
  }
  if (s.end_date) text += ` until ${shortDate(s.end_date)}`
  if (s.occurrence_count != null) text += `, ${s.occurrence_count} times`
  return text
}

/** A chore's schedule in words, whatever its mode. */
export function describeChore(c: ChoreLike): string {
  if (c.paused) return 'Paused'
  if (c.mode !== 'fixed') return describeLoose({ mode: c.mode, every: c.every_days ?? 7 })
  if (!c.rule) return 'No schedule'
  return describeSchedule({ rule: c.rule, rule_config: c.rule_config, start_date: c.start_date ?? '2000-01-03', end_date: c.end_date })
}
