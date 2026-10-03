/** Sleep's arithmetic, with no database and no React (checked in
 *  src/test/sleep.check.mjs): the target (hours and bedtime) and how each
 *  night compares with it, sleep debt over the last seven days, how regular
 *  bed and wake times are, and the bedtime block the planner can hold.
 *  Times are 'HH:MM'; a night belongs to the day it ended. */

export interface SleepSettings {
  /** Hours a night the person aims for, 4 to 12. */
  target_hours: number
  /** When they aim to be in bed. */
  bedtime: string
  /** Minutes before bed the block (and its reminder) starts, 0 to 120. */
  wind_down: number
  /** Put a bedtime block on the planner every night (SLP-03). */
  block: boolean
  /** Locked: nothing is to be planned across it. */
  locked: boolean
  /** The task series that holds the block, once there is one. */
  block_series: string | null
}

export const SLEEP_DEFAULTS: SleepSettings = { target_hours: 8, bedtime: '22:00', wind_down: 30, block: false, locked: true, block_series: null }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const clockText = (v: unknown) => (typeof v === 'string' && TIME.test(v.slice(0, 5)) ? v.slice(0, 5) : null)

/** The module's stored settings, checked: anything broken takes the default
 *  (the server's own defaults: 8 hours, bed at 22:00). */
export function readSleepSettings(raw: Record<string, unknown> | null | undefined): SleepSettings {
  const r = raw ?? {}
  const h = Number(r.target_hours)
  const w = Number(r.wind_down)
  return {
    target_hours: Number.isFinite(h) && h >= 4 && h <= 12 ? Math.round(h * 4) / 4 : SLEEP_DEFAULTS.target_hours,
    bedtime: clockText(r.bedtime) ?? SLEEP_DEFAULTS.bedtime,
    wind_down: Number.isInteger(w) && w >= 0 && w <= 120 ? w : SLEEP_DEFAULTS.wind_down,
    block: r.block === true,
    locked: r.locked !== false,
    block_series: typeof r.block_series === 'string' ? r.block_series : null,
  }
}

/* ---------- clock arithmetic ---------------------------------------------- */

export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
export function clockOf(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Hours from bed to waking, across midnight. */
export function hoursSlept(bed: string, woke: string): number {
  const mins = (minutesOf(woke) - minutesOf(bed) + 1440) % 1440
  return Math.round((mins / 60) * 100) / 100
}

/** The wake time a bedtime and a number of hours give, and the other way. */
export const wakeFrom = (bedtime: string, hours: number) => clockOf(minutesOf(bedtime) + hours * 60)
export const bedFrom = (wake: string, hours: number) => clockOf(minutesOf(wake) - hours * 60)

/** Minutes from `target` to `actual` on a clock, the short way round:
 *  23:30 against 23:00 is +30 (late), 22:40 is −20 (early), 00:15 is +75. */
export function clockDiff(actual: string, target: string): number {
  const d = (minutesOf(actual) - minutesOf(target) + 1440) % 1440
  return d > 720 ? d - 1440 : d
}

/* ---------- one night against the target ----------------------------------- */

export interface Night { log_date: string; went_to_bed: string | null; woke_at: string | null; hours: number | null; quality: number | null; deleted_at?: string | null }

/** A night's hours: as stored, or from its times. Unknown stays null. */
export function nightHours(n: Night): number | null {
  if (n.hours != null && Number.isFinite(Number(n.hours))) return Number(n.hours)
  if (n.went_to_bed && n.woke_at) return hoursSlept(n.went_to_bed.slice(0, 5), n.woke_at.slice(0, 5))
  return null
}

export interface NightCompared {
  hours: number | null
  /** Hours above (+) or below (−) the target. */
  vsTarget: number | null
  /** Minutes in bed after (+) or before (−) the target bedtime. */
  bedLate: number | null
  /** Minutes up after (+) or before (−) the wake time the target gives. */
  wakeLate: number | null
}

export function compareNight(n: Night, s: Pick<SleepSettings, 'target_hours' | 'bedtime'>): NightCompared {
  const hours = nightHours(n)
  return {
    hours,
    vsTarget: hours == null ? null : Math.round((hours - s.target_hours) * 100) / 100,
    bedLate: n.went_to_bed ? clockDiff(n.went_to_bed.slice(0, 5), s.bedtime) : null,
    wakeLate: n.woke_at ? clockDiff(n.woke_at.slice(0, 5), wakeFrom(s.bedtime, s.target_hours)) : null,
  }
}

/** "0.8 h short", "0.5 h over", "on target". */
export function describeVsTarget(v: number | null): string {
  if (v == null) return ''
  if (Math.abs(v) < 0.05) return 'on target'
  return `${Math.abs(v).toFixed(1)} h ${v < 0 ? 'short' : 'over'}`
}

/** "25 min late", "10 min early", "on time" (within 5 minutes). */
export function describeLate(min: number | null, what = ''): string {
  if (min == null) return ''
  const w = what ? `${what} ` : ''
  if (Math.abs(min) <= 5) return `${w}on time`
  const a = Math.abs(min)
  const t = a >= 60 ? `${Math.floor(a / 60)} h ${a % 60 ? `${a % 60} min` : ''}`.trim() : `${a} min`
  return `${w}${t} ${min > 0 ? 'late' : 'early'}`
}

/* ---------- the last seven days ---------------------------------------------- */

const dayNum = (d: string) => Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000)

