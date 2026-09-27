import { useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { Dropdown, type Option } from '../ui/Dropdown'
import { SearchPick } from '../ui/SearchPick'
import type { EntityDef, FieldDef, ModuleDef } from './types'
import { computeFormulas, isDateLike } from './def-rules'
import { addRecord, deleteRecord, updateRecord, type Lookups, type Rec } from './records'
import './modules.css'

/** A record's form, made from its fields. Every field type has its control:
 *  a switch for yes/no, the compact dropdown for a choice, the search picker
 *  for anything linked to another module, and the phone's own date and time
 *  pickers. Calculated fields show their value and are not typed into. */

const today = () => format(new Date(), 'yyyy-MM-dd')

/** A shown value, in words: "3 Oct 2026", "45 min", "Yes", a linked name. */
export function formatValue(f: FieldDef, value: unknown, lookups: Lookups = {}): string {
  if (value === null || value === undefined || value === '') return ''
  switch (f.type) {
    case 'boolean': return value ? 'Yes' : 'No'
    case 'date': { try { return format(parseISO(String(value)), 'd MMM yyyy') } catch { return String(value) } }
    case 'datetime': { try { return format(parseISO(String(value)), 'd MMM, HH:mm') } catch { return String(value) } }
    case 'lookup': return lookups[f.lookup!]?.find((i) => i.id === value)?.name ?? '(not found)'
    case 'duration': return `${value} ${f.unit || 'min'}`
    case 'number': case 'integer': case 'formula': {
      const n = typeof value === 'number' ? Math.round(value * 100) / 100 : value
      return f.unit ? `${n} ${f.unit}` : String(n)
    }
    default: return String(value)
  }
}

/** Starting values for a new record: the first date field on the given day
 *  (or today), everything else empty. */
export function blankValues(fields: FieldDef[], day?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const first = fields.find(isDateLike)
  for (const f of fields) {
    if (f.type === 'formula') continue
    if (f.type === 'boolean') out[f.name] = false
    else if (f === first) out[f.name] = f.type === 'date' ? (day ?? today()) : `${day ?? today()}T${format(new Date(), 'HH')}:00`
    else out[f.name] = null
  }
  return out
}

/** The fields a form shows: everything not hidden. */
export const formFields = (e: EntityDef) => e.fields.filter((f) => !f.hidden)

export function RecordForm({ fields, values, onChange, errors, lookups, autoFocus }: {
  fields: FieldDef[]
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  errors: Record<string, string>
  lookups: Lookups
  autoFocus?: boolean
}) {
  const calc = computeFormulas(fields, values)
  return (
    <div className="form-grid">
      {fields.map((f, i) => (
        <FieldInput key={f.name} field={f} value={f.type === 'formula' ? calc[f.name] : values[f.name]}
          onChange={(v) => onChange(f.name, v)} error={errors[f.name]} lookups={lookups} autoFocus={autoFocus && i === 0} />
      ))}
    </div>
  )
}

function FieldInput({ field: f, value, onChange, error, lookups, autoFocus }: {
  field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string; lookups: Lookups; autoFocus?: boolean
}) {
  const label = `${f.label}${f.unit && f.type !== 'boolean' ? ` (${f.unit})` : f.type === 'duration' ? ' (min)' : ''}${f.required ? ' *' : ''}`
  const err = error ? <p className="mf-error" role="alert">{error}</p> : null
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))

  if (f.type === 'formula') {
    return (
      <div className="mf-field">
        <span>{label}</span>
        <div className="mf-calc" aria-label={f.label} title={f.formula}>{value === null || value === undefined ? '—' : formatValue(f, value)}</div>
      </div>
    )
  }
  if (f.type === 'boolean') {
    return (
      <div className="mf-switch">
        <span id={`mf-${f.name}`}>{label}</span>
        <button type="button" className="switch" role="switch" aria-checked={!!value} aria-labelledby={`mf-${f.name}`}
          onClick={() => onChange(!value)} />
      </div>
    )
  }
  if (f.type === 'select') {
    const options: Option[] = [...(f.required ? [] : [{ value: '', label: '—' }]), ...(f.options ?? []).map((o) => ({ value: o, label: o }))]
    return (
      <div className="mf-field">
        <span>{label}</span>
        <Dropdown label={f.label} value={text(value)} options={options} placeholder="Choose" onChange={(v) => onChange(v || null)} />
        {err}
      </div>
    )
  }
  if (f.type === 'lookup') {
    const items = lookups[f.lookup!] ?? []
    const chosen = items.find((i) => i.id === value)
    return (
      <div className="mf-field">
        <span>{label}</span>
        <SearchPick label={f.label} items={items} value={chosen?.name ?? (value ? '(not found)' : null)}
          placeholder={items.length ? `Search ${f.lookup}s` : `No ${f.lookup}s here yet`}
          onPick={(item) => onChange(item.id)} onClear={() => onChange(null)} />
        {err}
      </div>
    )
  }
  const numeric = f.type === 'number' || f.type === 'integer' || f.type === 'duration'
  const type = numeric ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : f.type === 'datetime' ? 'datetime-local' : 'text'
  return (
    <label>
      {label}
      <input type={type} value={text(value)} autoFocus={autoFocus} aria-invalid={!!error}
        inputMode={f.type === 'integer' ? 'numeric' : numeric ? 'decimal' : undefined}
        step={f.type === 'number' ? 'any' : numeric ? 1 : undefined} min={f.type === 'duration' ? 0 : undefined}
        maxLength={f.type === 'text' ? 2000 : undefined}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />
      {err}
    </label>
  )
}

