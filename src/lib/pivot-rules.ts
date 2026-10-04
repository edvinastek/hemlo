import { addDays, fromDayNumber, mondayOf, toDayNumber, weekdayOf } from './schedule-rules.ts'
import { fold } from './search-rules.ts'
import type { StatsFilter, Summary, TargetMode } from './stats-view-rules.ts'

/** The pivot table behind every stats view (STA-10, STA-12, STA-18): facts
 *  from every module, filtered, grouped into rows and columns, and summed
 *  up per cell with the summary each value asks for. Pure: no database, no
 *  React, no clock (today is always passed in), so every figure can be
 *  checked by hand in src/test/pivot.check.mjs.
 *
 *  The one rule that runs through all of it (STA-20, P8): a day nobody
 *  logged anything is unknown, not zero, for things that are logged (food,
 *  sleep, weight); and days still to come never lower an average. */

/* ---------- facts and measures --------------------------------------------- */

/** One number on one day from one module: a task done (1), 32 g of protein
 *  in a meal, 7.5 hours slept. The groupings travel with it, so a fact can
 *  be put in a row by its section, its item, its person or its fields. */
export interface Fact {
  day: string
  /** The measure key it counts towards ('tasks:done'). */
  measure: string
  value: number
  /** The module key ('tasks' for the planner's own tasks). */
  module: string
  /** What it is about: a habit's, food's, exercise's or chore's name. */
  item?: string | null
  /** A part of the module: a task's section, a meal, a supplement's slot. */
  section?: string | null
  /** A kind: a task's module, a finance category, an exercise's muscle group. */
  category?: string | null
  /** Who did it (household chores). */
  person?: string | null
  tags?: string[]
  /** A built module's choice, text and yes/no fields, by field name. */
  fields?: Record<string, string | string[] | null>
  /** What a tap in the table opens (drill-down): the row behind the fact. */
  ref?: { table: string; id: string; label: string }
}

/** How several facts on one day make that day's value. */
export type Combine = 'sum' | 'mean' | 'max' | 'min' | 'last'

export interface MeasureInfo {
  key: string
  module: string
  label: string
  /** 'g', 'kcal', 'min', 'h', 'kg', '%', 'time' (hours after midnight,
   *  shown as 23:30), or '' for a plain count. */
  unit: string
  decimals: number
  combine: Combine
  /** 'all': every day that has happened counts, a day with nothing as 0
   *  (tasks done, sets, money spent). 'logged': only days with something
   *  logged count; the rest are unknown (food, sleep, weight). */
  known: 'all' | 'logged'
  /** A share: the part and whole measures it is worked out from, as a
   *  percentage. Such a measure has no facts of its own. */
  ratio?: { part: string; whole: string }
  /** A share that can pass 100% (a budget overspent); others stop at 100. */
  over?: boolean
  /** The groupings it can be split by besides time ('section', 'item'…). */
  dims: string[]
  /** The summary it reads best with. */
  summary: Summary
  /** A target per day from the person's own targets, used when the view
   *  sets none (protein from the nutrition targets). */
  targets?: Record<string, number>
  target_mode?: TargetMode
  /** The first day the module has anything at all. Before it, even a
   *  counted day is unknown: the person was not using it yet, which is not
   *  the same as doing none of it. */
  since?: string | null
}

export interface ValueSpec {
  measure: string
  summary: Summary
  target?: number | null
  target_mode?: TargetMode
  label?: string
}

export interface Span { start: string; end: string }

export interface PivotSpec {
  rows: string
  columns: string
  values: ValueSpec[]
  filters: StatsFilter[]
  range: Span
  sort?: 'label' | 'value_asc' | 'value_desc'
}

export const TIME_DIMS = ['day', 'week', 'month', 'year', 'weekday']
export const isTimeDim = (d: string) => TIME_DIMS.includes(d)

/* ---------- days ------------------------------------------------------------ */

export function spanDays(r: Span): string[] {
  const out: string[] = []
  if (!r.start || !r.end || r.start > r.end) return out
  const a = toDayNumber(r.start); const b = Math.min(toDayNumber(r.end), a + 3700)
  for (let n = a; n <= b; n++) out.push(fromDayNumber(n))
  return out
}

