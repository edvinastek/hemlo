import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { search } from '../lib/search-rules'
import { templateSummary, type NoteTemplate } from '../lib/template-rules'
import './notes.css'

/** Choose a note template (NOT-13). An inline panel, not a sheet of its own,
 *  so it can sit inside the note editor, the task sheet or the copy dialog
 *  without stacking one sheet on another. The one search finds templates
 *  by name and by what they hold. */
export function TemplatePicker({ onPick, onClose, title = 'Insert a template' }: {
  onPick: (template: NoteTemplate) => void
  onClose: () => void
  title?: string
}) {
  const profile = useApp((s) => s.profile)
  const templates = useMemo(() => readSettings(profile).note_templates, [profile])
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const items = useMemo(() => templates.map((t, i) => ({ t, name: t.name, extra: templateSummary(t.body), recent: templates.length - i })), [templates])
  // With nothing typed the person's own order is kept; typing ranks by the search.
  const found = query.trim() ? search(items, query) : items
  const shown = all ? found : found.slice(0, 20)

  return (
    <div className="tp" role="group" aria-label={title} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="tp-head">
        <span className="tp-title">{title}</span>
        <button type="button" className="tp-close" onClick={onClose}>Close</button>
      </div>
      {templates.length > 0 && (
        <input className="tp-search" type="search" value={query} placeholder="Search templates" aria-label="Search templates"
          onChange={(e) => { setQuery(e.target.value); setAll(false) }} autoFocus />
      )}
      {templates.length === 0 ? (
        <p className="tp-empty">No templates yet: save any note as a template, or make one in Settings, Note templates.</p>
      ) : shown.length === 0 ? (
        <p className="tp-empty">No template has “{query.trim()}” in it.</p>
      ) : (
        <ul className="tp-list">
          {shown.map(({ t, extra }) => (
            <li key={t.id}>
              <button type="button" className="tp-item" onClick={() => onPick(t)}>
                <span className="tp-name">{t.name}</span>
                {extra && <span className="tp-sum">{extra}</span>}
                {t.after_done && <span className="chip tp-chip">Can ask when the task is done</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!all && found.length > shown.length && (
        <button type="button" className="tp-more" onClick={() => setAll(true)}>Show all {found.length}</button>
      )}
    </div>
  )
}
