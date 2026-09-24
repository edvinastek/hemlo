import type { Series, SeriesException } from './types'

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
    default:
      return false
  }
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

/* ---------- the Repeat control ------------------------------------------- */

export type RepeatKind = 'never' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly'

/** What the Repeat control holds, turned into the series table's shape. The
 *  start day decides the defaults: weekly with no day picked repeats on the
 *  start's weekday, monthly on the start's day of the month. */
export function ruleFromChoice(kind: Exclude<RepeatKind, 'never'>, start: string, weekdays: number[] = []):
  Pick<Series, 'rule' | 'rule_config'> {
  const days = [...new Set(weekdays)].filter((w) => w >= 0 && w <= 6).sort((a, b) => a - b)
  const picked = days.length ? days : [weekdayOf(start)]
  switch (kind) {
    case 'daily': return { rule: 'daily', rule_config: {} }
    case 'weekdays': return { rule: 'weekdays', rule_config: {} }
    case 'weekly': return { rule: 'weekly', rule_config: { weekdays: picked } }
    case 'biweekly': return { rule: 'every_n_weeks', rule_config: { n: 2, weekdays: picked } }
    case 'monthly': return { rule: 'monthly', rule_config: { day_of_month: Number(start.slice(8, 10)) } }
  }
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
    default: text = 'Repeats'
  }
  if (s.end_date) text += ` until ${shortDate(s.end_date)}`
  if (s.occurrence_count != null) text += `, ${s.occurrence_count} times`
  return text
}

/** Which Repeat choice a stored series corresponds to, to show it in the control. */
export function choiceFromRule(s: Pick<Series, 'rule' | 'rule_config'>): Exclude<RepeatKind, 'never'> {
  if (s.rule === 'every_n_weeks') return 'biweekly'
  return s.rule
}
