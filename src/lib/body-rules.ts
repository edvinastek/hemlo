/** The weigh-in's arithmetic, kept apart from the database and React so it
 *  can be checked by hand in src/test/body.check.mjs. Days are the user's
 *  local calendar days as 'yyyy-MM-dd' strings throughout. */

import { readPlan, type BodyPlan } from './calc.ts'
import { readAnswers, type ActivityAnswers } from './activity.ts'
import { readAdaptiveChoice, type AdaptiveChoice } from './adaptive-rules.ts'

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
  // Day numbers are worked out once and the window's start only moves
  // forward, because this runs on every render over the whole history, which
  // grows by one row a day for years. The window is summed afresh each time
  // (it holds at most one entry a day) so rounding cannot build up.
  const asc = newestFirst(rows).reverse()
  const days = asc.map((r) => dayNumber(r.log_date))
  const out: { log_date: string; avg: number }[] = []
  let start = 0
  for (let i = 0; i < asc.length; i++) {
    while (days[start] <= days[i] - windowDays) start++
    let sum = 0
    for (let j = start; j <= i; j++) sum += asc[j].weight_kg
    out.push({ log_date: asc[i].log_date, avg: Math.round((sum / (i - start + 1)) * 100) / 100 })
  }
  return out
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
 *  words. The calculation would otherwise have to guess a height, an age or
 *  a sex and show numbers that look precise and are not (BODY-05). */
export function missingForTargets(p: { height_cm: number | null; birth_date: string | null; sex?: string | null }): string | null {
  const names = { sex: 'sex', height: 'height', birth_date: 'date of birth' } as const
  const missing = missingFields(p).map((f) => names[f])
  if (missing.length === 0) return null
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return `Targets need your ${list}.`
}

/** The same check as a list, so the form can ask for exactly what is absent.
 *  A height of 0 or one that is not a number counts as absent: More saves
 *  Number(text), which turns an empty box into 0. Sex is checked when the
 *  profile carries the field (a profile row always does). */
export function missingFields(p: { height_cm: number | null; birth_date: string | null; sex?: string | null }): ('sex' | 'height' | 'birth_date')[] {
  const out: ('sex' | 'height' | 'birth_date')[] = []
  if ('sex' in p && p.sex !== 'male' && p.sex !== 'female') out.push('sex')
  const h = Number(p.height_cm)
  if (!p.height_cm || !Number.isFinite(h) || h <= 0) out.push('height')
  if (!p.birth_date) out.push('birth_date')
  return out
}

export const HEIGHT_MIN = 100
export const HEIGHT_MAX = 250

/** Height in cm, for filling in a profile that has none. Like weight, the
 *  range only catches a slip such as 1.80 typed in metres. */
export function parseHeight(input: string): Parsed {
  if (input.trim() === '') return { ok: false, message: 'Put in a height in cm.' }
  const n = toNumber(input)
  if (n === null) return { ok: false, message: 'Height should be a number, like 180.' }
  if (n < HEIGHT_MIN || n > HEIGHT_MAX) {
    return { ok: false, message: `Height should be between ${HEIGHT_MIN} and ${HEIGHT_MAX} cm.` }
  }
  return { ok: true, value: Math.round(n * 10) / 10 }
}

export type ParsedDay = { ok: true; value: string } | { ok: false; message: string }

/** A date of birth as 'yyyy-MM-dd', the form a date input gives. It has to be
 *  a real calendar day (not 31 February), not after today and not more than
 *  120 years back, or the age in the calculation would be nonsense. */
export function parseBirthDate(input: string, today: string): ParsedDay {
  const s = input.trim()
  if (s === '') return { ok: false, message: 'Put in a date of birth.' }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return { ok: false, message: 'Date of birth should be a date, like 1996-02-01.' }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const back = new Date(Date.UTC(y, mo - 1, d))
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return { ok: false, message: 'That date does not exist.' }
  }
  if (s > today) return { ok: false, message: 'Date of birth cannot be after today.' }
  if (y < Number(today.slice(0, 4)) - 120) return { ok: false, message: 'Date of birth is more than 120 years ago.' }
  return { ok: true, value: s }
}

/** The weigh-in the targets should come from when they are worked out
 *  without a new save: the one on the day, else the latest before it. */
export function latestOnOrBefore<T extends WeighInPoint>(rows: T[], day: string): T | null {
  return newestFirst(rows).find((r) => r.log_date <= day) ?? null
}

/** Which copy of the profile the weigh-in works from. The list is preferred
 *  because it follows the local rows live, while the active profile in the
 *  store is only replaced on a switch and keeps an old height after an edit.
 *  Another profile is never used in its place. */
export function pickProfile<T extends { id: string }>(profiles: T[], active: T | null, id: string): T | null {
  return profiles.find((p) => p.id === id) ?? (active?.id === id ? active : null)
}

// ---- the body settings kept with Health (BODY-03, BODY-10, BODY-16) ------------------------


export interface BodySettings { plan: BodyPlan; activity: ActivityAnswers; adaptive: AdaptiveChoice }

/** As stored in the Health module's settings ("body"), every value checked.
 *  `adaptive` is what the person did with the adaptive estimate (BODY-17). */
export function readBodySettings(v: unknown): BodySettings {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { plan: readPlan(r.plan), activity: readAnswers(r.activity), adaptive: readAdaptiveChoice(r.adaptive) }
}

/** Which change led to new targets, as the note under them says it. */
export type RecalcWhy = 'goal' | 'activity' | 'height' | 'birth_date' | 'sex' | 'plan' | 'weigh-in'
export function recalcReason(why: RecalcWhy): string {
  switch (why) {
    case 'goal': return 'recalculated after the goal changed'
    case 'activity': return 'recalculated after the activity changed'
    case 'height': return 'recalculated after the height changed'
    case 'birth_date': return 'recalculated after the date of birth changed'
    case 'sex': return 'recalculated after sex changed'
    case 'plan': return 'recalculated after the plan’s numbers changed'
    default: return ''
  }
}
