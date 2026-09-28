// Generated from src/lib/series-rules.ts by scripts/copy-shared.mjs. Do not edit here:
// change the original and run `node scripts/copy-shared.mjs`.

import type { Series, SeriesException } from './types.ts'

/** Pure date logic for recurring series: no database, no React, no clock.
 *
 *  Every date here is a local calendar day as 'yyyy-MM-dd'. The arithmetic runs
 *  on whole days counted in UTC, which has no daylight-saving gaps, so adding a
 *  day always lands on the next calendar day. Nothing here asks what time zone
 *  the phone is in: the caller has already turned "now" into the person's day. */

export type RuleFields = Pick<Series, 'rule' | 'rule_config' | 'start_date' | 'end_date' | 'occurrence_count'>
export type ExceptionFields = Pick<SeriesException, 'exception_date' | 'action' | 'moved_to'> & {
  deleted_at?: string | null
}

/** One generated occurrence. `base` is the day the rule produced; `date` is
 *  where it lands after a move. They differ only for a moved occurrence, and
 *  `base` is what identifies it, so a move can be undone or moved again. */
export interface Occurrence { base: string; date: string }

const DAY_MS = 86_400_000
/** A series with no end still has to stop being walked somewhere. Twenty
 *  years of days is far beyond any window the app asks for. */
const MAX_DAYS = 366 * 20

/** How far ahead a series is turned into real tasks. Eight weeks is enough to
 *  plan a month and see the next, and few enough rows that a daily series does
 *  not bury the week view or the sync. Past this, the planner shows the days a
 *  series will land on as "planned repeats", worked out on the spot. */
export const WINDOW_DAYS = 56

/** The most days a person can pick by hand for one series: a year's worth. */
export const MAX_PICKED_DATES = 366
/** The longest gap "every N days" takes. */
export const MAX_EVERY_N_DAYS = 365

export function toDayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

export function fromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function addDays(day: string, n: number): string {
  return fromDayNumber(toDayNumber(day) + n)
}

/** 0 is Sunday, as in the series table's rule_config.weekdays. */
export function weekdayOf(day: string): number {
  return new Date(toDayNumber(day) * DAY_MS).getUTCDay()
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** Monday of the week the day falls in. Weeks start on Monday here, so an
 *  every-2-weeks series started on a Sunday counts that Sunday in the week
 *  that began the Monday before. */
function mondayOf(dayNum: number): number {
  const wd = new Date(dayNum * DAY_MS).getUTCDay()
  return dayNum - ((wd + 6) % 7)
}

function chosenWeekdays(s: RuleFields): number[] {
  const picked = (s.rule_config?.weekdays ?? []).filter((w) => Number.isInteger(w) && w >= 0 && w <= 6)
  return picked.length ? picked : [weekdayOf(s.start_date)]
}

/** Does the rule, before any end or count, produce this day? */
function matches(s: RuleFields, dayNum: number, startNum: number): boolean {
  if (dayNum < startNum) return false
  const date = new Date(dayNum * DAY_MS)
  const wd = date.getUTCDay()
  switch (s.rule) {
    case 'daily': {
      const n = Math.max(1, Math.floor(s.rule_config?.n ?? 1))
      return (dayNum - startNum) % n === 0
    }
    case 'weekdays':
      return wd >= 1 && wd <= 5
    case 'weekly':
      return chosenWeekdays(s).includes(wd)
    case 'every_n_weeks': {
      const n = Math.max(1, Math.floor(s.rule_config?.n ?? 2))
      const weeks = (mondayOf(dayNum) - mondayOf(startNum)) / 7
      return weeks % n === 0 && chosenWeekdays(s).includes(wd)
    }
    case 'monthly': {
      // "The 31st" in a shorter month means that month's last day, so a bill
      // due on the 31st still shows up in February rather than being skipped.
      const want = s.rule_config?.day_of_month ?? Number(s.start_date.slice(8, 10))
      const last = daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)
      return date.getUTCDate() === Math.min(Math.max(1, want), last)
    }
    case 'dates':
      return cleanDates(s.rule_config?.dates).includes(fromDayNumber(dayNum))
    default:
      return false
  }
}