/** Add or edit one record in a bottom sheet; delete asks once. */
export function RecordSheet({ def, entity, profileId, rec, day, lookups, onClose }: {
  def: ModuleDef
  entity: EntityDef
  profileId: string
  /** The record to edit; absent for a new one. */
  rec?: Rec
  /** A new record's day, from the calendar. */
  day?: string
  lookups: Lookups
  onClose: () => void
}) {
  const fields = formFields(entity)
  const [values, setValues] = useState<Record<string, unknown>>(() => rec ? { ...rec.values } : blankValues(entity.fields, day))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const noun = entity.label.toLowerCase()

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = rec
        ? await updateRecord(profileId, def, entity, rec, changed(rec.values, values, entity.fields))
        : await addRecord(profileId, def, entity, values)
      if (res.ok) onClose()
      else setErrors(res.errors)
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!rec) return
    setBusy(true)
    await deleteRecord(profileId, def, entity, rec)
    onClose()
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet" onSubmit={(e) => void save(e)} role="dialog" aria-label={rec ? `Edit ${noun}` : `New ${noun}`} noValidate>
        <h2>{rec ? `Edit ${noun}` : `New ${noun}`}</h2>
        {errors._ && <p className="mf-error" role="alert">{errors._}</p>}
        {fields.length === 0
          ? <p className="mf-hint">This module has no fields yet. Add some under Edit module.</p>
          : <RecordForm fields={fields} values={values} errors={errors} lookups={lookups} autoFocus={!rec}
              onChange={(name, v) => { setValues((s) => ({ ...s, [name]: v })); setErrors((x) => { const { [name]: _n, _: _all, ...rest } = x; return rest }) }} />}
        <div className="sheet-actions">
          {rec && !confirm && <button type="button" className="btn" onClick={() => setConfirm(true)}>Delete</button>}
          {rec && confirm && (
            <button type="button" className="btn" style={{ color: 'var(--e-warn)' }} disabled={busy} onClick={() => void remove()}>Delete for good</button>
          )}
          <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || fields.length === 0}>Save</button>
        </div>
      </form>
    </>
  )
}

/** Only what the form changed, so an edit never rewrites fields it did not touch. */
function changed(before: Record<string, unknown>, after: Record<string, unknown>, fields: FieldDef[]) {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.type === 'formula' || f.hidden) continue
    const a = before[f.name] ?? null
    const b = after[f.name] ?? null
    if (String(a) !== String(b)) out[f.name] = b
  }
  // Required fields are checked even when untouched, so an edit cannot leave one empty.
  for (const f of fields) if (f.required && !(f.name in out) && !f.hidden) out[f.name] = after[f.name] ?? null
  return out
}

/** A form on the page itself, for a module whose view is "form": add one
 *  record after another without opening a sheet. */
export function InlineForm({ def, entity, profileId, lookups }: {
  def: ModuleDef; entity: EntityDef; profileId: string; lookups: Lookups
}) {
  const fields = formFields(entity)
  const [values, setValues] = useState<Record<string, unknown>>(() => blankValues(entity.fields))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    const res = await addRecord(profileId, def, entity, values)
    if (!res.ok) { setErrors(res.errors); setSaved(false); return }
    setValues(blankValues(entity.fields))
    setErrors({})
    setSaved(true)
  }
  return (
    <form className="mp-inline-form" onSubmit={(e) => void save(e)} noValidate aria-label={`Add ${entity.label.toLowerCase()}`}>
      {errors._ && <p className="mf-error" role="alert">{errors._}</p>}
      <RecordForm fields={fields} values={values} errors={errors} lookups={lookups}
        onChange={(name, v) => { setSaved(false); setValues((s) => ({ ...s, [name]: v })) }} />
      <div className="sheet-actions">
        {saved && <p className="mf-hint" role="status">Saved. Add the next one.</p>}
        <button type="submit" className="btn btn-primary grow">Add</button>
      </div>
    </form>
  )
}