/** Monday 1 to Sunday 7, the way weeks are drawn in the app. */
export const isoWeekday = (day: string) => ((weekdayOf(day) + 6) % 7) + 1
export const mondayFor = (day: string) => fromDayNumber(mondayOf(toDayNumber(day)))

/** The bucket a day falls in for a time grouping. */
export function timeKey(dim: string, day: string): string {
  switch (dim) {
    case 'day': return day
    case 'week': return mondayFor(day)
    case 'month': return day.slice(0, 7)
    case 'year': return day.slice(0, 4)
    case 'weekday': return String(isoWeekday(day))
    default: return ''
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const mon3 = (m: number) => MONTHS[m - 1].slice(0, 3)
const dd = (day: string) => Number(day.slice(8, 10))
const mm = (day: string) => Number(day.slice(5, 7))

/** A time bucket's name: long for the table and the readout, short under a bar. */
export function timeLabel(dim: string, key: string, shortDays = false): { label: string; short: string } {
  switch (dim) {
    case 'day': {
      const wd = WEEKDAYS[isoWeekday(key) - 1].slice(0, 3)
      return { label: `${wd} ${dd(key)} ${mon3(mm(key))}`, short: shortDays ? wd : String(dd(key)) }
    }
    case 'week': return { label: `Week of ${dd(key)} ${mon3(mm(key))} ${key.slice(0, 4)}`, short: `${dd(key)} ${mon3(mm(key))}` }
    case 'month': return { label: `${MONTHS[mm(key) - 1]} ${key.slice(0, 4)}`, short: mon3(mm(key)) }
    case 'year': return { label: key, short: key }
    case 'weekday': return { label: WEEKDAYS[Number(key) - 1], short: WEEKDAYS[Number(key) - 1].slice(0, 3) }
    default: return { label: key, short: key }
  }
}

/** What a missing grouping is called: a task with no section, a food in no meal. */
export const NONE_LABEL: Record<string, string> = {
  module: 'No module', section: 'No section', category: 'No category', item: 'Unnamed',
  person: 'Nobody', tag: 'No tag', none: 'All',
}
export const noneLabel = (dim: string) => NONE_LABEL[dim] ?? 'Not filled in'

/** The keys a fact sits under for a grouping: usually one, several for tags
 *  and multi-choice fields, '' when it has none. */
export function keysOf(f: Fact, dim: string): string[] {
  if (dim === 'none' || !dim) return ['']
  if (isTimeDim(dim)) return [timeKey(dim, f.day)]
  const one = (v: string | null | undefined) => [v && v.trim() ? v.trim() : '']
  switch (dim) {
    case 'module': return [f.module]
    case 'section': return one(f.section)
    case 'category': return one(f.category)
    case 'item': return one(f.item)
    case 'person': return one(f.person)
    case 'tag': return f.tags?.length ? [...new Set(f.tags.map((t) => t.trim()).filter(Boolean))] : ['']
  }
  if (dim.startsWith('field:')) {
    const v = f.fields?.[dim.slice(6)]
    if (Array.isArray(v)) return v.length ? [...new Set(v.map(String).filter(Boolean))] : ['']
    return one(v == null ? null : String(v))
  }
  return ['']
}

/* ---------- filters ---------------------------------------------------------- */

/** Whether a fact passes a filter. 'is' and 'not' compare words the way the
 *  one search does (case and accents ignored); 'gt' and 'lt' compare numbers
 *  (the fact's value, a weekday) or days. */
export function passes(f: Fact, filter: StatsFilter): boolean {
  const { field, op, value } = filter
  if (field === 'value' || field === 'day' || field === 'weekday') {
    const have: number | string = field === 'value' ? f.value : field === 'day' ? f.day : isoWeekday(f.day)
    if (op === 'gt') return have > (typeof have === 'number' ? Number(value) : String(value))
    if (op === 'lt') return have < (typeof have === 'number' ? Number(value) : String(value))
    const same = String(have) === String(value)
    return op === 'not' ? !same : same
  }
  const keys = keysOf(f, field)
  if (op === 'gt' || op === 'lt') {
    const n = keys.map(Number).find((x) => Number.isFinite(x))
    if (n == null) return false
    return op === 'gt' ? n > Number(value) : n < Number(value)
  }
  const want = fold(String(value))
  const hit = keys.some((k) => fold(k) === want)
  return op === 'not' ? !hit : hit
}

/* ---------- one cell ------------------------------------------------------- */

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function combine(how: Combine, vs: number[]): number {
  switch (how) {
    case 'sum': return vs.reduce((a, b) => a + b, 0)
    case 'mean': return vs.reduce((a, b) => a + b, 0) / vs.length
    case 'max': return Math.max(...vs)
    case 'min': return Math.min(...vs)
    case 'last': return vs[vs.length - 1]
  }
}

/** A part of a whole as a percentage: at most 100 unless the measure can go over. */
const share = (info: MeasureInfo, part: number, whole: number) => (info.over ? (100 * part) / whole : Math.min(100, (100 * part) / whole))

/** The value of each day of a cell that counts, oldest first: for a
 *  measure that counts every day, every day that has happened (0 when
 *  nothing); for a logged one, only days with something; for a share, the
 *  days there was anything to do. */
export function dailyValues(info: MeasureInfo, facts: Fact[], days: string[], today: string): [string, number][] {
  if (info.ratio) {
    const part = new Map<string, number>(); const whole = new Map<string, number>()
    for (const f of facts) {
      if (f.measure === info.ratio.part) part.set(f.day, (part.get(f.day) ?? 0) + f.value)
      else if (f.measure === info.ratio.whole) whole.set(f.day, (whole.get(f.day) ?? 0) + f.value)
    }
    const out: [string, number][] = []
    for (const d of days) {
      const w = whole.get(d) ?? 0
      if (d <= today && w > 0) out.push([d, share(info, part.get(d) ?? 0, w)])
    }
    return out
  }
  const byDay = new Map<string, number[]>()
  for (const f of facts) {
    if (f.measure !== info.key || !finite(f.value)) continue
    const list = byDay.get(f.day)
    if (list) list.push(f.value); else byDay.set(f.day, [f.value])
  }
  const out: [string, number][] = []
  for (const d of days) {
    const vs = byDay.get(d)
    if (vs?.length) {
      // Logged things planned ahead (a meal for Friday) count; counted ones
      // (tasks) only up to today, so a half-over week is never pulled down.
      if (info.known === 'all' && d > today) continue
      out.push([d, combine(info.combine, vs)])
    } else if (info.known === 'all' && info.combine === 'sum' && d <= today && !(info.since && d < info.since)) out.push([d, 0])
  }
  return out
}

const isHit = (v: number, t: number | null | undefined, mode: TargetMode | undefined) =>
  t == null ? v > 0 : mode === 'at_most' ? v <= t : v >= t

/** One cell's figure. Null means there is nothing to say (no data, every
 *  day still to come, or a share with nothing to do), never zero. */
export function cellValue(info: MeasureInfo, vs: ValueSpec, facts: Fact[], days: string[], today: string): number | null {
  const own = info.ratio
    ? facts.filter((f) => f.measure === info.ratio!.part || f.measure === info.ratio!.whole)
    : facts.filter((f) => f.measure === info.key && finite(f.value))
  const series = dailyValues(info, own, days, today)
  const daySet = new Set(days)
  // A day that has happened, and since the module was in use.
  const anyPast = days.some((d) => d <= today && !(info.since && d < info.since))
  const target = (d: string) => (vs.target != null ? vs.target : info.targets?.[d] ?? null)
  const mode = vs.target_mode ?? info.target_mode
  const values = series.map(([, v]) => v)
  switch (vs.summary) {
    case 'sum': {
      if (info.ratio) {
        let p = 0; let w = 0
        for (const f of own) {
          if (f.day > today || !daySet.has(f.day)) continue
          if (f.measure === info.ratio.part) p += f.value; else w += f.value
        }
        return w > 0 ? share(info, p, w) : null
      }
      if (info.combine !== 'sum') return values.length ? combine(info.combine, values) : null
      const inDays = own.filter((f) => daySet.has(f.day))
      if (!inDays.length) return info.known === 'all' && anyPast ? 0 : null
      return inDays.reduce((a, f) => a + f.value, 0)
    }
    case 'avg':
      if (info.ratio) return cellValue(info, { ...vs, summary: 'sum' }, facts, days, today)
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    case 'count': {
      if (info.ratio) return series.length
      const n = own.filter((f) => daySet.has(f.day)).length
      return n > 0 || anyPast ? n : null
    }
    case 'min': return values.length ? Math.min(...values) : null
    case 'max': return values.length ? Math.max(...values) : null
    case 'latest': {
      const real = info.known === 'all' && !info.ratio ? series.filter(([d]) => d <= today) : series
      return real.length ? real[real.length - 1][1] : null
    }
    case 'change': {
      // From the first day with something to the last: a weight over a month.
      const factDays = new Set(own.map((f) => f.day))
      const logged = info.ratio || info.known === 'logged' ? series : series.filter(([d]) => factDays.has(d))
      return logged.length >= 2 ? logged[logged.length - 1][1] - logged[0][1] : null
    }
    case 'pct_target': {
      const scored = series.filter(([d]) => target(d) != null)
      if (!scored.length) return null
      return (100 * scored.filter(([d, v]) => isHit(v, target(d), mode)).length) / scored.length
    }
    case 'streak':
    case 'best_streak': {
      if (!series.length) return vs.summary === 'streak' && anyPast ? 0 : null
      const hit = new Map(series.map(([d, v]) => [d, isHit(v, target(d), mode)]))
      // A share skips the days there was nothing to do (a weekday habit's
      // weekend); anything else needs every calendar day.
      const line = info.ratio ? series.map(([d]) => d) : days.filter((d) => d <= today && !(info.since && d < info.since))
      if (vs.summary === 'best_streak') {
        let best = 0; let run = 0
        for (const d of line) { if (hit.get(d)) { run++; best = Math.max(best, run) } else run = 0 }
        return best
      }
      let i = line.length - 1
      // Today is still under way: not done yet does not break the run.
      if (i >= 0 && line[i] === today && !hit.get(today)) i--
      let run = 0
      for (; i >= 0 && hit.get(line[i]); i--) run++
      return run
    }
  }
  return null
}

/* ---------- the table ------------------------------------------------------ */

export interface PivotHeader {
  key: string
  label: string
  short: string
  /** The days a time bucket covers; null for any other grouping. */
  days: string[] | null
  /** The bucket has not started yet. */
  future: boolean
}

export interface PivotValue { spec: ValueSpec; info: MeasureInfo }

export interface PivotResult {
  rows: PivotHeader[]
  columns: PivotHeader[]
  values: PivotValue[]
  /** [row][column][value]. */
  cells: (number | null)[][][]
  /** Each row over every column, [row][value]. */
  rowTotals: (number | null)[][]
  /** Each column over every row, [column][value]. */
  colTotals: (number | null)[][]
  grand: (number | null)[]
  /** The facts that passed the range and the filters, for drill-down. */
  facts: Fact[]
  days: string[]
  /** Measure keys the view asks for that no module on gives. */
  missing: string[]
}

export interface PivotOptions {
  /** A module key's name for the 'module' grouping. */
  moduleName?: (key: string) => string
}

function headersFor(dim: string, facts: Fact[], days: string[], today: string, opts: PivotOptions): PivotHeader[] {
  if (dim === 'none' || !dim) return [{ key: '', label: 'All', short: 'All', days: null, future: false }]
  if (isTimeDim(dim)) {
    const order: string[] = []
    const byKey = new Map<string, string[]>()
    for (const d of days) {
      const k = timeKey(dim, d)
      const list = byKey.get(k)
      if (list) list.push(d); else { byKey.set(k, [d]); order.push(k) }
    }
    if (dim === 'weekday') order.sort()
    const shortDays = dim === 'day' && days.length <= 7
    return order.map((k) => {
      const ds2 = byKey.get(k)!
      return { key: k, ...timeLabel(dim, k, shortDays), days: ds2, future: ds2[0] > today }
    })
  }
  const keys = new Set<string>()
  for (const f of facts) for (const k of keysOf(f, dim)) keys.add(k)
  const name = (k: string) => (k === '' ? noneLabel(dim) : dim === 'module' && opts.moduleName ? opts.moduleName(k) : k)
  return [...keys]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : name(a).localeCompare(name(b), 'en-GB', { sensitivity: 'base' })))
    .map((k) => ({ key: k, label: name(k), short: name(k), days: null, future: false }))
}

