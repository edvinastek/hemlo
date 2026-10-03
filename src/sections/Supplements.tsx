import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../lib/db'
import type { Supplement } from '../lib/types'
import {
  archiveSupplement, moduleEnabled, moveInList, restoreSupplement, saveSupplement, saveSupplementSlots, setSupplementsTaken,
  supplementSlots, toggleSupplement,
} from '../lib/tracking'
import {
  MAX_SLOTS, cleanName, nextSortOrder, pickLog, slotKey, supplementDue, supplementGroups, type SupplementSlotDef,
} from '../lib/tracking-rules'
import { describeSchedule } from '../lib/schedule-rules'
import { PlusGlyph, TickGlyph } from './Habits'
import { Dropdown } from '../ui/Dropdown'
import { RepeatPicker, type RepeatValue } from '../ui/RepeatPicker'
import { offerUndo } from '../ui/Undo'
import { TrackSheet } from './TrackSheet'
import { ModuleMenu, PlainSheet } from '../modules/ModuleHead'
import './tracking.css'

const SUPP_KINDS = ['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'yearly', 'dates'] as const

/** Supplements by the person's own time slots (SUP-02), in the order of the
 *  day. Each slot has one "Take all" tick (SUP-04) and each supplement its
 *  own tick, dose and schedule (SUP-03). Opened, a supplement can be edited
 *  (SUP-01), moved or archived; archived ones can be brought back. */
export function Supplements({ profileId, day }: { profileId: string; day: string }) {
  const onPage = useLocation().pathname.startsWith('/m/')
  const data = useLiveQuery(async () => {
    if (!(await moduleEnabled(profileId, 'supplements'))) return null
    const all = await db.supplement.where('profile_id').equals(profileId).toArray()
    const live = all.filter((s) => s.active && !s.deleted_at)
    const logs = live.length ? await db.supplement_log.where('[supplement_id+log_date]').anyOf(live.map((s) => [s.id, day])).toArray() : []
    return { all, live, logs, slots: await supplementSlots(profileId) }
  }, [profileId, day])

  const [open, setOpen] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Supplement | 'new' | null>(null)
  const [editSlots, setEditSlots] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  // Still loading, or the module is switched off: nothing is shown either way.
  if (!data) return null
  const { live, logs, slots } = data
  const archived = data.all.filter((s) => !s.active || s.deleted_at)
  const taken = (id: string) => !!pickLog(logs.filter((l) => l.supplement_id === id))?.done
  const today = format(new Date(), 'yyyy-MM-dd')
  const groups = supplementGroups(live, slots)

  return (
    <section aria-labelledby="supplements-title" className="track">
      {onPage && <ModuleMenu items={[{ label: 'Time slots…', onSelect: () => setEditSlots(true) }]} />}
      {/* On its own page the page title already says it (CALM-07); the heading stays for screen readers. */}
      <h2 className={onPage ? 'visually-hidden' : 'section-title'} id="supplements-title">Supplements</h2>
      {live.length === 0 && (
        <p className="empty">Add a supplement with its dose and when you take it{onPage ? ': tap the round + button' : ''}.</p>
      )}
      {groups.map((g) => {
        const due = g.rows.filter((s) => supplementDue(s, day))
        const n = due.filter((s) => taken(s.id)).length
        const all = due.length > 0 && n === due.length
        return (
          <div key={g.slot?.key ?? 'any'} className="supp-slot">
            <div className="supp-head">
              <h3 className="track-group">{g.label}{g.slot?.time ? ` · ${g.slot.time}` : ''}</h3>
              {due.length > 0 && <span className="track-count">{n} of {due.length}</span>}
              {due.length > 1 && (
                <button type="button" className="supp-all" aria-pressed={all}
                  onClick={async () => {
                    const ids = due.map((s) => s.id)
                    const before = due.filter((s) => taken(s.id)).map((s) => s.id)
                    await setSupplementsTaken(ids, day, !all)
                    offerUndo(all ? `${g.label}: all unticked` : `${g.label}: all taken`, async () => {
                      await setSupplementsTaken(ids.filter((id) => !before.includes(id)), day, false)
                      await setSupplementsTaken(before, day, true)
                    })
                  }}>
                  {all ? 'Untick all' : 'Take all'}
                </button>
              )}
            </div>
            {g.rows.map((s) => {
              const isDue = supplementDue(s, day)
              const done = taken(s.id)
              const meta = [s.dose_text, s.rule && s.rule !== 'daily' || s.start_date || s.end_date
                ? describeSchedule({ rule: s.rule ?? 'daily', rule_config: s.rule_config ?? {}, start_date: s.start_date ?? '2000-01-03', end_date: s.end_date })
                : null, isDue ? null : 'not today'].filter(Boolean).join(' · ')
              return (
                <div key={s.id} className={`track-item${open === s.id ? ' is-open' : ''}`}>
                  <div className={`track-row${done ? ' is-done' : ''}${!isDue && !done ? ' is-off' : ''}`}>
                    <div className="track-text">
                      <div className="row-name"><button type="button" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>{s.name}</button></div>
                      {meta && <div className="row-meta">{meta}</div>}
                    </div>
                    <div className="track-right">
                      <button className="tick" aria-pressed={done} aria-label={`${s.name}, ${done ? 'taken' : 'not taken'}`}
                        onClick={() => void toggleSupplement(s.id, day)}>
                        {done && <TickGlyph />}
                      </button>
                      <button type="button" className="track-more" aria-label={`More for ${s.name}`} aria-expanded={open === s.id}
                        onClick={() => setOpen(open === s.id ? null : s.id)}>⋮</button>
                    </div>
                  </div>
                  {open === s.id && (
                    <div className="track-open">
                      <div className="track-actions">
                        <button type="button" className="btn" onClick={() => setSheet(s)}>Edit</button>
                        <button type="button" className="btn" disabled={g.rows[0].id === s.id} onClick={() => void moveInList('supplement', g.rows, s.id, -1)}>Move up</button>
                        <button type="button" className="btn" disabled={g.rows.at(-1)!.id === s.id} onClick={() => void moveInList('supplement', g.rows, s.id, 1)}>Move down</button>
                        <button type="button" className="btn" onClick={async () => {
                          setOpen(null)
                          await archiveSupplement(s)
                          offerUndo(`${s.name} archived`, () => restoreSupplement(s))
                        }}>Archive</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {/* One add on the page: the round + (CALM-01); Today's Body tab keeps the row. */}
      {!onPage && <button className="track-add" onClick={() => setSheet('new')}><PlusGlyph />Add a supplement</button>}
      {onPage && (
        <>
          {editSlots && (
            <PlainSheet title="Time slots" onClose={() => setEditSlots(false)}>
              <SlotEditor profileId={profileId} slots={slots} supplements={live} />
            </PlainSheet>
          )}
          {archived.length > 0 && (
            <>
              <button type="button" className="track-fold" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>Archived ({archived.length})</button>
              {showArchived && archived.map((s) => (
                <div key={s.id} className="track-row is-off">
                  <div><div className="row-name">{s.name}</div><div className="row-meta">Past ticks kept</div></div>
                  <button type="button" className="btn" onClick={() => void restoreSupplement(s)}>Bring back</button>
                </div>
              ))}
            </>
          )}
          <button type="button" className="fab" aria-label="Add a supplement" onClick={() => setSheet('new')}>+</button>
        </>
      )}
      {sheet && (
        <SupplementSheet profileId={profileId} supplement={sheet === 'new' ? null : sheet} slots={slots} today={today}
          nextOrder={nextSortOrder(live)} onClose={() => setSheet(null)} />
      )}
    </section>
  )
}

/** The person's time slots (SUP-02): renamed, timed, ordered, added and
 *  removed. A slot that still has supplements asks where they go first, so
 *  removing a slot never hides one. */
function SlotEditor({ profileId, slots, supplements }: { profileId: string; slots: SupplementSlotDef[]; supplements: Supplement[] }) {
  const [draft, setDraft] = useState<SupplementSlotDef[]>(slots)
  const [moving, setMoving] = useState<{ key: string; to: string } | null>(null)
  const [newName, setNewName] = useState('')
  const changed = JSON.stringify(draft) !== JSON.stringify(slots)
  const used = (key: string) => supplements.filter((s) => s.time_slot === key)

  async function save(next = draft) {
    const clean = next.map((s) => ({ ...s, name: cleanName(s.name) ?? s.key }))
    await saveSupplementSlots(profileId, clean)
    const before = slots
    offerUndo('Time slots saved', () => saveSupplementSlots(profileId, before))
  }
  async function removeSlot(key: string, to: string | null) {
    for (const s of used(key)) await saveSupplement({ ...s, time_slot: to }, s)
    const next = draft.filter((s) => s.key !== key)
    setDraft(next)
    setMoving(null)
    await save(next)
  }
  const swap = (i: number, j: number) => { const n = [...draft]; [n[i], n[j]] = [n[j], n[i]]; setDraft(n) }

  return (
    <div className="supp-slots">
      {draft.map((s, i) => (
        <div key={s.key} className="supp-slot-row">
          <input className="serif" value={s.name} aria-label={`Name of slot ${i + 1}`} maxLength={30}
            onChange={(e) => setDraft(draft.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)))} />
          <input type="time" value={s.time ?? ''} aria-label={`Time of ${s.name}`}
            onChange={(e) => setDraft(draft.map((x) => (x.key === s.key ? { ...x, time: e.target.value || null } : x)))} />
          <button type="button" className="track-step" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => swap(i, i - 1)}>↑</button>
          <button type="button" className="track-step" aria-label={`Move ${s.name} down`} disabled={i === draft.length - 1} onClick={() => swap(i, i + 1)}>↓</button>
          <button type="button" className="btn" disabled={draft.length <= 1}
            onClick={() => (used(s.key).length ? setMoving({ key: s.key, to: draft.find((x) => x.key !== s.key)!.key }) : void removeSlot(s.key, null))}>Remove</button>
          {moving?.key === s.key && (
            <div className="track-ask">
              <span>{used(s.key).length} {used(s.key).length === 1 ? 'supplement is' : 'supplements are'} in {s.name}. Move to</span>
              <Dropdown label="Move to" value={moving.to} onChange={(to) => setMoving({ ...moving, to })}
                options={draft.filter((x) => x.key !== s.key).map((x) => ({ value: x.key, label: x.name }))} />
              <button type="button" className="btn btn-primary" onClick={() => void removeSlot(s.key, moving.to)}>Move and remove</button>
              <button type="button" className="btn" onClick={() => setMoving(null)}>Keep</button>
            </div>
          )}
        </div>
      ))}
      {draft.length < MAX_SLOTS && (
        <div className="supp-slot-row">
          <input className="serif" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Before training" aria-label="New slot name" maxLength={30} />
          <button type="button" className="btn" disabled={!cleanName(newName)} onClick={() => {
            setDraft([...draft, { key: slotKey(newName, draft.map((d) => d.key)), name: cleanName(newName)!, time: null }])
            setNewName('')
          }}>Add slot</button>
        </div>
      )}
      <div className="track-actions">
        <button type="button" className="btn btn-primary" disabled={!changed} onClick={() => void save()}>Save slots</button>
        <button type="button" className="btn" disabled={!changed} onClick={() => setDraft(slots)}>Undo changes</button>
      </div>
    </div>
  )
}

/** Add or edit a supplement: name, dose, slot and its own schedule. */
export function SupplementSheet({ profileId, supplement, slots, today, nextOrder, onClose }: {
  profileId: string
  supplement: Supplement | null
  slots: SupplementSlotDef[]
  today: string
  nextOrder: number
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Supplement>(() => supplement ?? {
    id: crypto.randomUUID(), profile_id: profileId, name: '', dose_text: null, time_slot: slots[0]?.key ?? null,
    rule: null, rule_config: {}, start_date: null, end_date: null, active: true, sort_order: nextOrder,
    updated_at: new Date().toISOString(), deleted_at: null,
  })
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Supplement>(k: K, v: Supplement[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const start = draft.start_date ?? today
  const repeat: RepeatValue = { rule: draft.rule ?? 'daily', rule_config: draft.rule_config ?? {}, end_date: draft.end_date ?? null }
  const slotOptions = [...slots.map((s) => ({ value: s.key, label: s.name + (s.time ? ` · ${s.time}` : '') })), { value: '', label: 'Any time' }]

  async function save() {
    if (draft.end_date && draft.end_date < start) return setError('The last day is before the first.')
    try {
      const everyDay = (draft.rule ?? 'daily') === 'daily' && !(draft.rule_config?.n && draft.rule_config.n > 1)
      await saveSupplement({ ...draft, rule: everyDay ? null : draft.rule, rule_config: everyDay ? {} : draft.rule_config ?? {} }, supplement)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It could not be saved.')
    }
  }

  return (
    <TrackSheet label={supplement ? 'Edit supplement' : 'New supplement'} onClose={onClose} onSubmit={() => void save()}>
      <div className="two">
        <label>Name
          <input className="serif" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Vitamin D" autoFocus={!supplement} maxLength={120} />
        </label>
        <label>Dose
          <input value={draft.dose_text ?? ''} onChange={(e) => set('dose_text', e.target.value || null)} placeholder="25 µg" maxLength={60} />
        </label>
      </div>
      <div className="ts-field">
        <span className="ts-field-name">When in the day</span>
        <Dropdown label="Time slot" value={draft.time_slot ?? ''} options={slotOptions} onChange={(v) => set('time_slot', v || null)} />
      </div>
      <RepeatPicker value={repeat} start={start} today={today} kinds={[...SUPP_KINDS]} allowNone={false}
        onChange={(v) => setDraft((d) => ({ ...d, rule: v.rule, rule_config: v.rule_config, end_date: v.end_date }))} />
      <label>Taken from
        <input type="date" value={draft.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
        <span className="row-meta">Leave empty for “from now on”. With a last day too, it is taken only in between (vitamin D in winter).</span>
      </label>
      {error && <p className="track-error" role="alert">{error}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!draft.name.trim()}>Save</button>
      </div>
    </TrackSheet>
  )
}
