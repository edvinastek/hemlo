/** Pure rules for habits and supplements: which days a habit is due, how long
 *  its current run is, and how supplements are grouped. No database and no
 *  React here, so every rule can be checked by hand in src/test/tracking.check.mjs.
 *
 *  Days are the user's local calendar days as 'yyyy-MM-dd'. The arithmetic
 *  below reads the three numbers out of that string and counts on a UTC
 *  calendar, which has no daylight-saving gaps, so a day never becomes 23 or
 *  25 hours long and no timezone can shift it. */

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

/** Whether a habit is due on the given day. A weekly habit is due every day
 *  of its week until it is done once, so it counts as scheduled on each. */
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

  let count = 0
  let cursor = day
  let first = true
  for (let i = 0; i < LOOKBACK; i++, cursor = addDays(cursor, -1)) {
    if (!isScheduled(schedule, cursor)) continue
    if (done.has(cursor)) count++
    else if (!first) break
    first = false
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
export function groupBySlot<T extends { time_slot: SupplementSlot | null; sort_order: number; name: string }>(
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