/** A real calendar day written as 'yyyy-MM-dd' ('2026-02-30' is not one). */
export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromDayNumber(toDayNumber(value)) === value
}

/** Days picked by hand, as they are stored: real days only, each once, in
 *  order, and no more than MAX_PICKED_DATES of them (the earliest are kept).
 *  Anything else that arrives from storage or another device is dropped. */
export function cleanDates(dates: unknown): string[] {
  if (!Array.isArray(dates)) return []
  return [...new Set(dates.filter(isDay))].sort().slice(0, MAX_PICKED_DATES)
}

/** One tap on a day in the picker: a picked day is unpicked, another added,
 *  unless the list is already full, when the tap changes nothing. */
export function togglePicked(dates: string[], day: string): string[] {
  if (!isDay(day)) return dates
  if (dates.includes(day)) return dates.filter((d) => d !== day)
  if (dates.length >= MAX_PICKED_DATES) return dates
  return cleanDates([...dates, day])
}

/** Every day the rule produces from its start up to `until`, honouring
 *  end_date and occurrence_count. The count is of days the rule produced: a
 *  skipped day still used up its place, the way a calendar invite's "10 times"
 *  does not grow an eleventh because one was cancelled. */
export function baseDates(s: RuleFields, until: string): string[] {
  const startNum = toDayNumber(s.start_date)
  let last = Math.min(toDayNumber(until), startNum + MAX_DAYS)
  if (s.end_date) last = Math.min(last, toDayNumber(s.end_date))
  const limit = s.occurrence_count != null && s.occurrence_count >= 0 ? s.occurrence_count : Infinity
  // Days picked by hand are already a list: no need to walk the calendar.
  if (s.rule === 'dates') {
    const lastDay = fromDayNumber(last)
    return cleanDates(s.rule_config?.dates).filter((d) => d >= s.start_date && d <= lastDay).slice(0, limit)
  }
  const out: string[] = []
  for (let n = startNum; n <= last && out.length < limit; n++) {
    if (matches(s, n, startNum)) out.push(fromDayNumber(n))
  }
  return out
}

/** Occurrences whose landing day is between from and to, both included,
 *  sorted by that day. Skips remove an occurrence; a move lands it on
 *  moved_to, which may be outside the rule's own days or outside the window's
 *  base range (a Monday pulled back into this week from next). An exception
 *  on a day the rule never produced changes nothing. */
export function plan(s: RuleFields, from: string, to: string, exceptions: ExceptionFields[] = []): Occurrence[] {
  const live = exceptions.filter((e) => !e.deleted_at)
  const byBase = new Map(live.map((e) => [e.exception_date, e]))
  // Walk far enough to see any occurrence that was moved into the window from later.
  let until = to
  for (const e of live) {
    if (e.action === 'move' && e.moved_to && e.moved_to >= from && e.moved_to <= to && e.exception_date > until) {
      until = e.exception_date
    }
  }
  const out: Occurrence[] = []
  for (const base of baseDates(s, until)) {
    const ex = byBase.get(base)
    if (ex?.action === 'skip') continue
    const date = ex?.action === 'move' && ex.moved_to ? ex.moved_to : base
    if (date >= from && date <= to) out.push({ base, date })
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.base.localeCompare(b.base))
  return out
}

/** The days a series lands on between from and to, both included. */
export function occurrences(s: RuleFields, from: string, to: string, exceptions: ExceptionFields[] = []): string[] {
  return [...new Set(plan(s, from, to, exceptions).map((o) => o.date))]
}

