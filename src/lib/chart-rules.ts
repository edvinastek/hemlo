import { contrast, luminance, SWATCHES } from './colours-rules.ts'
import { decimalsFor, unitFor, type PivotResult } from './pivot-rules.ts'
import type { StatsView } from './stats-view-rules.ts'
import type { StatsWidgetView } from './stats-widget-rules.ts'

/** What the stats charts draw, worked out without React or SVG: the axis,
 *  the series and their colours (always readable on the page), numbers
 *  written out, and the sentence that says what the chart shows for anyone
 *  who cannot see it (STA-12, STA-19, P9). Pure. */

/* ---------- numbers ------------------------------------------------------- */

const group = (v: number, decimals: number) =>
  v.toLocaleString('en-GB', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })

/** A value with its unit: "142 g", "86%", "23:30", "3 days", "1 day". */
export function formatValue(v: number | null, unit: string, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return '–'
  if (unit === 'time') {
    const mins = Math.round((((v % 24) + 24) % 24) * 60) % 1440
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  }
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals
  if (unit === '%') return `${group(r, decimals)}%`
  if (unit === 'days' || unit === 'entries') {
    const one = unit === 'days' ? 'day' : 'entry'
    return `${group(r, decimals)} ${r === 1 ? one : unit}`
  }
  return unit ? `${group(r, decimals)} ${unit}` : group(r, decimals)
}

/** A number short enough for an axis: 1.2k, 15k. */
export function shortNumber(v: number, unit = ''): string {
  if (unit === 'time') return formatValue(v, 'time')
  const a = Math.abs(v)
  if (a >= 10000) return `${Math.round(v / 1000)}k`
  if (a >= 1000) return `${Math.round(v / 100) / 10}k`
  return group(Math.round(v * 10) / 10, a < 10 ? 1 : 0)
}

/* ---------- the axis ------------------------------------------------------- */

export interface Scale { min: number; max: number; ticks: number[] }

/** Round numbers for an axis that holds every value: steps of 1, 2, 2.5 or 5
 *  times a power of ten, from zero unless every value is far from it. */
export function niceScale(values: number[], opts: { min?: number | null; max?: number | null; count?: number; zero?: boolean } = {}): Scale {
  const count = opts.count ?? 4
  const finite = values.filter((v) => Number.isFinite(v))
  let lo = finite.length ? Math.min(...finite) : 0
  let hi = finite.length ? Math.max(...finite) : 1
  if (opts.zero !== false) { lo = Math.min(0, lo); hi = Math.max(0, hi) }
  if (opts.min != null) lo = opts.min
  if (opts.max != null) hi = opts.max
  if (hi <= lo) hi = lo + 1
  const raw = (hi - lo) / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const min = opts.min != null ? opts.min : Math.floor(lo / step) * step
  const max = opts.max != null ? opts.max : Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let t = Math.ceil(min / step) * step; t <= max + step / 1e6; t += step) ticks.push(Math.round(t * 1e6) / 1e6)
  return { min, max, ticks }
}

/* ---------- colours ------------------------------------------------------- */

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  return `#${[1, 3, 5].map((i) => hex2(p(a, i) + (p(b, i) - p(a, i)) * t)).join('')}`
}

/** A colour moved towards the ink just far enough to stand 3:1 against the
 *  page, so a series chosen on the light page never vanishes on the dark
 *  one. Colours that already stand out are left as they are. */
export function readable(hex: string, paper: string, min = 3): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex) || !/^#[0-9a-f]{6}$/i.test(paper)) return hex
  if (contrast(hex, paper) >= min) return hex.toLowerCase()
  const ink = luminance(paper) > 0.5 ? '#000000' : '#ffffff'
  for (let t = 0.1; t <= 1; t += 0.1) {
    const c = mix(hex, ink, t)
    if (contrast(c, paper) >= min) return c
  }
  return ink
}

/** A colour for the n-th series of a split: the swatches in an order that
 *  keeps neighbours far apart in hue. */
export function splitColour(n: number): string {
  const order = [5, 13, 9, 0, 4, 11, 1, 7, 14, 3, 10, 6, 12, 2, 8, 15]
  return SWATCHES[order[n % order.length]].hex
}