/** The measures a view asks for, with the part and whole a share needs. */
export function factMeasures(values: ValueSpec[], catalogue: Map<string, MeasureInfo>): Set<string> {
  const out = new Set<string>()
  for (const v of values) {
    const info = catalogue.get(v.measure)
    if (!info) continue
    if (info.ratio) { out.add(info.ratio.part); out.add(info.ratio.whole) } else out.add(info.key)
  }
  return out
}

/** The whole pivot: rows by columns, each cell the summary of each value,
 *  with totals worked out from the facts themselves (so an average total is
 *  the average, never a sum of averages). */
export function pivot(spec: PivotSpec, facts: Fact[], catalogue: MeasureInfo[] | Map<string, MeasureInfo>, today: string, opts: PivotOptions = {}): PivotResult {
  const cat = catalogue instanceof Map ? catalogue : new Map(catalogue.map((m) => [m.key, m]))
  const values: PivotValue[] = []
  const missing: string[] = []
  for (const v of spec.values) {
    const info = cat.get(v.measure)
    if (info) values.push({ spec: v, info }); else missing.push(v.measure)
  }
  const days = spanDays(spec.range)
  const wanted = factMeasures(values.map((v) => v.spec), cat)
  const kept = facts.filter((f) => wanted.has(f.measure) && f.day >= spec.range.start && f.day <= spec.range.end
    && spec.filters.every((flt) => passes(f, flt)))

  const rows = headersFor(spec.rows, kept, days, today, opts)
  const columns = headersFor(spec.columns, kept, days, today, opts)
  const rIndex = new Map(rows.map((h, i) => [h.key, i]))
  const cIndex = new Map(columns.map((h, i) => [h.key, i]))
  const cellFacts: Fact[][][] = rows.map(() => columns.map(() => []))
  const rowFacts: Fact[][] = rows.map(() => [])
  const colFacts: Fact[][] = columns.map(() => [])
  for (const f of kept) {
    const rs = keysOf(f, spec.rows).map((k) => rIndex.get(k)).filter((i): i is number => i != null)
    const cs = keysOf(f, spec.columns).map((k) => cIndex.get(k)).filter((i): i is number => i != null)
    for (const r of rs) { rowFacts[r].push(f); for (const c of cs) cellFacts[r][c].push(f) }
    for (const c of cs) colFacts[c].push(f)
  }
  const inter = (a: string[] | null, b: string[] | null): string[] => {
    if (!a && !b) return days
    if (!a) return b!
    if (!b) return a
    const set = new Set(b)
    return a.filter((d) => set.has(d))
  }
  const figure = (fs: Fact[], ds: string[]) => values.map((v) => cellValue(v.info, v.spec, fs, ds, today))
  const cells = rows.map((r, i) => columns.map((c, j) => figure(cellFacts[i][j], inter(r.days, c.days))))
  const rowTotals = rows.map((r, i) => figure(rowFacts[i], r.days ?? days))
  const colTotals = columns.map((c, j) => figure(colFacts[j], c.days ?? days))
  const grand = figure(kept, days)

  let order = rows.map((_, i) => i)
  if (spec.sort === 'value_asc' || spec.sort === 'value_desc') {
    const dir = spec.sort === 'value_asc' ? 1 : -1
    order = order.sort((a, b) => {
      const x = rowTotals[a][0]; const y = rowTotals[b][0]
      if (x == null && y == null) return a - b
      if (x == null) return 1
      if (y == null) return -1
      return (x - y) * dir || a - b
    })
  }
  return {
    rows: order.map((i) => rows[i]),
    columns,
    values,
    cells: order.map((i) => cells[i]),
    rowTotals: order.map((i) => rowTotals[i]),
    colTotals,
    grand,
    facts: kept,
    days,
    missing,
  }
}

