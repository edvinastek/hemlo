import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { keepPhoto, makePhoto, usePhotoUrl } from './photos'
import { isPhotoPath } from './photo-rules'
import { format, parseISO } from 'date-fns'
import { Dropdown, type Option } from '../ui/Dropdown'
import { SearchPick } from '../ui/SearchPick'
import { NoteEditor } from '../ui/NoteEditor'
import { RepeatPicker, NO_REPEAT, type RepeatValue } from '../ui/RepeatPicker'
import { offerUndo } from '../ui/Undo'
import { Tip } from '../ui/Tip'
import { MoreOptions } from '../ui/MoreOptions'
import { MoreMenu } from '../ui/MoreMenu'
import { useBackClose } from '../ui/useBackClose'
import { describeSchedule } from '../lib/schedule-rules'
import { canCopy } from './records'
import { copyValues, stageFields, stagedSummary } from './list-rules'
import type { ModuleRecord } from '../lib/types'
import type { EntityDef, FieldDef, ModuleDef } from './types'
import { RATING_MAX, checklistCount, computeFormulas, firstDateField, isDateLike, spanMinutes } from './def-rules'
import { addRecord, deleteRecord, lookupKey, restoreRecord, setEventRepeat, updateRecord, type Lookups, type Rec } from './records'
import { RECORD_REPEAT_KINDS } from './repeat-rules'
import { recordRepeat, setRecordRepeat } from './record-repeat'
import { EVENT_RULE_KINDS } from '../lib/day-items-rules'
import './modules.css'
import { planToday } from '../lib/day-edge'

/** A record's form, made from its fields. Every field type has its control:
 *  a switch for yes/no, the compact dropdown for a choice, the search picker
 *  for anything linked to another module, and the phone's own date and time
 *  pickers. Calculated fields show their value and are not typed into. */

const today = () => planToday()

