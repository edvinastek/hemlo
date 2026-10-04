import type { Fact } from './pivot-rules.ts'
import {
  addDays as addDay, choreState, habitDay, habitSchedule, mondayOf, fromDayNumber, toDayNumber,
  type ChoreDone, type ChoreLike, type HabitLike as ScheduledHabit,
} from './schedule-rules.ts'
import { addDays, habitStrengths, weekday, weekStart } from './tracking-rules.ts'
import { compareNight, regularity, sleepDebt, type Night, type SleepSettings } from './sleep-rules.ts'
import { trendLine, weeklyRate, type WeighIn } from './trend-rules.ts'
import { budgetFor, entryAmount, entryCategory, entryDay, entryKind, topOf, type EntryLike, type FinanceSettings } from './finance-rules.ts'
import { itemCost, pickPrice, type PriceLike } from './shopping-rules.ts'

/** The arithmetic behind the Stats page, with no database and no React, so
 *  every figure can be checked by hand in src/test/stats.check.mjs.
 *
 *  Days are local calendar days as 'yyyy-MM-dd', counted the same way the
 *  habit rules count them (tracking-rules.ts), so no timezone or clock change
 *  can move one. A "series" is a value per day: a day with nothing logged is
 *  simply not in it. */

export type Period = 'day' | 'week' | 'month' | 'year'
export const PERIODS: Period[] = ['day', 'week', 'month', 'year']
export const PERIOD_LABEL: Record<Period, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }

/** First and last day of a period, both included. */
export interface Range { start: string; end: string }

/** A value per day. */
export type Series = Record<string, number>

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_MS = 86_400_000

