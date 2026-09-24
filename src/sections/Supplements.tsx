import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { Supplement } from '../lib/types'
import { addSupplement, archiveSupplement, moduleEnabled, toggleSupplement } from '../lib/tracking'
import { SLOTS, SLOT_LABEL, groupBySlot, pickLog, type SupplementSlot } from '../lib/tracking-rules'
import { PlusGlyph, TickGlyph } from './Habits'
import './tracking.css'

/** The day's supplements on Today's Body tab, in the order of the day:
 *  morning, midday, evening. Each has its dose and a tick for the day. */
export function Supplements({ profileId, day }: { profileId: string; day: string }) {
  const data = useLiveQuery(async () => {
    if (!(await moduleEnabled(profileId, 'supplements'))) return null
    const supplements = (await db.supplement.where('profile_id').equals(profileId).toArray())
      .filter((s) => s.active && !s.deleted_at)
    // Only the shown day's logs are needed: supplements have no run to count.
    const logs = supplements.length
      ? await db.supplement_log.where('[supplement_id+log_date]')
        .anyOf(supplements.map((s) => [s.id, day])).toArray()
      : []
    return { supplements, logs }
  }, [profileId, day])

  const [editing, setEditing] = useState<string | null>(null)

  // Still loading, or the module is switched off: nothing is shown either way.
  if (!data) return null
  const { supplements, logs } = data

  return (
    <section aria-labelledby="supplements-title">
      <h2 className="section-title" id="supplements-title">Supplements</h2>
      {supplements.length === 0 && <p className="empty">Add a supplement below with its dose and time of day.</p>}
      {groupBySlot(supplements).map((group) => (
        <div key={group.slot ?? 'any'}>
          <h3 className="track-group">{group.label}</h3>
          {group.rows.map((s) => {
            const done = !!pickLog(logs.filter((l) => l.supplement_id === s.id))?.done
            return editing === s.id
              ? <SupplementEdit key={s.id} supplement={s} onDone={() => setEditing(null)} />
              : (
                <div key={s.id} className={`track-row${done ? ' is-done' : ''}`}>
                  <div>
                    <div className="row-name"><button onClick={() => setEditing(s.id)} title="Archive">{s.name}</button></div>
                    {s.dose_text && <div className="row-meta">{s.dose_text}</div>}
                  </div>
                  <div className="track-right">
                    <button className="tick" aria-pressed={done} aria-label={`${s.name}, ${done ? 'taken' : 'not taken'}`}
                      onClick={() => void toggleSupplement(s.id, day)}>
                      {done && <TickGlyph />}
                    </button>
                  </div>
                </div>
              )
          })}
        </div>
      ))}
      <SupplementAdd profileId={profileId} />
    </section>
  )
}

function SupplementEdit({ supplement, onDone }: { supplement: Supplement; onDone: () => void }) {
  return (
    <div className="track-form">
      <div className="row-name">{supplement.name}</div>
      <div className="actions">
        <span className="row-meta">Archive it? Past ticks are kept.</span>
        <button type="button" className="btn warn grow" onClick={async () => { await archiveSupplement(supplement); onDone() }}>Archive</button>
        <button type="button" className="btn" onClick={onDone}>Keep</button>
      </div>
    </div>
  )
}

function SupplementAdd({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [slot, setSlot] = useState<SupplementSlot>('morning')

  if (!open) {
    return (
      <button className="track-add" onClick={() => setOpen(true)}>
        <PlusGlyph />Add a supplement
      </button>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!(await addSupplement(profileId, name, dose, slot))) return
    // The slot is kept: the next one added is often taken at the same time.
    setName('')
    setDose('')
  }

  return (
    <form className="track-form" onSubmit={submit}>
      <div className="fields three">
        <input className="name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Vitamin D" aria-label="Supplement name" autoFocus />
        <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="25 µg" aria-label="Dose" />
        <select value={slot} onChange={(e) => setSlot(e.target.value as SupplementSlot)} aria-label="Time of day">
          {SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Add</button>
        <button type="button" className="btn grow" onClick={() => { setOpen(false); setName(''); setDose('') }}>Done</button>
      </div>
    </form>
  )
}
