import { useMemo, useState } from 'react'
import type { FieldDef } from '../modules/types'
import { evaluateFormula } from '../modules/formula'
import { useNarrow } from './useNarrow'

export interface LookupOption { id: string; label: string }

interface Props<T extends { id: string }> {
  fields: FieldDef[]
  /** Fields to keep when the screen is too narrow for the full sheet. */
  priority?: string[]
  /** Only these fields take edits; the rest read as text. All, when absent. */
  editable?: string[]
  rows: T[]
  lookups?: Record<string, LookupOption[]>
  onChange?: (row: T, field: string, value: unknown) => void
  totals?: (keyof T & string)[]
  emptyNote?: string
  /** A calculated cell's value, when the caller works it out (module pages
   *  leave a formula blank until its inputs are filled). */
  computed?: (row: T, field: FieldDef) => number | null
  /** Adds an Open button at the end of each row, for the row's own sheet. */
  onOpen?: (row: T) => void
  openLabel?: (row: T) => string
  /** A cleared number cell sends null rather than 0. */
  emptyAsNull?: boolean
}

/** A table that behaves like the sheet it came from: edit in place, recalculate
 *  at once, dropdowns wherever a database is referenced, and calculated cells
 *  that are visibly not yours to type in. */
export function DataTable<T extends { id: string } & Record<string, unknown>>(
  { fields, priority, editable, rows, lookups = {}, onChange, totals = [], emptyNote, computed, onOpen, openLabel, emptyAsNull }: Props<T>,
) {
  const narrow = useNarrow()
  const shown = narrow && priority
    ? fields.filter((f) => priority.includes(f.name))
    : fields
  const totalRow = useMemo(() => {
    if (totals.length === 0 || rows.length === 0) return null
    const acc: Record<string, number> = {}
    for (const f of totals) {
      acc[f] = rows.reduce((sum, r) => sum + Number(r[f] ?? 0), 0)
    }
    return acc
  }, [rows, totals])

  if (rows.length === 0) return <p className="empty">{emptyNote ?? 'Nothing here yet.'}</p>

  return (
    <div className="sheet-wrap">
      <table className="sheet">
        <thead>
          <tr>
            {shown.map((f) => (
              <th key={f.name} style={{ width: narrow ? undefined : f.width }}>
                {f.label}{f.unit ? <span style={{ color: 'var(--e-ink-soft)' }}> {f.unit}</span> : null}
              </th>
            ))}
            {onOpen && <th aria-label="Open" style={{ width: 52 }} />}
          </tr>
        </thead>
        <tbody>
          {totalRow && (
            <tr className="total">
              {shown.map((f, i) => (
                <td key={f.name} className={totals.includes(f.name as keyof T & string) ? 'calc' : undefined}>
                  {i === 0 ? 'Total' : totals.includes(f.name as keyof T & string)
                    ? Math.round(totalRow[f.name] * 10) / 10
                    : ''}
                </td>
              ))}
              {onOpen && <td />}
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id}>
              {shown.map((f) => (
                <Cell key={f.name} field={f} row={row} lookups={lookups} computed={computed} emptyAsNull={emptyAsNull}
                  onChange={!editable || editable.includes(f.name) ? onChange : undefined} />
              ))}
              {onOpen && (
                <td className="open-cell">
                  <button type="button" className="sheet-open" onClick={() => onOpen(row)}
                    aria-label={openLabel ? openLabel(row) : 'Open'}>Open</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell<T extends { id: string } & Record<string, unknown>>(
  { field, row, lookups, onChange, computed: compute, emptyAsNull }:
  { field: FieldDef; row: T; lookups: Record<string, LookupOption[]>; onChange?: Props<T>['onChange']
    computed?: Props<T>['computed']; emptyAsNull?: boolean },
) {
  const value = row[field.name]

  if (field.type === 'formula') {
    const computed = compute ? compute(row, field) : field.formula ? evaluateFormula(field.formula, row) : null
    return <td className="calc" title={field.formula}>{computed === null ? '—' : Math.round(computed * 100) / 100}</td>
  }

  if (field.type === 'lookup') {
    const options = lookups[field.lookup ?? field.name] ?? []
    return (
      <td>
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange?.(row, field.name, e.target.value || null)}
          disabled={!onChange}
        >
          <option value="">—</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </td>
    )
  }

  if (field.type === 'select') {
    return (
      <td>
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange?.(row, field.name, e.target.value)}
          disabled={!onChange}
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
    )
  }

  if (field.type === 'boolean') {
    return (
      <td style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange?.(row, field.name, e.target.checked)}
          disabled={!onChange}
        />
      </td>
    )
  }

  const numeric = field.type === 'number' || field.type === 'integer' || field.type === 'duration'

  // A name is the thing the row exists to show, and an <input> cannot wrap, so
  // text reads as text until it is tapped.
  if (field.type === 'text') {
    return <TextCell value={String(value ?? '')} onSave={onChange && ((v) => onChange(row, field.name, v))} />
  }

  return (
    <td className={numeric ? 'num' : undefined}>
      <input
        type={numeric ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : field.type === 'datetime' ? 'datetime-local' : 'text'}
        value={(value as string | number) ?? ''}
        aria-label={field.label}
        onChange={(e) => onChange?.(row, field.name, numeric
          ? (emptyAsNull && e.target.value === '' ? null : Number(e.target.value))
          : (emptyAsNull && e.target.value === '' ? null : e.target.value))}
        readOnly={!onChange}
      />
    </td>
  )
}

function TextCell({ value, onSave }: { value: string; onSave?: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <td
        className="text-cell"
        onClick={() => { if (onSave) { setDraft(value); setEditing(true) } }}
        style={{ cursor: onSave ? 'text' : 'default' }}
      >
        {value || '—'}
      </td>
    )
  }
  return (
    <td>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onSave?.(draft) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
    </td>
  )
}
