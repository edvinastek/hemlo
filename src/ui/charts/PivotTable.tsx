import { useState } from 'react'
import { formatValue } from '../../lib/chart-rules'
import { decimalsFor, drill, unitFor, type Fact, type PivotResult } from '../../lib/pivot-rules'
import { summaryName } from '../../lib/stats-builder-rules'
import './charts.css'

/** The pivot as a table (STA-12, STA-18): groups down the side, a second
 *  grouping across, the summary in each cell, totals at the end. A tap on a
 *  cell lists the entries behind it. Wide tables scroll inside their own
 *  box, so the page never runs off the side; the first column stays put. */
export function PivotTable({ result, rows, columns, rowsName, colsName, caption, measures }: {
  result: PivotResult; rows: string; columns: string; rowsName: string; colsName: string; caption: string
  /** Names and units of every measure, for the entries behind a cell. */
  measures?: Map<string, { label: string; unit: string; decimals: number }>
}) {
  const [cell, setCell] = useState<{ r: number | null; c: number | null } | null>(null)
  const split = columns !== 'none'
  const many = result.values.length > 1
  const fmt = (v: number | null, k: number) => {
    const x = result.values[k]
    return formatValue(v, unitFor(x.info, x.spec.summary), decimalsFor(x.info, x.spec.summary))
  }
  const name = (k: number) => {
    const x = result.values[k]
    return `${x.spec.label ?? x.info.label}${many || split ? '' : ''}, ${summaryName(x.spec.summary, x.info).toLowerCase()}`
  }
  const facts = cell ? drill(result, { rows, columns }, cell.r == null ? null : result.rows[cell.r].key, cell.c == null ? null : result.columns[cell.c].key) : []
  const where = cell ? [cell.r == null ? null : result.rows[cell.r].label, cell.c == null ? null : result.columns[cell.c].label].filter(Boolean).join(' · ') || 'Everything' : ''
  const showRowTotal = split
  const showGrand = result.rows.length > 1

  const Cell = ({ v, k, r, c }: { v: number | null; k: number; r: number | null; c: number | null }) => (
    <td className="num">
      <button type="button" className="pt-cell" onClick={() => setCell({ r, c })}
        aria-label={`${[r == null ? 'Total' : result.rows[r].label, c == null ? (split ? 'total' : null) : split ? result.columns[c].label : null, name(k)].filter(Boolean).join(', ')}: ${fmt(v, k)}. Show the entries.`}>
        {fmt(v, k)}
      </button>
    </td>
  )

  return (
    <div className="pt">
      <div className="pt-scroll" tabIndex={0} role="region" aria-label={`${caption}, as a table`}>
        <table className="pt-table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="pt-corner">{rowsName}{split ? ` · ${colsName}` : ''}</th>
              {split
                ? result.columns.flatMap((c) => result.values.map((_, k) => <th key={`${c.key}${k}`} scope="col" className="num" title={c.label}>{c.days && columns !== 'day' ? c.short : c.label}{many ? <span className="pt-sub">{result.values[k].spec.label ?? result.values[k].info.label}</span> : null}</th>))
                : result.values.map((_, k) => <th key={k} scope="col" className="num">{result.values[k].spec.label ?? result.values[k].info.label}<span className="pt-sub">{summaryName(result.values[k].spec.summary, result.values[k].info)}</span></th>)}
              {showRowTotal && result.values.map((_, k) => <th key={`t${k}`} scope="col" className="num">Total{many ? <span className="pt-sub">{result.values[k].spec.label ?? result.values[k].info.label}</span> : null}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={r.key} className={r.future ? 'is-future' : undefined}>
                <th scope="row">{r.label}</th>
                {result.columns.flatMap((_, j) => result.values.map((__, k) => <Cell key={`${j}${k}`} v={result.cells[i][j][k]} k={k} r={i} c={split ? j : null} />))}
                {showRowTotal && result.values.map((_, k) => <Cell key={`t${k}`} v={result.rowTotals[i][k]} k={k} r={i} c={null} />)}
              </tr>
            ))}
          </tbody>
          {showGrand && (
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {split
                  ? result.columns.flatMap((_, j) => result.values.map((__, k) => <Cell key={`${j}${k}`} v={result.colTotals[j][k]} k={k} r={null} c={j} />))
                  : result.values.map((_, k) => <Cell key={k} v={result.grand[k]} k={k} r={null} c={null} />)}
                {showRowTotal && result.values.map((_, k) => <Cell key={`g${k}`} v={result.grand[k]} k={k} r={null} c={null} />)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {cell && <DrillSheet title={where} facts={facts} measures={measures} onClose={() => setCell(null)} />}
    </div>
  )
}

/** The entries behind a cell, newest first, grouped by the row they come
 *  from (a task, a meal, a set), with their figures. */
function DrillSheet({ title, facts, measures, onClose }: {
  title: string; facts: Fact[]; measures?: Map<string, { label: string; unit: string; decimals: number }>; onClose: () => void
}) {
  // One line per entry: the same row can give several figures (a meal's
  // calories and protein), shown together.
  const lines = new Map<string, { day: string; label: string; parts: string[] }>()
  for (const f of facts) {
    const key = `${f.ref?.table ?? f.measure}:${f.ref?.id ?? f.day}:${f.day}`
    const line = lines.get(key) ?? { day: f.day, label: f.ref?.label ?? f.item ?? 'Entry', parts: [] }
    const m = measures?.get(f.measure)
    const what = m?.label ?? f.measure.split(':').slice(1).join(' ').replace(/_/g, ' ')
    line.parts.push(`${what} ${formatValue(f.value, m?.unit === '%' ? '' : m?.unit ?? '', Math.max(1, m?.decimals ?? 1))}`)
    lines.set(key, line)
  }
  const list = [...lines.values()].slice(0, 300)
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet pt-drill" role="dialog" aria-modal="true" aria-label={`Entries: ${title}`}>
        <h2>{title}</h2>
        {list.length === 0 ? <p className="st-note">Nothing was logged here.</p> : (
          <ul className="pt-drill-list">
            {list.map((l, i) => (
              <li key={i}>
                <span className="pt-drill-day">{fmt(l.day)}</span>
                <span className="pt-drill-name">{l.label}</span>
                <span className="pt-drill-parts">{l.parts.join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
        {lines.size > 300 && <p className="st-note">The first 300 of {lines.size} entries.</p>}
        <div className="sheet-actions"><button type="button" className="btn grow" onClick={onClose} autoFocus>Close</button></div>
      </div>
    </>
  )
}