/** The id of the task a series makes for one of its days, the same on every
 *  device. Two phones that fill the same new day while out of touch then
 *  write one row between them rather than two, and a task later moved to
 *  another day still says which day it was made for, so that day is not
 *  filled again. The digest is SHA-256 of the series id and the day, shaped
 *  as a version 8 (custom) UUID so Postgres takes it as any other id. */
export async function occurrenceId(seriesId: string, base: string): Promise<string> {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(`series-occurrence:${seriesId}:${base}`)))
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** The chosen last day comes before the first, so the series would never
 *  produce a day and the task being saved would go nowhere. */
export function endsBeforeStart(start: string, endDate: string | null): boolean {
  return !!endDate && endDate < start
}

/* ---------- the Repeat control ------------------------------------------- */

export type RepeatKind = 'never' | 'daily' | 'every_n_days' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'dates'

/** "Every N days" as a whole number from 2 to MAX_EVERY_N_DAYS; 2 when blank. */
export function everyN(n: unknown): number {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) ? Math.min(MAX_EVERY_N_DAYS, Math.max(2, v)) : 2
}

/** What the Repeat control holds, turned into the series table's shape. The
 *  start day decides the defaults: weekly with no day picked repeats on the
 *  start's weekday, monthly on the start's day of the month. `n` is for
 *  "every N days" and `dates` for days picked by hand. */
export function ruleFromChoice(
  kind: Exclude<RepeatKind, 'never'>, start: string, weekdays: number[] = [],
  extra: { n?: number; dates?: string[] } = {},
): Pick<Series, 'rule' | 'rule_config'> {
  const days = [...new Set(weekdays)].filter((w) => w >= 0 && w <= 6).sort((a, b) => a - b)
  const picked = days.length ? days : [weekdayOf(start)]
  switch (kind) {
    case 'daily': return { rule: 'daily', rule_config: {} }
    case 'every_n_days': return { rule: 'daily', rule_config: { n: everyN(extra.n) } }
    case 'weekdays': return { rule: 'weekdays', rule_config: {} }
    case 'weekly': return { rule: 'weekly', rule_config: { weekdays: picked } }
    case 'biweekly': return { rule: 'every_n_weeks', rule_config: { n: 2, weekdays: picked } }
    case 'monthly': return { rule: 'monthly', rule_config: { day_of_month: Number(start.slice(8, 10)) } }
    case 'dates': return { rule: 'dates', rule_config: { dates: cleanDates(extra.dates) } }
  }
}

/** The first and last day a new series covers. Most rules start on the
 *  task's day and end when the person says. Days picked by hand start on the
 *  first of them and end on the last, so the series counts as over once the
 *  last picked day has passed. */
