import { Fragment, useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { search } from '../lib/search-rules'
import {
  addTemplate, moveTemplate, removeTemplate, restoreTemplate, STARTER_NOTE_TEMPLATES, templateParts, templateSummary, updateTemplate,
  type NoteTemplate,
} from '../lib/template-rules'
import { NoteEditor } from '../ui/NoteEditor'
import { offerUndo } from '../ui/Undo'
import type { Profile } from '../lib/types'
import '../ui/notes.css'
import './note-templates.css'

/** Settings → Planning → Note templates (NOT-11, NOT-12, NOT-17): the person's templates,
 *  searched with the one search, made, edited, renamed, ordered and
 *  deleted (with Undo). They live in the profile's settings, so they sync
 *  and go into the backup. Fill-ins show as labelled chips, never as code. */
export function NoteTemplates() {
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  return <TemplateList key={profile.id} profile={profile} />
}

function TemplateList({ profile }: { profile: Profile }) {
  const list = readSettings(profile).note_templates
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const latest = useApp((s) => s.profile) ?? profile

  const save = (next: NoteTemplate[]) => saveSettings(useApp.getState().profile ?? latest, { note_templates: next })
  const items = useMemo(() => list.map((t) => ({ t, name: t.name, extra: templateSummary(t.body) })), [list])
  const shown = query.trim() ? search(items, query).map((i) => i.t) : list
  const missing = STARTER_NOTE_TEMPLATES.filter((s) => !list.some((t) => t.id === s.id))

  function remove(t: NoteTemplate) {
    const r = removeTemplate(list, t.id)
    if (!r.removed) return
    setOpen(null)
    void save(r.list)
    offerUndo(`${t.name} deleted`, () => {
      const now = readSettings(useApp.getState().profile).note_templates
      return save(restoreTemplate(now, r.removed!, r.index))
    })
  }

  return (
    <>
      <p className="section-title">Note templates</p>
      {list.length > 4 && (
        <div className="nt-search">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" aria-label="Search templates" />
        </div>
      )}
      {list.length === 0 && <p className="empty">No templates. Make one below, or put the starter templates back.</p>}
      {query.trim() && shown.length === 0 && <p className="empty">No template has “{query.trim()}” in it.</p>}
      <ul className="nt-list">
        {shown.map((t) => {
          const i = list.indexOf(t)
          return (
            <li key={t.id} className="nt-row">
              {open === t.id ? (
                <TemplateForm template={t} onCancel={() => setOpen(null)} onDelete={() => remove(t)}
                  onSave={(patch) => { void save(updateTemplate(list, t.id, patch)); setOpen(null) }} />
              ) : (
                <div className="nt-line">
                  <button type="button" className="nt-open" onClick={() => setOpen(t.id)} aria-label={`Edit ${t.name}`}>
                    <span className="nt-name">{t.name}</span>
                    <Chips body={templateSummary(t.body)} />
                    {t.after_done && <span className="chip">Can ask when a task is done</span>}
                  </button>
                  <div className="nt-order">
                    <button type="button" className="nt-step" aria-label={`Move ${t.name} up`} disabled={i <= 0 || !!query.trim()}
                      onClick={() => void save(moveTemplate(list, t.id, -1))}>↑</button>
                    <button type="button" className="nt-step" aria-label={`Move ${t.name} down`} disabled={i >= list.length - 1 || !!query.trim()}
                      onClick={() => void save(moveTemplate(list, t.id, 1))}>↓</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {adding ? (
        <div className="nt-row">
          <TemplateForm template={{ id: '', name: '', body: '', after_done: false }} onCancel={() => setAdding(false)}
            onSave={(patch) => {
              const made = addTemplate(list, patch.name ?? '', patch.body ?? '', patch.after_done ?? false)
              if (made) void save(made.list)
              setAdding(false)
            }} />
        </div>
      ) : (
        <div className="nt-actions">
          <button type="button" className="btn" onClick={() => { setAdding(true); setOpen(null) }}>New template</button>
          {missing.length > 0 && (
            <button type="button" className="btn" onClick={() => void save([...list, ...missing.map((m) => ({ ...m }))])}>
              Put back {missing.length === 1 ? 'the starter template' : `${missing.length} starter templates`}
            </button>
          )}
        </div>
      )}
    </>
  )
}

/** A template's summary with its fill-ins drawn as chips. */
function Chips({ body }: { body: string }) {
  if (!body) return null
  return (
    <span className="nt-sum">
      {templateParts(body).map((p, i) => ('fill' in p
        ? <span key={i} className="nt-fill">{p.fill}</span>
        : <Fragment key={i}>{p.text}</Fragment>))}
    </span>
  )
}

function TemplateForm({ template, onSave, onCancel, onDelete }: {
  template: NoteTemplate
  onSave: (patch: Partial<NoteTemplate>) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(template.name)
  const [body, setBody] = useState(template.body)
  const [after, setAfter] = useState(template.after_done)
  const [confirm, setConfirm] = useState(false)
  return (
    <form className="nt-form form-grid" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name, body, after_done: after }) }}>
      <label>Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Reading reflection" autoFocus={!template.id} />
      </label>
      <NoteEditor value={body} onChange={setBody} label="Template" templateMode />
      {body && (
        <div className="nt-preview" aria-label="How it reads">
          <span className="nt-preview-label">How it reads</span>
          <p className="nt-preview-body">
            {templateParts(body).map((p, i) => ('fill' in p ? <span key={i} className="nt-fill">{p.fill}</span> : <Fragment key={i}>{p.text}</Fragment>))}
          </p>
        </div>
      )}
      <div className="setting-row nt-switch">
        <div>
          <div className="row-name">Can ask when a task is done</div>
          <div className="row-meta">Chosen for a task, it opens when the task is ticked, with Fill in, Later and Skip.</div>
        </div>
        <button type="button" className="switch" role="switch" aria-checked={after} aria-label="Can ask when a task is done" onClick={() => setAfter(!after)} />
      </div>
      <div className="sheet-actions">
        {onDelete && (confirm
          ? <button type="button" className="btn" style={{ color: 'var(--e-warn)' }} onClick={onDelete}>Delete it</button>
          : <button type="button" className="btn" onClick={() => setConfirm(true)}>Delete</button>)}
        <button type="button" className="btn grow" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Save</button>
      </div>
    </form>
  )
}