/** The facts behind one cell (a row key, a column key, or both), newest
 *  first: what a tap on a cell shows. */
export function drill(result: PivotResult, spec: Pick<PivotSpec, 'rows' | 'columns'>, rowKey: string | null, colKey: string | null): Fact[] {
  return result.facts
    .filter((f) => (rowKey == null || keysOf(f, spec.rows).includes(rowKey)) && (colKey == null || keysOf(f, spec.columns).includes(colKey)))
    .sort((a, b) => b.day.localeCompare(a.day) || (a.ref?.label ?? '').localeCompare(b.ref?.label ?? ''))
}

/* ---------- compare: days when something happened ---------------------------- */

export interface WithWithout {
  with: { days: number; mean: number | null }
  without: { days: number; mean: number | null }
  /** At least three known days on each side (STA-11). */
  enough: boolean
  /** with minus without, when there is enough. */
  difference: number | null
}

/** A measure's daily values on days a thing happened against days it did
 *  not, over days the measure is known on. Too few days on a side says so
 *  instead of a figure that means nothing (STA-11, STA-30). */
export function withWithout(series: [string, number][], happened: Set<string>, minDays = 3): WithWithout {
  const a: number[] = []; const b: number[] = []
  for (const [d, v] of series) (happened.has(d) ? a : b).push(v)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  const enough = a.length >= minDays && b.length >= minDays
  const ma = mean(a); const mb = mean(b)
  return {
    with: { days: a.length, mean: ma },
    without: { days: b.length, mean: mb },
    enough,
    difference: enough && ma != null && mb != null ? ma - mb : null,
  }
}