export function seriesBounds(
  rule: Pick<Series, 'rule' | 'rule_config'>, taskDay: string, endDate: string | null,
): { start_date: string; end_date: string | null } {
  if (rule.rule !== 'dates') return { start_date: taskDay, end_date: endDate }
  const dates = cleanDates(rule.rule_config.dates)
  if (dates.length === 0) return { start_date: taskDay, end_date: taskDay }
  return { start_date: dates[0], end_date: dates[dates.length - 1] }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Monday first, the way the week is drawn everywhere else in the app. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const dayName = (wd: number) => DAY_NAMES[wd]

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export function shortDate(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
}

/** The rule as a sentence a person would write: "Weekly on Mon, Wed until 3 Nov 2026". */
export function describeRule(s: RuleFields): string {
  const days = (ws: number[]) => WEEK_ORDER.filter((w) => ws.includes(w)).map(dayName).join(', ')
  let text: string
  switch (s.rule) {
    case 'daily': {
      const n = s.rule_config?.n ?? 1
      text = n > 1 ? `Every ${n} days` : 'Every day'
      break
    }
    case 'weekdays': text = 'Weekdays'; break
    case 'weekly': text = `Weekly on ${days(chosenWeekdays(s))}`; break
    case 'every_n_weeks': text = `Every ${s.rule_config?.n ?? 2} weeks on ${days(chosenWeekdays(s))}`; break
    case 'monthly': {
      const d = s.rule_config?.day_of_month ?? Number(s.start_date.slice(8, 10))
      text = `Monthly on the ${ordinal(d)}${d > 28 ? ', or the last day of a shorter month' : ''}`
      break
    }
    case 'dates': {
      // The picked days already say where it ends, so no "until".
      const dates = cleanDates(s.rule_config?.dates)
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

/** Which Repeat choice a stored series corresponds to, to show it in the control. */
export function choiceFromRule(s: Pick<Series, 'rule' | 'rule_config'>): Exclude<RepeatKind, 'never'> {
  if (s.rule === 'every_n_weeks') return 'biweekly'
  if (s.rule === 'daily' && (s.rule_config?.n ?? 1) > 1) return 'every_n_days'
  return s.rule
}

/* ---------- planned repeats: past the filled weeks ----------------------- */

/** The last day the fill has turned into real tasks, counted from today. */
export const fillHorizon = (today: string) => addDays(today, WINDOW_DAYS)

/** What the planner needs of a series to show the days it will land on. */
export type PlannedSeries = RuleFields & Pick<Series,
  'id' | 'title' | 'time_of_day' | 'task_template' | 'module_key' | 'active' | 'deleted_at'>
export type PlannedException = ExceptionFields & Pick<SeriesException, 'series_id'> & {
  changes?: Record<string, unknown>
}

/** A day a series will land on that has no task yet, because it is further
 *  ahead than the fill goes. It looks like a task but is only worked out, so
 *  nothing about it can be ticked or changed until it becomes a real one. */
export interface PlannedRepeat {
  seriesId: string
  base: string
  date: string
  title: string
  time: string | null
  duration_min: number | null
  category: string | null
  module_key: string | null
}

/** Every planned repeat landing between from and to (both included), on
 *  days after `horizon`, the last day the fill has made tasks for.
 *
 *  Up to the horizon, a day with no task is a day the person deleted or
 *  moved away, so nothing is invented there. After it, a day already holding
 *  a task of that series (a moved one, or one another device filled further
 *  ahead) shows that task and not a planned copy. `tasks` must include
 *  deleted ones, for the same reason the fill counts them. A "change" made
 *  to one day only (a new title or time) is shown on that day. */
export function plannedRepeats(
  series: PlannedSeries[], exceptions: PlannedException[],
  tasks: { series_id: string | null; planned_date: string | null }[],
  from: string, to: string, horizon: string,
): PlannedRepeat[] {
  const start = from > horizon ? from : addDays(horizon, 1)
  if (start > to) return []
  const taken = new Map<string, Set<string>>()
  for (const t of tasks) {
    if (!t.series_id || !t.planned_date) continue
    const set = taken.get(t.series_id) ?? new Set<string>()
    set.add(t.planned_date)
    taken.set(t.series_id, set)
  }
  const out: PlannedRepeat[] = []
  for (const s of series) {
    if (s.deleted_at || !s.active) continue
    const own = exceptions.filter((e) => e.series_id === s.id && !e.deleted_at)
    const days = taken.get(s.id)
    for (const occ of plan(s, start, to, own)) {
      if (occ.base <= horizon) continue
      if (days?.has(occ.date) || days?.has(occ.base)) continue
      const change = own.find((e) => e.exception_date === occ.base && e.action === 'change')?.changes ?? {}
      const title = typeof change.title === 'string' && change.title ? change.title : s.title
      const time = typeof change.planned_time === 'string' ? change.planned_time : s.time_of_day
      out.push({
        seriesId: s.id, base: occ.base, date: occ.date, title,
        time: time ? time.slice(0, 5) : null,
        duration_min: s.task_template?.duration_min ?? null,
        category: s.task_template?.category ?? null,
        module_key: s.module_key,
      })
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99')
    || a.title.localeCompare(b.title))
  return out
}
