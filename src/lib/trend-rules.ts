/** Trend weight (HLT-03), worked out with no database and no React (checked
 *  in src/test/trend.check.mjs). A day's weight swings with water and food;
 *  the trend is a moving average that weighs each new weigh-in by how long
 *  it has been since the last one, so a week without weighing does not count
 *  as seven days of the same weight (the method Libra and The Hacker's Diet
 *  use: 10% a day). From the trend come the weekly rate and, with a goal
 *  weight, an estimated date to reach it. Days are 'yyyy-MM-dd'. */

export interface WeighIn { log_date: string; weight_kg: number | null; deleted_at?: string | null }
export interface TrendPoint { day: string; weight: number; trend: number }

/** How much of the gap to a new weigh-in the trend closes per day. */
export const DAILY_SMOOTHING = 0.1

const dayNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000)
const fromNum = (n: number) => { const d = new Date(n * 86_400_000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
const r2 = (n: number) => Math.round(n * 100) / 100

/** Every weigh-in with the trend on its day, oldest first. One weigh-in per
 *  day (the last one given wins); deleted and empty ones are left out. */
export function trendLine(rows: WeighIn[]): TrendPoint[] {
  const byDay = new Map<string, number>()
  for (const r of rows) {
    if (r.deleted_at || r.weight_kg == null || !Number.isFinite(Number(r.weight_kg))) continue
    byDay.set(r.log_date, Number(r.weight_kg))
  }
  const days = [...byDay.keys()].sort()
  const out: TrendPoint[] = []
  let trend = 0
  let last = 0
  for (const day of days) {
    const w = byDay.get(day)!
    if (!out.length) trend = w
    else {
      const gap = Math.max(1, dayNum(day) - last)
      const alpha = 1 - (1 - DAILY_SMOOTHING) ** gap
      trend = trend + alpha * (w - trend)
    }
    last = dayNum(day)
    out.push({ day, weight: w, trend: r2(trend) })
  }
  return out
}

/** The trend's weekly rate in kg (negative is losing), from a straight line
 *  through the trend over the last `days` days. Null with fewer than two
 *  weigh-ins, or when they span less than a week: too little to say. */
export function weeklyRate(points: TrendPoint[], today: string, days = 28): number | null {
  const end = dayNum(today)
  const list = points.filter((p) => dayNum(p.day) <= end && dayNum(p.day) > end - days)
  if (list.length < 2) return null
  const xs = list.map((p) => dayNum(p.day))
  if (xs[xs.length - 1] - xs[0] < 7) return null
  const mx = xs.reduce((a, x) => a + x, 0) / xs.length
  const my = list.reduce((a, p) => a + p.trend, 0) / list.length
  let num = 0
  let den = 0
  list.forEach((p, i) => { num += (xs[i] - mx) * (p.trend - my); den += (xs[i] - mx) ** 2 })
  if (!den) return null
  return r2((num / den) * 7)
}

export interface GoalDate {
  /** The estimated day, or null when it cannot be worked out. */
  day: string | null
  /** Why there is none, or how it was worked out. */
  note: string
}

/** When the trend reaches the goal weight at the current weekly rate. */
export function goalDate(trend: number | null, rate: number | null, goal: number | null, today: string): GoalDate {
  if (goal == null) return { day: null, note: 'Set a goal weight to see when you would reach it.' }
  if (trend == null) return { day: null, note: 'No weigh-ins yet.' }
  const gap = goal - trend
  if (Math.abs(gap) < 0.05) return { day: today, note: 'The trend is at the goal weight.' }
  if (rate == null) return { day: null, note: 'Weigh in over at least a week to see a date.' }
  if (rate === 0 || Math.sign(rate) !== Math.sign(gap)) {
    return { day: null, note: `At the current rate the trend is moving away from ${goal} kg, so there is no date.` }
  }
  const weeks = gap / rate
  const days = Math.ceil(weeks * 7)
  if (days > 3650) return { day: null, note: 'At the current rate that is more than ten years away.' }
  return { day: fromNum(dayNum(today) + days), note: `At ${Math.abs(rate).toFixed(2)} kg a week, ${Math.abs(gap).toFixed(1)} kg to go.` }
}

/** "−0.45 kg a week", "+0.20 kg a week", "steady". */
export function describeRate(rate: number | null): string {
  if (rate == null) return 'not enough weigh-ins yet'
  if (Math.abs(rate) < 0.05) return 'steady'
  return `${rate > 0 ? '+' : '−'}${Math.abs(rate).toFixed(2)} kg a week`
}

/** Points scaled into a w × h box for the chart: dots for the weigh-ins and
 *  a line for the trend, with the range shown (a little padding either side). */
export function chartScale(points: TrendPoint[], w: number, h: number, goal: number | null = null):
  { dots: { x: number; y: number; day: string; weight: number }[]; line: string; min: number; max: number; goalY: number | null } {
  if (!points.length) return { dots: [], line: '', min: 0, max: 0, goalY: null }
  const vals = points.flatMap((p) => [p.weight, p.trend])
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (goal != null && goal >= min - 3 && goal <= max + 3) { min = Math.min(min, goal); max = Math.max(max, goal) }
  if (max - min < 1) { const mid = (max + min) / 2; min = mid - 0.5; max = mid + 0.5 }
  const pad = (max - min) * 0.08
  min -= pad
  max += pad
  const x0 = dayNum(points[0].day)
  const span = Math.max(1, dayNum(points[points.length - 1].day) - x0)
  const X = (d: string) => Math.round(((dayNum(d) - x0) / span) * w * 10) / 10
  const Y = (v: number) => Math.round((h - ((v - min) / (max - min)) * h) * 10) / 10
  const dots = points.map((p) => ({ x: points.length === 1 ? w / 2 : X(p.day), y: Y(p.weight), day: p.day, weight: p.weight }))
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${points.length === 1 ? w / 2 : X(p.day)},${Y(p.trend)}`).join(' ')
  return { dots, line, min: r2(min), max: r2(max), goalY: goal != null && goal >= min && goal <= max ? Y(goal) : null }
}
