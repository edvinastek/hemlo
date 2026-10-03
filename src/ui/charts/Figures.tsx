import { useState } from 'react'
import { formatValue } from '../../lib/chart-rules'
import type { HeatGrid as Grid } from '../../lib/pivot-rules'
import './charts.css'

/** One figure, large: "142 g", with a quieter line under it and, when there
 *  is one, the figure for the period before. */
export function NumberTile({ value, unit, decimals, sub, before, label }: {
  value: number | null; unit: string; decimals: number; sub?: string; before?: { text: string } | null; label: string
}) {
  return (
    <div className="ch-number" role="group" aria-label={`${label}: ${formatValue(value, unit, decimals)}`}>
      <span className="ch-number-value">{value == null ? 'Nothing logged' : formatValue(value, unit, decimals)}</span>
      {sub && <span className="ch-number-sub">{sub}</span>}
      {before && <span className="ch-number-sub">{before.text}</span>}
    </div>
  )
}

/** A ring filled to a share (0 to 1), with the figure in the middle. The
 *  unfilled track is a pale step of the same colour, so the whole ring
 *  reads as one thing. */
export function Ring({ progress, text, sub, colour, label }: { progress: number | null; text: string; sub?: string; colour: string; label: string }) {
  const r = 42
  const c = 2 * Math.PI * r
  const p = progress == null ? 0 : Math.max(0, Math.min(1, progress))
  return (
    <div className="ch-ring" role="img" aria-label={`${label}: ${text}${sub ? `, ${sub}` : ''}`}>
      <svg viewBox="0 0 100 100" width="128" height="128" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke={colour} strokeOpacity={0.18} strokeWidth="9" />
        {progress != null && p > 0 && (
          <circle cx="50" cy="50" r={r} fill="none" stroke={colour} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 50 50)" />
        )}
      </svg>
      <div className="ch-ring-text">
        <span className="ch-number-value">{text}</span>
        {sub && <span className="ch-number-sub">{sub}</span>}
      </div>
    </div>
  )
}

/** A square per day, darker for more (STA-17): a calendar for a short range,
 *  a year in pixels (months across, days down) for a long one. A day with
 *  nothing logged is outlined, not filled, so it never reads as zero. */
export function HeatGrid({ grid, colour, unit, decimals, label }: { grid: Grid; colour: string; unit: string; decimals: number; label: string }) {
  const [picked, setPicked] = useState<string | null>(null)
  const cell = grid.rows.flatMap((r) => r.cells).find((c) => c?.day === picked) ?? null
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div className="ch">
      <p className="ch-readout" aria-live="polite">
        {cell ? <><b>{fmt(cell.day)}</b> <span className="ch-read-item">{cell.value == null ? (cell.future ? 'still to come' : 'nothing logged') : formatValue(cell.value, unit, decimals)}</span></>
          : <span className="ch-hint">Tap a square to read its day.</span>}
      </p>
      <div className={`ch-heat is-${grid.mode}`} role="grid" aria-label={label}
        style={{ gridTemplateColumns: `2.6em repeat(${grid.columns.length}, minmax(0, 1fr))` }}>
        <span role="presentation" />
        {grid.columns.map((c, i) => <span key={i} className="ch-heat-head" role="columnheader">{c}</span>)}
        {grid.rows.map((r) => (
          <div key={r.label} role="row" className="ch-heat-row">
            <span className="ch-heat-head" role="rowheader">{r.label}</span>
            {r.cells.map((c, i) => c ? (
              <button key={c.day} type="button" role="gridcell"
                className={`ch-heat-cell${c.level == null ? ' is-unknown' : ''}${c.future ? ' is-future' : ''}${picked === c.day ? ' is-picked' : ''}`}
                style={{ background: c.level == null ? undefined : c.level === 0 ? 'var(--e-tint)' : `color-mix(in srgb, ${colour} ${[0, 30, 52, 76, 100][c.level]}%, var(--e-paper))` }}
                aria-label={`${fmt(c.day)}: ${c.value == null ? (c.future ? 'still to come' : 'nothing logged') : formatValue(c.value, unit, decimals)}`}
                aria-pressed={picked === c.day}
                onClick={() => setPicked((p) => (p === c.day ? null : c.day))} />
            ) : <span key={i} className="ch-heat-none" />)}
          </div>
        ))}
      </div>
      <div className="ch-heat-legend" aria-hidden>
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => <i key={l} style={{ background: l === 0 ? 'var(--e-tint)' : `color-mix(in srgb, ${colour} ${[0, 30, 52, 76, 100][l]}%, var(--e-paper))` }} />)}
        <span>More</span>
        <i className="is-unknown" /><span>Nothing logged</span>
      </div>
    </div>
  )
}
