import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import type { EntityDef, FieldDef, ModuleDef, ViewDef } from './types'
import {
  LIMITS, RULE_DAY_TASK, RULE_REMIND, builtRuleCatalogue, cleanKeywords, definitionFor, definitionProblem,
  fieldNameFrom, glyphProblem, isDateLike, isNumeric, readBuiltDefinition, viewDefaults, viewProblem,
  type LookupKind, type StatsKind,
} from './def-rules'
import { VIEW_TYPE_NAME, VIEW_TYPE_OPTIONS, ViewSettings } from './ViewSettings'
import { createBuiltModule, setModuleEnabled, useModuleDefs } from './defs'
import { PRESETS, presetByKey } from './presets'
import { FieldForm, LOOKUP_OPTIONS, STATS_OPTIONS, describeField } from './FieldForm'
import { Dropdown } from '../ui/Dropdown'
import './modules.css'

/** More → Modules: the modules the person built, and the button that builds
 *  another. Kept here so More only has to place it. */
export function BuiltModules({ onEdit }: { onEdit: (key: string) => void }) {
  const profile = useApp((s) => s.profile)
  const entries = useModuleDefs()
  const navigate = useNavigate()
  const [building, setBuilding] = useState(false)
  const built = (entries ?? []).filter((e) => e.def.built)

  return (
    <>
      <p className="section-title">Built by you</p>
      {built.length === 0 && (
        <p className="mp-note" style={{ paddingTop: 0 }}>Anything the modules above do not cover — a reading list, the car, plants — can be a module of its own, with its own page.</p>
      )}
      {built.map(({ def, enabled }) => (
        <div key={def.key} className="setting-row">
          <div>
            <div className="row-name">{def.name}</div>
            <div className="row-meta">{def.summary || `${def.entities[0]?.fields.length ?? 0} fields`}</div>
          </div>
          <div className="row-right">
            <button className="btn" onClick={() => navigate(`/m/${def.key}`)}>Open</button>
            <button className="btn" onClick={() => onEdit(def.key)}>Edit</button>
            <button className="switch" role="switch" aria-checked={enabled} aria-label={`Turn ${def.name} ${enabled ? 'off' : 'on'}`}
              onClick={() => profile && void setModuleEnabled(profile.id, def.key, !enabled)} />
          </div>
        </div>
      ))}
      <div className="mb-built">
        <button className="btn btn-primary" onClick={() => setBuilding(true)}>Build a module</button>
      </div>
      {building && <ModuleBuilder onClose={() => setBuilding(false)} />}
    </>
  )
}

const STEPS = ['Name', 'What you track', 'Keywords', 'Fields', 'Links and rules'] as const

/** The views chosen, each with its settings filled in from the fields. */
function viewsFor(views: Omit<ViewDef, 'entity'>[], entity: EntityDef): ViewDef[] {
  return views.map((v) => viewDefaults({ ...v, entity: entity.name }, entity))
}
const SET_UP_VIEWS: ViewDef['type'][] = ['board', 'grid', 'chart']

/** Build a module in five short steps. Everything chosen here can be
 *  changed later in the editor; nothing is saved until Create. */
