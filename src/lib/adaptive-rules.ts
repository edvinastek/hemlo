/** The adaptive estimate of maintenance (BODY-17), worked out with no
 *  database and no React (checked in src/test/adaptive.check.mjs).
 *
 *  What a person burns is what they eat less what their body stores:
 *  maintenance = average intake − the energy in the change of trend weight,
 *  at 7,700 kcal a kilo (MacroFactor's "calories out = calories in − change
 *  in stored energy", competitor review §8). The trend (trend-rules.ts)
 *  smooths out water and food, so a heavy day after a salty meal does not
 *  read as a kilo of fat.
 *
 *  It is offered only on enough data: the last two or three whole weeks
 *  before today, each with food logged on at least 6 of its 7 days and at
 *  least one weigh-in. A day logged at under half the usual amount counts as
 *  not logged (a day half filled in would make the estimate low). Today is
 *  left out: it is not over yet. */

import { trendLine, weeklyRate, type WeighIn } from './trend-rules.ts'

export const KCAL_PER_KG = 7700
export const DAYS_LOGGED_A_WEEK = 6
export const MIN_WEEKS = 2
export const MAX_WEEKS = 3
/** An estimate outside this is more likely missing logs than a real body. */
export const SANE = { min: 1200, max: 5000 }
/** A difference smaller than this from what the targets rest on now is not
 *  worth offering. */
export const WORTH_OFFERING = 50
/** "Not now" hides the offer for two weeks. */
export const SNOOZE_DAYS = 14

export interface DayIntake { day: string; kcal: number }

export type Adaptive =
  | {
    ok: true
    /** Maintenance, rounded to 10 kcal. */
    kcal: number
    /** Average intake on the days counted. */
    intake: number
    /** Trend change a week, kg (below zero is losing). */
    rate: number
    /** What that change is worth a day, kcal (below zero: the body gave energy). */
    stored: number
    weeks: number
    from: string
    to: string
    daysLogged: number
    weighIns: number
  }
  | { ok: false; reason: 'logs' | 'weigh-ins' | 'trend' | 'range' }

const dayNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000)
const fromNum = (n: number) => {
  const d = new Date(n * 86_400_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The estimate from the days' intake (only days with food logged) and every
 *  weigh-in, as of `today`. */
export function adaptiveEstimate(intake: DayIntake[], weighIns: WeighIn[], today: string): Adaptive {
  const end = dayNum(today) - 1
  const start = end - MAX_WEEKS * 7 + 1
  const byDay = new Map<number, number>()
  for (const d of intake) {
    const n = dayNum(d.day)
    if (n < start || n > end || !(d.kcal > 0)) continue
    byDay.set(n, (byDay.get(n) ?? 0) + d.kcal)
  }
  // A day logged at under half the usual is a day half filled in.
  const usual = median([...byDay.values()])
  for (const [n, kcal] of byDay) if (kcal < usual / 2) byDay.delete(n)

  const weighed = new Set(weighIns.filter((w) => !w.deleted_at && w.weight_kg != null && Number.isFinite(Number(w.weight_kg))).map((w) => dayNum(w.log_date)))

  // Whole weeks back from yesterday, while each has the logs and a weigh-in.
  let weeks = 0
  let short: 'logs' | 'weigh-ins' | null = null
  for (let k = 0; k < MAX_WEEKS; k++) {
    const hi = end - 7 * k
    const lo = hi - 6
    let logged = 0
    let weighedIn = false
    for (let n = lo; n <= hi; n++) {
      if (byDay.has(n)) logged++
      if (weighed.has(n)) weighedIn = true
    }
    if (logged < DAYS_LOGGED_A_WEEK) { short = 'logs'; break }
    if (!weighedIn) { short = 'weigh-ins'; break }
    weeks++
  }
  if (weeks < MIN_WEEKS) return { ok: false, reason: short ?? 'logs' }

  const from = end - weeks * 7 + 1
  const counted = [...byDay].filter(([n]) => n >= from)
  const avg = counted.reduce((a, [, k]) => a + k, 0) / counted.length

  // The trend's rate over the same weeks, from every weigh-in up to the end
  // (the trend before the window carries into it).
  const points = trendLine(weighIns.filter((w) => dayNum(w.log_date) <= end))
  const rate = weeklyRate(points, fromNum(end), weeks * 7)
  if (rate === null) return { ok: false, reason: 'trend' }
  const stored = (rate / 7) * KCAL_PER_KG
  const kcal = Math.round((avg - stored) / 10) * 10
  if (kcal < SANE.min || kcal > SANE.max) return { ok: false, reason: 'range' }
  return {
    ok: true, kcal, intake: Math.round(avg), rate, stored: Math.round(stored), weeks, from: fromNum(from), to: fromNum(end),
    daysLogged: counted.length, weighIns: [...weighed].filter((n) => n >= from && n <= end).length,
  }
}

// ---- the offer -------------------------------------------------------------------------------

/** What the person did with the offer, kept with the body settings. */
export interface AdaptiveChoice {
  /** The maintenance they took, and on which day. */
  accepted_kcal: number | null
  accepted_on: string | null
  /** The day they said "Not now". */
  declined_on: string | null
}

export const NO_CHOICE: AdaptiveChoice = { accepted_kcal: null, accepted_on: null, declined_on: null }

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function readAdaptiveChoice(v: unknown): AdaptiveChoice {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const k = Number(r.accepted_kcal)
  return {
    accepted_kcal: r.accepted_kcal != null && Number.isFinite(k) && k >= SANE.min && k <= SANE.max ? Math.round(k) : null,
    accepted_on: isDay(r.accepted_on) ? r.accepted_on : null,
    declined_on: isDay(r.declined_on) ? r.declined_on : null,
  }
}

/** The activity factor that makes the targets rest on `kcal`: maintenance ÷
 *  resting energy, to two decimals, or null outside the factors the app
 *  allows (1.2 to 2.4). */
export function factorFrom(kcal: number, bmr: number, limits: [number, number] = [1.2, 2.4]): number | null {
  if (!(bmr > 0)) return null
  const f = Math.round((kcal / bmr) * 100) / 100
  return f >= limits[0] && f <= limits[1] ? f : null
}

/** Whether to offer it now: an estimate, far enough from what the targets
 *  rest on, a factor the app allows, and not just put off. */
export function shouldOffer(est: Adaptive, current: number | null, bmr: number | null, choice: AdaptiveChoice, today: string): boolean {
  if (!est.ok || current === null || bmr === null) return false
  if (Math.abs(est.kcal - current) < WORTH_OFFERING) return false
  if (factorFrom(est.kcal, bmr) === null) return false
  if (choice.declined_on && dayNum(today) - dayNum(choice.declined_on) < SNOOZE_DAYS) return false
  return true
}

const kcalText = (n: number) => Math.round(n).toLocaleString('en-GB')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayText = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`
const kgText = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(n).toFixed(2)}`

/** The offer's line. */
export const offerText = (kcal: number) => `Your logs suggest about ${kcalText(kcal)} kcal maintenance`

/** How it was worked out, for the offer's About (never on the screen). */
export function aboutText(est: Extract<Adaptive, { ok: true }>, bmr: number, current: number): string[] {
  const days = est.weeks * 7
  const change = (est.rate / 7) * days
  const factor = factorFrom(est.kcal, bmr)
  return [
    `From the ${est.weeks} weeks to ${dayText(est.to)}: you logged food on ${est.daysLogged} of ${days} days, ${kcalText(est.intake)} kcal a day on average, and weighed in ${est.weighIns} ${est.weighIns === 1 ? 'time' : 'times'}.`,
    `Your trend weight moved ${kgText(change)} kg (${kgText(est.rate)} kg a week). A kilo of body weight holds about ${kcalText(KCAL_PER_KG)} kcal, so that is ${kcalText(Math.abs(est.stored))} kcal a day ${est.stored < 0 ? 'your body gave' : 'your body stored'}.`,
    `${kcalText(est.intake)} ${est.stored < 0 ? '+' : '−'} ${kcalText(Math.abs(est.stored))} ≈ ${kcalText(est.kcal)} kcal a day keeps your weight where it is. Your targets rest on ${kcalText(current)} kcal now.`,
    factor !== null ? `Use sets your activity factor to ${factor} (${kcalText(est.kcal)} ÷ your resting ${kcalText(bmr)} kcal), and the targets are worked out again. Undo puts it back.` : '',
    'Days with less than half your usual intake count as not logged, and the trend smooths out water and salt. Log every day and weigh in at least once a week for a better estimate.',
  ].filter(Boolean)
}