/* ---------- series -------------------------------------------------------- */

export interface ChartSeries {
  /** 'm0', 'm1' (measures), 'cmp' (the comparison), 'c:<column key>' (a split). */
  key: string
  label: string
  colour: string
  values: (number | null)[]
  unit: string
  decimals: number
  /** 1 for a second axis on the right, when the units differ (STA-11). */
  axis: 0 | 1
  hidden: boolean
}

export interface ChartData {
  labels: string[]
  long: string[]
  future: boolean[]
  series: ChartSeries[]
  /** A target to draw as a line: the view's own, or a measure's. */
  target: number | null
  /** Per row, the target the person set for that day (protein per day). */
  targets: (number | null)[] | null
  /** Rows to shade behind the chart (days something happened). */
  shaded: boolean[] | null
}

/** The series a view draws from its pivot: one per measure, or with a
 *  split, one per column of the first measure. Colours are the person's
 *  choice where made, else the module's own, always made readable. */
export function chartData(result: PivotResult, view: Pick<StatsView, 'measures' | 'compare' | 'chart' | 'columns'>,
  moduleColour: (key: string) => string, paper: string, shadeDays?: Set<string> | null): ChartData {
  const hidden = new Set(view.chart.hidden ?? [])
  const split = view.columns !== 'none' && result.columns.length > 0
  const series: ChartSeries[] = []
  if (split) {
    const v = result.values[0]
    if (v) {
      result.columns.forEach((c, j) => {
        const key = `c:${c.key}`
        series.push({
          key, label: c.label,
          colour: readable(view.chart.colours?.[key] ?? splitColour(j), paper),
          values: result.rows.map((_, i) => result.cells[i][j][0]),
          unit: unitFor(v.info, v.spec.summary), decimals: decimalsFor(v.info, v.spec.summary), axis: 0, hidden: hidden.has(key),
        })
      })
    }
  } else {
    result.values.forEach((v, i) => {
      const isCmp = i >= view.measures.length
      const key = isCmp ? 'cmp' : `m${i}`
      const chosen = isCmp ? view.compare?.colour : view.measures[i]?.colour
      // Two measures of one module would share its colour: the second takes a swatch.
      const fallback = i === 0 || result.values.slice(0, i).every((p) => p.info.module !== v.info.module)
        ? moduleColour(v.info.module) : splitColour(i)
      series.push({
        key, label: v.spec.label ?? v.info.label,
        colour: readable(chosen ?? fallback, paper),
        values: result.rows.map((_, r) => result.cells[r][0][i]),
        unit: unitFor(v.info, v.spec.summary), decimals: decimalsFor(v.info, v.spec.summary), axis: 0, hidden: hidden.has(key),
      })
    })
  }
  // A second axis when the units differ from the first series' (kcal and kg).
  const first = series.find((s) => !s.hidden)
  for (const s of series) if (first && s.unit !== first.unit) s.axis = 1
  const m0 = result.values[0]
  const dayRows = result.rows.every((r) => r.days?.length === 1)
  const targets = m0 && !m0.spec.target && m0.info.targets && dayRows && (m0.spec.summary === 'sum' || m0.spec.summary === 'avg')
    ? result.rows.map((r) => m0.info.targets![r.days![0]] ?? null) : null
  return {
    labels: result.rows.map((r) => r.short),
    long: result.rows.map((r) => r.label),
    future: result.rows.map((r) => r.future),
    series,
    target: view.chart.target_line ?? view.measures[0]?.target ?? null,
    targets: targets && targets.some((t) => t != null) ? targets : null,
    shaded: shadeDays ? result.rows.map((r) => !!r.days?.some((d) => shadeDays.has(d))) : null,
  }
}

/** Which labels fit under a chart of a given width: every one when they
 *  fit, else every n-th, so they never run into each other. */
export function labelStep(count: number, width: number, labelWidth = 34): number {
  if (count <= 0) return 1
  const fit = Math.max(1, Math.floor(width / labelWidth))
  return Math.max(1, Math.ceil(count / fit))
}

/* ---------- words --------------------------------------------------------- */

/** The chart in a sentence or two, for screen readers and the summary line:
 *  the overall figure, the highest and lowest rows, and how many are unknown. */