/** The days a measure had anything above zero: "days I trained". */
export function daysWith(facts: Fact[], info: MeasureInfo, span: Span, today: string): Set<string> {
  return new Set(dailyValues(info, facts, spanDays(span), today).filter(([, v]) => v > 0).map(([d]) => d))
}

/* ---------- heat grid (year in pixels, STA-17) ------------------------------- */

export interface HeatCell { day: string; value: number | null; level: 0 | 1 | 2 | 3 | 4 | null; future: boolean }
export interface HeatGrid {
  /** 'weeks': a calendar, a row per week, Monday first. 'months': a column
   *  per month and a row per day of the month, the year-in-pixels layout. */
  mode: 'weeks' | 'months'
  columns: string[]
  rows: { label: string; cells: (HeatCell | null)[] }[]
  /** The values each level starts at, for the legend. */
  steps: number[]
}

/** Levels by quartile of the days above zero: 0 is a known day of nothing,
 *  null an unknown day (drawn differently, never as 0). */
export function heatSteps(values: number[]): number[] {
  const pos = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (!pos.length) return []
  const q = (p: number) => pos[Math.min(pos.length - 1, Math.floor(p * pos.length))]
  return [...new Set([pos[0], q(0.25), q(0.5), q(0.75)])]
}

export function heatLevel(v: number | null, steps: number[]): HeatCell['level'] {
  if (v == null) return null
  if (v <= 0 || !steps.length) return 0
  let level = 1
  for (let i = 1; i < steps.length; i++) if (v >= steps[i]) level = i + 1
  return Math.min(4, level) as HeatCell['level']
}

