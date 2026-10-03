import { useState } from 'react'
import { Dropdown, type Option } from '../ui/Dropdown'
import type { FieldDef, FieldType } from './types'
import { LIMITS, RATING_MAX, fieldNameFrom, fieldProblem, formulaScope, hasOptions, isNumeric, type LookupKind, type StatsKind } from './def-rules'
import './modules.css'

/** Adding or changing one field: its name, its kind, and whatever that kind
 *  needs (options for a choice, what a link points at, a formula checked as
 *  it is typed). Shared by the module editor and the builder. */

export const TYPE_OPTIONS: Option<FieldType>[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number', hint: 'With decimals, and a unit if you like' },
  { value: 'integer', label: 'Whole number' },
  { value: 'duration', label: 'Length of time', hint: 'In minutes' },
  { value: 'boolean', label: 'Yes or no' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date and time' },
  { value: 'timespan', label: 'Start and end', hint: 'From one time to another, with the length worked out' },
  { value: 'select', label: 'Choice', hint: 'One of a list you write' },
  { value: 'multi', label: 'Tags', hint: 'Any of a list you write, several at once' },
  { value: 'rating', label: 'Rating', hint: `1 to ${RATING_MAX} stars` },
  { value: 'percent', label: 'Percentage', hint: '0 to 100 %' },
  { value: 'money', label: 'Money', hint: 'An amount, in the currency you set' },
  { value: 'checklist', label: 'Checklist', hint: 'Lines to tick, kept with the record' },
  { value: 'note', label: 'Note', hint: 'Longer text, with lists and headings' },
  { value: 'lookup', label: 'Link to another module', hint: 'A food, recipe, exercise, task, goal or a record of a module you built' },
  { value: 'formula', label: 'Calculated', hint: 'Worked out from other fields' },
]
export const TYPE_NAME = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label])) as Record<FieldType, string>

export const LOOKUP_OPTIONS: Option<LookupKind>[] = [
  { value: 'food', label: 'Foods' },
  { value: 'recipe', label: 'Recipes' },
  { value: 'exercise', label: 'Exercises' },
  { value: 'task', label: 'Tasks' },
  { value: 'goal', label: 'Goals' },
  { value: 'record', label: 'A module you built' },
]

export const STATS_OPTIONS: Option<StatsKind | 'none'>[] = [
  { value: 'none', label: 'Not counted' },
  { value: 'sum', label: 'Add up' },
  { value: 'average', label: 'Average' },
  { value: 'count', label: 'Count records' },
]

/** One line saying what a field is: "Number · kg", "Choice · 4 options". */
export function describeField(f: FieldDef): string {
  const bits = [TYPE_NAME[f.type] ?? f.type]
  if (f.unit) bits.push(f.unit)
  if (hasOptions(f.type)) bits.push(`${f.options?.length ?? 0} options`)
  if (f.type === 'lookup' && f.lookup) bits.push(f.lookup === 'record' ? 'picks a record' : `picks from ${f.lookup}s`)
  if (f.type === 'formula' && f.formula) bits.push(f.formula)
  if (f.required) bits.push('needed')
  if (f.stats) bits.push(f.stats === 'sum' ? 'added up in Stats' : f.stats === 'average' ? 'averaged in Stats' : 'counted in Stats')
  return bits.join(' · ')
}