const parts = (day: string) => day.split('-').map(Number) as [number, number, number]
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`
const utc = (day: string) => { const [y, m, d] = parts(day); return Date.UTC(y, m - 1, d) }

/** How many days month m (1 to 12) of year y has. */
export function monthLength(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/* ---------- periods ------------------------------------------------------- */

/** The period an anchor day falls in. Weeks run Monday to Sunday. */
export function periodRange(period: Period, anchor: string): Range {
  const [y, m] = parts(anchor)
  switch (period) {
    case 'day': return { start: anchor, end: anchor }
    case 'week': { const start = weekStart(anchor); return { start, end: addDays(start, 6) } }
    case 'month': return { start: iso(y, m, 1), end: iso(y, m, monthLength(y, m)) }
    case 'year': return { start: iso(y, 1, 1), end: iso(y, 12, 31) }
  }
}

/** The anchor moved n periods on (or back, for negative n). A month or year
 *  step keeps the day of the month where it can: 31 January plus a month is
 *  28 or 29 February, never 3 March. */
export function shiftAnchor(period: Period, anchor: string, n: number): string {
  const [y, m, d] = parts(anchor)
  switch (period) {
    case 'day': return addDays(anchor, n)
    case 'week': return addDays(anchor, 7 * n)
    case 'month': {
      const total = y * 12 + (m - 1) + n
      const ny = Math.floor(total / 12)
      const nm = total - ny * 12 + 1
      return iso(ny, nm, Math.min(d, monthLength(ny, nm)))
    }
    case 'year': return iso(y + n, m, Math.min(d, monthLength(y + n, m)))
  }
}

/** The period before the one the anchor is in, for "compared with". */
export function previousRange(period: Period, anchor: string): Range {
  return periodRange(period, shiftAnchor(period, anchor, -1))
}

/** Every day of a range, in order. */
export function daysOf(range: Range): string[] {
  const out: string[] = []
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d)
  return out
}

export function dayCount(range: Range): number {
  return Math.max(0, Math.round((utc(range.end) - utc(range.start)) / DAY_MS) + 1)
}

/** How far the arrows go: three years back and five ahead of today. */
export const REACH = { back: 3, ahead: 5 } as const

export function reach(today: string): Range {
  return { start: shiftAnchor('year', today, -REACH.back), end: shiftAnchor('year', today, REACH.ahead) }
}

/** Whether an arrow may step: the period it lands on has to touch the reach. */
export function canShift(period: Period, anchor: string, dir: 1 | -1, today: string): boolean {
  const next = periodRange(period, shiftAnchor(period, anchor, dir))
  const r = reach(today)
  return next.end >= r.start && next.start <= r.end
}

/** An anchor pulled back inside the reach (a day typed or kept from long ago). */
export function clampAnchor(anchor: string, today: string): string {
  const r = reach(today)
  return anchor < r.start ? r.start : anchor > r.end ? r.end : anchor
}

/** The heading over the figures: "Sun 27 September 2026", "21 – 27 Sep 2026",
 *  "September 2026", "2026". */
export function periodTitle(period: Period, anchor: string): string {
  const [y, m, d] = parts(anchor)
  const short = (day: string) => MONTHS[parts(day)[1] - 1].slice(0, 3)
  switch (period) {
    case 'day': return `${WEEKDAYS[weekday(anchor)]} ${d} ${MONTHS[m - 1]} ${y}`
    case 'week': {
      const { start, end } = periodRange('week', anchor)
      const [sy, , sd] = parts(start)
      const [ey, , ed] = parts(end)
      if (sy !== ey) return `${sd} ${short(start)} ${sy} – ${ed} ${short(end)} ${ey}`
      if (short(start) !== short(end)) return `${sd} ${short(start)} – ${ed} ${short(end)} ${ey}`
      return `${sd} – ${ed} ${short(end)} ${ey}`
    }
    case 'month': return `${MONTHS[m - 1]} ${y}`
    case 'year': return String(y)
  }
}

/** How the period before is named next to a change: "the week before". */
export function beforeName(period: Period): string {
  return `the ${period} before`
}

/** Whether today falls in the period. */
export function isCurrent(period: Period, anchor: string, today: string): boolean {
  const r = periodRange(period, anchor)
  return today >= r.start && today <= r.end
}

/* ---------- adding up ----------------------------------------------------- */

export interface Bucket {
  /** A day (yyyy-MM-dd) for a day, week or month; a month (yyyy-MM) for a year. */
  key: string
  /** Under the bar: "Mon", "14", "S". */
  label: string
  /** The bucket's figure, or null when there is nothing to show. */
  value: number | null
  /** The bucket has not started yet. */
  future: boolean
}

export interface Summary {
  /** Everything in the range added up, future days included (tasks can be planned ahead). */
  total: number
  /** Added up over the days that have happened (up to and including today). */
  sofar: number
  /** Days in the range with a value. */
  logged: number
  /** Days the average runs over. */
  days: number
  /** The average: per day for a total, per entry for a mean. Null with nothing to average. */
  average: number | null
  /** The day with the highest value above zero. */
  best: { day: string; value: number } | null
  buckets: Bucket[]
}

export interface SummariseOptions {
  /** 'sum' adds up (minutes, sets); 'mean' averages (hours of sleep, weight). */
  how?: 'sum' | 'mean'
  /** For a sum: average over every day so far ('day') or only over days with
   *  something logged ('logged', for food, where an unlogged day is unknown
   *  rather than nothing eaten). */
  per?: 'day' | 'logged'
  /** For a mean: how many entries each day's value holds, when it is a sum of
   *  several (three records on one day). Without it each day counts once. */
  counts?: Series
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A series summed up over a range: total, average, best day, and a bucket
 *  per day (week, month) or per month (year). Days after today never lower
 *  an average: a week that is half over is averaged over its first half. */
export function summarise(series: Series, range: Range, period: Period, today: string, opts: SummariseOptions = {}): Summary {
  const how = opts.how ?? 'sum'
  const weight = (d: string) => (opts.counts ? (finite(opts.counts[d]) ? opts.counts[d] : 0) : 1)
  let total = 0; let sofar = 0; let logged = 0; let past = 0; let entries = 0
  let best: Summary['best'] = null
  for (const d of daysOf(range)) {
    if (d <= today) past++
    const v = series[d]
    if (!finite(v)) continue
    total += v
    logged++
    entries += weight(d)
    if (d <= today) sofar += v
    if (v > 0 && (!best || v > best.value)) best = { day: d, value: v }
  }
  let days: number
  let average: number | null
  if (how === 'mean') {
    days = logged
    average = entries > 0 ? total / entries : null
  } else if (opts.per === 'logged') {
    days = logged
    average = logged > 0 ? total / logged : null
  } else {
    days = past
    average = past > 0 ? sofar / past : null
  }
  return { total, sofar, logged, days, average, best, buckets: buckets(series, range, period, today, how, opts.counts) }
}

const INITIALS = 'JFMAMJJASOND'

function buckets(series: Series, range: Range, period: Period, today: string, how: 'sum' | 'mean', counts?: Series): Bucket[] {
  const fold = (days: string[]): number | null => {
    let sum = 0; let n = 0; let entries = 0
    for (const d of days) {
      const v = series[d]
      if (!finite(v)) continue
      sum += v; n++
      entries += counts ? (finite(counts[d]) ? counts[d] : 0) : 1
    }
    if (how === 'mean') return entries > 0 ? sum / entries : null
    return n > 0 ? sum : days.every((d) => d > today) ? null : 0
  }
  if (period === 'year') {
    const [y] = parts(range.start)
    return Array.from({ length: 12 }, (_, i) => {
      const r = { start: iso(y, i + 1, 1), end: iso(y, i + 1, monthLength(y, i + 1)) }
      return { key: r.start.slice(0, 7), label: INITIALS[i], value: fold(daysOf(r)), future: r.start > today }
    })
  }
  return daysOf(range).map((d) => ({
    key: d,
    label: period === 'month' ? String(parts(d)[2]) : WEEKDAYS[weekday(d)],
    value: fold([d]),
    future: d > today,
  }))
}

/** A share as a whole percentage, or null when there was nothing to do. */
export function percent(part: number, whole: number): number | null {
  if (!(whole > 0)) return null
  return Math.min(100, Math.round((part / whole) * 100))
}

/** A series without the days after today. */
export function upTo(series: Series, today: string): Series {
  const out: Series = {}
  for (const [d, v] of Object.entries(series)) if (d <= today) out[d] = v
  return out
}

/** Bars for a share: each bucket's part over its whole, as a percentage,
 *  counting only days that have happened (this month's bar is the month so far). */
export function ratioBuckets(part: Series, whole: Series, range: Range, period: Period, today: string): Bucket[] {
  const p = summarise(upTo(part, today), range, period, today).buckets
  return summarise(upTo(whole, today), range, period, today).buckets
    .map((b, i) => ({ ...b, value: b.value != null && b.value > 0 ? percent(p[i]?.value ?? 0, b.value) : null }))
}

/** The last value on or before a day, for a figure like weight that is read
 *  as "where it stands" rather than added up. */
export function latest(series: Series, upTo: string, from?: string): { day: string; value: number } | null {
  let out: { day: string; value: number } | null = null
  for (const [d, v] of Object.entries(series)) {
    if (d > upTo || (from && d < from) || !finite(v)) continue
    if (!out || d > out.day) out = { day: d, value: v }
  }
  return out
}

/** Add a value to a day of a series. */
export function add(series: Series, day: string, value: number): void {
  if (!finite(value)) return
  series[day] = (series[day] ?? 0) + value
}

/* ---------- figures ------------------------------------------------------- */

export interface Metric {
  key: string
  label: string
  /** 'min', 'kg', '%', 'kcal', or '' for a plain count. */
  unit: string
  /** The figure for the period, or null when there is nothing to say. */
  value: number | null
  /** Average per day for a figure that adds up; null otherwise. */
  perDay: number | null
  /** What "a day" means next to perDay: every day so far, or days logged. */
  perLabel?: string
  /** Change on the period before: per day for a total, the figure itself otherwise. */
  delta: number | null
  /** The change is across the period itself (a weight, from before it began to its end). */
  deltaWithin?: boolean
  decimals: number
}

const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b)

/** A figure that adds up: the total, the average a day, and how the
 *  average a day moved (a half-over week compared fairly with a whole one). */
export function sumMetric(key: string, label: string, unit: string, cur: Summary, prev: Summary, decimals = 0, perLabel?: string): Metric {
  return { key, label, unit, value: cur.total, perDay: cur.average, perLabel, delta: diff(cur.average, prev.average), decimals }
}

/** A figure that is an average (hours slept, quality). */
export function meanMetric(key: string, label: string, unit: string, cur: Summary, prev: Summary, decimals = 1): Metric {
  return { key, label, unit, value: cur.average, perDay: null, delta: diff(cur.average, prev.average), decimals }
}

/** A share done: part over whole, for the days that have happened. */
export function ratioMetric(key: string, label: string, part: Summary, whole: Summary, prevPart: Summary, prevWhole: Summary): Metric {
  const value = percent(part.sofar, whole.sofar)
  return { key, label, unit: '%', value, perDay: null, delta: diff(value, percent(prevPart.sofar, prevWhole.sofar)), decimals: 0 }
}

/* ---------- habits and supplements ----------------------------------------- */

export interface HabitLike extends ScheduledHabit { id: string; active: boolean; deleted_at?: string | null }

/** Per day: ticks (every tick), due (what the schedule asked for) and hits
 *  (ticks that answered a due day), through the one repeat engine
 *  (schedule-rules.ts), so weekends, chosen days, dates, start and end days
 *  all count. An N-times-a-week habit (the old "weekly" is once a week) is
 *  due N times in each week: on the days it was done, up to N, and, for
 *  what was not done, on the week's Sunday, so a week still under way is
 *  not counted as missed. Only habits still in use are due; a habit put
 *  away keeps the ticks it had. */
export function habitSeries(habits: HabitLike[], done: Record<string, string[]>, range: Range): { ticks: Series; due: Series; hits: Series } {
  const ticks: Series = {}; const due: Series = {}; const hits: Series = {}
  const days = daysOf(range)
  for (const h of habits) {
    const doneSet = new Set((done[h.id] ?? []).filter((d) => d >= range.start && d <= range.end))
    for (const d of doneSet) add(ticks, d, 1)
    if (!h.active || h.deleted_at) continue
    const s = habitSchedule(h)
    const running = (d: string) => d >= s.start_date && (!s.end_date || d <= s.end_date)
    if (s.rule === 'times_per_week') {
      const times = Math.min(7, Math.max(1, Math.round(Number(s.rule_config.times) || 1)))
      const weeks = new Map<string, string[]>()
      for (const d of days) if (running(d)) { const w = weekStart(d); weeks.set(w, [...(weeks.get(w) ?? []), d]) }
      for (const [w, inRange] of weeks) {
        const doneIn = inRange.filter((d) => doneSet.has(d)).slice(0, times)
        for (const d of doneIn) { add(due, d, 1); add(hits, d, 1) }
        const sunday = addDays(w, 6)
        if (doneIn.length < times && inRange.includes(sunday)) add(due, sunday, times - doneIn.length)
      }
      continue
    }
    for (const d of days) {
      if (habitDay(h, d, []) !== 'due') continue
      add(due, d, 1)
      if (doneSet.has(d)) add(hits, d, 1)
    }
  }
  return { ticks, due, hits }
}

/** Per day: supplements taken, and how many were to take (those in use). */
export function supplementSeries(activeCount: number, taken: string[], range: Range): { taken: Series; due: Series } {
  const t: Series = {}; const due: Series = {}
  for (const d of taken) if (d >= range.start && d <= range.end) add(t, d, 1)
  if (activeCount > 0) for (const d of daysOf(range)) due[d] = activeCount
  return { taken: t, due }
}

/* ---------- sleep and records --------------------------------------------- */

/** Hours between going to bed and waking, across midnight: "23:30" to
 *  "07:00" is 7.5. Null when either is missing. */
export function sleepHours(bed: string | null | undefined, woke: string | null | undefined): number | null {
  const t = (v: string | null | undefined) => {
    const m = /^(\d{2}):(\d{2})/.exec(v ?? '')
    return m ? Number(m[1]) + Number(m[2]) / 60 : null
  }
  const a = t(bed); const b = t(woke)
  if (a == null || b == null) return null
  return Math.round((b >= a ? b - a : b + 24 - a) * 100) / 100
}

/** A value from a record as a number: numbers and numeric text count, the rest do not. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** One field of dated records as series: the day's sum and how many records
 *  had a value. 'count' counts records with anything in the field. */
export function fieldSeries(records: { date: string | null; values: Record<string, unknown> }[], field: string, how: 'sum' | 'average' | 'count'):
  { values: Series; counts: Series } {
  const values: Series = {}; const counts: Series = {}
  for (const r of records) {
    if (!r.date) continue
    const v = r.values[field]
    if (how === 'count') {
      if (v === null || v === undefined || v === '' || v === false) continue
      add(values, r.date, 1); add(counts, r.date, 1)
      continue
    }
    const n = toNumber(v)
    if (n == null) continue
    add(values, r.date, n); add(counts, r.date, 1)
  }
  return { values, counts }
}

/** "Entry" to "Entries", "Block" to "Blocks": a record count's label. */
export function plural(word: string): string {
  const w = word.trim()
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`
  return `${w}s`
}

