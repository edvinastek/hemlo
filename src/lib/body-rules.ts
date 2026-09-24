/** The weigh-in's arithmetic, kept apart from the database and React so it
 *  can be checked by hand in src/test/body.check.mjs. Days are the user's
 *  local calendar days as 'yyyy-MM-dd' strings throughout. */

export const WEIGHT_MIN = 30
export const WEIGHT_MAX = 300
export const WAIST_MIN = 40
export const WAIST_MAX = 250

export type Parsed = { ok: true; value: number | null } | { ok: false; message: string }

/** People in the Netherlands and most of Europe type 82,4, so a decimal comma
 *  is read the same as a point rather than refused. */
function toNumber(input: string): number | null {
  const s = input.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

/** Weight is required. The range is wide on purpose: it only catches a typo
 *  such as 8.24 or 824, never a real body. Stored to two decimals, which is
 *  what the server's numeric(5,2) column keeps anyway. */
export function parseWeight(input: string): Parsed {
  if (input.trim() === '') return { ok: false, message: 'Put in a weight in kg.' }
  const n = toNumber(input)
  if (n === null) return { ok: false, message: 'Weight should be a number, like 82.4.' }
  if (n < WEIGHT_MIN || n > WEIGHT_MAX) {
    return { ok: false, message: `Weight should be between ${WEIGHT_MIN} and ${WEIGHT_MAX} kg.` }
  }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

/** Waist is optional, so an empty box is a valid answer and means none. */
export function parseWaist(input: string): Parsed {
  if (input.trim() === '') return { ok: true, value: null }
  const n = toNumber(input)
  if (n === null) return { ok: false, message: 'Waist should be a number, like 84.5.' }
  if (n < WAIST_MIN || n > WAIST_MAX) {
    return { ok: false, message: `Waist should be between ${WAIST_MIN} and ${WAIST_MAX} cm.` }
  }
  return { ok: true, value: Math.round(n * 10) / 10 }
}

/** A weigh-in for a day that has not happened yet would also write targets
 *  starting that day, and every screen reads the newest targets. Both days are
 *  'yyyy-MM-dd', so comparing the strings compares the dates. */
export function isFutureDay(day: string, today: string): boolean {
  return day > today
}

/** Whole days since 1970 for a calendar day. UTC is used only as a counter
 *  here, so a daylight-saving change cannot make two days 23 hours apart. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

export interface WeighInPoint { log_date: string; weight_kg: number }

/** Newest first, one per day. Two local rows for one day can only come from
 *  a sync race; the later one in the list is dropped rather than drawn twice. */
export function newestFirst<T extends WeighInPoint>(rows: T[]): T[] {
  const seen = new Set<string>()
  return [...rows]
    .sort((a, b) => b.log_date.localeCompare(a.log_date))
    .filter((r) => (seen.has(r.log_date) ? false : (seen.add(r.log_date), true)))
}

/** Each weigh-in with its change against the one before it. The change for
 *  the oldest shown row still uses the entry before it when there is one, so
 *  pass the whole history and slice afterwards. */
export function withChanges<T extends WeighInPoint>(rows: T[]): (T & { change: number | null })[] {
  const sorted = newestFirst(rows)
  return sorted.map((r, i) => {
    const prev = sorted[i + 1]
    return { ...r, change: prev ? Math.round((r.weight_kg - prev.weight_kg) * 100) / 100 : null }
  })
}

/** The 7-day moving average at each weigh-in: the mean of every weigh-in in
 *  the window of calendar days ending that day. It is counted in days, not in
 *  entries, because people skip days and eight entries can span a month.
 *  Returned oldest first, the order a line is drawn in. */
export function movingAverage(rows: WeighInPoint[], windowDays = 7): { log_date: string; avg: number }[] {
  const asc = newestFirst(rows).reverse()
  return asc.map((r) => {
    const end = dayNumber(r.log_date)
    const inWindow = asc.filter((o) => {
      const n = dayNumber(o.log_date)
      return n <= end && n > end - windowDays
    })
    const sum = inWindow.reduce((s, o) => s + o.weight_kg, 0)
    return { log_date: r.log_date, avg: Math.round((sum / inWindow.length) * 100) / 100 }
  })
}

/** SVG polyline points for a series, x spaced by calendar day so a gap in the
 *  weigh-ins shows as a gap in time. A flat series sits in the middle rather
 *  than dividing by zero. */
export function trendPoints(
  series: { log_date: string; avg: number }[],
  width: number,
  height: number,
  pad = 2,
): string {
  if (series.length === 0) return ''
  const xs = series.map((p) => dayNumber(p.log_date))
  const ys = series.map((p) => p.avg)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  const w = width - pad * 2, h = height - pad * 2
  return series
    .map((p, i) => {
      const x = x1 === x0 ? width / 2 : pad + ((xs[i] - x0) / (x1 - x0)) * w
      const y = y1 === y0 ? height / 2 : pad + (1 - (p.avg - y0) / (y1 - y0)) * h
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
    })
    .join(' ')
}

/** A change written the way a person reads it, with a true minus sign. */
export function formatChange(change: number | null): string {
  if (change === null) return 'first entry'
  if (Math.abs(change) < 0.05) return 'no change'
  const abs = Math.abs(change).toFixed(1)
  return change > 0 ? `+${abs} kg` : `−${abs} kg`
}

/** What the targets calculation still needs from the profile, in the user's
 *  words. The calculation would otherwise fall back to a guessed height and
 *  age and show numbers that look precise and are not. */
export function missingForTargets(p: { height_cm: number | null; birth_date: string | null }): string | null {
  const missing: string[] = []
  if (!p.height_cm || Number(p.height_cm) <= 0) missing.push('height')
  if (!p.birth_date) missing.push('date of birth')
  if (missing.length === 0) return null
  return `Targets need your ${missing.join(' and ')}. Add ${missing.length > 1 ? 'them' : 'it'} under More, then save a weigh-in to work them out.`
}