export function heatGrid(series: [string, number][], span: Span, today: string): HeatGrid {
  const value = new Map(series)
  const steps = heatSteps(series.map(([, v]) => v))
  const cell = (d: string): HeatCell => {
    const v = value.has(d) ? value.get(d)! : null
    return { day: d, value: v, level: heatLevel(v, steps), future: d > today }
  }
  const days = spanDays(span)
  if (days.length <= 62) {
    const rows: HeatGrid['rows'] = []
    let week: (HeatCell | null)[] = []
    let label = ''
    for (const d of days) {
      const wd = isoWeekday(d)
      if (wd === 1 || !week.length) {
        if (week.length) rows.push({ label, cells: week })
        week = Array.from({ length: wd - 1 }, () => null)
        label = `${dd(mondayFor(d))} ${mon3(mm(mondayFor(d)))}`
      }
      week.push(cell(d))
    }
    if (week.length) { while (week.length < 7) week.push(null); rows.push({ label, cells: week }) }
    return { mode: 'weeks', columns: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], rows, steps }
  }
  // Months side by side, at most the last twelve of the range.
  const months = [...new Set(days.map((d) => d.slice(0, 7)))].slice(-12)
  const inSpan = new Set(days)
  const rows: HeatGrid['rows'] = []
  for (let day = 1; day <= 31; day++) {
    rows.push({
      label: String(day),
      cells: months.map((m) => {
        const d = `${m}-${String(day).padStart(2, '0')}`
        // 31 February does not exist: toDayNumber would roll it into March.
        return inSpan.has(d) && fromDayNumber(toDayNumber(d)) === d ? cell(d) : null
      }),
    })
  }
  return { mode: 'months', columns: months.map((m) => MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 1)), rows, steps }
}

