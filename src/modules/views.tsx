import { useMemo, useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { DataTable, type LookupOption } from '../ui/DataTable'
import type { EntityDef, FieldDef, ModuleDef, ViewDef } from './types'
import { computeFormulas, firstDateField, isDateLike, mainField } from './def-rules'
import { updateRecord, type Lookups, type Rec } from './records'
import { PhotoThumb, formatValue } from './RecordSheet'
import { eventTimes } from '../lib/day-items-rules'
import type { Selection } from '../ui/useSelection'

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
export function ListView({ entity, recs, lookups, onOpen, sel }: {
  entity: EntityDef; recs: Rec[]; lookups: Lookups; onOpen: (r: Rec) => void
  /** Hold a card to select it and others (GEN-52); a tap then ticks. */
  sel?: Selection<Rec>
}) {
  const dateF = firstDateField(entity.fields)
  return (
    <ul className="mp-cards">
      {recs.map((r) => {
        const calc = computeFormulas(entity.fields, r.values)
        const shownAs = titleField(entity, r)
        const bits = entity.fields.filter((f) => !f.hidden && f !== shownAs && f !== dateF && f.type !== 'photo')
          .map((f) => {
            const v = f.type === 'formula' ? calc[f.name] : r.values[f.name]
            if (v === null || v === undefined || v === '' || (f.type === 'boolean' && !v)) return null
            return f.type === 'boolean' ? f.label : `${f.label} ${formatValue(f, v, lookups)}`
          })
          .filter(Boolean)
          .slice(0, 5)
        const dv = dateF ? r.values[dateF.name] : null
        const picking = !!sel?.selecting
        const on = !!sel?.has(r.id)
        const title = recordTitle(entity, r, lookups)
        const pic = entity.fields.find((f) => f.type === 'photo' && !f.hidden && r.values[f.name])
        return (
          <li key={r.id}>
            <button type="button" className={`mp-card${picking ? ' is-pickable' : ''}${on ? ' is-picked' : ''}${pic ? ' has-thumb' : ''}`} {...sel?.hold(r.id)}
              aria-pressed={picking ? on : undefined} aria-label={picking ? `${on ? 'Selected' : 'Select'}: ${title}` : undefined}
              onClick={() => (picking ? sel!.toggle(r.id) : onOpen(r))}>
              {picking && <span className={`mp-tick${on ? ' is-on' : ''}`} aria-hidden>{on ? '✓' : ''}</span>}
              <span className="mp-card-main">{title}</span>
              <span className="mp-card-date">{dv ? formatValue(dateF!, dv) : ''}</span>
              {bits.length > 0 && <span className="mp-card-meta">{bits.join(' · ')}</span>}
              {pic && <PhotoThumb path={r.values[pic.name]} alt={`${pic.label} of ${title}`} />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The spreadsheet: every cell edits in place, calculated ones do not. */
export function TableView({ def, entity, view, recs, lookups, profileId, onOpen, sel }: {
  def: ModuleDef; entity: EntityDef; view: ViewDef; recs: Rec[]; lookups: Lookups; profileId: string; onOpen: (r: Rec) => void
  /** Hold a row to select it and others (GEN-52). */
  sel?: Selection<Rec>
}) {
  const [error, setError] = useState<string | null>(null)
  const byName = new Map(entity.fields.map((f) => [f.name, f]))
  const cols: FieldDef[] = (view.columns?.length ? view.columns.map((c) => byName.get(c)).filter((f): f is FieldDef => !!f) : entity.fields)
    .filter((f) => !f.hidden)
  // Kinds a cell cannot edit in place (tags, stars, notes, checklists, a
  // start and end, a link to another module's record) read as their words
  // and open in the record's sheet; money and shares edit as numbers.
  const asText = (f: FieldDef) => ['multi', 'rating', 'checklist', 'note', 'timespan', 'photo'].includes(f.type) || (f.type === 'lookup' && f.lookup === 'record')
  const shownCols: FieldDef[] = cols.map((f) => asText(f) ? { ...f, type: 'text' as const }
    : f.type === 'money' || f.type === 'percent' ? { ...f, type: 'number' as const, unit: f.type === 'percent' ? '%' : f.unit || '€' } : f)
  const rows = recs.map((r) => {
    const row: Record<string, unknown> = { id: r.id, ...r.values }
    for (const f of cols) if (asText(f)) row[f.name] = formatValue(f, r.values[f.name], lookups)
    return row as { id: string } & Record<string, unknown>
  })
  const tableLookups: Record<string, LookupOption[]> = {}
  for (const [k, items] of Object.entries(lookups)) tableLookups[k] = (items ?? []).map((i) => ({ id: i.id, label: i.name }))
  const recById = new Map(recs.map((r) => [r.id, r]))
  const editable = cols.filter((f) => !asText(f)).map((f) => f.name)

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
      <DataTable fields={shownCols} rows={rows} lookups={tableLookups} emptyAsNull editable={editable}
        computed={(row, f) => computeFormulas(entity.fields, row)[f.name] ?? null}
        onChange={(row, field, value) => void change(row, field, value)}
        onOpen={(row) => { const r = recById.get(row.id); if (r) onOpen(r) }}
        openLabel={(row) => `Open ${recordTitle(entity, recById.get(row.id)!, lookups)}`}
        selected={sel?.selecting ? new Set(sel.picked.map((r) => r.id)) : undefined}
        onSelect={sel?.selecting ? (row, on) => sel.toggle(row.id, on) : undefined}
        selectLabel={(row) => `Select ${recordTitle(entity, recById.get(row.id)!, lookups)}`}
        rowProps={sel && !sel.selecting ? (row) => sel.hold(row.id) : undefined} />
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
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }), [month])
  const byDay = useMemo(() => {
    const map = new Map<string, Rec[]>()
    if (!dateF) return map
    const first = format(days[0], 'yyyy-MM-dd')
    const last = format(days[days.length - 1], 'yyyy-MM-dd')
    for (const r of recs) {
      // A repeating own event (AGN-03) is on every day it starts in view.
      if (entity.table === 'calendar_event' && r.row.rule && !r.row.subscription_id) {
        for (const t of eventTimes(r.row as never, first, last)) if (t.first >= first) map.set(t.first, [...(map.get(t.first) ?? []), r])
        continue
      }
      const v = r.values[dateF.name]
      if (typeof v !== 'string' || v.length < 10) continue
      const d = v.slice(0, 10)
      map.set(d, [...(map.get(d) ?? []), r])
    }
    // By the clock (a repeat's own time of day), then by name.
    const clock = (r: Rec) => String(r.values[dateF.name] ?? '').slice(11)
    for (const list of map.values()) list.sort((a, b) => clock(a).localeCompare(clock(b)) || String(a.values[dateF.name]).localeCompare(String(b.values[dateF.name])))
    return map
  }, [recs, dateF, days, entity.table])

  if (!dateF) {
    return <p className="empty">This calendar has no date to go by. Add a date field under Edit module, then pick it for this view.</p>
  }

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