export function FieldForm({ field, fields, index, onSave, onCancel, typeLocked, modules = [] }: {
  /** The field being changed; absent for a new one. */
  field?: FieldDef
  /** Every field of the entity, in order (including this one when changing it). */
  fields: FieldDef[]
  /** Where this field is (or will go) in `fields`. */
  index: number
  onSave: (f: FieldDef) => void
  onCancel: () => void
  /** A built-in field: only its label and the Stats flag change. */
  typeLocked?: boolean
  /** Modules the person built, for a link to one of their records. */
  modules?: { key: string; name: string }[]
}) {
  const [label, setLabel] = useState(field?.label ?? '')
  const [type, setType] = useState<FieldType>(field?.type ?? 'text')
  const [options, setOptions] = useState<string[]>(field?.options ?? [])
  const [option, setOption] = useState('')
  const [unit, setUnit] = useState(field?.unit ?? '')
  const [required, setRequired] = useState(!!field?.required)
  const [formula, setFormula] = useState(field?.formula ?? '')
  const [lookup, setLookup] = useState<LookupKind>(field?.lookup ?? 'food')
  const [target, setTarget] = useState(field?.module ?? modules[0]?.key ?? '')
  const [stats, setStats] = useState<StatsKind | 'none'>(field?.stats ?? 'none')
  const [touched, setTouched] = useState(false)

  const others = fields.filter((_, i) => i !== (field ? index : -1))
  const name = field?.name ?? fieldNameFrom(label || 'field', others.map((f) => f.name))
  const numeric = isNumeric({ type })
  // Stars and shares carry their own unit; money's unit is its currency.
  const ownUnit = numeric && type !== 'rating' && type !== 'percent'
  const candidate: FieldDef = {
    name, label: label.trim(), type,
    ...(hasOptions(type) ? { options } : {}),
    ...(type === 'lookup' ? { lookup, ...(lookup === 'record' ? { module: target } : {}) } : {}),
    ...(type === 'formula' ? { formula: formula.trim() } : {}),
    ...(unit.trim() && ownUnit ? { unit: unit.trim() } : type === 'money' ? { unit: '€' } : {}),
    ...(required && type !== 'formula' && type !== 'boolean' ? { required: true } : {}),
    ...(stats !== 'none' && (numeric || stats === 'count') ? { stats } : {}),
    ...(field?.width ? { width: field.width } : {}),
    ...(field?.hidden && !(required && type !== 'formula') ? { hidden: true } : {}),
  }
  const list = [...others]
  list.splice(index, 0, candidate)
  const problem = fieldProblem(candidate, list, index)
  const usable = formulaScope(list, index)

  function addOption() {
    const o = option.trim().slice(0, LIMITS.option)
    if (!o || options.includes(o) || options.length >= LIMITS.options) return
    setOptions([...options, o])
    setOption('')
  }

  return (
    <div className="form-grid" role="group" aria-label={field ? `Change ${field.label}` : 'New field'}>
      <label>Name
        <input value={label} maxLength={LIMITS.label} autoFocus={!field} placeholder="Cost, Author, Mileage"
          onChange={(e) => setLabel(e.target.value)} />
      </label>
      {!typeLocked && (
        <div className="mf-field">
          <span>Kind</span>
          <Dropdown label="Kind of field" value={type} options={TYPE_OPTIONS} onChange={setType} />
        </div>
      )}
      {!typeLocked && hasOptions(type) && (
        <div className="me-options">
          <span className="mf-hint">Options</span>
          {options.map((o, i) => (
            <div key={o} className="me-option">
              <input value={o} aria-label={`Option ${i + 1}`} maxLength={LIMITS.option}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" className="me-icon" aria-label={`Remove option ${o}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="me-option">
            <input value={option} placeholder="Add an option" aria-label="New option" maxLength={LIMITS.option}
              onChange={(e) => setOption(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }} />
            <button type="button" className="btn" onClick={addOption}>Add</button>
          </div>
        </div>
      )}
      {!typeLocked && type === 'lookup' && (
        <div className="mf-field">
          <span>Links to</span>
          <Dropdown label="Links to" value={lookup}
            options={LOOKUP_OPTIONS.filter((o) => o.value !== 'record' || modules.length > 0)} onChange={setLookup} />
        </div>
      )}
      {!typeLocked && type === 'lookup' && lookup === 'record' && (
        <div className="mf-field">
          <span>Which module</span>
          <Dropdown label="Which module" value={target || null} placeholder="Choose a module"
            options={modules.map((m) => ({ value: m.key, label: m.name }))} onChange={setTarget} />
        </div>
      )}
      {!typeLocked && type === 'formula' && (
        <label>Formula
          <input value={formula} maxLength={LIMITS.formula} placeholder="sets * reps * load" spellCheck={false}
            autoCapitalize="off" autoCorrect="off" onChange={(e) => { setFormula(e.target.value); setTouched(true) }} />
          <span className="mf-hint">
            {usable.length ? `Fields you can use: ${usable.join(', ')}.` : 'Add number fields first, then work with them here.'}
            {' '}Also + − × ÷ as + - * /, brackets, and round, ceil, floor, min, max, abs, sqrt, hours_between.
          </span>
        </label>
      )}
      {!typeLocked && ownUnit && (
        <label>{type === 'money' ? 'Currency' : 'Unit'}
          <input value={unit} maxLength={LIMITS.unit} placeholder={type === 'duration' ? 'min' : type === 'money' ? '€' : 'kg, km, €'} onChange={(e) => setUnit(e.target.value)} />
        </label>
      )}
      {(numeric || type === 'text' || hasOptions(type) || type === 'date' || type === 'checklist' || type === 'timespan') && (
        <div className="mf-field">
          <span>In Stats</span>
          <Dropdown label="In Stats" value={stats}
            options={numeric ? STATS_OPTIONS : STATS_OPTIONS.filter((o) => o.value === 'none' || o.value === 'count')}
            onChange={setStats} />
        </div>
      )}
      {!typeLocked && type !== 'formula' && type !== 'boolean' && (
        <label style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Needed on every record
        </label>
      )}
      {problem && (touched || label.trim()) && <p className="mf-error" role="alert">{problem}</p>}
      <div className="sheet-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn grow" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!!problem} onClick={() => onSave(candidate)}>
          {field ? 'Done' : 'Add field'}
        </button>
      </div>
    </div>
  )
}