/* ---------- out of the table ------------------------------------------------- */

/** The pivot as flat rows, for an export (CSV, Excel, JSON): one row per
 *  cell and value, totals included and marked. */
export function pivotRows(result: PivotResult, rowsName: string, colsName: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const hasCols = !(result.columns.length === 1 && result.columns[0].key === '' && result.columns[0].label === 'All')
  const round = (v: number | null, d: number) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d)
  const push = (row: string, col: string, vi: number, v: number | null) => {
    const { info, spec } = result.values[vi]
    out.push({ [rowsName]: row, ...(hasCols ? { [colsName]: col } : {}), measure: spec.label ?? info.label, summary: SUMMARY_LABEL[spec.summary], value: round(v, Math.max(info.decimals, 1)), unit: unitFor(info, spec.summary) })
  }
  result.rows.forEach((r, i) => {
    result.columns.forEach((c, j) => result.values.forEach((_, k) => push(r.label, c.label, k, result.cells[i][j][k])))
    if (hasCols) result.values.forEach((_, k) => push(r.label, 'Total', k, result.rowTotals[i][k]))
  })
  if (result.rows.length > 1 || hasCols) result.values.forEach((_, k) => push('Total', hasCols ? 'Total' : '', k, result.grand[k]))
  return out
}

export const SUMMARY_LABEL: Record<Summary, string> = {
  sum: 'Total', avg: 'Average', count: 'Count', min: 'Lowest', max: 'Highest', latest: 'Latest',
  change: 'Change', streak: 'Current streak', best_streak: 'Best streak', pct_target: '% of days on target',
}

/** The unit a summary's figure is in: a count of days for a streak, a
 *  percentage for days on target, else the measure's own. */
export function unitFor(info: Pick<MeasureInfo, 'unit'>, summary: Summary): string {
  if (summary === 'streak' || summary === 'best_streak') return 'days'
  if (summary === 'pct_target') return '%'
  if (summary === 'count') return info.unit === '%' ? 'days' : 'entries'
  return info.unit
}

/** Decimals a summary's figure is shown with. */
export function decimalsFor(info: Pick<MeasureInfo, 'decimals' | 'unit'>, summary: Summary): number {
  if (summary === 'streak' || summary === 'best_streak' || summary === 'count' || summary === 'pct_target') return 0
  if (summary === 'avg' && info.unit !== '%' && info.unit !== 'time') return Math.max(1, info.decimals)
  return info.decimals
}

/** Shifts a span by whole spans: the week before, the 30 days before. */
export function shiftSpan(span: Span, n: number): Span {
  const len = toDayNumber(span.end) - toDayNumber(span.start) + 1
  return { start: addDays(span.start, len * n), end: addDays(span.end, len * n) }
}