export function describe(result: PivotResult, rangeText: string): string {
  const v = result.values[0]
  if (!v) return 'Nothing to show: the measure is not kept by any module that is on.'
  const unit = unitFor(v.info, v.spec.summary)
  const dec = decimalsFor(v.info, v.spec.summary)
  const name = v.spec.label ?? v.info.label
  const parts: string[] = []
  const overall = result.grand[0]
  parts.push(`${name}, ${rangeText.toLowerCase()}: ${overall == null ? 'nothing logged' : formatValue(overall, unit, dec)} overall.`)
  if (result.rows.length > 1) {
    const rows = result.rows.map((r, i) => ({ r, v: result.rowTotals[i][0] })).filter((x) => x.v != null) as { r: PivotResult['rows'][number]; v: number }[]
    if (rows.length > 1) {
      const hi = rows.reduce((a, b) => (b.v > a.v ? b : a))
      const lo = rows.reduce((a, b) => (b.v < a.v ? b : a))
      parts.push(`Highest ${formatValue(hi.v, unit, dec)} (${hi.r.label}); lowest ${formatValue(lo.v, unit, dec)} (${lo.r.label}).`)
    }
    const unknown = result.rows.filter((r, i) => result.rowTotals[i][0] == null && !r.future).length
    if (unknown) parts.push(`${unknown} ${unknown === 1 ? 'has' : 'have'} nothing logged.`)
  }
  for (const other of result.values.slice(1)) {
    const k = result.values.indexOf(other)
    parts.push(`${other.spec.label ?? other.info.label}: ${formatValue(result.grand[k], unitFor(other.info, other.spec.summary), decimalsFor(other.info, other.spec.summary))}.`)
  }
  return parts.join(' ')
}

/* ---------- the home-screen widget (STA-21) ---------------------------------- */


/** A saved view, worked out, in the shape the Android stats widget draws:
 *  a figure, a ring, bars, a line or a short table, with a tap that opens
 *  the view in the app. */
export function toWidgetView(view: Pick<StatsView, 'id' | 'name' | 'chart' | 'measures'>, result: PivotResult, data: ChartData,
  rangeText: string, rowsName: string): StatsWidgetView {
  const type = view.chart.type
  const kind: StatsWidgetView['kind'] = type === 'number' ? 'number' : type === 'ring' ? 'ring' : type === 'table' ? 'table'
    : type === 'line' || type === 'area' || type === 'dots' ? 'line' : 'bars'
  const v = result.values[0]
  const unit = v ? unitFor(v.info, v.spec.summary) : ''
  const dec = v ? decimalsFor(v.info, v.spec.summary) : 0
  const overall = result.grand[0] ?? null
  const target = data.target
  const shown = data.series.find((s) => !s.hidden) ?? data.series[0]
  const out: StatsWidgetView = {
    id: view.id,
    name: view.name,
    kind,
    headline: formatValue(overall, unit, dec),
    sub: [v ? (v.spec.label ?? v.info.label) : view.name, rangeText, target != null ? `target ${formatValue(target, unit, dec)}` : '']
      .filter(Boolean).join(' · '),
    points: kind === 'bars' || kind === 'line'
      ? (shown?.values ?? []).map((value, i) => ({ label: data.labels[i] ?? '', value: value == null ? null : Math.round(value * 100) / 100, colour: shown?.colour }))
      : [],
    target,
    link: `/stats?view=${encodeURIComponent(view.id)}`,
  }
  if (kind === 'ring') {
    out.progress = overall == null ? null
      : unit === '%' ? Math.max(0, Math.min(1, overall / 100))
      : target ? Math.max(0, Math.min(1, overall / target)) : null
  }
  if (kind === 'table') {
    const heads = [rowsName, ...result.values.slice(0, 2).map((x) => x.spec.label ?? x.info.label)]
    const body = result.rows.slice(0, 5).map((r, i) => [r.label, ...result.values.slice(0, 2).map((x, k) =>
      formatValue(result.rowTotals[i][k], unitFor(x.info, x.spec.summary), decimalsFor(x.info, x.spec.summary)))])
    out.rows = [heads, ...body]
  }
  return out
}
