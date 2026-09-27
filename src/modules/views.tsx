import { useMemo, useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { DataTable, type LookupOption } from '../ui/DataTable'
import type { EntityDef, FieldDef, ModuleDef, ViewDef } from './types'
import { computeFormulas, firstDateField, isDateLike, mainField } from './def-rules'
import { updateRecord, type Lookups, type Rec } from './records'
import { formatValue } from './RecordSheet'

/** The views a module page draws, each from the same records. */

const dayLabel = (d: string) => { try { return format(parseISO(d), 'EEE d MMM yyyy') } catch { return d } }

/** What a record is called on a card: its main field, or else the first
 *  link or choice that is filled in (a set is known by its exercise). */
export function recordTitle(entity: EntityDef, rec: Rec, lookups: Lookups): string {
  const main = mainField(entity.fields)
  const candidates = [main, ...entity.fields.filter((f) => !f.hidden && (f.type === 'lookup' || f.type === 'select' || f.type === 'text'))]
  for (const f of candidates) {
    if (!f) continue
    const shown = formatValue(f, rec.values[f.name], lookups)
    if (shown) return shown
  }
  return `${entity.label} without a name`
}

/** The field the card's title came from, so it is not repeated underneath. */
function titleField(entity: EntityDef, rec: Rec): FieldDef | undefined {
  const main = mainField(entity.fields)
  const candidates = [main, ...entity.fields.filter((f) => !f.hidden && (f.type === 'lookup' || f.type === 'select' || f.type === 'text'))]
  return candidates.find((f) => f && rec.values[f.name] !== null && rec.values[f.name] !== undefined && rec.values[f.name] !== '')
}

/** Cards: the main field, then what else is filled in, and the day. */
export function ListView({ entity, recs, lookups, onOpen }: {
  entity: EntityDef; recs: Rec[]; lookups: Lookups; onOpen: (r: Rec) => void
}) {
  const dateF = firstDateField(entity.fields)
  return (
    <ul className="mp-cards">
      {recs.map((r) => {
        const calc = computeFormulas(entity.fields, r.values)
        const shownAs = titleField(entity, r)
        const bits = entity.fields.filter((f) => !f.hidden && f !== shownAs && f !== dateF)
          .map((f) => {
            const v = f.type === 'formula' ? calc[f.name] : r.values[f.name]
            if (v === null || v === undefined || v === '' || (f.type === 'boolean' && !v)) return null
            return f.type === 'boolean' ? f.label : `${f.label} ${formatValue(f, v, lookups)}`
          })
          .filter(Boolean)
          .slice(0, 5)
        const dv = dateF ? r.values[dateF.name] : null
        return (
          <li key={r.id}>
            <button type="button" className="mp-card" onClick={() => onOpen(r)}>
              <span className="mp-card-main">{recordTitle(entity, r, lookups)}</span>
              <span className="mp-card-date">{dv ? formatValue(dateF!, dv) : ''}</span>
              {bits.length > 0 && <span className="mp-card-meta">{bits.join(' · ')}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The spreadsheet: every cell edits in place, calculated ones do not. */
export function TableView({ def, entity, view, recs, lookups, profileId, onOpen }: {
  def: ModuleDef; entity: EntityDef; view: ViewDef; recs: Rec[]; lookups: Lookups; profileId: string; onOpen: (r: Rec) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const byName = new Map(entity.fields.map((f) => [f.name, f]))
  const cols: FieldDef[] = (view.columns?.length ? view.columns.map((c) => byName.get(c)).filter((f): f is FieldDef => !!f) : entity.fields)
    .filter((f) => !f.hidden)
  const rows = recs.map((r) => ({ id: r.id, ...r.values }))
  const tableLookups: Record<string, LookupOption[]> = {}
  for (const [k, items] of Object.entries(lookups)) tableLookups[k] = (items ?? []).map((i) => ({ id: i.id, label: i.name }))
  const recById = new Map(recs.map((r) => [r.id, r]))

  async function change(row: { id: string }, field: string, value: unknown) {
    const rec = recById.get(row.id)
    if (!rec) return
    const res = await updateRecord(profileId, def, entity, rec, { [field]: value })
    setError(res.ok ? null : Object.values(res.errors)[0] ?? null)
  }

  return (
    <>
      {error && <p className="mp-note is-warn" role="alert">{error}</p>}
      <div className="mp-table">
      <DataTable fields={cols} rows={rows} lookups={tableLookups} emptyAsNull
        computed={(row, f) => computeFormulas(entity.fields, row)[f.name] ?? null}
        onChange={(row, field, value) => void change(row, field, value)}
        onOpen={(row) => { const r = recById.get(row.id); if (r) onOpen(r) }}
        openLabel={(row) => `Open ${recordTitle(entity, recById.get(row.id)!, lookups)}`} />
      </div>
    </>
  )
}

/** A month with the records on their days. A day tapped shows its records
 *  underneath, with a button to add one on that day. */
export function CalendarView({ entity, view, recs, lookups, onOpen, onAdd }: {
  entity: EntityDef; view: ViewDef; recs: Rec[]; lookups: Lookups; onOpen: (r: Rec) => void; onAdd: (day: string) => void
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [picked, setPicked] = useState<string | null>(null)
  const dateF = entity.fields.find((f) => f.name === view.dateField && isDateLike(f)) ?? firstDateField(entity.fields)
  const byDay = useMemo(() => {
    const map = new Map<string, Rec[]>()
    if (!dateF) return map
    for (const r of recs) {
      const v = r.values[dateF.name]
      if (typeof v !== 'string' || v.length < 10) continue
      const d = v.slice(0, 10)
      map.set(d, [...(map.get(d) ?? []), r])
    }
    for (const list of map.values()) list.sort((a, b) => String(a.values[dateF.name]).localeCompare(String(b.values[dateF.name])))
    return map
  }, [recs, dateF])

  if (!dateF) {
    return <p className="empty">This calendar has no date to go by. Add a date field under Edit module, then pick it for this view.</p>
  }

  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) })
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const pickedRecs = picked ? byDay.get(picked) ?? [] : []

  return (
    <>
      <div className="mp-cal-head">
        <button type="button" className="btn" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>‹</button>
        <h2 aria-live="polite">{format(month, 'MMMM yyyy')}</h2>
        <button type="button" className="btn" onClick={() => { setMonth(startOfMonth(new Date())); setPicked(todayKey) }}>Today</button>
        <button type="button" className="btn" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>›</button>
      </div>
      <div className="mp-weekdays" aria-hidden>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d.slice(0, 2)}</span>)}
      </div>
      <div className="month-grid mp-month" role="grid" aria-label={format(month, 'MMMM yyyy')}>
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd')
          const list = byDay.get(key) ?? []
          return (
            <button type="button" key={key} role="gridcell"
              className={`month-cell${isSameMonth(d, month) ? '' : ' is-out'}${key === todayKey ? ' is-today' : ''}`}
              aria-pressed={picked === key}
              aria-label={`${format(d, 'EEEE d MMMM')}${list.length ? `, ${list.length} ${list.length === 1 ? 'record' : 'records'}` : ''}`}
              onClick={() => setPicked(key)}>
              <span className="d">{format(d, 'd')}</span>
              {list.slice(0, 2).map((r) => <span key={r.id} className="mp-cal-item">{recordTitle(entity, r, lookups)}</span>)}
              {list.length > 2 && <span className="mp-cal-more">+{list.length - 2}</span>}
            </button>
          )
        })}
      </div>
      {picked && (
        <>
          <div className="mp-day-head">
            <h3>{dayLabel(picked)}</h3>
            <button type="button" className="btn" onClick={() => onAdd(picked)}>Add on this day</button>
          </div>
          {pickedRecs.length === 0
            ? <p className="mp-note">Nothing on this day.</p>
            : <ListView entity={entity} recs={pickedRecs} lookups={lookups} onOpen={onOpen} />}
        </>
      )}
    </>
  )
}

/** Totals for the fields marked to count in Stats, over what is shown. */
export function Totals({ entity, recs }: { entity: EntityDef; recs: Rec[] }) {
  const flagged = entity.fields.filter((f) => f.stats)
  if (flagged.length === 0 || recs.length === 0) return null
  const parts = flagged.map((f) => {
    const vals = recs.map((r) => (f.type === 'formula' ? computeFormulas(entity.fields, r.values)[f.name] : r.values[f.name]))
      .filter((v) => v !== null && v !== undefined && v !== '')
    if (f.stats === 'count') return { label: `${f.label}, count`, value: String(vals.length) }
    const nums = vals.map(Number).filter(Number.isFinite)
    if (nums.length === 0) return null
    const sum = nums.reduce((a, b) => a + b, 0)
    const v = f.stats === 'average' ? sum / nums.length : sum
    return { label: `${f.label}, ${f.stats === 'average' ? 'average' : 'total'}`, value: `${Math.round(v * 100) / 100}${f.unit ? ` ${f.unit}` : ''}` }
  }).filter((p): p is { label: string; value: string } => !!p)
  if (parts.length === 0) return null
  return (
    <div className="totals" aria-label="Totals">
      {parts.map((p) => <span key={p.label}>{p.label} <b>{p.value}</b></span>)}
    </div>
  )
}