/* ---------- showing and exporting ------------------------------------------ */

/** A number for the page: grouped thousands, at most the decimals given. */
export function formatNumber(v: number, decimals = 0): string {
  return v.toLocaleString('en-GB', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
}

/** A change with its sign: "+1.5", "−3", or "no change". */
export function formatDelta(v: number, decimals = 0): string {
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals
  if (r === 0) return 'no change'
  return `${r > 0 ? '+' : '−'}${formatNumber(Math.abs(r), decimals)}`
}

export interface ModuleStats {
  /** A module key, or 'tasks' for the planner's own figures. */
  key: string
  label: string
  /** The module is switched off (shown because "switched-off modules" is ticked). */
  off: boolean
  metrics: Metric[]
  chart: { label: string; unit: string; decimals: number; buckets: Bucket[] } | null
  /** Said in place of figures when the period has nothing: what to log. */
  empty: string | null
}

export interface StatsRow {
  /** "week 2026-09-21 to 2026-09-27", "day 2026-09-27". */
  period: string
  module: string
  metric: string
  value: number
  unit: string
}

/** The figures as rows, for an export: one row per figure, and one more
 *  for its average a day where it has one. Empty cards give no rows. */
export function statsRows(period: Period, range: Range, modules: ModuleStats[]): StatsRow[] {
  const when = range.start === range.end ? `${period} ${range.start}` : `${period} ${range.start} to ${range.end}`
  const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
  const rows: StatsRow[] = []
  for (const m of modules) {
    if (m.empty) continue
    for (const x of m.metrics) {
      if (x.value != null) rows.push({ period: when, module: m.label, metric: x.label, value: round(x.value, x.decimals), unit: x.unit })
      if (x.perDay != null) {
        rows.push({ period: when, module: m.label, metric: `${x.label}, ${x.perLabel ?? 'a day'}`, value: round(x.perDay, Math.max(1, x.decimals)), unit: x.unit })
      }
    }
  }
  return rows
}

/* ---------- facts for the stats builder (pivot-rules.ts) ------------------- */


export interface HabitRow extends ScheduledHabit { id: string; name: string; active: boolean; deleted_at?: string | null }

/** Each habit's days as facts: a tick, whether it was due, whether a due
 *  day was answered (hit), and any amount counted. A day is due by the
 *  habit's own schedule (schedule-rules.ts); today is not yet missed; a
 *  times-a-week habit is due its number of times in each week, the ones not
 *  done counted on the week's Sunday once that Sunday has passed. A habit
 *  put away keeps its ticks but is no longer due. */
export function habitFacts(habits: HabitRow[], done: Record<string, string[]>, amounts: Record<string, Record<string, number>>, range: Range, today: string): Fact[] {
  const out: Fact[] = []
  for (const h of habits) {
    if (h.deleted_at) continue
    const base = { module: 'habits', item: h.name, ref: { table: 'habit', id: h.id, label: h.name } }
    const doneSet = new Set(done[h.id] ?? [])
    const inRange = (d: string) => d >= range.start && d <= range.end
    for (const d of doneSet) if (inRange(d)) out.push({ ...base, day: d, measure: 'habits:ticks', value: 1 })
    for (const [d, v] of Object.entries(amounts[h.id] ?? {})) if (inRange(d) && Number.isFinite(v)) out.push({ ...base, day: d, measure: 'habits:amount', value: v })
    if (!h.active) continue
    const s = habitSchedule(h)
    if (s.rule === 'times_per_week') {
      const times = Math.max(1, Math.min(7, Math.floor(s.rule_config.times ?? 1)))
      const first = fromDayNumber(mondayOf(toDayNumber(range.start)))
      for (let mon = first; mon <= range.end; mon = addDay(mon, 7)) {
        const week = Array.from({ length: 7 }, (_, i) => addDay(mon, i)).filter((d) => d >= s.start_date && (!s.end_date || d <= s.end_date))
        if (!week.length) continue
        const ticked = week.filter((d) => doneSet.has(d))
        ticked.slice(0, times).forEach((d) => {
          if (!inRange(d)) return
          out.push({ ...base, day: d, measure: 'habits:due', value: 1 }, { ...base, day: d, measure: 'habits:hit', value: 1 })
        })
        const sunday = week[week.length - 1]
        const missing = times - ticked.length
        if (missing > 0 && sunday < today && inRange(sunday)) out.push({ ...base, day: sunday, measure: 'habits:due', value: missing })
      }
      continue
    }
    for (let d = range.start; d <= range.end && d <= today; d = addDay(d, 1)) {
      const state = habitDay(h, d, doneSet)
      if (state === 'done') {
        if (d < s.start_date || (s.end_date && d > s.end_date)) continue
        out.push({ ...base, day: d, measure: 'habits:due', value: 1 }, { ...base, day: d, measure: 'habits:hit', value: 1 })
      } else if (state === 'due' && d < today) {
        out.push({ ...base, day: d, measure: 'habits:due', value: 1 })
      }
    }
  }
  return out
}

export interface ChoreRow extends ChoreLike { id: string; name: string; room: string | null; minutes: number | null; deleted_at?: string | null }
export interface ChoreLogRow extends ChoreDone { id: string; chore_id: string }

/** Household chores as facts: each one done (by whom, in which room, for
 *  how long), and, for each day that has ended, every fixed or "after"
 *  chore still not done after it fell due. Flexible chores are never
 *  overdue: they only grow more due. */
export function choreFacts(chores: ChoreRow[], logs: ChoreLogRow[], range: Range, today: string, person: (userId: string | null) => string): Fact[] {
  const out: Fact[] = []
  const byChore = new Map<string, ChoreLogRow[]>()
  for (const l of logs) if (!l.deleted_at) byChore.set(l.chore_id, [...(byChore.get(l.chore_id) ?? []), l])
  for (const c of chores) {
    const base = { module: 'household', item: c.name, section: c.room, ref: { table: 'chore', id: c.id, label: c.name } }
    const mine = byChore.get(c.id) ?? []
    for (const l of mine) {
      if (l.done_on < range.start || l.done_on > range.end) continue
      out.push({ ...base, day: l.done_on, measure: 'household:chores_done', value: 1, person: person(l.done_by) })
      if (c.minutes != null && c.minutes > 0) out.push({ ...base, day: l.done_on, measure: 'household:chore_minutes', value: c.minutes, person: person(l.done_by) })
    }
    if (c.deleted_at || c.paused || c.mode === 'flexible') continue
    // At most a year and a bit of days looked at, so a long range stays quick.
    const from = range.start < addDay(today, -400) ? addDay(today, -400) : range.start
    for (let d = from; d <= range.end && d < today; d = addDay(d, 1)) {
      if (choreState(c, d, mine).overdueDays > 0) out.push({ ...base, day: d, measure: 'household:chores_overdue', value: 1 })
    }
  }
  return out
}

/** A clock time as hours after midnight; a bedtime before noon is the
 *  night before's, so 00:30 is 24.5 and averages sensibly with 23:30. */
export function clockHours(t: string | null | undefined, bedtime = false): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '')
  if (!m) return null
  const h = Number(m[1]) + Number(m[2]) / 60
  if (h >= 24) return null
  return bedtime && h < 12 ? h + 24 : h
}

