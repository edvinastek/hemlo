/** Day start and day end (GEN-70): where the person's day begins and ends,
 *  and so which calendar day "today" is a little after midnight. Pure: no
 *  database, no React; the clock is passed in. Checked in
 *  src/test/dayedge.check.mjs.
 *
 *  The cut-off: a day that ends after midnight (day end earlier than day
 *  start, say 09:00 to 01:30) keeps the hours from midnight to its end, so
 *  at 00:40 it is still the day before for Today, ticks, food logs and the
 *  review. A day that ends before midnight (the stored default, 06:00 to
 *  22:00) changes nothing: the calendar day is the day. Day end decides it,
 *  not day start, so someone up at 05:30 with a 06:00 start still sees the
 *  new day at breakfast. The cut-off never passes noon. */

export interface DayEdgeFields {
  day_start?: string | null
  day_end?: string | null
}

export interface DayEdges {
  /** 'HH:MM' */
  start: string
  end: string
  /** Until this time of the night the day before goes on; '00:00' when the
   *  day ends before midnight. */
  cutoff: string
}

export const DEFAULT_DAY_START = '06:00'
export const DEFAULT_DAY_END = '22:00'
/** The latest a day may run on into the next morning. */
export const LATEST_CUTOFF = '12:00'

const pad = (n: number) => String(n).padStart(2, '0')

/** 'HH:MM' from what the server or a form stores ('06:00:00', '6:00'), or null. */
export function cleanClock(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null
}

/** The person's day edges, checked, with the defaults where one is missing. */
export function dayEdges(p: DayEdgeFields | null | undefined): DayEdges {
  const start = cleanClock(p?.day_start) ?? DEFAULT_DAY_START
  const end = cleanClock(p?.day_end) ?? DEFAULT_DAY_END
  // Only a day that ends after midnight runs on into the next morning.
  const cutoff = end < start ? (end > LATEST_CUTOFF ? LATEST_CUTOFF : end) : '00:00'
  return { start, end, cutoff }
}

/** The local calendar day of a moment, 'yyyy-MM-dd'. */
export function calendarDay(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/** The local clock of a moment, 'HH:MM'. */
export function clockOf(at: Date): string {
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** THE person's day for a moment: the calendar day, or the day before while
 *  the night has not reached the cut-off. Built from the date's parts, so a
 *  daylight-saving change never shifts it. A moment that cannot be read is
 *  read as now. */
export function planDay(now: Date, p: DayEdgeFields | null | undefined): string {
  const at = Number.isFinite(now.getTime()) ? now : new Date()
  const { cutoff } = dayEdges(p)
  if (cutoff === '00:00' || clockOf(at) >= cutoff) return calendarDay(at)
  return calendarDay(new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1, 12))
}

/** Is the moment in the hours after midnight that still belong to the day
 *  before? Then its clock reads as later than any evening time. */
export function inNightTail(now: Date, p: DayEdgeFields | null | undefined): boolean {
  return planDay(now, p) !== calendarDay(now)
}

/** A time of day as the day is read: times after midnight but before the
 *  cut-off come after 23:59 ('00:40' reads as '24:40'), so a day that runs
 *  past midnight lists them last. Anything not a time sorts after all
 *  times. */
export function dayOrderKey(time: string | null | undefined, cutoff: string): string {
  const t = cleanClock(time)
  if (!t) return '99:99'
  if (cutoff !== '00:00' && t < cutoff) return `${24 + Number(t.slice(0, 2))}${t.slice(2)}`
  return t
}

/** Is a time outside the person's day: before it starts ('early'), after it
 *  ends ('late'), or inside it (null)? In a day that runs past midnight the
 *  hours up to the cut-off are inside it (its end), and the hours between
 *  the cut-off and day start are early. */
export function edgeOf(time: string | null | undefined, e: DayEdges): 'early' | 'late' | null {
  const t = cleanClock(time)
  if (!t || e.start === e.end) return null
  if (e.end > e.start) return t < e.start ? 'early' : t >= e.end ? 'late' : null
  return dayOrderKey(t, e.cutoff) < e.start ? 'early' : null
}

/** Where the day's two edges go in a list of times already in day order:
 *  the index before which "Day starts" is drawn (null when nothing comes
 *  before it) and the index before which "Day ends" is drawn (null when
 *  nothing comes after it). A day with nothing outside its edges draws
 *  neither, so it looks just as it did. */
export function edgeSlots(times: (string | null)[], e: DayEdges): { start: number | null; end: number | null } {
  const edges = times.map((t) => edgeOf(t, e))
  const lastEarly = edges.lastIndexOf('early')
  const firstLate = edges.indexOf('late')
  return { start: lastEarly === -1 ? null : lastEarly + 1, end: firstLate === -1 ? null : firstLate }
}

/** How long the waking day is, in minutes: day start to day end, wrapping
 *  past midnight. Sixteen hours when they are the same. */
export function wakingMinutes(e: DayEdges): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const span = (m(e.end) - m(e.start) + 1440) % 1440
  return span === 0 ? 16 * 60 : span
}
