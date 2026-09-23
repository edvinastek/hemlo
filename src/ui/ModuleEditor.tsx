import { useState } from 'react'
import { moduleByKey } from '../modules/registry'
import { checkFormula } from '../modules/formula'
import type { FieldDef } from '../modules/types'

/** A module shown as what it actually is: fields, views and rules. Editing any
 *  of the three is the same screen whether the module shipped with the app or
 *  someone built it, which is the point of defining them all as configuration. */
export function ModuleEditor({ moduleKey, onBack }: { moduleKey: string; onBack: () => void }) {
  const mod = moduleByKey.get(moduleKey)
  const [tab, setTab] = useState<'fields' | 'views' | 'rules'>('fields')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!mod) return <p className="empty">No such module.</p>

  const fieldNames = mod.entities.flatMap((e) => e.fields.map((f) => f.name))

  function testFormula(value: string) {
    setDraft(value)
    setError(value.trim() ? checkFormula(value, fieldNames) : null)
  }

  return (
    <>
      <div className="setting-row">
        <div>
          <div className="row-name">{mod.name}</div>
          <div className="row-meta">{mod.summary}</div>
        </div>
        <button className="btn" onClick={onBack}>Back</button>
      </div>

      <div className="tabs" style={{ margin: '0 var(--space-4)' }}>
        {(['fields', 'views', 'rules'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'fields' && (
        <>
          {mod.entities.length === 0 && (
            <p className="empty">This module has no fields yet. Add some and it becomes yours.</p>
          )}
          {mod.entities.map((entity) => (
            <div key={entity.name}>
              <p className="section-title">{entity.label}</p>
              {entity.fields.map((f) => <FieldRow key={f.name} field={f} />)}
            </div>
          ))}

          <p className="section-title">Add a calculated field</p>
          <div className="setting-row">
            <div style={{ width: '100%' }}>
              <input
                className="btn"
                style={{ width: '100%' }}
                placeholder="grams * kcal / 100"
                value={draft}
                onChange={(e) => testFormula(e.target.value)}
              />
              <div className="row-meta" style={{ marginTop: 6, color: error ? 'var(--e-warn)' : undefined }}>
                {error ?? (draft
                  ? 'That formula parses. Saving new fields comes with the editor build; for now this only checks it.'
                  : `Fields you can use: ${fieldNames.slice(0, 8).join(', ')}${fieldNames.length > 8 ? '…' : ''}`)}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'views' && (
        <>
          {mod.views.map((v) => (
            <div key={v.key} className="setting-row">
              <div>
                <div className="row-name">{v.name}</div>
                <div className="row-meta">{v.type} of {v.entity}{v.columns ? ` · ${v.columns.length} columns` : ''}</div>
              </div>
              <span className="chip">{v.type}</span>
            </div>
          ))}
          {mod.views.length === 0 && <p className="empty">No views yet.</p>}
        </>
      )}

      {tab === 'rules' && (
        <>
          {mod.rules.map((r) => (
            <div key={r.name} className="setting-row">
              <div>
                <div className="row-name">{r.sentence}</div>
                <div className="row-meta">when {r.when} → {r.then}</div>
              </div>
              <span className="chip">{r.locked ? 'locked' : 'on'}</span>
            </div>
          ))}
          {mod.rules.length === 0 && <p className="empty">No rules. This module only holds records.</p>}
          <p className="empty">
            A locked rule is one the planner may never work around — sleep and shopping days
            stay where you put them. Rules are read-only in this build.
          </p>
        </>
      )}
    </>
  )
}

function FieldRow({ field }: { field: FieldDef }) {
  return (
    <div className="setting-row">
      <div>
        <div className="row-name">{field.label}</div>
        <div className="row-meta">
          {field.name} · {field.type}
          {field.unit ? ` · ${field.unit}` : ''}
          {field.lookup ? ` · picks from ${field.lookup}` : ''}
          {field.formula ? ` · ${field.formula}` : ''}
        </div>
      </div>
      {field.type === 'formula' && <span className="chip">calculated</span>}
    </div>
  )
}