/* ---------- version 18: the measures Stats was missing (STA-03) ------------- */

/** Sleep against the person's own target (SLP-02): each night's hours less
 *  the target and its bedtime against the target bedtime, and for every day
 *  that has happened the sleep debt of the seven days up to it and how much
 *  bed and wake times wandered over the fourteen days up to it. A day whose
 *  window holds no night (or, for regularity, fewer than three) has no
 *  figure: unknown, never zero (P8). `nights` should reach 13 days before
 *  the range so its first days have their whole window. */
export function sleepStatsFacts(nights: Night[], s: Pick<SleepSettings, 'target_hours' | 'bedtime'>, range: Range, today: string): Fact[] {
  const live = nights.filter((n) => !n.deleted_at)
  const out: Fact[] = []
  const inRange = (d: string) => d >= range.start && d <= range.end
  for (const n of live) {
    if (!inRange(n.log_date)) continue
    const c = compareNight(n, s)
    const base = { day: n.log_date, module: 'sleep', ref: { table: 'sleep_log', id: (n as Night & { id?: string }).id ?? n.log_date, label: 'Night' } }
    if (c.vsTarget != null) out.push({ ...base, measure: 'sleep:vs_target', value: c.vsTarget })
    if (c.bedLate != null) out.push({ ...base, measure: 'sleep:bed_late', value: c.bedLate })
  }
  for (let d = range.start; d <= range.end && d <= today; d = addDay(d, 1)) {
    const debt = sleepDebt(live, s.target_hours, d, 7)
    if (debt.hours != null) out.push({ day: d, module: 'sleep', measure: 'sleep:debt', value: debt.hours })
    const r = regularity(live, d, 14)
    if (r.bed != null) out.push({ day: d, module: 'sleep', measure: 'sleep:bed_spread', value: r.bed })
    if (r.wake != null) out.push({ day: d, module: 'sleep', measure: 'sleep:wake_spread', value: r.wake })
  }
  return out
}