/** Nights from the `days` days ending on `today` (both ends included). */
export function recentNights<T extends Night>(nights: T[], today: string, days: number): T[] {
  const end = dayNum(today)
  return nights.filter((n) => !n.deleted_at && dayNum(n.log_date) <= end && dayNum(n.log_date) > end - days)
}

export interface Debt {
  /** Hours short of the target, added up over the nights logged, less any
   *  hours over it; never below zero. Null when no night was logged. */
  hours: number | null
  nights: number
  days: number
}

/** Sleep debt over the last `days` days. A night not logged is not counted as
 *  a night without sleep: unknown is never zero. */
export function sleepDebt(nights: Night[], target: number, today: string, days = 7): Debt {
  const list = recentNights(nights, today, days).map(nightHours).filter((h): h is number => h != null)
  if (!list.length) return { hours: null, nights: 0, days }
  const net = list.reduce((a, h) => a + (target - h), 0)
  return { hours: Math.max(0, Math.round(net * 10) / 10), nights: list.length, days }
}

/** How much a set of clock times wanders: the standard deviation in minutes,
 *  taken around the times' own middle so 23:50 and 00:10 are 20 minutes
 *  apart, not 23 hours. Null with fewer than three times. */
export function spread(times: string[]): number | null {
  if (times.length < 3) return null
  // Mean direction on a 24-hour circle, then each time's offset from it.
  const ang = times.map((t) => (minutesOf(t) / 1440) * 2 * Math.PI)
  const mean = Math.atan2(ang.reduce((a, x) => a + Math.sin(x), 0), ang.reduce((a, x) => a + Math.cos(x), 0))
  const centre = ((mean / (2 * Math.PI)) * 1440 + 1440) % 1440
  const offs = times.map((t) => { const d = (minutesOf(t) - centre + 1440) % 1440; return d > 720 ? d - 1440 : d })
  const m = offs.reduce((a, x) => a + x, 0) / offs.length
  return Math.round(Math.sqrt(offs.reduce((a, x) => a + (x - m) ** 2, 0) / offs.length))
}

export interface Regularity { bed: number | null; wake: number | null; nights: number; averageBed: string | null; averageWake: string | null }

/** Regularity of bed and wake times over the last `days` days. */
export function regularity(nights: Night[], today: string, days = 14): Regularity {
  const list = recentNights(nights, today, days)
  const beds = list.map((n) => n.went_to_bed?.slice(0, 5)).filter((t): t is string => !!t && TIME.test(t))
  const wakes = list.map((n) => n.woke_at?.slice(0, 5)).filter((t): t is string => !!t && TIME.test(t))
  return { bed: spread(beds), wake: spread(wakes), nights: list.length, averageBed: middle(beds), averageWake: middle(wakes) }
}

/** The usual time of a set of clock times (their circular mean), or null. */
export function middle(times: string[]): string | null {
  if (!times.length) return null
  const ang = times.map((t) => (minutesOf(t) / 1440) * 2 * Math.PI)
  const mean = Math.atan2(ang.reduce((a, x) => a + Math.sin(x), 0), ang.reduce((a, x) => a + Math.cos(x), 0))
  return clockOf(((mean / (2 * Math.PI)) * 1440 + 1440) % 1440)
}

/** "steady (± 12 min)", "fairly steady (± 35 min)", "irregular (± 1 h 20 min)". */
export function describeSpread(min: number | null): string {
  if (min == null) return 'needs three nights'
  const t = min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`
  return `${min <= 20 ? 'steady' : min <= 45 ? 'fairly steady' : 'irregular'} (± ${t})`
}

/* ---------- the bedtime block on the planner (SLP-03, GEN-37) ------------------- */

/** The series the bedtime block should be: every night, starting the wind-down
 *  before bed (at least a quarter of an hour on the planner), locked if
 *  chosen. None when the block is off or the rule is switched off. */
export function bedtimeSeries(s: SleepSettings, ruleOn: boolean, today: string) {
  if (!ruleOn || !s.block) return null
  const minutes = Math.max(15, s.wind_down)
  return {
    title: s.wind_down > 0 ? `Wind down, bed at ${s.bedtime}` : `Bed at ${s.bedtime}`,
    rule: 'daily',
    rule_config: {},
    start_date: today,
    end_date: null,
    time_of_day: clockOf(minutesOf(s.bedtime) - s.wind_down),
    task_template: { category: 'Night', duration_min: minutes, locked: s.locked, notes: null },
  }
}

/** The measures Sleep gives Stats, by source key. */
export const SLEEP_MEASURES = [
  { source: 'sleep.hours', label: 'Hours slept', unit: 'h', summary: 'avg' as const },
  { source: 'sleep.vs_target', label: 'Hours against the target', unit: 'h', summary: 'sum' as const },
  { source: 'sleep.bed_late', label: 'Bedtime against the target', unit: 'min', summary: 'avg' as const },
  { source: 'sleep.quality', label: 'Quality', unit: '/5', summary: 'avg' as const },
]

/** A value per day for one of those measures; nights without it are left out. */
export function sleepSeries(nights: Night[], measure: 'hours' | 'vs_target' | 'bed_late' | 'quality', s: Pick<SleepSettings, 'target_hours' | 'bedtime'>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of nights) {
    if (n.deleted_at) continue
    const c = compareNight(n, s)
    const v = measure === 'hours' ? c.hours : measure === 'vs_target' ? c.vsTarget : measure === 'bed_late' ? c.bedLate : n.quality
    if (v != null && Number.isFinite(Number(v))) out[n.log_date] = Number(v)
  }
  return out
}
