import { addDays, fromDayNumber, toDayNumber, weekdayOf } from './series-rules.ts'

/** Pure calendar logic for moving about in time: how far the app lets a
 *  person go, and how the months of the scrolling calendar are laid out.
 *  Days are 'yyyy-MM-dd' and months 'yyyy-MM', as everywhere else. */

/** Every view reaches three years back and five years ahead of today. Far
 *  enough to look back at a past year and plan a long way out; near enough
 *  that nothing has to be worked out for centuries of empty days. */
export const YEARS_BACK = 3
export const YEARS_AHEAD = 5

export interface DayRange { first: string; last: string }

/** A month moved on (or back) by a number of months: '2026-09' + 5 is '2027-02'. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const year = Math.floor(total / 12)
  return `${String(year).padStart(4, '0')}-${String(total - year * 12 + 1).padStart(2, '0')}`
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** The range the app lets a person move in, whole months at each end: from
 *  the first of the month three years back to the last of the month five
 *  years ahead. */
export function navRange(today: string): DayRange {
  const month = today.slice(0, 7)
  const firstMonth = addMonths(month, -12 * YEARS_BACK)
  const lastMonth = addMonths(month, 12 * YEARS_AHEAD)
  return { first: `${firstMonth}-01`, last: `${lastMonth}-${String(daysInMonth(lastMonth)).padStart(2, '0')}` }
}

export const inRange = (day: string, range: DayRange) => day >= range.first && day <= range.last

/** The nearest day inside the range: a day past either end becomes that end. */
export function clampDay(day: string, range: DayRange): string {
  if (day < range.first) return range.first
  if (day > range.last) return range.last
  return day
}

/** Where a swipe of the week strip lands: a week on or back, stopping at the
 *  end of the range. Null when the day is already at that end, so the strip
 *  does not pretend to move. */
export function moveWeek(day: string, dir: 1 | -1, range: DayRange): string | null {
  if (dir === 1 ? day >= range.last : day <= range.first) return null
  return clampDay(addDays(day, dir * 7), range)
}

/* ---------- the scrolling month calendar --------------------------------- */

/** One month of the vertical calendar. `lead` is how many empty cells come
 *  before the 1st, with weeks starting on Monday; `weeks` is how many rows
 *  of seven the month needs (four to six). */
export interface MonthBlock { key: string; lead: number; days: number; weeks: number }

export function monthBlock(month: string): MonthBlock {
  const lead = (weekdayOf(`${month}-01`) + 6) % 7
  const days = daysInMonth(month)
  return { key: month, lead, days, weeks: Math.ceil((lead + days) / 7) }
}

/** Every month from the one holding `first` to the one holding `last`. */
export function monthsBetween(first: string, last: string): MonthBlock[] {
  const out: MonthBlock[] = []
  const end = last.slice(0, 7)
  for (let m = first.slice(0, 7); m <= end; m = addMonths(m, 1)) out.push(monthBlock(m))
  return out
}

/** Where each month starts, top to bottom, when every month has a heading
 *  of `headH` pixels and every week row is `rowH` tall. Known heights are
 *  what let the calendar draw only the months near the screen. */
export function monthTops(months: MonthBlock[], headH: number, rowH: number, columns = 1): { tops: number[]; total: number } {
  const tops: number[] = []
  let y = 0
  // With more than one column (a wide screen), months stand side by side in
  // rows of `columns`; every month in a row starts at the row's top, and the
  // row is as tall as its tallest month.
  const cols = Math.max(1, Math.floor(columns))
  for (let i = 0; i < months.length; i += cols) {
    const row = months.slice(i, i + cols)
    for (let k = 0; k < row.length; k++) tops.push(y)
    y += headH + Math.max(...row.map((m) => m.weeks)) * rowH
  }
  return { tops, total: y }
}

/** The month showing at a scroll position: the last one starting at or above it. */
export function monthAt(tops: number[], y: number): number {
  let lo = 0
  let hi = tops.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tops[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** The position of a month in the list, or the nearest end when it falls outside. */
export function monthIndex(months: MonthBlock[], day: string): number {
  if (months.length === 0) return 0
  const key = day.slice(0, 7)
  if (key <= months[0].key) return 0
  if (key >= months[months.length - 1].key) return months.length - 1
  const [y0, m0] = months[0].key.split('-').map(Number)
  const [y, m] = key.split('-').map(Number)
  return (y - y0) * 12 + (m - m0)
}

/** The days of one month in order, as 'yyyy-MM-dd'. */
export function monthDays(block: MonthBlock): string[] {
  const start = toDayNumber(`${block.key}-01`)
  return Array.from({ length: block.days }, (_, i) => fromDayNumber(start + i))
}
