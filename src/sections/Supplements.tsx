import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { Supplement } from '../lib/types'
import {
  archiveSupplement, moduleEnabled, moveInList, restoreSupplement, saveSupplement, saveSupplementSlots, setSupplementsTaken,
  supplementSlots, toggleSupplement,
} from '../lib/tracking'
import {
  MAX_SLOTS, REFILL_DAYS, cleanName, doneDays, nextSortOrder, pickLog, slotKey, stockFromNow, stockWords, supplementDue, supplementGroups,
  supplementStock, type SupplementSlotDef,
} from '../lib/tracking-rules'
import { MoreOptions } from '../ui/MoreOptions'
import { MICROS, doseText, readDoseNutrients, readMicroText, storedMicros, type MicroCode, type Micros } from '../lib/micros-rules'
import { describeSchedule } from '../lib/schedule-rules'
import { PlusGlyph, TickGlyph } from './Habits'
import { Dropdown } from '../ui/Dropdown'
import { RepeatPicker, type RepeatValue } from '../ui/RepeatPicker'
import { offerUndo } from '../ui/Undo'
import { TrackSheet } from './TrackSheet'
import { ModuleMenu, PlainSheet } from '../modules/ModuleHead'
import './tracking.css'
import { planToday } from '../lib/day-edge'

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
    // Supplements keeping a stock count: the days ticked since it was counted (SUP-05).
    const counted = live.filter((s) => s.stock_count != null && s.stock_from)
    const since: Record<string, string[]> = {}
    for (const s of counted) {
      since[s.id] = doneDays(await db.supplement_log.where('supplement_id').equals(s.id).filter((l) => l.log_date >= s.stock_from!).toArray())
    }
    return { all, live, logs, since, slots: await supplementSlots(profileId) }
  }, [profileId, day])

  const [open, setOpen] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Supplement | 'new' | null>(null)
  const [editSlots, setEditSlots] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  // Still loading, or the module is switched off: nothing is shown either way.
  if (!data) return null
  const { live, logs, slots, since } = data
  const archived = data.all.filter((s) => !s.active || s.deleted_at)
  const taken = (id: string) => !!pickLog(logs.filter((l) => l.supplement_id === id))?.done
  const today = planToday()
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
              const stock = since[s.id] ? supplementStock(s, since[s.id], today) : null
              const meta = [s.dose_text, s.rule && s.rule !== 'daily' || s.start_date || s.end_date
                ? describeSchedule({ rule: s.rule ?? 'daily', rule_config: s.rule_config ?? {}, start_date: s.start_date ?? '2000-01-03', end_date: s.end_date })
                : null, isDue ? null : 'not today'].filter(Boolean).join(' · ')
              return (
                <div key={s.id} className={`track-item${open === s.id ? ' is-open' : ''}`}>
                  <div className={`track-row${done ? ' is-done' : ''}${!isDue && !done ? ' is-off' : ''}`}>
                    <div className="track-text">
                      <div className="row-name"><button type="button" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>{s.name}</button></div>
                      {meta && <div className="row-meta">{meta}</div>}
                      {stock && <div className={`row-meta${stock.low ? ' track-low' : ''}`}>{stockWords(stock)}</div>}
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
          nextOrder={nextSortOrder(live)} onClose={() => setSheet(null)}
          stockNow={sheet !== 'new' && since[sheet.id] ? supplementStock(sheet, since[sheet.id], today)?.left ?? null : null}
          takenToday={sheet !== 'new' && taken(sheet.id)} />
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

/** Add or edit a supplement: name, dose and slot up front; its own
 *  schedule, first day and stock in "More options" (CALM-08). */
export function SupplementSheet({ profileId, supplement, slots, today, nextOrder, onClose, stockNow = null, takenToday = false }: {
  profileId: string
  supplement: Supplement | null
  slots: SupplementSlotDef[]
  today: string
  nextOrder: number
  onClose: () => void
  /** Doses left now, when it keeps a count (SUP-05). */
  stockNow?: number | null
  /** Today's dose is ticked already (so a count typed now is after it). */
  takenToday?: boolean
}) {
  const [draft, setDraft] = useState<Supplement>(() => supplement ?? {
    id: crypto.randomUUID(), profile_id: profileId, name: '', dose_text: null, time_slot: slots[0]?.key ?? null,
    rule: null, rule_config: {}, start_date: null, end_date: null, active: true, sort_order: nextOrder,
    updated_at: new Date().toISOString(), deleted_at: null,
  })
  const [error, setError] = useState<string | null>(null)
  // The count as the person sees it: doses left now. Saved as the count at
  // the start of today, so ticks keep taking doses off (SUP-05).
  const [left, setLeft] = useState(stockNow != null ? String(stockNow) : '')
  const [refill, setRefill] = useState(String(supplement?.refill_days ?? REFILL_DAYS))
  // What a dose counts towards (SUP-07), as typed: nutrient and amount.
  const [counts, setCounts] = useState<{ code: MicroCode; amount: string }[]>(() =>
    Object.entries(readDoseNutrients(supplement?.nutrients)).map(([code, v]) => ({ code: code as MicroCode, amount: String(v) })))
  const set = <K extends keyof Supplement>(k: K, v: Supplement[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const start = draft.start_date ?? today
  const repeat: RepeatValue = { rule: draft.rule ?? 'daily', rule_config: draft.rule_config ?? {}, end_date: draft.end_date ?? null }
  const slotOptions = [...slots.map((s) => ({ value: s.key, label: s.name + (s.time ? ` · ${s.time}` : '') })), { value: '', label: 'Any time' }]

  async function save() {
    if (draft.end_date && draft.end_date < start) return setError('The last day is before the first.')
    const n = left.trim() === '' ? null : Number(left)
    if (n !== null && !(Number.isInteger(n) && n >= 0 && n < 100000)) return setError('Doses in stock is a whole number, or empty to keep no count.')
    const r = Number(refill)
    if (n !== null && !(Number.isInteger(r) && r >= 0 && r <= 365)) return setError('Remind me is a number of days from 0 to 365.')
    const nutrients: Micros = {}
    for (const c of counts) {
      const v = readMicroText(c.amount)
      const m = MICROS.find((x) => x.code === c.code)!
      if (v === 'bad' || v === null) return setError(`${m.name}: the amount in one dose, in ${m.unit}.`)
      nutrients[c.code] = v
    }
    // A count is written only when it was typed or changed, so ticks since keep counting.
    const stock = n === null ? { stock_count: null, stock_from: null, refill_days: null }
      : n === stockNow && supplement?.stock_from ? { stock_count: supplement.stock_count ?? null, stock_from: supplement.stock_from, refill_days: r }
        : { ...stockFromNow(n, takenToday, today), refill_days: r }
    try {
      const everyDay = (draft.rule ?? 'daily') === 'daily' && !(draft.rule_config?.n && draft.rule_config.n > 1)
      await saveSupplement({ ...draft, ...stock, nutrients: storedMicros(nutrients), rule: everyDay ? null : draft.rule, rule_config: everyDay ? {} : draft.rule_config ?? {} }, supplement)
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
      <MoreOptions open={!!(draft.rule || draft.start_date || draft.end_date || left || counts.length)}
        summary={[draft.rule ? describeSchedule({ rule: draft.rule, rule_config: draft.rule_config ?? {}, start_date: start, end_date: draft.end_date ?? null }) : null,
          draft.start_date ? `from ${draft.start_date}` : null, left ? `${left} in stock` : null,
          counts.length ? doseText(Object.fromEntries(counts.map((c) => [c.code, Number(c.amount.replace(',', '.')) || 0]))) : null].filter(Boolean).join(' · ') || null}>
        <RepeatPicker value={repeat} start={start} today={today} kinds={[...SUPP_KINDS]} allowNone={false}
          onChange={(v) => setDraft((d) => ({ ...d, rule: v.rule, rule_config: v.rule_config, end_date: v.end_date }))} />
        <label title="Leave empty for from now on. With a last day too, it is taken only in between (vitamin D in winter).">Taken from
          <input type="date" value={draft.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
        </label>
        <div className="two">
          <label>Doses in stock
            <input inputMode="numeric" value={left} placeholder="No count" onChange={(e) => setLeft(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label>Remind me, days before
            <input inputMode="numeric" value={refill} disabled={!left} onChange={(e) => setRefill(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
        </div>
        <DoseNutrients counts={counts} onChange={(c) => { setCounts(c); setError(null) }} />
      </MoreOptions>
      {error && <p className="track-error" role="alert">{error}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!draft.name.trim()}>Save</button>
      </div>
    </TrackSheet>
  )
}

/** "Counts towards" (SUP-07): the vitamins and minerals one dose gives, each
 *  with its amount in the nutrient's unit (vitamin D 25 µg). A ticked dose
 *  adds them to the day's totals, which show when the person has chosen to
 *  see those nutrients (Settings → Food). */
function DoseNutrients({ counts, onChange }: { counts: { code: MicroCode; amount: string }[]; onChange: (c: { code: MicroCode; amount: string }[]) => void }) {
  const free = MICROS.filter((m) => !counts.some((c) => c.code === m.code))
  return (
    <div className="supp-counts" role="group" aria-labelledby="supp-counts-name">
      <span className="ts-field-name" id="supp-counts-name">Counts towards</span>
      {counts.map((c, i) => {
        const m = MICROS.find((x) => x.code === c.code)!
        return (
          <div key={c.code} className="supp-count">
            <Dropdown<MicroCode> label="Nutrient" value={c.code}
              options={[m, ...free].map((x) => ({ value: x.code, label: x.name }))}
              onChange={(code) => onChange(counts.map((x, j) => (j === i ? { ...x, code } : x)))} />
            <span className="supp-amount">
              <input inputMode="decimal" value={c.amount} placeholder="25" aria-label={`${m.name} in one dose, ${m.unit}`}
                onChange={(e) => onChange(counts.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <span aria-hidden="true">{m.unit}</span>
            </span>
            <button type="button" className="track-step" aria-label={`Remove ${m.name}`} onClick={() => onChange(counts.filter((_, j) => j !== i))}>×</button>
          </div>
        )
      })}
      {free.length > 0 && (
        <button type="button" className="slot-link supp-count-add" onClick={() => onChange([...counts, { code: free.find((m) => m.code === 'vd')?.code ?? free[0].code, amount: '' }])}>
          {counts.length ? 'Add another' : 'Add a vitamin or mineral'}
        </button>
      )}
    </div>
  )
}
