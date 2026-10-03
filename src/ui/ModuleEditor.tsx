import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { moduleByKey } from '../modules/registry'
import type { EntityDef, FieldDef, ModuleDef, RuleDef, ViewDef } from '../modules/types'
import {
  BUILTIN_RULES, LIMITS, RULE_DAY_TASK, RULE_REMIND, cleanKeywords, definitionFor, definitionProblem,
  glyphProblem, isDateLike, isNumeric, overlayFrom, ruleShown, ruleSupport, viewDefaults, type StatsKind,
} from '../modules/def-rules'
import { deleteBuiltModule, saveModuleDef, useModuleDef, useModuleDefs } from '../modules/defs'
import { syncModuleTasks } from '../modules/records'
import { syncMealTasks } from '../lib/meals'
import { FieldForm, STATS_OPTIONS, describeField } from '../modules/FieldForm'
import { VIEW_TYPE_NAME, VIEW_TYPE_OPTIONS, ViewSettings } from '../modules/ViewSettings'
import { Dropdown } from './Dropdown'
import { ModuleShow } from '../modules/ModuleShow'
import '../modules/modules.css'

/** A module as what it is — fields, views, rules and its name — and every
 *  part of it editable. Built-in and built modules share the screen; what a
 *  built-in one allows is narrower (its own fields keep their kind, and a
 *  field can only be added where its records are kept as module records),
 *  and its changes are saved as a layer over the app's version, so updates
 *  to the app still reach it. */

export type EditorTab = 'fields' | 'views' | 'show' | 'rules' | 'settings'
type Tab = EditorTab
const TABS: { key: Tab; label: string }[] = [
  { key: 'fields', label: 'Fields' }, { key: 'views', label: 'Views' }, { key: 'show', label: 'Show' },
  { key: 'rules', label: 'Rules' }, { key: 'settings', label: 'Settings' },
]
/** Modules whose page is a screen of its own: fields and views are fixed. */
const FIXED_PAGES = ['nutrition', 'shopping', 'habits', 'supplements', 'health']


const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** What saving would store, to tell whether anything changed. */
function stored(def: ModuleDef): string {
  if (def.built) return JSON.stringify([def.name, definitionFor(def)])
  const base = moduleByKey.get(def.key)
  return base ? JSON.stringify(overlayFrom(base, def)) : ''
}

