/** Pure rules for habits and supplements: which days a habit is due, how long
 *  its current run is, and how supplements are grouped. No database and no
 *  React here, so every rule can be checked by hand in src/test/tracking.check.mjs.
 *
 *  Days are the user's local calendar days as 'yyyy-MM-dd'. The arithmetic
 *  below reads the three numbers out of that string and counts on a UTC
 *  calendar, which has no daylight-saving gaps, so a day never becomes 23 or
 *  25 hours long and no timezone can shift it. */

import {
  habitSchedule, habitDay, daysIn, occursOn, isDay as isDayString, mondayOf, toDayNumber, fromDayNumber,
  addDays as addDayString, type HabitLike, type RuleKind, type RuleConfig, type Schedule,
} from './schedule-rules.ts'

export type HabitSchedule = 'daily' | 'weekdays' | 'weekly'
export type SupplementSlot = 'morning' | 'midday' | 'evening'

export const SCHEDULES: HabitSchedule[] = ['daily', 'weekdays', 'weekly']
export const SCHEDULE_LABEL: Record<HabitSchedule, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Once a week',
}

export const SLOTS: SupplementSlot[] = ['morning', 'midday', 'evening']
export const SLOT_LABEL: Record<SupplementSlot, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
}

const DAY_MS = 86_400_000

function toUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${mm}-${dd}`
}

/** The day n days after (or before, for negative n) the given day. */
export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS)
}

/** 0 is Sunday to 6 Saturday, as Date.getDay() counts. */
export function weekday(day: string): number {
  return new Date(toUtc(day)).getUTCDay()
}

/** The Monday that starts the week the day falls in. Weeks start on Monday
 *  because that is how the Netherlands and most of Europe count them. */
export function weekStart(day: string): string {
  return addDays(day, -((weekday(day) + 6) % 7))
}

/** Whether a habit is due on the given day, from the old three-way field
 *  only. Kept for its checks; the app asks schedule-rules.ts (habitDay,
 *  habitShows, habitSchedule), which also knows weekends, chosen days,
 *  dates, start and end days and N times a week. A weekly habit is due
 *  every day of its week until it is done once. */
export function isScheduled(schedule: HabitSchedule, day: string): boolean {
  if (schedule === 'weekdays') {
    const w = weekday(day)
    return w !== 0 && w !== 6
  }
  return true
}

/** Streaks never look back further than this. A run longer than ten years
 *  is shown as ten years rather than walking the calendar forever. */
const LOOKBACK = 3660

/** The current run of a habit: how many scheduled days in a row were done,
 *  counting back from the day shown. Days after the day shown are ignored.
 *
 *  The day shown still being open does not break the run: a daily habit not
 *  yet ticked this morning keeps yesterday's count until the day is over.
 *  For a weekdays habit, Saturdays and Sundays are skipped, neither adding
 *  to the run nor breaking it. For a weekly habit the unit is a week: any
 *  done day inside a Monday-to-Sunday week counts that week once. */
export function currentStreak(schedule: HabitSchedule, doneDays: Iterable<string>, day: string): number {
  const done = new Set<string>()
  for (const d of doneDays) if (d <= day) done.add(d)
  if (done.size === 0) return 0

  if (schedule === 'weekly') return weeklyStreak(done, day)

  // Only the day shown itself is still open. Looking back from a Saturday,
  // the first scheduled day of a weekdays habit is Friday, which is over, so
  // a missed Friday has to end the run rather than be treated as open.
  let count = 0
  let cursor = day
  for (let i = 0; i < LOOKBACK; i++, cursor = addDays(cursor, -1)) {
    if (!isScheduled(schedule, cursor)) continue
    if (done.has(cursor)) count++
    else if (cursor !== day) break
  }
  return count
}

function weeklyStreak(done: Set<string>, day: string): number {
  const weeksDone = new Set<string>()
  for (const d of done) weeksDone.add(weekStart(d))
  let count = 0
  let cursor = weekStart(day)
  let first = true
  for (let i = 0; i < LOOKBACK / 7; i++, cursor = addDays(cursor, -7)) {
    if (weeksDone.has(cursor)) count++
    else if (!first) break
    first = false
  }
  return count
}

/** Whether a weekly habit was already done on another day of the same week,
 *  up to and including the day shown, so the row can say so. */
export function doneThisWeek(doneDays: Iterable<string>, day: string): boolean {
  const start = weekStart(day)
  for (const d of doneDays) if (d >= start && d <= day) return true
  return false
}

/** How a streak reads in a row's meta line: a plain number with its unit.
 *  Nothing is said for zero, since there is nothing to report. */
export function streakText(schedule: HabitSchedule, n: number): string {
  if (n <= 0) return ''
  if (schedule === 'weekly') return n === 1 ? '1 week running' : `${n} weeks running`
  return n === 1 ? '1 day running' : `${n} days running`
}

/** Tidy a name typed into a form: trimmed, inner runs of spaces collapsed.
 *  Returns null for a name that is empty once tidied. */
export function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim()
  return name.length ? name : null
}

/** The sort order for a new row, placed after every existing one. */
export function nextSortOrder(rows: { sort_order: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1
}

/** Supplements grouped by slot in the order of the day, each group sorted by
 *  its sort order then name. Rows without a slot go last under "Any time".
 *  Empty groups are left out. */
export function groupBySlot<T extends { time_slot: string | null; sort_order: number; name: string }>(
  rows: T[],
): { slot: SupplementSlot | null; label: string; rows: T[] }[] {
  const order: (SupplementSlot | null)[] = [...SLOTS, null]
  return order
    .map((slot) => ({
      slot,
      label: slot ? SLOT_LABEL[slot] : 'Any time',
      rows: rows
        .filter((r) => (SLOTS.includes(r.time_slot as SupplementSlot) ? r.time_slot : null) === slot)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.rows.length > 0)
}

/** The log that decides a day's tick when a device holds more than one for
 *  the same day. That only happens when two devices each ticked it while
 *  offline; the server keeps one, and the most recent edit is the one the
 *  person last saw, so it wins here too. */
export function pickLog<T extends { updated_at: string }>(rows: T[]): T | undefined {
  let best: T | undefined
  for (const r of rows) if (!best || r.updated_at > best.updated_at) best = r
  return best
}

/** The days a habit counts as done, from its logs, with one decision per
 *  day by the same rule as pickLog. */
export function doneDays<T extends { log_date: string; done: boolean; updated_at: string }>(rows: T[]): string[] {
  const byDay = new Map<string, T>()
  for (const r of rows) {
    const seen = byDay.get(r.log_date)
    if (!seen || r.updated_at > seen.updated_at) byDay.set(r.log_date, r)
  }
  return [...byDay.values()].filter((r) => r.done).map((r) => r.log_date).sort()
}

/* ---------- version 16: any schedule ------------------------------------- */
// Habits now take any schedule from the one repeat engine (schedule-rules.ts),
// so the streak, the strength and the history below read the habit's own
// schedule instead of the three old words. Old habits still read the same:
// habitSchedule() turns "daily", "weekdays" and "weekly" into rules.


/** How a run is counted: in days for habits due every day (or every weekday,
 *  or weekend day), in weeks for "N times a week", and in times otherwise
 *  ("Mon, Wed, Fri" runs 6 times). */
export type StreakUnit = 'day' | 'week' | 'time'

const unitFor = (s: Schedule): StreakUnit =>
  s.rule === 'times_per_week' ? 'week'
    : (s.rule === 'daily' && (s.rule_config.n ?? 1) <= 1) || s.rule === 'weekdays' || s.rule === 'weekends' ? 'day' : 'time'

/** Weeks of a times-a-week habit that reached their number, as Mondays. */
function weeksMet(doneDays: Set<string>, times: number): Set<string> {
  const perWeek = new Map<string, number>()
  for (const d of doneDays) {
    const mon = fromDayNumber(mondayOf(toDayNumber(d)))
    perWeek.set(mon, (perWeek.get(mon) ?? 0) + 1)
  }
  return new Set([...perWeek].filter(([, n]) => n >= times).map(([m]) => m))
}

/** The current run of any habit, counting back from the day shown. The day
 *  shown (or, for a times-a-week habit, its week) still being open never
 *  breaks the run. A habit not yet started, or ended, runs as far as it got. */
export function habitStreak(h: HabitLike, done: Iterable<string>, day: string): { n: number; unit: StreakUnit } {
  const s = habitSchedule(h)
  const unit = unitFor(s)
  const doneDays = new Set<string>()
  for (const d of done) if (d <= day) doneDays.add(d)
  if (!doneDays.size) return { n: 0, unit }
  if (s.rule === 'times_per_week') {
    const met = weeksMet(doneDays, Math.max(1, s.rule_config.times ?? 1))
    let n = 0
    let mon = fromDayNumber(mondayOf(toDayNumber(day)))
    for (let i = 0; i < LOOKBACK / 7; i++, mon = addDayString(mon, -7)) {
      if (met.has(mon)) n++
      else if (i > 0) break
      if (mon < s.start_date) break
    }
    return { n, unit }
  }
  const due = daysIn(s, addDayString(day, -LOOKBACK), day)
  let n = 0
  for (let i = due.length - 1; i >= 0; i--) {
    if (doneDays.has(due[i])) n++
    else if (due[i] !== day) break
  }
  return { n, unit }
}

/** How a run reads: "12 days running", "3 weeks running", "6 times running".
 *  Nothing at zero: there is nothing to report. */
export function habitStreakText(st: { n: number; unit: StreakUnit }): string {
  if (st.n <= 0) return ''
  const word = st.unit === 'day' ? 'day' : st.unit === 'week' ? 'week' : 'time'
  return `${st.n} ${st.n === 1 ? word : `${word}s`} running`
}

/** How far back the strength looks. Older days have almost no weight left. */
const STRENGTH_DAYS = 400

/** A forgiving strength, 0 to 100 (HAB-07), in the spirit of Loop's habit
 *  score: each due day (each week, for a times-a-week habit) moves the
 *  strength a step towards 100 when done and a step towards 0 when missed.
 *  The step is sized so that about the last two weeks of due days carry half
 *  the weight: one miss after a good month costs a few points, it does not
 *  start the count again. The day shown, while still open, does not count.
 *  The look-back starts on the habit's start day, or on its first tick for a
 *  habit with no start day, so a new habit is not weighed down by the time
 *  before it existed. */
export function habitStrength(h: HabitLike, done: Iterable<string>, day: string): number {
  return habitStrengths(h, done, [day])[day] ?? 0
}

/** The strength on each of several days at once (Stats draws it day by day,
 *  HAB-07, STA-03): the same figure habitStrength gives for each day, with
 *  the habit's due days worked out once instead of once a day. The schedule
 *  keeps its own start day as its anchor, so an "every other day" or "on the
 *  15th" habit older than the look-back is read on its real days. */
export function habitStrengths(h: HabitLike, done: Iterable<string>, days: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  if (!days.length) return out
  const s = habitSchedule(h)
  const allDone = [...done].filter(isDayString).sort()
  const doneAll = new Set(allDone)
  const sorted = [...days].filter(isDayString).sort()
  const firstOf = (day: string) => (isDayString(h.start_date) ? h.start_date : allDone.find((d) => d <= day))
  // The window each day looks back over, and the habit's last day.
  const windowOf = (day: string) => {
    const first = firstOf(day)
    if (!first) return null
    const from = [first, addDayString(day, -STRENGTH_DAYS)].sort()[1]
    const end = s.end_date && s.end_date < day ? s.end_date : day
    return end < from ? null : { from, end }
  }
  const weighed = (values: number[], from: string, end: string) => {
    if (!values.length) return 0
    const perDay = s.rule === 'times_per_week' ? 1 / 7 : Math.min(1, values.length / Math.max(1, toDayNumber(end) - toDayNumber(from) + 1))
    const halfLife = Math.max(3, Math.round(14 * perDay))
    const step = 1 - Math.pow(0.5, 1 / halfLife)
    let strength = 0
    for (const v of values) strength += (v - strength) * step
    return Math.round(strength * 100)
  }
  if (s.rule === 'times_per_week') {
    const times = Math.max(1, s.rule_config.times ?? 1)
    const perWeek = new Map<number, number>()
    for (const d of allDone) { const m = mondayOf(toDayNumber(d)); perWeek.set(m, (perWeek.get(m) ?? 0) + 1) }
    for (const day of sorted) {
      const w = windowOf(day)
      if (!w) { out[day] = 0; continue }
      // Values per week, oldest first: a share for a week that got part of
      // its number; the week still running counts only once its number is reached.
      const values: number[] = []
      const thisWeek = mondayOf(toDayNumber(day))
      const last = toDayNumber(w.end)
      for (let mon = mondayOf(toDayNumber(w.from)); mon <= last; mon += 7) {
        let n = perWeek.get(mon) ?? 0
        // In the week of the day itself, only ticks up to the day count.
        if (mon === thisWeek) { n = 0; for (let i = 0; i < 7; i++) { const d = fromDayNumber(mon + i); if (d <= day && doneAll.has(d)) n++ } }
        if (mon === thisWeek && n < times) continue
        values.push(Math.min(1, n / times))
      }
      out[day] = weighed(values, w.from, w.end)
    }
    return out
  }
  // Every due day the windows can reach, worked out once.
  const windows = sorted.map((d) => windowOf(d))
  const reach = windows.filter((w): w is { from: string; end: string } => !!w)
  if (!reach.length) { for (const d of sorted) out[d] = 0; return out }
  const lo = reach.map((w) => w.from).sort()[0]
  const hi = reach.map((w) => w.end).sort().at(-1)!
  const sched = isDayString(s.start_date) ? s : { ...s, start_date: lo }
  const due = daysIn(sched, lo, hi)
  const firstAt = (d: string) => { let a = 0; let b = due.length; while (a < b) { const m = (a + b) >> 1; if (due[m] < d) a = m + 1; else b = m } return a }
  sorted.forEach((day, i) => {
    const w = windows[i]
    if (!w) { out[day] = 0; return }
    const values: number[] = []
    for (let k = firstAt(w.from); k < due.length && due[k] <= w.end; k++) {
      const d = due[k]
      // Only ticks up to the day count; the day itself, while open, does not.
      const hit = d <= day && doneAll.has(d)
      if (d === day && !hit) continue
      values.push(hit ? 1 : 0)
    }
    out[day] = weighed(values, w.from, w.end)
  })
  return out
}

export type HistoryCell = 'done' | 'missed' | 'open' | 'off' | 'future' | 'blank'

/** One month of a habit's history as weeks of seven days, Monday first, for
 *  the calendar grid (HAB-08). A past day it was due and not done is
 *  'missed'; a day of a times-a-week habit is never missed on its own, only
 *  'open'. Days outside the month are 'blank'. */
export function habitMonth(h: HabitLike, done: Iterable<string>, month: string, today: string): { day: string; cell: HistoryCell }[][] {
  const doneDays = new Set(done)
  const first = `${month}-01`
  const last = addDayString(fromDayNumber(toDayNumber(`${monthAfter(month)}-01`)), -1)
  const weeks: { day: string; cell: HistoryCell }[][] = []
  for (let mon = fromDayNumber(mondayOf(toDayNumber(first))); mon <= last; mon = addDayString(mon, 7)) {
    const week: { day: string; cell: HistoryCell }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDayString(mon, i)
      week.push({ day: d, cell: d < first || d > last ? 'blank' : historyCell(h, doneDays, d, today) })
    }
    weeks.push(week)
  }
  return weeks
}

/** The month after 'yyyy-MM'. */
export function monthAfter(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
/** The month before 'yyyy-MM'. */
export function monthBefore(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function historyCell(h: HabitLike, doneDays: Set<string>, d: string, today: string): HistoryCell {
  if (doneDays.has(d)) return 'done'
  if (d > today) return 'future'
  const s = habitSchedule(h)
  if (d < s.start_date || (s.end_date && d > s.end_date)) return 'off'
  if (s.rule === 'times_per_week') return d === today ? 'open' : (habitDay(h, d, doneDays) === 'met' ? 'off' : 'open')
  if (!occursOn(s, d)) return 'off'
  return d === today ? 'open' : 'missed'
}

/** The last year as columns of weeks (Monday first), oldest first, for the
 *  year-in-pixels strip: up to 53 columns of 7 cells. */
export function habitYear(h: HabitLike, done: Iterable<string>, today: string): HistoryCell[][] {
  const doneDays = new Set(done)
  const lastMon = fromDayNumber(mondayOf(toDayNumber(today)))
  const cols: HistoryCell[][] = []
  for (let mon = addDayString(lastMon, -52 * 7); mon <= lastMon; mon = addDayString(mon, 7)) {
    const col: HistoryCell[] = []
    for (let i = 0; i < 7; i++) col.push(historyCell(h, doneDays, addDayString(mon, i), today))
    cols.push(col)
  }
  return cols
}

/** Done against due over a range, for "28 of 31 due days" under the grid.
 *  A times-a-week habit counts its weeks instead. */
export function habitKept(h: HabitLike, done: Iterable<string>, from: string, to: string): { done: number; due: number; unit: 'day' | 'week' } {
  const s = habitSchedule(h)
  const doneDays = new Set<string>()
  for (const d of done) if (d >= from && d <= to) doneDays.add(d)
  if (s.rule === 'times_per_week') {
    const met = weeksMet(doneDays, Math.max(1, s.rule_config.times ?? 1))
    let due = 0
    for (let mon = fromDayNumber(mondayOf(toDayNumber(from))); mon <= to; mon = addDayString(mon, 7)) if (addDayString(mon, 6) <= to || met.has(mon)) due++
    return { done: met.size, due, unit: 'week' }
  }
  const dueDays = daysIn(s, from, to)
  return { done: dueDays.filter((d) => doneDays.has(d)).length, due: dueDays.length, unit: 'day' }
}

/** A habit's pinned checklist for one day (HAB-11): the note's checklist
 *  items, ticked from that day's log rather than from the note, so the note
 *  itself never changes and the ticks start fresh each day. `index` is the
 *  item's place among the checklist items, as setHabitChecks stores it. */
export function dayChecklist(note: string | null | undefined, checks: number[] | null | undefined): { index: number; line: number; text: string; depth: number; done: boolean }[] {
  const ticked = new Set(checks ?? [])
  const out: { index: number; line: number; text: string; depth: number; done: boolean }[] = []
  const lines = (note ?? '').split('\n')
  lines.forEach((raw, line) => {
    const m = /^([ \t]*)[-*+] \[[ xX]\](?: (.*))?$/.exec(raw.replace(/\r$/, ''))
    if (!m) return
    const index = out.length
    out.push({ index, line, text: (m[2] ?? '').trim(), depth: Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), done: ticked.has(index) })
  })
  return out
}

/** The ticks after tapping one item: on if it was off, off if it was on. */
export function toggleDayCheck(checks: number[] | null | undefined, index: number): number[] {
  const set = new Set(checks ?? [])
  if (set.has(index)) set.delete(index)
  else set.add(index)
  return [...set].sort((a, b) => a - b)
}

/** "5 of 8 glasses", "10 of 10 minutes"; the unit is the person's own word. */
export function amountText(amount: number | null | undefined, target: number | null | undefined, unit: string | null | undefined): string {
  const fmt = (n: number) => String(Math.round(n * 100) / 100)
  const u = unit ? ` ${unit}` : ''
  if (target == null) return amount == null ? '' : `${fmt(amount)}${u}`
  return `${fmt(amount ?? 0)} of ${fmt(target)}${u}`
}

/** Part of the day a habit is kept in when it has no clock time (HAB-03). */
export type DayPart = 'morning' | 'afternoon' | 'evening'
export const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening']
export const DAY_PART_LABEL: Record<DayPart, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

/** When in the day a habit sits: its clock time first, then its part of the
 *  day, then "any time". The key orders the Habits page and Today. */
export function habitWhen(h: { time_of_day?: string | null; day_part?: string | null }): { key: string; label: string } {
  if (h.time_of_day) return { key: h.time_of_day.slice(0, 5), label: h.time_of_day.slice(0, 5) }
  const part = DAY_PARTS.includes(h.day_part as DayPart) ? (h.day_part as DayPart) : null
  if (part) return { key: { morning: '08:00~', afternoon: '13:00~', evening: '19:00~' }[part], label: DAY_PART_LABEL[part] }
  return { key: '99', label: 'Any time' }
}

/* ---------- supplements: the person's slots and schedules ---------------- */

/** A time slot of the person's own (SUP-02): a key the supplements point
 *  to, the name shown, and an optional clock time. */
export interface SupplementSlotDef { key: string; name: string; time: string | null }

export const DEFAULT_SLOTS: SupplementSlotDef[] = [
  { key: 'morning', name: 'Morning', time: null },
  { key: 'midday', name: 'Midday', time: null },
  { key: 'evening', name: 'Evening', time: null },
]
export const MAX_SLOTS = 8
const SLOT_KEY = /^[a-z0-9_-]{1,40}$/

/** Slots as stored in the supplements module's settings, checked. Nothing
 *  stored (or the server's old list of plain words) gives the three
 *  defaults; a list the person made is theirs, in their order. */
export function readSlots(v: unknown): SupplementSlotDef[] {
  if (!Array.isArray(v) || !v.length || v.every((x) => typeof x === 'string')) return DEFAULT_SLOTS.map((s) => ({ ...s }))
  const seen = new Set<string>()
  const out: SupplementSlotDef[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    const key = typeof r.key === 'string' && SLOT_KEY.test(r.key) ? r.key : null
    const name = typeof r.name === 'string' ? cleanName(r.name)?.slice(0, 30) ?? null : null
    if (!key || !name || seen.has(key)) continue
    seen.add(key)
    const time = typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d/.test(r.time) ? r.time.slice(0, 5) : null
    out.push({ key, name, time })
    if (out.length >= MAX_SLOTS) break
  }
  return out.length ? out : DEFAULT_SLOTS.map((s) => ({ ...s }))
}

/** A key for a new slot, from its name, unique among the slots given. */
export function slotKey(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'slot'
  let key = base
  for (let i = 2; taken.includes(key); i++) key = `${base}-${i}`
  return key
}

export interface SupplementLike {
  id: string
  name: string
  dose_text: string | null
  time_slot: string | null
  sort_order: number
  active: boolean
  deleted_at: string | null
  rule?: RuleKind | null
  rule_config?: RuleConfig | null
  start_date?: string | null
  end_date?: string | null
}

/** Is a supplement taken on this day (SUP-03)? No rule means every day.
 *  Before its start day or after its last it is not. */
export function supplementDue(s: Pick<SupplementLike, 'rule' | 'rule_config' | 'start_date' | 'end_date'>, day: string): boolean {
  const start = isDayString(s.start_date) ? s.start_date : '2000-01-03'
  const end = isDayString(s.end_date) ? s.end_date : null
  if (day < start || (end && day > end)) return false
  if (!s.rule) return true
  return occursOn({ rule: s.rule, rule_config: s.rule_config ?? {}, start_date: start, end_date: end }, day)
}

/** The supplements in each of the person's slots, in the order of the day,
 *  each slot's rows by their order then name. Rows whose slot is gone go to
 *  "Any time" at the end, so a removed slot never hides a supplement.
 *  `day` given: only the ones due that day. Empty slots are left out. */
export function supplementGroups<T extends SupplementLike>(rows: T[], slots: SupplementSlotDef[], day?: string): { slot: SupplementSlotDef | null; label: string; rows: T[] }[] {
  const live = rows.filter((r) => r.active && !r.deleted_at && (!day || supplementDue(r, day)))
  const keys = new Set(slots.map((s) => s.key))
  const order = (a: T, b: T) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  const groups = slots.map((slot) => ({ slot, label: slot.name, rows: live.filter((r) => r.time_slot === slot.key).sort(order) }))
  const loose = live.filter((r) => !r.time_slot || !keys.has(r.time_slot)).sort(order)
  return [...groups, { slot: null, label: 'Any time', rows: loose }].filter((g) => g.rows.length > 0)
}