/** Trend weight (HLT-03) on each weigh-in day of the range, and the trend's
 *  rate a week over the four weeks up to it (when there is enough to say).
 *  `rows` should be every weigh-in, since the trend carries its history. */
export function trendFacts(rows: (WeighIn & { id?: string })[], range: Range): Fact[] {
  const points = trendLine(rows)
  const out: Fact[] = []
  for (const p of points) {
    if (p.day < range.start || p.day > range.end) continue
    out.push({ day: p.day, module: 'health', measure: 'health:trend', value: p.trend })
    const rate = weeklyRate(points, p.day, 28)
    if (rate != null) out.push({ day: p.day, module: 'health', measure: 'health:rate', value: rate })
  }
  return out
}

/** Each habit's strength (HAB-07) on every day of the range that has
 *  happened, from the day the habit started (or was first ticked). A habit
 *  put away keeps its last strength out of the figures: it is no longer kept. */
export function habitStrengthFacts(habits: HabitRow[], done: Record<string, string[]>, range: Range, today: string): Fact[] {
  const out: Fact[] = []
  for (const h of habits) {
    if (h.deleted_at || !h.active) continue
    const ticks = [...(done[h.id] ?? [])].sort()
    const first = (h as { start_date?: string | null }).start_date ?? ticks[0]
    if (!first) continue
    const days: string[] = []
    for (let d = range.start > first ? range.start : first; d <= range.end && d <= today; d = addDay(d, 1)) days.push(d)
    const by = habitStrengths(h, ticks, days)
    for (const d of days) out.push({ day: d, module: 'habits', measure: 'habits:strength', value: by[d] ?? 0, item: h.name, ref: { table: 'habit', id: h.id, label: h.name } })
  }
  return out
}