export function ModuleEditor({ moduleKey, onBack, tab: firstTab = 'fields' }: { moduleKey: string; onBack: () => void; tab?: EditorTab }) {
  const profile = useApp((s) => s.profile)
  const live = useModuleDef(moduleKey)
  const [draft, setDraft] = useState<ModuleDef | null>(null)
  const [tab, setTab] = useState<Tab>(firstTab)
  const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // The draft starts from the module as saved; later saves (here or from
  // another device) do not overwrite what is being typed.
  useEffect(() => { if (live && (!draft || draft.key !== live.key)) setDraft(clone(live)) }, [live]) // eslint-disable-line react-hooks/exhaustive-deps

  if (live === undefined) return null
  if (live === null || !draft) {
    return (
      <>
        <div className="me-head"><div><div className="row-name">No such module</div></div><button className="btn" onClick={onBack}>Back</button></div>
        <p className="empty">It may have been deleted on another device.</p>
      </>
    )
  }

  const base = moduleByKey.get(draft.key)
  const fixed = FIXED_PAGES.includes(draft.key)
  const dirty = stored(draft) !== stored(live)
  const problem = definitionProblem(draft)
  const change = (fn: (d: ModuleDef) => void) => {
    setDraft((d) => { if (!d) return d; const n = clone(d); fn(n); return n })
    setNote(null)
    setLeaving(false)
  }

  async function save() {
    if (!profile || !draft || !live) return
    setBusy(true)
    try {
      const rulesChanged = JSON.stringify(draft.rules) !== JSON.stringify(live.rules)
        || JSON.stringify(draft.entities) !== JSON.stringify(live.entities)
      await saveModuleDef(profile.id, draft)
      if (draft.built && rulesChanged) await syncModuleTasks(profile.id, draft)
      // A built-in rule that makes tasks follows its switch at once, from today on.
      if (draft.key === 'nutrition' && rulesChanged) await syncMealTasks(profile.id)
      setNote({ text: 'Saved.' })
      window.setTimeout(() => setNote((n) => (n?.text === 'Saved.' ? null : n)), 2500)
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'Could not save.', warn: true })
    } finally { setBusy(false) }
  }

  function back() {
    if (dirty && !leaving) { setLeaving(true); return }
    onBack()
  }

  return (
    <div className="me">
      <div className="me-head">
        <div>
          <div className="row-name">{draft.name || 'Untitled module'}</div>
          <div className="row-meta">{draft.built ? 'Built by you' : 'Comes with the app; your changes are kept on top'}</div>
        </div>
        <button className="btn" onClick={back}>Back</button>
      </div>

      <div className="tabs me-tabs" role="tablist" aria-label="Edit module">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'fields' && <FieldsTab draft={draft} base={base} fixed={fixed} change={change} />}
      {tab === 'views' && <ViewsTab draft={draft} base={base} fixed={fixed} change={change} />}
      {tab === 'show' && <ModuleShow moduleKey={draft.key} name={live.name} />}
      {tab === 'rules' && <RulesTab draft={draft} fixed={fixed} change={change} />}
      {tab === 'settings' && (
        <SettingsTab draft={draft} base={base} change={change} setDraft={(d) => { setDraft(d); setNote(null) }}
          onDelete={async () => { if (profile) { await deleteBuiltModule(profile.id, draft.key); onBack() } }} />
      )}

      {(dirty || note || leaving) && (
        <div className={`me-savebar${dirty || leaving ? '' : ' is-quiet'}`} role="region" aria-label="Save changes">
          {leaving
            ? <p className="is-warn">Leave without saving these changes?</p>
            : <p className={problem || note?.warn ? 'is-warn' : undefined} role="status">
                {note?.text ?? (problem ?? 'Unsaved changes.')}
              </p>}
          {leaving ? (
            <>
              <button className="btn" onClick={() => setLeaving(false)}>Stay</button>
              <button className="btn" onClick={onBack}>Leave</button>
            </>
          ) : dirty && (
            <>
              <button className="btn" onClick={() => { setDraft(clone(live)); setNote(null) }}>Discard</button>
              <button className="btn btn-primary" disabled={busy || !!problem} onClick={() => void save()}>Save</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

type Change = (fn: (d: ModuleDef) => void) => void

/* ---------- fields ------------------------------------------------------- */

function FieldsTab({ draft, base, fixed, change }: { draft: ModuleDef; base?: ModuleDef; fixed: boolean; change: Change }) {
  if (draft.entities.length === 0 && draft.built) {
    return (
      <>
        <p className="mp-note">This module has nothing to keep yet. Add its first field.</p>
        <div className="me-add">
          <button className="btn" onClick={() => change((d) => {
            d.entities.push({ name: 'item', label: 'Item', fields: [] })
            if (!d.views.length) d.views.push({ key: 'list', name: 'List', type: 'list', entity: 'item' })
          })}>Start</button>
        </div>
      </>
    )
  }
  if (draft.entities.length === 0) return <p className="empty">This module has no fields. Build your own module in More, Modules.</p>
  return (
    <>
      {fixed && (
        <p className="mp-note">
          {draft.name} has a screen of its own, so its fields are fixed. You can still rename the module and switch its rules.
        </p>
      )}
      {draft.entities.map((e, ei) => (
        <EntityFields key={e.name} entity={e} baseEntity={base?.entities.find((b) => b.name === e.name)}
          built={!!draft.built} fixed={fixed} showTitle={draft.entities.length > 1 || !!base} self={draft.key}
          change={(fn) => change((d) => fn(d.entities[ei], d))} />
      ))}
    </>
  )
}

function EntityFields({ entity, baseEntity, built, fixed, showTitle, self, change }: {
  entity: EntityDef; baseEntity?: EntityDef; built: boolean; fixed: boolean; showTitle: boolean; self: string
  change: (fn: (e: EntityDef, d: ModuleDef) => void) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Modules the person built (not this one), for a link to their records.
  const others = (useModuleDefs() ?? []).filter((e) => e.def.built && e.def.key !== self).map((e) => ({ key: e.def.key, name: e.def.name }))
  // Fields can be added where records are module records: every built
  // module, and the light built-in ones.
  const structural = !fixed && (built || !entity.table)
  const isBase = (f: FieldDef) => !built && !!baseEntity?.fields.some((b) => b.name === f.name)
  const full = entity.fields.length >= LIMITS.fields

  const move = (i: number, by: number) => change((e) => {
    const j = i + by
    if (j < 0 || j >= e.fields.length) return
    const [f] = e.fields.splice(i, 1)
    e.fields.splice(j, 0, f)
  })
  const remove = (name: string) => change((e, d) => {
    e.fields = e.fields.filter((f) => f.name !== name)
    for (const v of d.views) {
      if (v.entity !== e.name) continue
      if (v.columns) v.columns = v.columns.filter((c) => c !== name)
      if (v.dateField === name) delete v.dateField
      if (v.groupBy === name) delete v.groupBy
      if (v.field === name) delete v.field
    }
  })

  return (
    <section aria-label={entity.label}>
      {showTitle && <p className="section-title">{entity.label}</p>}
      {entity.fields.map((f, i) => (
        <div key={f.name} className={`me-row${f.hidden ? ' is-off' : ''}`}>
          <label className="me-label">
            <span className="row-meta">{describeField(f)}</span>
            <input value={f.label} maxLength={LIMITS.label} aria-label={`Name of the ${f.label || f.name} field`} disabled={fixed}
              onChange={(ev) => change((e) => { e.fields[i].label = ev.target.value })} />
          </label>
          {!fixed && (
            <div className="me-tools">
              <button type="button" className="me-icon" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="me-icon" aria-label={`Move ${f.label} down`} disabled={i === entity.fields.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="switch" role="switch" aria-checked={!f.hidden}
                aria-label={`Show ${f.label}`} disabled={!!f.required}
                title={f.required ? 'A field every record needs stays on the form' : undefined}
                onClick={() => change((e) => { if (e.fields[i].hidden) delete e.fields[i].hidden; else e.fields[i].hidden = true })} />
            </div>
          )}
          {!fixed && open !== f.name && (
            <div className="me-more">
              <button type="button" className="btn" onClick={() => setOpen(f.name)}>{structural && !isBase(f) ? 'Change' : 'Label and Stats'}</button>
              {structural && !isBase(f) && (
                <button type="button" className="btn" onClick={() => remove(f.name)}>Remove</button>
              )}
            </div>
          )}
          {open === f.name && (
            <div className="me-panel">
              <FieldForm field={f} fields={entity.fields} index={i} typeLocked={!structural || isBase(f)} modules={others}
                onCancel={() => setOpen(null)}
                onSave={(nf) => { change((e) => { e.fields[i] = nf }); setOpen(null) }} />
            </div>
          )}
        </div>
      ))}
      {structural && (
        adding ? (
          <div className="me-add">
            <div className="me-panel">
              <FieldForm fields={entity.fields} index={entity.fields.length} modules={others} onCancel={() => setAdding(false)}
                onSave={(nf) => { change((e) => { e.fields.push(nf) }); setAdding(false) }} />
            </div>
          </div>
        ) : (
          <div className="me-add">
            <button type="button" className="btn" disabled={full} onClick={() => setAdding(true)}>Add a field</button>
            {full && <p className="mf-hint">A module holds at most {LIMITS.fields} fields.</p>}
          </div>
        )
      )}
      {!structural && !fixed && (
        <p className="mp-note">These records are kept in a table of their own, so the fields are fixed; rename, reorder and hide them here.</p>
      )}
    </section>
  )
}

/* ---------- views -------------------------------------------------------- */

function ViewsTab({ draft, base, fixed, change }: { draft: ModuleDef; base?: ModuleDef; fixed: boolean; change: Change }) {
  const [type, setType] = useState<ViewDef['type']>('list')
  const [name, setName] = useState('')
  const [entityName, setEntityName] = useState(draft.entities[0]?.name ?? '')

  if (fixed) {
    return <p className="mp-note">{draft.name} has a screen of its own, so it has no views to change here.</p>
  }
  if (draft.entities.length === 0) return <p className="empty">Add a field first; then the module can have views.</p>

  const removable = (v: ViewDef) => draft.built || !base?.views.some((b) => b.key === v.key)
  const shownCount = draft.views.filter((v) => !v.hidden).length
  const move = (i: number, by: number) => change((d) => {
    const j = i + by
    if (j < 0 || j >= d.views.length) return
    const [v] = d.views.splice(i, 1)
    d.views.splice(j, 0, v)
  })

  function addView() {
    change((d) => {
      const label = name.trim() || VIEW_TYPE_NAME[type]
      let key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || type
      const taken = d.views.map((v) => v.key)
      for (let i = 2; taken.includes(key); i++) key = `${key.replace(/_\d+$/, '')}_${i}`
      const entity = d.entities.find((e) => e.name === entityName) ?? d.entities[0]
      // Settings filled in from the fields there are, so it draws at once.
      d.views.push(viewDefaults({ key, name: label.slice(0, LIMITS.viewName), type, entity: entity.name }, entity))
    })
    setName('')
  }

  return (
    <>
      {draft.views.map((v, i) => {
        const entity = draft.entities.find((e) => e.name === v.entity)
        const fields = entity?.fields ?? []
        const cols = v.columns?.length ? v.columns : fields.map((f) => f.name)
        return (
          <div key={v.key} className={`me-row${v.hidden ? ' is-off' : ''}`}>
            <label className="me-label">
              <span className="row-meta">
                {VIEW_TYPE_NAME[v.type] ?? v.type}{draft.entities.length > 1 && entity ? ` of ${entity.label.toLowerCase()}s` : ''}
              </span>
              <input value={v.name} maxLength={LIMITS.viewName} aria-label={`Name of the ${v.name} view`}
                onChange={(ev) => change((d) => { d.views[i].name = ev.target.value })} />
            </label>
            <div className="me-tools">
              <button type="button" className="me-icon" aria-label={`Move ${v.name} left`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="me-icon" aria-label={`Move ${v.name} right`} disabled={i === draft.views.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="switch" role="switch" aria-checked={!v.hidden} aria-label={`Show the ${v.name} view`}
                disabled={!v.hidden && shownCount <= 1}
                onClick={() => change((d) => { if (d.views[i].hidden) delete d.views[i].hidden; else d.views[i].hidden = true })} />
            </div>
            {v.type === 'table' && (
              <div className="me-cols" role="group" aria-label={`Columns of ${v.name}`}>
                {fields.map((f) => {
                  const on = cols.includes(f.name)
                  return (
                    <button key={f.name} type="button" className="me-col" aria-pressed={on}
                      onClick={() => change((d) => {
                        const next = on ? cols.filter((c) => c !== f.name) : fields.map((x) => x.name).filter((n) => n === f.name || cols.includes(n))
                        if (next.length) d.views[i].columns = next
                      })}>{f.label}</button>
                  )
                })}
              </div>
            )}
            {entity && <ViewSettings view={v} entity={entity} change={(fn) => change((d) => fn(d.views[i]))} />}
            {removable(v) && (
              <div className="me-more">
                <button type="button" className="btn" disabled={draft.views.length <= 1}
                  onClick={() => change((d) => { d.views.splice(i, 1) })}>Remove view</button>
              </div>
            )}
          </div>
        )
      })}
      <p className="section-title">Add a view</p>
      <div className="me-block form-grid">
        <div className="two">
          <div className="mf-field">
            <span>Kind</span>
            <Dropdown label="Kind of view" value={type} options={VIEW_TYPE_OPTIONS} onChange={setType} />
          </div>
          <label>Name
            <input value={name} maxLength={LIMITS.viewName} placeholder={VIEW_TYPE_NAME[type]} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        {draft.entities.length > 1 && (
          <div className="mf-field">
            <span>Of</span>
            <Dropdown label="Records shown" value={entityName} options={draft.entities.map((e) => ({ value: e.name, label: e.label }))} onChange={setEntityName} />
          </div>
        )}
        <div><button type="button" className="btn" disabled={draft.views.length >= LIMITS.views} onClick={addView}>Add view</button></div>
      </div>
    </>
  )
}

/* ---------- rules -------------------------------------------------------- */

function RulesTab({ draft, fixed, change }: { draft: ModuleDef; fixed: boolean; change: Change }) {
  const dayTaskOn = draft.rules.some((r) => r.name === RULE_DAY_TASK && !r.off)
  const hasDate = draft.entities.some((e) => e.fields.some(isDateLike))
  const numericFields = fixed ? [] : draft.entities.flatMap((e, ei) => e.fields.map((f, fi) => ({ e, ei, f, fi })))
    .filter(({ f }) => isNumeric(f))

  const ruleRow = (r: RuleDef, i: number) => {
    // A built-in module's rule has a switch only when the app acts on it;
    // otherwise a line says why not (see BUILTIN_RULES in def-rules.ts).
    if (!draft.built) {
      const support = ruleSupport(draft.key, r.name)
      const note = BUILTIN_RULES[`${draft.key}.${r.name}`]?.note ?? 'Not acted on yet.'
      return (
        <div key={r.name} className={`me-row${r.off && support === 'switch' ? ' is-off' : ''}`}>
          <div>
            <div className="row-name">{r.sentence}</div>
            <div className="row-meta">{note}{r.locked ? ' Locked: the planner never works around it.' : ''}</div>
          </div>
          {support === 'switch'
            ? <button type="button" className="switch" role="switch" aria-checked={!r.off} aria-label={r.sentence}
                onClick={() => change((d) => { const rule = d.rules[i]; if (rule.off) delete rule.off; else rule.off = true })} />
            : <span className="row-meta">Always on</span>}
        </div>
      )
    }
    const needsDayTask = r.name === RULE_REMIND && !dayTaskOn
    return (
      <div key={r.name} className={`me-row${r.off ? ' is-off' : ''}`}>
        <div>
          <div className="row-name">{r.sentence}</div>
          <div className="row-meta">
            {r.name === RULE_DAY_TASK && (hasDate ? 'The task keeps the record’s name, day and module. Ticking it off works as usual.' : 'Add a date field first: only records with a date get a task.')}
            {r.name === RULE_REMIND && (needsDayTask ? 'Needs the rule above: a reminder is the task’s time.' : 'Reminders follow the task’s time, as for any task.')}
            {r.name !== RULE_DAY_TASK && r.name !== RULE_REMIND && <>when {r.when} → {r.then}{r.locked ? ' · locked: the planner never works around it' : ''}</>}
          </div>
        </div>
        <button type="button" className="switch" role="switch" aria-checked={!r.off} aria-label={r.sentence}
          disabled={needsDayTask && !!r.off}
          onClick={() => change((d) => {
            const rule = d.rules[i]
            if (rule.off) delete rule.off; else rule.off = true
            // Switching the task rule off takes the reminder with it.
            if (rule.name === RULE_DAY_TASK && rule.off) { const rem = d.rules.find((x) => x.name === RULE_REMIND); if (rem) rem.off = true }
          })} />
        {r.name === RULE_REMIND && !r.off && (
          <div className="me-more">
            <label className="mf-hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              When a record has no time of its own, at
              <input type="time" value={r.time ?? '09:00'} aria-label="Reminder time"
                onChange={(ev) => change((d) => { if (ev.target.value) d.rules[i].time = ev.target.value })} />
            </label>
          </div>
        )}
      </div>
    )
  }

  // Rules the app does not carry out yet are not shown (MOD-06).
  const shown = draft.rules.map((r, i) => ({ r, i })).filter(({ r }) => draft.built || ruleShown(draft.key, r.name))
  return (
    <>
      {shown.length === 0 && <p className="empty">No rules. This module only holds records and shows them where you choose under Show.</p>}
      {shown.map(({ r, i }) => ruleRow(r, i))}
      {numericFields.length > 0 && (
        <>
          <p className="section-title">Count in Stats</p>
          {numericFields.map(({ e, ei, f, fi }) => (
            <div key={`${e.name}.${f.name}`} className="me-row">
              <div>
                <div className="row-name">{f.label}</div>
                <div className="row-meta">{describeField(f)}</div>
              </div>
              <Dropdown className="dd-end" label={`${f.label} in Stats`} value={f.stats ?? 'none'} options={STATS_OPTIONS}
                onChange={(v) => change((d) => {
                  const field = d.entities[ei].fields[fi]
                  if (v === 'none') delete field.stats; else field.stats = v as StatsKind
                })} />
            </div>
          ))}
        </>
      )}
      {!draft.built && shown.length > 0 && (
        <p className="mp-note">A switch takes effect once saved and is kept with your module settings. A rule without a switch is what the module is: switch the module off to stop it.</p>
      )}
    </>
  )
}

/* ---------- settings ----------------------------------------------------- */

function SettingsTab({ draft, base, change, setDraft, onDelete }: {
  draft: ModuleDef; base?: ModuleDef; change: Change; setDraft: (d: ModuleDef) => void; onDelete: () => Promise<void>
}) {
  const [keywords, setKeywords] = useState((draft.keywords ?? []).join(', '))
  const [confirm, setConfirm] = useState(false)
  const glyphError = glyphProblem(draft.glyph ?? '')

  return (
    <>
      <div className="me-block form-grid">
        <label>Name
          <input value={draft.name} maxLength={LIMITS.moduleName} onChange={(e) => change((d) => { d.name = e.target.value })} />
        </label>
        <div className="two">
          <label>Mark
            <input value={draft.glyph ?? ''} maxLength={4} placeholder={Array.from(draft.name)[0]?.toUpperCase() ?? ''} aria-describedby="glyph-hint"
              onChange={(e) => change((d) => { const g = e.target.value.trim(); if (g) d.glyph = g; else delete d.glyph })} />
          </label>
          <p id="glyph-hint" className={glyphError ? 'mf-error' : 'mf-hint'} style={{ alignSelf: 'end' }}>
            {glyphError ?? 'One letter or symbol for the page bar.'}
          </p>
        </div>
        <label>Summary
          <textarea value={draft.summary} maxLength={LIMITS.summary} onChange={(e) => change((d) => { d.summary = e.target.value })} />
        </label>
        <label>Keywords
          <input value={keywords} placeholder="books, reading, novels"
            onChange={(e) => { setKeywords(e.target.value); const k = cleanKeywords(e.target.value); change((d) => { d.keywords = k }) }} />
          <span className="mf-hint">Separated by commas. When someone describes their days at setup, these words suggest this module.</span>
        </label>
      </div>

      {!draft.built && base && (
        <div className="me-block">
          <button type="button" className="btn" onClick={() => { setDraft(clone(base)); setKeywords((base.keywords ?? []).join(', ')) }}>
            Go back to the app’s version
          </button>
          <p className="mf-hint" style={{ marginTop: 6 }}>Undoes every change to this module once saved. Records are not touched.</p>
        </div>
      )}

      {draft.built && (
        <>
          <p className="section-title">Delete</p>
          <div className="me-block">
            <p className="mf-hint" style={{ marginBottom: 8 }}>
              The module leaves your pages and is switched off, and tasks it made that are not done go.
              Its records are kept until you delete your account.
            </p>
            {!confirm
              ? <button type="button" className="btn" onClick={() => setConfirm(true)}>Delete module</button>
              : (
                <div className="sheet-actions" style={{ marginTop: 0 }}>
                  <button type="button" className="btn" onClick={() => setConfirm(false)}>Keep it</button>
                  <button type="button" className="btn" style={{ color: 'var(--e-warn)' }} onClick={() => void onDelete()}>Delete {draft.name}</button>
                </div>
              )}
          </div>
        </>
      )}
    </>
  )
}
