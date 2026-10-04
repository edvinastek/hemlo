import { useMemo, useState } from 'react'
import { useApp } from '../../lib/store'
import { dropDayTemplate, saveDayTemplate } from '../../lib/copy'
import { loadPlanPrefs, savePlanPrefs, usePlanPrefs } from '../../lib/plan-prefs'
import { dropStart, templateSummary, withoutTemplate, type PlanTemplate } from '../../lib/plan-templates-rules'
import { dayLabel } from '../../lib/copy-rules'
import { search } from '../../lib/search-rules'
import { useBackClose } from '../../ui/useBackClose'
import { offerUndo } from '../../ui/Undo'
import '../../ui/copysheet.css'

/** "Save day as template" / "Save week as template" (PLN-08): a name, and
 *  whether repeating tasks and meals come along. */
export function SaveTemplateSheet({ kind, first, onClose }: { kind: 'day' | 'week'; first: string; onClose: () => void }) {
  useBackClose(onClose)
  const profile = useApp((s) => s.profile)
  const [name, setName] = useState('')
  const [repeats, setRepeats] = useState(false)
  const [meals, setMeals] = useState(true)
  const [busy, setBusy] = useState(false)
  const title = kind === 'week' ? `Save the week of ${dayLabel(first).slice(4)} as a template` : `Save ${dayLabel(first)} as a template`

  async function save() {
    if (!profile || busy) return
    setBusy(true)
    try {
      const t = await saveDayTemplate(profile.id, name || (kind === 'week' ? 'My week' : 'My day'), kind, first, { repeats, meals })
      offerUndo(`Saved “${t.name}”: ${templateSummary(t)}`, async () => {
        const now = await loadPlanPrefs(profile.id)
        await savePlanPrefs(profile.id, { plan_templates: withoutTemplate(now.plan_templates, t.id) })
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet cs-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="form-grid">
          <label>Name
            <input autoFocus value={name} maxLength={60} placeholder={kind === 'week' ? 'Busy week' : 'Sunday reset'}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} />
          </label>
        </div>
        <section className="cs-part" aria-label="Bring along">
          <label className="cs-choice">
            <input type="checkbox" checked={meals} onChange={(e) => setMeals(e.target.checked)} />
            <span><span className="cs-choice-name">Meals</span><span className="cs-choice-sub">The planned meals, with their food and portions</span></span>
          </label>
          <label className="cs-choice">
            <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
            <span><span className="cs-choice-name">Repeating tasks</span><span className="cs-choice-sub">As one-offs; their series have days of their own.</span></span>
          </label>
        </section>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary grow" disabled={busy} onClick={() => void save()}>Save template</button>
        </div>
      </div>
    </>
  )
}

/** "Drop a template onto this day" (PLN-08): the person's day and week
 *  templates, searchable, each with what it holds. A week template lands on
 *  the week of the day. A template can be deleted here too, with undo. */
export function DropTemplateSheet({ day, onClose, onSave }: { day: string; onClose: () => void; onSave?: () => void }) {
  useBackClose(onClose)
  const profile = useApp((s) => s.profile)
  const prefs = usePlanPrefs(profile?.id)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useMemo(() => search(prefs.plan_templates.map((t) => ({ ...t, extra: templateSummary(t) })), query), [prefs.plan_templates, query])

  async function drop(t: PlanTemplate) {
    if (!profile || busy) return
    setBusy(true)
    try {
      const r = await dropDayTemplate(profile.id, t, day)
      offerUndo(r.summary, r.undo)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function remove(t: PlanTemplate) {
    if (!profile) return
    const before = prefs.plan_templates
    await savePlanPrefs(profile.id, { plan_templates: withoutTemplate(before, t.id) })
    offerUndo(`Template “${t.name}” deleted`, () => savePlanPrefs(profile.id, { plan_templates: before }))
  }

  const title = `Add a template to ${dayLabel(day)}`
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet cs-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {prefs.plan_templates.length === 0 ? (
          <p className="cs-note">No day or week templates yet.</p>
        ) : (
          <>
            {prefs.plan_templates.length > 5 && (
              <div className="form-grid">
                <label>Find a template
                  <input type="search" value={query} placeholder="Sunday" onChange={(e) => setQuery(e.target.value)} />
                </label>
              </div>
            )}
            <ul className="pt-list">
              {list.map((t) => (
                <li key={t.id} className="pt-row">
                  <button type="button" className="pt-use" disabled={busy} onClick={() => void drop(t)}>
                    <span className="pt-name">{t.name}</span>
                    <span className="pt-what">
                      {t.kind === 'week' ? `Week, from ${dayLabel(dropStart(t, day))}` : 'Day'} · {templateSummary(t)}
                    </span>
                  </button>
                  <button type="button" className="btn pt-delete" aria-label={`Delete the template ${t.name}`} onClick={() => void remove(t)}>Delete</button>
                </li>
              ))}
              {list.length === 0 && <li className="cs-note">No template has those words.</li>}
            </ul>
          </>
        )}
        <div className="sheet-actions">
          {onSave && <button type="button" className="btn" onClick={() => { onClose(); onSave() }}>Save this day as one</button>}
          <button type="button" className="btn grow" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  )
}