export function ModuleBuilder({ onClose }: { onClose: () => void }) {
  const { profile, session } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [glyph, setGlyph] = useState('')
  const [summary, setSummary] = useState('')
  const [presetKey, setPresetKey] = useState('blank')
  const [item, setItem] = useState(PRESETS[0].item)
  const [keywords, setKeywords] = useState('')
  const [fields, setFields] = useState<FieldDef[]>(PRESETS[0].fields.map((f) => ({ ...f })))
  const [views, setViews] = useState<Omit<ViewDef, 'entity'>[]>(PRESETS[0].views.map((v) => ({ ...v })))
  const [rules, setRules] = useState(builtRuleCatalogue())
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const preset = presetByKey(presetKey) ?? PRESETS[0]

  function pickPreset(key: string) {
    const p = presetByKey(key)
    if (!p) return
    setPresetKey(key)
    setFields(p.fields.map((f) => ({ ...f, ...(f.options ? { options: [...f.options] } : {}) })))
    setViews(p.views.map((v) => ({ ...v })))
    setItem(p.item)
    setKeywords(p.keywords.join(', '))
    setOpen(null)
  }

  const draft: ModuleDef = {
    key: 'u_draft00', name: name.trim(), summary: summary.trim() || (preset.key === 'blank' ? '' : preset.description), built: true, depth: 'light',
    keywords: cleanKeywords(keywords),
    entities: [{ name: 'item', label: item.trim() || 'Item', fields }],
    views: [], rules,
    ...(glyph.trim() ? { glyph: glyph.trim() } : {}),
  }
  // Views follow the fields: columns and calendar dates only name fields
  // that are there.
  const entity = draft.entities[0]
  draft.views = readBuiltDefinition({ key: draft.key, name: draft.name || 'x', definition: { ...definitionFor(draft), views: viewsFor(views, entity) } }).views

  /** A kind of view on or off. At least one view stays. */
  function toggleView(type: ViewDef['type']) {
    setViews((vs) => {
      if (vs.some((v) => v.type === type)) {
        const rest = vs.filter((v) => v.type !== type)
        return rest.length ? rest : vs
      }
      let key: string = type
      for (let i = 2; vs.some((v) => v.key === key); i++) key = `${type}_${i}`
      return [...vs, { key, name: VIEW_TYPE_NAME[type], type }]
    })
  }
  const viewCantDraw = (type: ViewDef['type']) => viewProblem(viewDefaults({ key: 'x', name: 'x', type, entity: entity.name }, entity), entity)
  const problem = definitionProblem({ ...draft, name: draft.name || 'x' })

  function stepProblem(): string | null {
    if (step === 0) {
      if (!name.trim()) return 'Give the module a name.'
      return glyphProblem(glyph.trim())
    }
    if (step === 3) {
      if (fields.length === 0) return 'Add at least one field.'
      if (!item.trim()) return 'Say what one record is called.'
    }
    return null
  }

  function next() {
    const p = stepProblem()
    if (p) { setError(p); return }
    setError(null)
    setOpen(null)
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  async function create() {
    if (!profile || !session) { setError('Sign in again to build a module.'); return }
    const p = stepProblem() ?? definitionProblem(draft)
    if (p) { setError(p); return }
    setBusy(true)
    try {
      const key = await createBuiltModule(session.user.id, profile.id, draft)
      onClose()
      navigate(`/m/${key}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the module.')
      setBusy(false)
    }
  }

  function addLink(kind: LookupKind) {
    const label = LOOKUP_OPTIONS.find((o) => o.value === kind)!.label.replace(/s$/, '')
    setFields((fs) => fs.length >= LIMITS.fields ? fs : [...fs, { name: fieldNameFrom(label, fs.map((f) => f.name)), label, type: 'lookup', lookup: kind }])
  }

  const setRule = (ruleName: string, on: boolean) => setRules((rs) => rs.map((r) => {
    if (r.name === ruleName) return { ...r, off: !on }
    if (ruleName === RULE_DAY_TASK && !on && r.name === RULE_REMIND) return { ...r, off: true }
    return r
  }))
  const dayTaskOn = rules.some((r) => r.name === RULE_DAY_TASK && !r.off)

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-label="Build a module">
        <p className="mb-step">Step {step + 1} of {STEPS.length}</p>
        <h2>{STEPS[step]}</h2>

        {step === 0 && (
          <div className="form-grid">
            <label>Name
              <input autoFocus value={name} maxLength={LIMITS.moduleName} placeholder="Reading, Car, Plants" onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="two">
              <label>Mark
                <input value={glyph} maxLength={4} placeholder={Array.from(name.trim())[0]?.toUpperCase() ?? 'R'} onChange={(e) => setGlyph(e.target.value)} />
              </label>
              <p className="mf-hint" style={{ alignSelf: 'end' }}>One letter or symbol for the page bar. Optional.</p>
            </div>
            <label>Summary
              <input value={summary} maxLength={LIMITS.summary} placeholder="One line on what it is for. Optional." onChange={(e) => setSummary(e.target.value)} />
            </label>
          </div>
        )}

        {step === 1 && (
          <>
            <p className="mf-hint" style={{ marginBottom: 8 }}>A starting set of fields. You can change every one of them next.</p>
            <div className="mb-presets" role="group" aria-label="Start from">
              {PRESETS.map((p) => (
                <button key={p.key} type="button" className="mb-preset" aria-pressed={p.key === presetKey} onClick={() => pickPreset(p.key)}>
                  <span className="mb-preset-name">{p.name}</span>
                  <span className="mb-preset-why">{p.description}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <div className="form-grid">
            <label>Keywords
              <input autoFocus value={keywords} placeholder="books, reading, novels" onChange={(e) => setKeywords(e.target.value)} />
            </label>
            <p className="mf-hint">
              Separated by commas. When someone describes their days at setup, these words suggest this module.
              {cleanKeywords(keywords).length > 0 && <> Kept: {cleanKeywords(keywords).join(', ')}.</>}
            </p>
          </div>
        )}

        {step === 3 && (
          <>
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <label>One record is a
                <input value={item} maxLength={LIMITS.label} placeholder="Book, Expense, Job" onChange={(e) => setItem(e.target.value)} />
              </label>
            </div>
            <ul className="mb-fields" aria-label="Fields">
              {fields.map((f, i) => (
                <li key={f.name}>
                  {open === i ? (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <FieldForm field={f} fields={fields} index={i} onCancel={() => setOpen(null)}
                        onSave={(nf) => { setFields((fs) => fs.map((x, j) => (j === i ? nf : x))); setOpen(null) }} />
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="row-name">{f.label}</div>
                        <div className="row-meta">{describeField(f)}</div>
                      </div>
                      <div className="me-tools">
                        <button type="button" className="btn" onClick={() => setOpen(i)}>Change</button>
                        <button type="button" className="me-icon" aria-label={`Remove ${f.label}`}
                          onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}>×</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {open === 'new' ? (
              <div className="me-panel" style={{ marginTop: 12 }}>
                <FieldForm fields={fields} index={fields.length} onCancel={() => setOpen(null)}
                  onSave={(nf) => { setFields((fs) => [...fs, nf]); setOpen(null) }} />
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn" disabled={fields.length >= LIMITS.fields} onClick={() => setOpen('new')}>Add a field</button>
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <div className="form-grid">
            <div className="mf-field">
              <span>Link each record to something in another module</span>
              <div className="mb-links">
                {LOOKUP_OPTIONS.map((o) => (
                  <button key={o.value} type="button" className="btn" onClick={() => addLink(o.value)}>
                    + {o.label.replace(/s$/, '').toLowerCase()}
                  </button>
                ))}
              </div>
              {fields.some((f) => f.type === 'lookup') && (
                <p className="mf-hint">Linked: {fields.filter((f) => f.type === 'lookup').map((f) => f.label).join(', ')}.</p>
              )}
            </div>
            <div className="mf-field">
              <span>Views: how the records are shown on the module’s page</span>
              <div className="me-cols" role="group" aria-label="Views">
                {VIEW_TYPE_OPTIONS.map((o) => {
                  const on = views.some((v) => v.type === o.value)
                  const cant = on ? null : viewCantDraw(o.value)
                  return (
                    <button key={o.value} type="button" className="me-col" aria-pressed={on} disabled={!!cant}
                      title={cant ?? o.hint} onClick={() => toggleView(o.value)}>{o.label}</button>
                  )
                })}
              </div>
              <p className="mf-hint">
                {VIEW_TYPE_OPTIONS.filter((o) => views.some((v) => v.type === o.value)).map((o) => `${o.label}: ${o.hint?.toLowerCase()}`).join('. ')}.
                {' '}A board needs a choice field; a grid and a chart need a date. All of it can be changed later in Edit module.
              </p>
              {draft.views.filter((v) => SET_UP_VIEWS.includes(v.type)).map((v) => (
                <div key={v.key} className="mb-view">
                  <span className="mf-hint">{v.name}</span>
                  <ViewSettings view={v} entity={entity} change={(fn) => setViews((vs) => vs.map((x) => {
                    if (x.key !== v.key) return x
                    const next = viewDefaults({ ...x, entity: entity.name }, entity)
                    fn(next)
                    return next
                  }))} />
                </div>
              ))}
            </div>
            {rules.map((r) => {
              const blocked = r.name === RULE_REMIND && !dayTaskOn
              return (
                <div key={r.name} className="mf-switch">
                  <span>
                    {r.sentence}
                    {r.name === RULE_DAY_TASK && !fields.some(isDateLike) && <><br />Needs a date field.</>}
                  </span>
                  <button type="button" className="switch" role="switch" aria-checked={!r.off} aria-label={r.sentence}
                    disabled={blocked} onClick={() => setRule(r.name, !!r.off)} />
                </div>
              )
            })}
            {fields.some((f) => isNumeric(f)) && (
              <>
                <span className="mf-hint">Count in Stats</span>
                {fields.map((f, i) => isNumeric(f) && (
                  <div key={f.name} className="mf-switch">
                    <span>{f.label}</span>
                    <div style={{ width: 160 }}>
                      <Dropdown className="dd-end" label={`${f.label} in Stats`} value={f.stats ?? 'none'} options={STATS_OPTIONS}
                        onChange={(v) => setFields((fs) => fs.map((x, j) => {
                          if (j !== i) return x
                          const { stats: _s, ...rest } = x
                          return v === 'none' ? rest : { ...rest, stats: v as StatsKind }
                        }))} />
                    </div>
                  </div>
                ))}
              </>
            )}
            {problem && <p className="mf-error" role="alert">{problem}</p>}
          </div>
        )}

        {error && <p className="mf-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        <div className="sheet-actions">
          {step > 0
            ? <button type="button" className="btn" onClick={() => { setError(null); setOpen(null); setStep((s) => s - 1) }}>Back</button>
            : <button type="button" className="btn" onClick={onClose}>Cancel</button>}
          {step < STEPS.length - 1
            ? <button type="button" className="btn btn-primary grow" onClick={next}>Next</button>
            : <button type="button" className="btn btn-primary grow" disabled={busy || !!problem} onClick={() => void create()}>Create</button>}
        </div>
      </div>
    </>
  )
}
