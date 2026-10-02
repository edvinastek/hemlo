/** Saved stats views: what a person set up in the stats builder (STA-10 to
 *  STA-21), kept in profile.settings.stats_views. The builder's own rules
 *  (what each key means, how it is computed) live in stats-builder-rules.ts;
 *  this file only keeps stored views safe to read. Pure. */

export type GroupBy = string
export type Summary = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'streak' | 'pct_target' | 'latest'
export type ChartType = 'bar' | 'stacked' | 'line' | 'area' | 'dots' | 'number' | 'ring' | 'table' | 'heat'

export interface StatsMeasure {
  /** What is measured, as a measure key the builder knows ('tasks.done',
   *  'nutrition.protein_g', 'habit:<id>.kept', 'module:<key>.<field>'). */
  source: string
  summary: Summary
  label?: string
  /** #rrggbb for this series, else the module's colour. */
  colour?: string
  /** A target to draw as a line, and to count "% of days on target" against. */
  target?: number
}

export interface StatsFilter { field: string; op: 'is' | 'not' | 'gt' | 'lt'; value: string | number }

export interface StatsView {
  id: string
  name: string
  measures: StatsMeasure[]
  /** Pivot rows and columns: 'day', 'week', 'month', 'weekday', 'module',
   *  'section', 'category', 'item', 'field:<name>' or 'none'. */
  rows: GroupBy
  columns: GroupBy
  filters: StatsFilter[]
  range: { kind: 'last' | 'this' | 'custom'; n?: number; unit?: 'days' | 'weeks' | 'months' | 'years'; from?: string; to?: string }
  chart: { type: ChartType; sort?: 'label' | 'value_asc' | 'value_desc'; y_min?: number | null; y_max?: number | null; labels?: boolean; target_line?: number | null }
  /** A second measure drawn on the same chart, or days when a thing
   *  happened shaded behind it. */
  compare?: { source: string; summary: Summary; shade?: boolean } | null
  /** Where it shows besides the Stats page. */
  pinned?: { today?: boolean }
}

export const MAX_VIEWS = 50
const ID = /^[a-z0-9_-]{1,40}$/i
const SUMMARIES: Summary[] = ['sum', 'avg', 'count', 'min', 'max', 'streak', 'pct_target', 'latest']
const CHARTS: ChartType[] = ['bar', 'stacked', 'line', 'area', 'dots', 'number', 'ring', 'table', 'heat']
const GROUP = /^(none|day|week|month|year|weekday|module|section|category|item|field:[a-z0-9_]{1,40})$/
const SOURCE = /^[a-z0-9_:.\-]{1,120}$/i
const HEX = /^#[0-9a-f]{6}$/i
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function readMeasure(v: unknown): StatsMeasure | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.source !== 'string' || !SOURCE.test(r.source)) return null
  const m: StatsMeasure = { source: r.source, summary: SUMMARIES.includes(r.summary as Summary) ? (r.summary as Summary) : 'sum' }
  if (typeof r.label === 'string' && r.label.trim()) m.label = r.label.trim().slice(0, 60)
  if (typeof r.colour === 'string' && HEX.test(r.colour)) m.colour = r.colour.toLowerCase()
  const t = num(r.target)
  if (t != null) m.target = t
  return m
}

/** Stored views, checked; anything unreadable is dropped, never shown broken. */
export function readStatsViews(v: unknown): StatsView[] {
  if (!Array.isArray(v)) return []
  const out: StatsView[] = []
  const seen = new Set<string>()
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    if (typeof r.id !== 'string' || !ID.test(r.id) || seen.has(r.id)) continue
    if (typeof r.name !== 'string' || !r.name.trim()) continue
    const measures = (Array.isArray(r.measures) ? r.measures : []).map(readMeasure).filter((m): m is StatsMeasure => !!m).slice(0, 6)
    if (!measures.length) continue
    const rg = (r.range ?? {}) as Record<string, unknown>
    const ch = (r.chart ?? {}) as Record<string, unknown>
    const cmp = r.compare as Record<string, unknown> | null | undefined
    seen.add(r.id)
    out.push({
      id: r.id,
      name: r.name.trim().slice(0, 60),
      measures,
      rows: typeof r.rows === 'string' && GROUP.test(r.rows) ? r.rows : 'day',
      columns: typeof r.columns === 'string' && GROUP.test(r.columns) ? r.columns : 'none',
      filters: (Array.isArray(r.filters) ? r.filters : []).flatMap((f) => {
        const ff = f as Record<string, unknown>
        if (!ff || typeof ff.field !== 'string' || !SOURCE.test(ff.field)) return []
        const op = ['is', 'not', 'gt', 'lt'].includes(ff.op as string) ? (ff.op as StatsFilter['op']) : 'is'
        const value = typeof ff.value === 'number' || typeof ff.value === 'string' ? ff.value : null
        return value == null ? [] : [{ field: ff.field, op, value: typeof value === 'string' ? value.slice(0, 80) : value }]
      }).slice(0, 8),
      range: {
        kind: ['last', 'this', 'custom'].includes(rg.kind as string) ? (rg.kind as StatsView['range']['kind']) : 'last',
        n: num(rg.n) != null ? Math.min(3650, Math.max(1, Math.floor(rg.n as number))) : 30,
        unit: ['days', 'weeks', 'months', 'years'].includes(rg.unit as string) ? (rg.unit as 'days') : 'days',
        from: typeof rg.from === 'string' ? rg.from.slice(0, 10) : undefined,
        to: typeof rg.to === 'string' ? rg.to.slice(0, 10) : undefined,
      },
      chart: {
        type: CHARTS.includes(ch.type as ChartType) ? (ch.type as ChartType) : 'bar',
        sort: ['label', 'value_asc', 'value_desc'].includes(ch.sort as string) ? (ch.sort as 'label') : 'label',
        y_min: num(ch.y_min) ?? null, y_max: num(ch.y_max) ?? null,
        labels: ch.labels !== false,
        target_line: num(ch.target_line) ?? null,
      },
      compare: cmp && typeof cmp.source === 'string' && SOURCE.test(cmp.source)
        ? { source: cmp.source, summary: SUMMARIES.includes(cmp.summary as Summary) ? (cmp.summary as Summary) : 'sum', shade: cmp.shade === true }
        : null,
      pinned: { today: (r.pinned as Record<string, unknown> | undefined)?.today === true },
    })
    if (out.length >= MAX_VIEWS) break
  }
  return out
}
