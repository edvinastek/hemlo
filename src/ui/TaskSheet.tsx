import { useState } from 'react'
import type { Task } from '../lib/types'
import { deleteTask, saveTask } from '../lib/tasks'

/** Add or edit one task. Duration goes after the name, never inside it, and a
 *  locked task is one nothing — reminders' pushes or a future assistant — may move. */
export function TaskSheet({ task, isNew, onClose }: { task: Task; isNew: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Task>(task)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setDraft((d) => ({ ...d, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) return
    await saveTask({ ...draft, title: draft.title.trim() })
    onClose()
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet" onSubmit={save} role="dialog" aria-label={isNew ? 'New task' : 'Edit task'}>
        <h2>{isNew ? 'New task' : 'Edit task'}</h2>
        <div className="form-grid">
          <label>What
            <input autoFocus required value={draft.title} placeholder="Mobility"
              onChange={(e) => set('title', e.target.value)} />
          </label>
          <div className="two">
            <label>Day
              <input type="date" value={draft.planned_date ?? ''} onChange={(e) => set('planned_date', e.target.value || null)} />
            </label>
            <label>Time
              <input type="time" value={draft.planned_time?.slice(0, 5) ?? ''} onChange={(e) => set('planned_time', e.target.value || null)} />
            </label>
          </div>
          <div className="two">
            <label>Minutes
              <input type="number" min={0} step={5} value={draft.duration_min ?? ''}
                onChange={(e) => set('duration_min', e.target.value ? Number(e.target.value) : null)} />
            </label>
            <label>Section
              <select value={draft.category ?? ''} onChange={(e) => set('category', e.target.value || null)}>
                <option value="">—</option>
                {['Work', 'Meal', 'Training', 'Learning', 'Home', 'Body', 'Night'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={draft.locked} onChange={(e) => set('locked', e.target.checked)} />
            Locked — nothing may move it
          </label>
          <label>Note
            <textarea value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
          </label>
        </div>
        <div className="sheet-actions">
          {!isNew && !confirmDelete && <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>Delete</button>}
          {!isNew && confirmDelete && (
            <button type="button" className="btn" style={{ color: 'var(--e-warn)' }}
              onClick={() => void deleteTask(task).then(onClose)}>Delete for good</button>
          )}
          <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </>
  )
}