/** A shown value, in words: "3 Oct 2026", "45 min", "Yes", a linked name. */
export function formatValue(f: FieldDef, value: unknown, lookups: Lookups = {}): string {
  if (value === null || value === undefined || value === '') return ''
  switch (f.type) {
    case 'boolean': return value ? 'Yes' : 'No'
    case 'date': { try { return format(parseISO(String(value)), 'd MMM yyyy') } catch { return String(value) } }
    case 'datetime': { try { return format(parseISO(String(value)), 'd MMM, HH:mm') } catch { return String(value) } }
    case 'lookup': return lookups[lookupKey(f)]?.find((i) => i.id === value)?.name ?? '(not found)'
    case 'duration': return `${value} ${f.unit || 'min'}`
    case 'number': case 'integer': case 'formula': {
      const n = typeof value === 'number' ? Math.round(value * 100) / 100 : value
      return f.unit ? `${n} ${f.unit}` : String(n)
    }
    case 'multi': return Array.isArray(value) ? value.join(', ') : String(value)
    case 'rating': {
      const n = Math.max(0, Math.min(RATING_MAX, Number(value) || 0))
      return '★'.repeat(n) + '☆'.repeat(RATING_MAX - n)
    }
    case 'percent': return `${value}\u00a0%`
    case 'money': {
      const n = Number(value)
      const amount = Number.isFinite(n) ? n.toFixed(2) : String(value)
      const cur = f.unit || '€'
      // A sign goes in front (€ 12.50); a code goes after (12.50 CHF).
      return /^[A-Za-z]{2,}$/.test(cur) ? `${amount}\u00a0${cur}` : `${cur}\u00a0${amount}`
    }
    case 'checklist': {
      const c = checklistCount(value)
      return c.total ? `${c.done} of ${c.total} ticked` : ''
    }
    case 'note': {
      const first = String(value).split('\n').map((l) => l.replace(/^[#>*\-\s]+|\[[ xX]\]\s*/g, '').trim()).find(Boolean) ?? ''
      return first.length > 80 ? `${first.slice(0, 79)}…` : first
    }
    case 'photo': return 'Photo'
    case 'timespan': {
      const m = spanMinutes(value)
      const [a, b] = String(value).split('-')
      return m === null ? String(value) : `${a}–${b} (${m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`})`
    }
    default: return String(value)
  }
}

/** A text field called a note is written with the shared note editor
 *  (NOT-16): checklists, bullets and headings, as in a task's note. */
const isNoteText = (f: FieldDef) => f.type === 'note' || (f.type === 'text' && /^notes?$/.test(f.name))

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

/** Where a photo taken in the form goes: the profile and the record. */
export interface PhotoTarget { profileId: string; recordId: string }

export function RecordForm({ fields, values, onChange, errors, lookups, autoFocus, photo }: {
  fields: FieldDef[]
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  errors: Record<string, string>
  lookups: Lookups
  autoFocus?: boolean
  photo?: PhotoTarget
}) {
  const calc = computeFormulas(fields, values)
  return (
    <div className="form-grid">
      {fields.map((f, i) => (
        <FieldInput key={f.name} field={f} value={f.type === 'formula' ? calc[f.name] : values[f.name]}
          onChange={(v) => onChange(f.name, v)} error={errors[f.name]} lookups={lookups} autoFocus={autoFocus && i === 0} photo={photo} />
      ))}
    </div>
  )
}

function FieldInput({ field: f, value, onChange, error, lookups, autoFocus, photo }: {
  field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string; lookups: Lookups; autoFocus?: boolean; photo?: PhotoTarget
}) {
  const label = `${f.label}${f.unit && f.type !== 'boolean' && f.type !== 'money' ? ` (${f.unit})` : f.type === 'duration' ? ' (min)' : ''}${f.required ? ' *' : ''}`
  const err = error ? <p className="mf-error" role="alert">{error}</p> : null
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))

  if (f.type === 'photo') {
    return <PhotoInput label={label} value={value} onChange={onChange} error={err} target={photo} />
  }
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
  if (isNoteText(f) || f.type === 'checklist') {
    return (
      <div className="mf-field">
        <NoteEditor label={label} value={text(value)} autoFocus={autoFocus}
          onChange={(v) => onChange(v === '' ? null : v.slice(0, 2000))} />
        {f.type === 'checklist' && !text(value) && <p className="mf-hint">Tap ☐ for a line to tick.</p>}
        {err}
      </div>
    )
  }
  if (f.type === 'multi') {
    const picked = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="mf-field" role="group" aria-label={f.label}>
        <span>{label}</span>
        <div className="mf-tags">
          {(f.options ?? []).map((o) => {
            const on = picked.includes(o)
            return (
              <button key={o} type="button" className="me-col" aria-pressed={on}
                onClick={() => {
                  const next = on ? picked.filter((x) => x !== o) : (f.options ?? []).filter((x) => x === o || picked.includes(x))
                  onChange(next.length ? next : null)
                }}>{o}</button>
            )
          })}
        </div>
        {err}
      </div>
    )
  }
  if (f.type === 'rating') {
    const n = Number(value) || 0
    return (
      <div className="mf-field">
        <span id={`mf-${f.name}`}>{label}</span>
        <div className="mf-stars" role="radiogroup" aria-labelledby={`mf-${f.name}`}>
          {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={n === k} aria-label={`${k} of ${RATING_MAX}`}
              className={`mf-star${k <= n ? ' is-on' : ''}`}
              // Tapping the stars already given takes them back.
              onClick={() => onChange(n === k ? null : k)}>{k <= n ? '★' : '☆'}</button>
          ))}
        </div>
        {err}
      </div>
    )
  }
  if (f.type === 'timespan') {
    const [a = '', b = ''] = text(value).split('-')
    const set = (x: string, y: string) => onChange(x && y ? `${x}-${y}` : null)
    const m = spanMinutes(value)
    return (
      <div className="mf-field" role="group" aria-label={f.label}>
        <span>{label}</span>
        <div className="two">
          <label>From<input type="time" value={a} onChange={(e) => set(e.target.value, b || e.target.value)} /></label>
          <label>To<input type="time" value={b} onChange={(e) => set(a || e.target.value, e.target.value)} /></label>
        </div>
        {m !== null && <p className="mf-hint">{m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`}{b < a ? ', ending the next day' : ''}</p>}
        {err}
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
    const items = lookups[lookupKey(f)] ?? []
    const chosen = items.find((i) => i.id === value)
    return (
      <div className="mf-field">
        <span>{label}</span>
        <SearchPick label={f.label} items={items} value={chosen?.name ?? (value ? '(not found)' : null)}
          placeholder={items.length ? `Search ${f.lookup === 'record' ? f.label.toLowerCase() : `${f.lookup}s`}` : `Nothing to link to yet`}
          onPick={(item) => onChange(item.id)} onClear={() => onChange(null)} />
        {err}
      </div>
    )
  }
  const numeric = f.type === 'number' || f.type === 'integer' || f.type === 'duration' || f.type === 'percent' || f.type === 'money'
  const type = numeric ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : f.type === 'datetime' ? 'datetime-local' : 'text'
  return (
    <label>
      {label}{f.type === 'percent' ? ' (%)' : f.type === 'money' ? ` (${f.unit || '€'})` : ''}
      <input type={type} value={text(value)} autoFocus={autoFocus} aria-invalid={!!error}
        inputMode={f.type === 'integer' ? 'numeric' : numeric ? 'decimal' : undefined}
        step={f.type === 'number' || f.type === 'money' || f.type === 'percent' ? 'any' : numeric ? 1 : undefined}
        min={f.type === 'duration' || f.type === 'percent' ? 0 : undefined} max={f.type === 'percent' ? 100 : undefined}
        maxLength={f.type === 'text' ? 2000 : undefined}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />
      {err}
    </label>
  )
}

