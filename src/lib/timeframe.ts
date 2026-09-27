// A task's length can be given as minutes or as a time it runs until. Only
// minutes are stored; these turn one into the other. Pure, so the checks can
// run them without a browser.

const DAY = 24 * 60

/** Minutes after midnight for 'HH:MM' or 'HH:MM:SS' (the server sends
 *  seconds), or null for anything that is not a real time of day. */
export function toMinutes(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(time?.trim() ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 'HH:MM' for minutes after midnight; anything past midnight wraps round. */
export function fromMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % DAY) + DAY) % DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** How long from start to end. An end earlier than the start is read as the
 *  next morning (22:00 until 01:00 is three hours), because nobody means a
 *  negative length. The same time is nothing rather than a whole day: it is
 *  what an untouched field shows, not a choice. Never more than 24 hours. */
export function durationBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s === null || e === null) return null
  return Math.min(DAY, (e - s + DAY) % DAY)
}

/** Whether a length can be shown as an end time. A day or more cannot: the
 *  clock would come back round and the end would say less than was meant. */
export function fitsInDay(minutes: number | null | undefined): minutes is number {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 && minutes < DAY
}

/** The end time for a start and a length, or null when there is no start or
 *  the length would not fit on a clock face. */
export function endFrom(start: string | null | undefined, minutes: number | null | undefined): string | null {
  const s = toMinutes(start)
  if (s === null || !fitsInDay(minutes)) return null
  return fromMinutes(s + minutes)
}

/** A short length for a label with little room: "45 min", "1 h", "2 h 30". */
export function shortSpan(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return ''
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`
}
