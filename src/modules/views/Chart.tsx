import { useState } from 'react'
import type { EntityDef, ViewDef } from '../types'
import { CHART_PERIODS, chartFields, type ChartPeriod } from '../def-rules'
import { chartBuckets, chartDomain, chartPoints, labelEvery, shortNumber, type ChartBucket } from '../view-rules'
import { fieldMeasure } from '../field-kinds'
import type { Rec } from '../records'
import './views.css'
import { planToday } from '../../lib/day-edge'

/** A number over time, added up per day, week or month, as bars or a line.
 *  Plain SVG in the page's own colours, so it reads in light and dark. Each
 *  day, week or month is a button over the drawing: tapping it (or pointing
 *  at it) reads its value out above, for a screen reader too. */

const W = 320
const H = 180
const PLOT = { left: 40, right: 312, top: 12, bottom: 150 }
const PERIOD_NAME: Record<ChartPeriod, string> = { day: 'Day', week: 'Week', month: 'Month' }
const pct = (v: number, of: number) => `${(v / of) * 100}%`

export function ChartView({ entity, view, recs }: { entity: EntityDef; view: ViewDef; recs: Rec[] }) {
  const [period, setPeriod] = useState<ChartPeriod>(view.period ?? 'week')
  const [picked, setPicked] = useState<string | null>(null)
  const { value, date } = chartFields(entity, view)
  if (!value || !date) {
    return <p className="empty">This chart needs a number field and a date field. Pick them under Edit module.</p>
  }

  const today = planToday()
  // As the field counts (field-kinds.ts): stars and shares averaged, money
  // in its currency, a start and end in minutes.
  const measure = fieldMeasure(value)
  const mean = measure?.combine === 'mean'
  const buckets = chartBuckets(chartPoints(entity.fields, value, date, recs), period, today, undefined, mean ? 'mean' : 'sum')
  const [lo, hi] = chartDomain(buckets.map((b) => b.value))
  const plotW = PLOT.right - PLOT.left
  const plotH = PLOT.bottom - PLOT.top
  const step = plotW / buckets.length
  const y = (v: number) => PLOT.bottom - ((v - lo) / (hi - lo)) * plotH
  const x = (i: number) => PLOT.left + step * i + step / 2
  const ticks = lo < 0 && hi > 0 ? [lo, 0, hi] : [lo, (lo + hi) / 2, hi]
  const kind = view.chart ?? 'bar'
  const unit = measure?.unit ? ` ${measure.unit}` : value.unit ? ` ${value.unit}` : value.type === 'duration' ? ' min' : ''
  const fmt = (b: ChartBucket) => (b.value === null ? 'nothing logged' : `${shortNumber(b.value)}${unit}`)
  const shown = buckets.find((b) => b.key === picked)
  const logged = buckets.filter((b) => b.value !== null)
  const total = logged.reduce((a, b) => a + (b.value ?? 0), 0)
  const labelled = labelEvery(buckets.length, period === 'day' ? 7 : 6)
  const barW = Math.min(24, step * 0.7)

  // The line joins the points that have a value; a gap stays a gap.
  const segments: string[] = []
  let run: string[] = []
  buckets.forEach((b, i) => {
    if (b.value === null) { if (run.length) segments.push(run.join(' ')); run = []; return }
    run.push(`${x(i).toFixed(1)},${y(b.value).toFixed(1)}`)
  })
  if (run.length) segments.push(run.join(' '))

  return (
    <figure className="ch">
      <div className="ch-top">
        <div className="tabs ch-periods" role="tablist" aria-label={mean ? 'Averaged per' : 'Added up per'}>
          {CHART_PERIODS.map((p) => (
            <button key={p} role="tab" aria-selected={p === period} onClick={() => { setPeriod(p); setPicked(null) }}>{PERIOD_NAME[p]}</button>
          ))}
        </div>
      </div>
      <figcaption className="ch-cap">
        <span>{value.label}{unit ? ` (${unit.trim()})` : ''}, per {period}</span>
        <span className="ch-readout" aria-live="polite">
          {shown ? `${shown.name}: ${fmt(shown)}`
            : logged.length
              ? mean ? `Average ${shortNumber(Math.round((total / logged.length) * 10) / 10)}${unit} over ${logged.length} ${logged.length === 1 ? period : `${period}s`}`
                : `Total ${shortNumber(total)}${unit} over ${buckets.length} ${period}s`
              : 'Nothing logged in this time yet'}
        </span>
      </figcaption>
      <div className="ch-frame">
        <svg className="ch-svg" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${value.label} per ${period}, ${buckets[0].name} to ${buckets[buckets.length - 1].name}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'ch-zero' : 'ch-grid'} x1={PLOT.left} x2={PLOT.right} y1={y(t)} y2={y(t)} />
              <text className="ch-label" x={PLOT.left - 6} y={y(t) + 3.5} textAnchor="end">{shortNumber(t)}</text>
            </g>
          ))}
          {shown && (
            <rect className="ch-pick" x={PLOT.left + step * buckets.indexOf(shown)} y={PLOT.top} width={step} height={plotH} />
          )}
          {kind === 'bar' && buckets.map((b, i) => {
            if (b.value === null || b.value === 0) return null
            const top = y(Math.max(b.value, 0))
            const h = Math.max(1.5, Math.abs(y(b.value) - y(0)))
            return <rect key={b.key} className={`ch-bar${b.value < 0 ? ' is-neg' : ''}`} x={x(i) - barW / 2} y={top} width={barW} height={h} rx={2} />
          })}
          {kind === 'line' && (
            <>
              {segments.map((s) => <polyline key={s} className="ch-line" points={s} />)}
              {buckets.map((b, i) => b.value !== null && (
                <circle key={b.key} className={`ch-dot${picked === b.key ? ' is-picked' : ''}`} cx={x(i)} cy={y(b.value)} r={picked === b.key ? 4 : 2.8} />
              ))}
            </>
          )}
          {buckets.map((b, i) => labelled(i) && (
            <text key={b.key} className="ch-label" x={x(i)} y={H - 14} textAnchor="middle">{b.label}</text>
          ))}
        </svg>
        <div className="ch-hits" style={{
          left: pct(PLOT.left, W), width: pct(plotW, W), top: pct(PLOT.top, H), height: pct(plotH, H),
          gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))`,
        }}>
          {buckets.map((b) => (
            <button key={b.key} type="button" className="ch-hit" aria-pressed={picked === b.key}
              aria-label={`${b.name}: ${fmt(b)}`}
              onClick={() => setPicked(b.key)}
              onMouseEnter={() => setPicked(b.key)} onMouseLeave={() => setPicked(null)} />
          ))}
        </div>
      </div>
    </figure>
  )
}
