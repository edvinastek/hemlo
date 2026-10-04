import { useMemo, useState } from 'react'
import type { EntityDef, ModuleDef, ViewDef } from '../types'
import { gridFields } from '../def-rules'
import {
  GRID_SPANS, cellKey, gridCells, gridDays, gridRows, gridTap, rowStreak, shortDay, type GridSpan,
} from '../view-rules'
import { addRecord, updateRecord, type Lookups, type Rec } from '../records'
import { formatValue } from '../RecordSheet'
import './views.css'
import { planToday } from '../../lib/day-edge'

/** Days across, one row per name, like a habit grid: tap a cell to tick
 *  that row on that day (a record is made for it when there is none). The
 *  last 7, 14 or 30 days; the row names stay put while the days scroll. */
export function GridView({ def, entity, view, recs, lookups, profileId, onOpen }: {
  def: ModuleDef; entity: EntityDef; view: ViewDef; recs: Rec[]; lookups: Lookups; profileId: string; onOpen: (r: Rec) => void
}) {
  const [span, setSpan] = useState<GridSpan>(7)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const today = planToday()
  const g = gridFields(entity, view)
  const days = useMemo(() => gridDays(today, span), [today, span])
  const byId = new Map(recs.map((r) => [r.id, r]))

  if (!g.row || !g.date) {
    return <p className="empty">This grid needs a date field and a name for its rows. Pick them under Edit module.</p>
  }
  const fields = { row: g.row, date: g.date, mark: g.mark }
  const cells = gridCells(fields, recs, days)
  const label = (v: string) => (g.row!.type === 'lookup' ? formatValue(g.row!, v, lookups) || v : v)
  let rows = gridRows(g.row, recs)
  if (g.row.type === 'lookup') rows = rows.sort((a, b) => label(a).localeCompare(label(b)))

  async function tap(row: string, day: string) {
    const k = cellKey(row, day)
    if (busy) return
    const action = gridTap(fields, row, day, cells.get(k), recs)
    setError(null)
    if (action.kind === 'open') { const r = byId.get(action.id); if (r) onOpen(r); return }
    setBusy(k)
    try {
      if (action.kind === 'add') {
        const res = await addRecord(profileId, def, entity, action.values)
        if (!res.ok) setError(`Could not add it here: ${Object.values(res.errors)[0] ?? 'a field is missing'} Use the + button to fill it in.`)
        return
      }
      for (const c of action.changes) {
        const r = byId.get(c.id)
        if (!r) continue
        const res = await updateRecord(profileId, def, entity, r, c.values)
        if (!res.ok) { setError(Object.values(res.errors)[0] ?? 'Could not change it.'); return }
      }
    } finally { setBusy(null) }
  }

  const what = g.mark?.label.toLowerCase() ?? ''

  return (
    <>
      <div className="gd-head">
        <div className="gd-spans" role="group" aria-label="Days shown">
          {GRID_SPANS.map((s) => (
            <button key={s} type="button" className="me-col" aria-pressed={span === s} onClick={() => setSpan(s)}>{s} days</button>
          ))}
        </div>
      </div>
      {error && <p className="mp-note is-warn" role="alert">{error}</p>}
      {rows.length === 0 ? (
        <p className="empty">
          No rows yet. Add a {entity.label.toLowerCase()} with the + button; each {g.row.label.toLowerCase()} becomes a row.
        </p>
      ) : (
        <div className="gd-wrap">
          <table className={`gd n-${span}`}>
            <caption className="move-live">{view.name}: {g.row.label} by day, the last {span} days. Tap a cell to {g.mark?.type === 'boolean' ? 'tick or untick it' : 'add or open it'}.</caption>
            <thead>
              <tr>
                <th scope="col" className="gd-name">{g.row.label}</th>
                {days.map((d) => (
                  <th key={d} scope="col" className={`gd-day${d === today ? ' is-today' : ''}`} abbr={shortDay(d)}>
                    <span className="gd-wd">{shortDay(d).slice(0, 2)}</span>
                    <span>{Number(d.slice(8))}</span>
                  </th>
                ))}
                <th scope="col" className="gd-streak" title="Days in a row">Run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const name = label(row)
                return (
                  <tr key={row}>
                    <th scope="row" className="gd-name">{name}</th>
                    {days.map((d) => {
                      const k = cellKey(row, d)
                      const c = cells.get(k)
                      const shownValue = c?.total != null && c.total !== 0 ? String(c.total) : ''
                      const state = c?.on ? (shownValue ? shownValue : 'done') : c ? 'not done' : 'nothing'
                      return (
                        <td key={d} className={d === today ? 'is-today' : undefined}>
                          <button type="button" className={`gd-cell${c?.on ? ' is-on' : ''}`} aria-pressed={!!c?.on}
                            disabled={busy === k}
                            aria-label={`${name}, ${shortDay(d)}: ${state}`}
                            onClick={() => void tap(row, d)}>
                            {shownValue && <span>{shownValue}</span>}
                          </button>
                        </td>
                      )
                    })}
                    <td className="gd-streak">{rowStreak(row, days, cells) || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mp-note">
        {g.mark
          ? `A tap on an empty day adds a record for it with ${what} ${g.mark.type === 'boolean' ? 'ticked' : 'at 1'}; ${g.mark.type === 'boolean' ? 'a tap on a ticked day unticks it' : 'a tap on a counted day opens it'}.`
          : `A tap on an empty day adds a record for it; a tap on a full one opens it.`}
      </p>
    </>
  )
}