/** Add or edit one record in a bottom sheet. Delete takes it away at once
 *  and offers Undo for 8 seconds (GEN-54). A record kept in the shared
 *  store can repeat (MOD-14): its days become tasks of the module. What
 *  makes the record is up front; the rest, the repeat with it, waits in
 *  "More options" (CALM-08). Back and Escape close it (CALM-10); Duplicate
 *  and Copy to day are in the ⋮ beside its title. */
export function RecordSheet({ def, entity, profileId, rec, day, start: startValues, lookups, onClose, onDuplicate, onCopyTo }: {
  def: ModuleDef
  entity: EntityDef
  profileId: string
  /** The record to edit; absent for a new one. */
  rec?: Rec
  /** A new record's day, from the calendar. */
  day?: string
  /** A new record's values to start from (a duplicate). */
  start?: Record<string, unknown>
  lookups: Lookups
  onClose: () => void
  /** Duplicate: the sheet opens again on a copy, as a new record. */
  onDuplicate?: (values: Record<string, unknown>) => void
  /** Copy to day: the page asks for the day. */
  onCopyTo?: (rec: Rec) => void
}) {
  useBackClose(onClose)
  const fields = formFields(entity)
  const staged = stageFields(entity.fields)
  // A new record's id is chosen now, so a photo taken before saving is
  // already filed under it (MOD-12).
  const [newId] = useState(() => crypto.randomUUID())
  const photo: PhotoTarget = { profileId, recordId: rec?.id ?? newId }
  const [values, setValues] = useState<Record<string, unknown>>(() => rec ? { ...rec.values } : startValues ? { ...startValues } : blankValues(entity.fields, day))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const noun = entity.label.toLowerCase()
  // Repeats belong to records in the shared store (they make tasks), and to
  // the person's own agenda events (AGN-03), which keep their rule on the
  // event itself; a followed calendar's event is that calendar's. Sleep,
  // Training and goals do not repeat here.
  const canRepeat = !entity.table
  const isEvent = entity.table === 'calendar_event' && !rec?.row.subscription_id
  const [repeat, setRepeat] = useState<RepeatValue>(() => (isEvent && rec?.row.rule ? {
    rule: rec.row.rule as RepeatValue['rule'], rule_config: (rec.row.rule_config ?? {}) as RepeatValue['rule_config'],
    end_date: (rec.row.end_date as string | null) ?? null, count: (rec.row.count as number | null) ?? null,
  } : NO_REPEAT))
  const [repeatWas, setRepeatWas] = useState<RepeatValue>(NO_REPEAT)
  useEffect(() => {
    if (!rec || !canRepeat) return
    void recordRepeat(rec.row as unknown as ModuleRecord).then(({ value }) => { setRepeat(value); setRepeatWas(value) })
  }, [rec?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const today = planToday()
  const dateF = firstDateField(entity.fields)
  const dv = dateF ? values[dateF.name] : null
  const start = typeof dv === 'string' && dv.length >= 10 ? dv.slice(0, 10) : today

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = rec
        ? await updateRecord(profileId, def, entity, rec, changed(rec.values, values, entity.fields))
        : await addRecord(profileId, def, entity, values, newId)
      if (!res.ok) { setErrors(res.errors); return }
      // The repeat follows the record: a new name, day or time moves it too.
      if (canRepeat && (repeat.rule || repeatWas.rule)) {
        await setRecordRepeat(profileId, def, entity, res.rec.row as unknown as ModuleRecord, repeat)
      }
      if (isEvent) await setEventRepeat(res.rec.id, repeat)
      onClose()
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!rec) return
    setBusy(true)
    await deleteRecord(profileId, def, entity, rec)
    onClose()
    offerUndo(`${entity.label} deleted`, () => restoreRecord(profileId, def, entity, rec))
  }

  const onField = (name: string, v: unknown) => { setValues((s) => ({ ...s, [name]: v })); setErrors((x) => { const { [name]: _n, _: _all, ...rest } = x; return rest }) }
  const repeatText = repeat.rule ? describeSchedule({ rule: repeat.rule, rule_config: repeat.rule_config ?? {}, start_date: start, end_date: repeat.end_date ?? null }) : null
  // A field with a problem is never out of sight.
  const moreHasError = staged.more.some((f) => errors[f.name])
  const moreSet = stagedSummary(staged.more, values, [repeatText])
  const copyable = !!rec && canCopy(entity) && !rec.row.subscription_id
  const repeatBlock = (
    <>
      {canRepeat && fields.length > 0 && (
          <div className="mf-repeat">
            {!rec && <Tip id="record-repeat" />}
            <RepeatPicker value={repeat} onChange={setRepeat} start={start} today={today}
              kinds={[...RECORD_REPEAT_KINDS]} loose noneLabel="Does not repeat" />
            {repeat.rule && (
              <p className="mf-hint">
                Each time it comes round it is an item on Today and Plan
                {dateF ? `, from ${format(parseISO(start), 'd MMM yyyy')}` : ', from today'}. Ticking it off ticks that day only.
              </p>
            )}
          </div>
        )}
        {isEvent && fields.length > 0 && (
          <div className="mf-repeat">
            <RepeatPicker value={repeat} onChange={setRepeat} start={start} today={today}
              kinds={[...EVENT_RULE_KINDS]} allowCount noneLabel="Does not repeat" />
            {repeat.rule && (
              <p className="mf-hint">
                On Today, Plan and in your calendar file on every day it repeats, at the same time and for as long. Changing it here changes every time.
              </p>
            )}
          </div>
        )}
    </>
  )

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet" onSubmit={(e) => void save(e)} role="dialog" aria-modal="true" aria-label={rec ? `Edit ${noun}` : `New ${noun}`} noValidate>
        <div className="rs-top">
          <h2>{rec ? `Edit ${noun}` : `New ${noun}`}</h2>
          {copyable && (onDuplicate || onCopyTo) && (
            <MoreMenu label={`More for this ${noun}`} items={[
              !!onCopyTo && !!firstDateField(entity.fields) && { label: 'Copy to day…', onSelect: () => onCopyTo(rec!) },
              !!onDuplicate && { label: 'Duplicate', onSelect: () => onDuplicate(copyValues(entity.fields, values)) },
            ]} />
          )}
        </div>
        {errors._ && <p className="mf-error" role="alert">{errors._}</p>}
        {fields.length === 0
          ? <p className="mf-hint">This module has no fields yet. Add some under Edit module.</p>
          : <RecordForm fields={staged.main} values={values} errors={errors} lookups={lookups} autoFocus={!rec} onChange={onField} photo={photo} />}
        {staged.more.length > 0 || ((canRepeat || isEvent) && fields.length > 0) ? (
          <MoreOptions open={!!moreSet || moreHasError} summary={moreSet}>
            {staged.more.length > 0 && <RecordForm fields={staged.more} values={values} errors={errors} lookups={lookups} onChange={onField} photo={photo} />}
            {repeatBlock}
          </MoreOptions>
        ) : null}
        <div className="sheet-actions">
          {rec && <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>Delete</button>}
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
  const [newId, setNewId] = useState(() => crypto.randomUUID())
  async function save(e: FormEvent) {
    e.preventDefault()
    const res = await addRecord(profileId, def, entity, values, newId)
    if (!res.ok) { setErrors(res.errors); setSaved(false); return }
    setNewId(crypto.randomUUID())
    setValues(blankValues(entity.fields))
    setErrors({})
    setSaved(true)
  }
  return (
    <form className="mp-inline-form" onSubmit={(e) => void save(e)} noValidate aria-label={`Add ${entity.label.toLowerCase()}`}>
      {errors._ && <p className="mf-error" role="alert">{errors._}</p>}
      <RecordForm fields={fields} values={values} errors={errors} lookups={lookups} photo={{ profileId, recordId: newId }}
        onChange={(name, v) => { setSaved(false); setValues((s) => ({ ...s, [name]: v })) }} />
      <div className="sheet-actions">
        {saved && <p className="mf-hint" role="status">Saved. Add the next one.</p>}
        <button type="submit" className="btn btn-primary grow">Add</button>
      </div>
    </form>
  )
}

