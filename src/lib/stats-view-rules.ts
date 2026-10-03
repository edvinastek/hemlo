/** Saved stats views: what a person set up in the stats builder (STA-10 to
 *  STA-21), kept in profile.settings.stats_views. The builder's own rules
 *  (what each measure key means, ready-made views, editing the list) live in
 *  stats-builder-rules.ts and the arithmetic in pivot-rules.ts; this file
 *  only keeps stored views safe to read. Pure.
 *
 *  Every field added since the first version is optional, so a view saved by
 *  an older copy of the app still reads, and an older copy reading a newer
 *  view simply ignores what it does not know. */

export type GroupBy = string
export type Summary = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'streak' | 'pct_target' | 'latest' | 'best_streak' | 'change'
export type ChartType = 'bar' | 'stacked' | 'line' | 'area' | 'dots' | 'number' | 'ring' | 'table' | 'heat'
export type TargetMode = 'at_least' | 'at_most'

export interface StatsMeasure {
  /** What is measured, as a measure key the builder knows: the module, a
   *  colon, then the measure ('tasks:done', 'nutrition:protein_g',
   *  'learning:study:minutes', 'u_ab12cd:entry:amount'). */
  source: string
  summary: Summary
  label?: string
  /** #rrggbb for this series, else the module's colour. */
  colour?: string
  /** A target to draw as a line, and to count "% of days on target" against. */
  target?: number
  /** Whether the target is a floor (protein: at least 140 g) or a ceiling
   *  (spending: at most 20 a day). A floor when missing. */
  target_mode?: TargetMode
}

export interface StatsFilter { field: string; op: 'is' | 'not' | 'gt' | 'lt'; value: string | number }

export interface StatsRange {
  /** last: the last n units up to today; this: the current week, month or
   *  year (days: today); custom: from and to. */
  kind: 'last' | 'this' | 'custom'
  n?: number
  unit?: 'days' | 'weeks' | 'months' | 'years'
  from?: string
  to?: string
}

export interface StatsChart {
  type: ChartType
  sort?: 'label' | 'value_asc' | 'value_desc'
  y_min?: number | null
  y_max?: number | null
  labels?: boolean
  target_line?: number | null
  /** Series left off the chart (they stay in the table): 'm0', 'm1' for the
   *  measures, 'c:<column key>' for a split, 'cmp' for the comparison. */
  hidden?: string[]
  /** Colours for the series of a split ('c:<column key>' to #rrggbb). */
  colours?: Record<string, string>
  /** Open with the table showing under the chart. */
  table?: boolean
}

export interface StatsCompare {
  source: string
  summary: Summary
  /** Shade the days when it happened behind the chart, instead of drawing it. */
  shade?: boolean
  label?: string
  colour?: string
}

export interface StatsView {
  id: string
  name: string
  measures: StatsMeasure[]
  /** Pivot rows and columns: 'day', 'week', 'month', 'year', 'weekday',
   *  'module', 'section', 'category', 'item', 'person', 'tag',
   *  'field:<name>' or 'none'. */
  rows: GroupBy
  columns: GroupBy
  filters: StatsFilter[]
  range: StatsRange
  chart: StatsChart
  /** A second measure drawn on the same chart, or days when a thing
   *  happened shaded behind it. */
  compare?: StatsCompare | null
  /** Where it shows besides the list of views: on the Stats page (on unless
   *  switched off) and as a card on Today. */
  pinned?: { today?: boolean; stats?: boolean }
}

export const MAX_VIEWS = 50
export const MAX_MEASURES = 10
export const MAX_FILTERS = 8
export const SUMMARIES: Summary[] = ['sum', 'avg', 'count', 'min', 'max', 'latest', 'change', 'streak', 'best_streak', 'pct_target']
export const CHARTS: ChartType[] = ['bar', 'stacked', 'line', 'area', 'dots', 'number', 'ring', 'table', 'heat']
const ID = /^[a-z0-9_-]{1,40}$/i
export const GROUP = /^(none|day|week|month|year|weekday|module|section|category|item|person|tag|field:[a-z0-9_]{1,40})$/
export const SOURCE = /^[a-z0-9_:.\-]{1,120}$/i
const SERIES = /^(m\d{1,2}|cmp|c:.{0,60})$/
const HEX = /^#[0-9a-f]{6}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const summaryOf = (v: unknown): Summary => (SUMMARIES.includes(v as Summary) ? (v as Summary) : 'sum')
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

function readMeasure(v: unknown): StatsMeasure | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.source !== 'string' || !SOURCE.test(r.source)) return null
  const m: StatsMeasure = { source: r.source, summary: summaryOf(r.summary) }
  const label = text(r.label, 60)
  if (label) m.label = label
  if (typeof r.colour === 'string' && HEX.test(r.colour)) m.colour = r.colour.toLowerCase()
  const t = num(r.target)
  if (t != null) m.target = t
  if (r.target_mode === 'at_most') m.target_mode = 'at_most'
  return m
}