/** One food's figure for an amount: null when the food is unknown or its
 *  label does not give the figure. */
export function foodFigure(food: Record<string, unknown> | undefined, grams: number | null | undefined, key: string): number | null {
  if (!food || grams == null || !Number.isFinite(Number(grams))) return null
  const v = food[key]
  if (v == null || v === '' || !Number.isFinite(Number(v))) return null
  return (Number(v) * Number(grams)) / 100
}

/** A label figure for something made of parts (a recipe's lines): the sum,
 *  or null when any part with an amount lacks the figure, so a total is
 *  never quietly short (P8). */
export function partsFigure(parts: { food: Record<string, unknown> | undefined; grams: number }[], key: string): number | null {
  let sum = 0
  for (const p of parts) {
    if (!(p.grams > 0)) continue
    const v = foodFigure(p.food, p.grams, key)
    if (v == null) return null
    sum += v
  }
  return sum
}

/** Money and budgets (FIN-02, FIN-03) as facts. Spending and money in are
 *  separate measures, never added together; "net" is money in less spent.
 *  Budgets are spread evenly over their month's days, up to today (and from
 *  the first entry on), so any
 *  range compares spending with the budget for the same days; "budget
 *  spent" is the spending in categories that have a budget (a top-level
 *  category's budget covers the ones under it). Groupings: the category as
 *  entered (field:category), its top-level category (category), and the
 *  type (field:kind). */