/** A photo field (MOD-12): the photo, and ways to take one with the camera,
 *  pick one from the files, or take it off. It is made smaller and kept on
 *  this device at once; it reaches Storage when there is a connection. */
function PhotoInput({ label, value, onChange, error, target }: {
  label: string; value: unknown; onChange: (v: unknown) => void; error: ReactNode; target?: PhotoTarget
}) {
  const url = usePhotoUrl(value)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  async function take(file: File | undefined) {
    if (!file || !target) return
    setBusy(true); setProblem(null)
    try {
      const made = await makePhoto(file)
      if (!made.ok) { setProblem(made.message); return }
      onChange(await keepPhoto(target.profileId, target.recordId, made.blob))
    } finally { setBusy(false) }
  }
  const has = isPhotoPath(value)
  return (
    <div className="mf-field mf-photo" role="group" aria-label={label}>
      <span>{label}</span>
      {has && (
        <div className="mf-photo-frame">
          {url ? <img src={url} alt={label} /> : <span className="mf-photo-wait">{url === null ? 'The photo shows once there is a connection.' : ''}</span>}
        </div>
      )}
      <div className="mf-photo-actions">
        <button type="button" className="btn" disabled={busy || !target} onClick={() => camera.current?.click()}>{has ? 'Take another' : 'Take a photo'}</button>
        <button type="button" className="btn" disabled={busy || !target} onClick={() => files.current?.click()}>{has ? 'Choose another' : 'Choose a photo'}</button>
        {has && <button type="button" className="btn" disabled={busy} onClick={() => onChange(null)}>Take off</button>}
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={files} type="file" accept="image/*" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }} />
      {busy && <p className="mf-hint" role="status">Making the photo smaller…</p>}
      {problem && <p className="mf-error" role="alert">{problem}</p>}
      {error}
    </div>
  )
}

/** A record's photo, small, for a card. */
export function PhotoThumb({ path, alt }: { path: unknown; alt: string }) {
  const url = usePhotoUrl(path)
  if (!url) return null
  return <img className="mp-thumb" src={url} alt={alt} />
}