function readChart(v: unknown): StatsChart {
  const ch = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const colours: Record<string, string> = {}
  if (ch.colours && typeof ch.colours === 'object' && !Array.isArray(ch.colours)) {
    for (const [k, x] of Object.entries(ch.colours as Record<string, unknown>).slice(0, 40)) {
      if (SERIES.test(k) && typeof x === 'string' && HEX.test(x)) colours[k] = x.toLowerCase()
    }
  }
  const out: StatsChart = {
    type: CHARTS.includes(ch.type as ChartType) ? (ch.type as ChartType) : 'bar',
    sort: ['label', 'value_asc', 'value_desc'].includes(ch.sort as string) ? (ch.sort as 'label') : 'label',
    y_min: num(ch.y_min) ?? null, y_max: num(ch.y_max) ?? null,
    labels: ch.labels !== false,
    target_line: num(ch.target_line) ?? null,
  }
  const hidden = Array.isArray(ch.hidden) ? [...new Set(ch.hidden.filter((x): x is string => typeof x === 'string' && SERIES.test(x)))].slice(0, 40) : []
  if (hidden.length) out.hidden = hidden
  if (Object.keys(colours).length) out.colours = colours
  if (ch.table === true) out.table = true
  return out
}

function readRange(v: unknown): StatsRange {
  const rg = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const kind = ['last', 'this', 'custom'].includes(rg.kind as string) ? (rg.kind as StatsRange['kind']) : 'last'
  const from = typeof rg.from === 'string' && DAY.test(rg.from.slice(0, 10)) ? rg.from.slice(0, 10) : undefined
  const to = typeof rg.to === 'string' && DAY.test(rg.to.slice(0, 10)) ? rg.to.slice(0, 10) : undefined
  // A custom range with its ends the wrong way round is read the right way round.
  const [a, b] = from && to && from > to ? [to, from] : [from, to]
  return {
    kind: kind === 'custom' && !(a && b) ? 'last' : kind,
    n: num(rg.n) != null ? Math.min(3650, Math.max(1, Math.floor(rg.n as number))) : 30,
    unit: ['days', 'weeks', 'months', 'years'].includes(rg.unit as string) ? (rg.unit as 'days') : 'days',
    from: a, to: b,
  }
}

/** One stored view, checked, or null when it cannot be shown. */
export function readStatsView(x: unknown): StatsView | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  if (typeof r.id !== 'string' || !ID.test(r.id)) return null
  if (typeof r.name !== 'string' || !r.name.trim()) return null
  const measures = (Array.isArray(r.measures) ? r.measures : []).map(readMeasure).filter((m): m is StatsMeasure => !!m).slice(0, MAX_MEASURES)
  if (!measures.length) return null
  const cmp = r.compare as Record<string, unknown> | null | undefined
  const pinned = (r.pinned && typeof r.pinned === 'object' ? r.pinned : {}) as Record<string, unknown>
  let compare: StatsCompare | null = null
  if (cmp && typeof cmp === 'object' && typeof cmp.source === 'string' && SOURCE.test(cmp.source)) {
    compare = { source: cmp.source, summary: summaryOf(cmp.summary), shade: cmp.shade === true }
    const label = text(cmp.label, 60)
    if (label) compare.label = label
    if (typeof cmp.colour === 'string' && HEX.test(cmp.colour)) compare.colour = cmp.colour.toLowerCase()
  }
  return {
    id: r.id,
    name: r.name.trim().slice(0, 60),
    measures,
    rows: typeof r.rows === 'string' && GROUP.test(r.rows) ? r.rows : 'day',
    columns: typeof r.columns === 'string' && GROUP.test(r.columns) ? r.columns : 'none',
    filters: (Array.isArray(r.filters) ? r.filters : []).flatMap((f) => {
      const ff = f as Record<string, unknown>
      if (!ff || typeof ff.field !== 'string' || !SOURCE.test(ff.field)) return []
      const op = ['is', 'not', 'gt', 'lt'].includes(ff.op as string) ? (ff.op as StatsFilter['op']) : 'is'
      const value = typeof ff.value === 'number' && Number.isFinite(ff.value) ? ff.value : typeof ff.value === 'string' ? ff.value : null
      return value == null ? [] : [{ field: ff.field, op, value: typeof value === 'string' ? value.slice(0, 80) : value }]
    }).slice(0, MAX_FILTERS),
    range: readRange(r.range),
    chart: readChart(r.chart),
    compare,
    // A view is on the Stats page unless the person took it off.
    pinned: { today: pinned.today === true, stats: pinned.stats !== false },
  }
}

/** Stored views, checked; anything unreadable is dropped, never shown broken. */
export function readStatsViews(v: unknown): StatsView[] {
  if (!Array.isArray(v)) return []
  const out: StatsView[] = []
  const seen = new Set<string>()
  for (const x of v) {
    const view = readStatsView(x)
    if (!view || seen.has(view.id)) continue
    seen.add(view.id)
    out.push(view)
    if (out.length >= MAX_VIEWS) break
  }
  return out
}
