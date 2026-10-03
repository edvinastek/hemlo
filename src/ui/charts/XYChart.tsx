import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatValue, labelStep, niceScale, shortNumber, type ChartData, type ChartSeries } from '../../lib/chart-rules'
import { useWidth } from './useWidth'
import './charts.css'

export type XYType = 'bar' | 'stacked' | 'line' | 'area' | 'dots'

interface Props {
  data: ChartData
  type: XYType
  yMin?: number | null
  yMax?: number | null
  /** Values written on the marks (selectively: few bars, or line ends). */
  labels?: boolean
  /** A sentence that says what the chart shows, for screen readers. */
  summary: string
  /** Height of one panel. */
  height?: number
  /** Name of what is shaded, for the legend. */
  shadeName?: string | null
  /** A row picked by tap, pointer or arrow keys. */
  onPick?: (row: number | null) => void
}

const PAD = { top: 10, right: 10, bottom: 20, left: 38 }

/** Bars, stacked bars, lines, areas and dots on one baseline, drawn as SVG.
 *  A series in another unit is drawn in a panel of its own under the first,
 *  sharing the days, rather than on a second scale over the same marks.
 *  Tap, point or use the arrow keys to read a day's values out; unknown
 *  days are gaps, never zero. */
export function XYChart({ data, type, yMin, yMax, labels = true, summary, height = 150, shadeName, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const width = useWidth(box)
  const [picked, setPicked] = useState<number | null>(null)
  const id = useId()
  const n = data.labels.length
  const shown = data.series.filter((s) => !s.hidden)
  const panels = [shown.filter((s) => s.axis === 0), shown.filter((s) => s.axis === 1)].filter((p) => p.length)
  const plotW = Math.max(40, width - PAD.left - PAD.right)
  const slot = n > 0 ? plotW / n : plotW
  const x = (i: number) => PAD.left + slot * i + slot / 2
  const step = labelStep(n, plotW, data.labels.some((l) => l.length > 3) ? 44 : 26)

  const pick = (i: number | null) => { setPicked(i); onPick?.(i) }
  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const i = Math.floor((e.clientX - r.left - PAD.left) / slot)
    return i >= 0 && i < n ? i : null
  }
  const onKey = (e: KeyboardEvent) => {
    if (!n) return
    if (e.key === 'ArrowRight') { e.preventDefault(); pick(picked == null ? 0 : Math.min(n - 1, picked + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pick(picked == null ? n - 1 : Math.max(0, picked - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); pick(0) }
    else if (e.key === 'End') { e.preventDefault(); pick(n - 1) }
    else if (e.key === 'Escape') pick(null)
  }

  const readout = picked == null ? null : (
    <>
      <b>{data.long[picked]}</b>
      {shown.map((s) => (
        <span key={s.key} className="ch-read-item">
          {shown.length > 1 && <i className="ch-key" style={{ background: s.colour }} aria-hidden />}
          {shown.length > 1 ? `${s.label}: ` : ''}
          {s.values[picked] == null ? (data.future[picked] ? 'still to come' : 'nothing logged') : formatValue(s.values[picked], s.unit, s.decimals)}
        </span>
      ))}
      {data.targets?.[picked] != null && <span className="ch-read-item">target {formatValue(data.targets[picked], shown[0]?.unit ?? '', 0)}</span>}
    </>
  )

  return (
    <div className="ch" ref={box}>
      <p className="ch-readout" aria-live="polite" id={`${id}-read`}>
        {readout ?? <span className="ch-hint">Tap the chart to read a value.</span>}
      </p>
      <div className="ch-plot" tabIndex={0} role="img" aria-label={summary} aria-describedby={`${id}-read`} onKeyDown={onKey}>
        {width > 0 && panels.map((series, p) => (
          <Panel key={p} series={series} data={data} type={type} width={width} height={height}
            last={p === panels.length - 1} x={x} slot={slot} step={step} picked={picked}
            yMin={p === 0 ? yMin : null} yMax={p === 0 ? yMax : null} labels={labels}
            target={p === 0 ? data.target : null} targets={p === 0 ? data.targets : null}
            onMove={(e) => { const i = fromPointer(e); if (e.pointerType === 'mouse') pick(i) }}
            onDown={(e) => { const i = fromPointer(e); pick(i === picked ? null : i) }}
            onLeave={(e) => { if (e.pointerType === 'mouse') pick(null) }} />
        ))}
        {width > 0 && !panels.length && <p className="ch-hint">Every series is switched off. Show one under Chart.</p>}
      </div>
      {(shown.length > 1 || data.shaded || data.target != null || data.targets) && (
        <ul className="ch-legend" aria-label="Legend">
          {shown.length > 1 && shown.map((s) => (
            <li key={s.key}><i className={`ch-key${type === 'line' || type === 'area' ? ' is-line' : ''}`} style={{ background: s.colour }} aria-hidden />{s.label}{s.axis === 1 ? ' (lower panel)' : ''}</li>
          ))}
          {(data.target != null || data.targets) && <li><i className="ch-key is-target" aria-hidden />Target</li>}
          {data.shaded && <li><i className="ch-key is-shade" aria-hidden />{shadeName ?? 'Shaded days'}</li>}
        </ul>
      )}
    </div>
  )
}

interface PanelProps {
  series: ChartSeries[]
  data: ChartData
  type: XYType
  width: number
  height: number
  last: boolean
  x: (i: number) => number
  slot: number
  step: number
  picked: number | null
  yMin?: number | null
  yMax?: number | null
  labels: boolean
  target: number | null
  targets: (number | null)[] | null
  onMove: (e: PointerEvent<SVGSVGElement>) => void
  onDown: (e: PointerEvent<SVGSVGElement>) => void
  onLeave: (e: PointerEvent<SVGSVGElement>) => void
}

function Panel({ series, data, type, width, height, last, x, slot, step, picked, yMin, yMax, labels, target, targets, onMove, onDown, onLeave }: PanelProps) {
  const n = data.labels.length
  const stacked = type === 'stacked' && series.length > 1
  const unit = series[0]?.unit ?? ''
  const h = height + (last ? PAD.bottom : 4)
  const values = useMemo(() => {
    const out: number[] = []
    if (stacked) {
      for (let i = 0; i < n; i++) {
        let pos = 0; let neg = 0
        for (const s of series) { const v = s.values[i]; if (v == null) continue; if (v >= 0) pos += v; else neg += v }
        out.push(pos, neg)
      }
    } else for (const s of series) for (const v of s.values) if (v != null) out.push(v)
    if (target != null) out.push(target)
    for (const t of targets ?? []) if (t != null) out.push(t)
    return out
  }, [series, n, stacked, target, targets])
  // Times of day and weights read best near their values, not from zero.
  const fromZero = !(unit === 'time' || unit === 'kg' || unit === 'cm' || type === 'line' || type === 'dots')
  const scale = niceScale(values, { min: yMin, max: yMax, zero: fromZero ? true : values.length === 0 })
  const y = (v: number) => PAD.top + (height - PAD.top) * (1 - (Math.min(scale.max, Math.max(scale.min, v)) - scale.min) / (scale.max - scale.min || 1))
  const base = y(Math.max(scale.min, Math.min(scale.max, 0)))
  const barW = Math.max(1, Math.min(24, (slot - 4) / (stacked || type !== 'bar' ? 1 : series.length) - (stacked || type !== 'bar' ? 0 : 2)))
  const fewLabels = n <= 12

  return (
    <svg className="ch-svg" width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden
      onPointerMove={onMove} onPointerDown={onDown} onPointerLeave={onLeave}>
      {/* Shaded days sit behind everything. */}
      {data.shaded?.map((on, i) => on ? <rect key={`s${i}`} x={x(i) - slot / 2} y={PAD.top} width={slot} height={height - PAD.top} className="ch-shade" /> : null)}
      {picked != null && <rect x={x(picked) - slot / 2} y={PAD.top} width={slot} height={height - PAD.top} className="ch-pick" />}
      {scale.ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'ch-base' : 'ch-grid'} />
          <text x={PAD.left - 5} y={y(t)} className="ch-tick" textAnchor="end" dominantBaseline="middle">{shortNumber(t, unit)}</text>
        </g>
      ))}
      {(type === 'bar' || type === 'stacked') && series.map((s, k) => s.values.map((v, i) => {
        if (v == null || v === 0) return null
        let top: number; let bottom: number
        if (stacked) {
          let below = 0
          for (const o of series.slice(0, k)) { const ov = o.values[i]; if (ov != null && Math.sign(ov) === Math.sign(v)) below += ov }
          top = y(below + v); bottom = y(below)
        } else { top = y(v); bottom = base }
        const left = stacked || series.length === 1 ? x(i) - barW / 2 : x(i) - (series.length * (barW + 2) - 2) / 2 + k * (barW + 2)
        const up = top < bottom
        const hgt = Math.abs(bottom - top)
        // A 2 px gap of page colour between stacked segments.
        const gap = stacked && k > 0 ? Math.min(2, hgt / 2) : 0
        const r = (!stacked || k === series.length - 1 || series.slice(k + 1).every((o) => o.values[i] == null)) ? Math.min(4, hgt, barW / 2) : 0
        return <path key={`${s.key}${i}`} d={barPath(left, up ? top : bottom, barW, Math.max(0, hgt - gap), r, up)} fill={s.colour}
          className={data.future[i] ? 'ch-future' : undefined} />
      }))}
      {(type === 'line' || type === 'area' || type === 'dots') && series.map((s) => {
        const runs: [number, number][][] = []
        let run: [number, number][] = []
        s.values.forEach((v, i) => {
          if (v == null) { if (run.length) runs.push(run); run = []; return }
          run.push([x(i), y(v)])
        })
        if (run.length) runs.push(run)
        const dots = type === 'dots' || n <= 31
        return (
          <g key={s.key}>
            {type === 'area' && runs.map((r, j) => (
              <path key={`a${j}`} d={`M${r[0][0]},${base} ${r.map(([a, b]) => `L${a},${b}`).join(' ')} L${r[r.length - 1][0]},${base} Z`} fill={s.colour} opacity={0.12} />
            ))}
            {type !== 'dots' && runs.map((r, j) => (
              <path key={`l${j}`} d={r.map(([a, b], q) => `${q ? 'L' : 'M'}${a},${b}`).join(' ')} className="ch-line" stroke={s.colour} />
            ))}
            {dots && s.values.map((v, i) => v == null ? null : (
              <circle key={i} cx={x(i)} cy={y(v)} r={type === 'dots' ? 4.5 : 4} fill={s.colour} className="ch-dot" />
            ))}
          </g>
        )
      })}
      {targets && (
        <path className="ch-target" d={targets.map((t, i) => t == null ? '' : `M${x(i) - slot / 2},${y(t)} L${x(i) + slot / 2},${y(t)}`).join(' ')} />
      )}
      {target != null && target >= scale.min && target <= scale.max && (
        <g>
          <line className="ch-target" x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} />
          <text className="ch-tick ch-target-label" x={width - PAD.right} y={y(target) - 4} textAnchor="end">Target {shortNumber(target, unit)}</text>
        </g>
      )}
      {/* Direct labels, sparingly: on a few bars, or at the end of each line. */}
      {labels && (type === 'bar' || type === 'stacked') && fewLabels && series.length === 1 && series[0].values.map((v, i) => v == null ? null : (
        <text key={`v${i}`} className="ch-value" x={x(i)} y={Math.min(y(v), base) - 4} textAnchor="middle">{shortNumber(v, unit)}</text>
      ))}
      {labels && (type === 'line' || type === 'area' || type === 'dots') && series.length <= 3 && series.map((s) => {
        const i = lastIndex(s.values)
        if (i < 0) return null
        return <text key={`e${s.key}`} className="ch-value" x={Math.min(x(i), width - PAD.right)} y={y(s.values[i]!) - 8} textAnchor={x(i) > width - 40 ? 'end' : 'middle'}>{shortNumber(s.values[i]!, unit)}</text>
      })}
      {last && data.labels.map((l, i) => (i % step === 0 || i === picked) ? (
        <text key={`x${i}`} x={x(i)} y={height + 14} className={`ch-tick${i === picked ? ' is-picked' : ''}`} textAnchor="middle">{l}</text>
      ) : null)}
    </svg>
  )
}

const lastIndex = (vs: (number | null)[]) => { for (let i = vs.length - 1; i >= 0; i--) if (vs[i] != null) return i; return -1 }

/** A column rounded at its data end and square at the baseline. */
function barPath(x: number, top: number, w: number, h: number, r: number, up: boolean): string {
  if (h <= 0) return ''
  r = Math.min(r, h)
  if (up) {
    return `M${x},${top + h} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${top + h} Z`
  }
  return `M${x},${top} L${x + w},${top} L${x + w},${top + h - r} Q${x + w},${top + h} ${x + w - r},${top + h} L${x + r},${top + h} Q${x},${top + h} ${x},${top + h - r} Z`
}