export function financeFacts(entries: EntryLike[], s: FinanceSettings, range: Range, today: string): Fact[] {
  const out: Fact[] = []
  const cats = s.categories
  const fold = (x: string) => x.trim().toLowerCase()
  // Which budget a category's spending counts against in a month: its own
  // top-level category's when that has one, else its own; null for none.
  const coverOf = (category: string, month: string): string | null => {
    const top = topOf(category, cats)
    if (budgetFor(s, month, top) != null && cats.some((c) => fold(c.name) === fold(top) && c.kind === 'expense' && !c.parent)) return top
    const own = cats.find((c) => fold(c.name) === fold(category) && c.kind === 'expense')
    return own && budgetFor(s, month, own.name) != null ? own.name : null
  }
  for (const e of entries) {
    if (e.deleted_at) continue
    const a = entryAmount(e)
    const d = entryDay(e)
    if (a == null || !d || d < range.start || d > range.end) continue
    const kind = entryKind(e)
    const cat = entryCategory(e)
    const top = topOf(cat, cats)
    const label = typeof e.data.note === 'string' && e.data.note.trim() ? e.data.note.trim() : cat
    const base = { day: d, module: 'finance', item: label, category: top, fields: { category: cat, kind }, ref: { table: 'module_record', id: e.id, label } }
    out.push({ ...base, measure: kind === 'income' ? 'finance:income' : 'finance:spent', value: a })
    out.push({ ...base, measure: 'finance:net', value: kind === 'income' ? a : -a })
    if (kind === 'expense' && coverOf(cat, d.slice(0, 7))) out.push({ ...base, measure: 'finance:budget_spent', value: a })
  }
  // Budgets count from the first entry on: before it the person was not
  // keeping Finance, which is not the same as spending nothing.
  const first = entries.filter((e) => !e.deleted_at).map(entryDay).filter((d): d is string => !!d).sort()[0]
  if (!first) return out
  for (let d = range.start > first ? range.start : first; d <= range.end && d <= today; d = addDay(d, 1)) {
    const month = d.slice(0, 7)
    const days = monthLength(Number(month.slice(0, 4)), Number(month.slice(5, 7)))
    for (const c of cats) {
      if (c.kind !== 'expense') continue
      const b = budgetFor(s, month, c.name)
      if (b == null || b <= 0) continue
      // A sub-category's own budget is inside its top-level one when that has one.
      if (c.parent && budgetFor(s, month, c.parent) != null) continue
      out.push({ day: d, module: 'finance', measure: 'finance:budget', value: b / days, item: c.name, category: c.parent ?? c.name, fields: { category: c.name, kind: 'expense' } })
    }
  }
  return out
}

/** What a bought item cost at the household's own price (PRICE-02): the
 *  price noted at the shop it was bought for, else the latest noted
 *  anywhere; null when there is none or the amount cannot be priced. */
export function boughtCost(item: { grams: number | null; qty: number | null; shop: string | null }, prices: (PriceLike & { shop: string; noted_on: string; deleted_at?: string | null })[]): number | null {
  const p = (item.shop ? pickPrice(prices, item.shop) : null) ?? pickPrice(prices, null)
  if (!p) return null
  return itemCost({ grams: item.grams != null && item.grams > 0 ? Number(item.grams) : null, pieces: item.grams ? null : item.qty != null && item.qty > 0 ? Number(item.qty) : null }, p)
}
