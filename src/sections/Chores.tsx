import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { useApp } from '../lib/store'
import { db } from '../lib/db'
import { edit } from '../lib/write'
import type { ModuleRecord } from '../lib/types'
import type { Chore, ChoreLog } from '../lib/types'
import { blankChore, choreLogs, choresFor, deleteChore, saveChore, toggleChore, CHORE_FIELDS } from '../lib/chores'
import { moduleEnabled, moveInList } from '../lib/tracking'
import { cleanName, nextSortOrder } from '../lib/tracking-rules'
import { choreAssignee, choreState, dayName, shortDate, weekdayOf, WEEK_ORDER, type ChoreState } from '../lib/schedule-rules'
import {
  STARTER_PACKS, choreRooms, choreScheduleText, choreSections, choreStatus, cleanMemberName, duenessFill, heldBack,
  choreFromRecord, lastDoneText, memberName, packChoresToAdd, roomsIn, type ChorePrefs, type Member, type StarterPack,
  mineOnly,
} from '../lib/chore-rules'
import { cachedMembers, chorePrefs, fetchMembers, pauseAll, saveChorePrefs, sendPendingName, setMyMemberName } from '../lib/household'
import { checklistProgress, hasNote, parseNote, toggleCheck } from '../lib/notes'
import { clearTicks } from '../lib/template-rules'
import { RepeatPicker, type RepeatValue } from '../ui/RepeatPicker'
import { choreOfRepeat, repeatOfChore } from '../lib/repeat-choice-rules'
import { NoteEditor } from '../ui/NoteEditor'
import { Dropdown } from '../ui/Dropdown'
import { offerUndo } from '../ui/Undo'
import { PlusGlyph, TickGlyph } from './Habits'
import { MoreOptions } from '../ui/MoreOptions'
import { TrackSheet, Choices, SwitchRow } from './TrackSheet'
import { ModuleMenu, PlainSheet } from '../modules/ModuleHead'
import '../ui/notes.css'
import './tracking.css'
import './chores.css'
import { planToday } from '../lib/day-edge'

const CHORE_KINDS = ['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'yearly', 'dates'] as const

/** Household chores (HSE-01 to HSE-11), shared by everyone in the
 *  household: what is due now, this week and later (or by room), each with
 *  calm words and a due-ness bar, who it goes to and who did it last. A
 *  tick marks it done today by you. Opened, a chore shows its checklist,
 *  its history and its actions. Starter packs, holidays, light days and a
 *  daily cap, and members' names are under the page's ⋮ (v17). */
export function Chores({ profileId, day }: { profileId: string; day: string }) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const online = useApp((s) => s.online)
  const onPage = useLocation().pathname.startsWith('/m/')
  const householdId = profile?.household_id ?? null
  const today = planToday()

  const data = useLiveQuery(async () => {
    if (!householdId || !(await moduleEnabled(profileId, 'household'))) return null
    const chores = (await choresFor(householdId)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    const logs = await choreLogs(chores.map((c) => c.id))
    // Chores kept as records before version 16, waiting to be brought over.
    const old = (await db.module_record.where('profile_id').equals(profileId)
      .filter((r) => r.module_key === 'household' && r.entity === 'chore' && !r.deleted_at).toArray())
    return { chores, logs, old, prefs: await chorePrefs(profileId), members: await cachedMembers(householdId) }
  }, [profileId, householdId])

  // Members' names come from the server when there is a connection.
  useEffect(() => {
    if (!householdId || !online) return
    void (async () => {
      if (userId) await sendPendingName(householdId, userId)
      await fetchMembers(householdId)
    })()
  }, [householdId, online, userId])

  const [view, setView] = useState<'when' | 'room'>(() => {
    // The name from before Visuma, kept: renaming it would lose what is stored under it.
    try { return localStorage.getItem('getit:chores:group') === 'room' ? 'room' : 'when' } catch { return 'when' }
  })
  const group = (v: 'when' | 'room') => {
    setView(v)
    try { localStorage.setItem('getit:chores:group', v) } catch { /* private window: not remembered */ }
  }
  const [open, setOpen] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Chore | 'new' | null>(null)
  // ?fold=names opens the names (Settings → Household links here, so a
  // person's name is changed in one place).
  const asked = new URLSearchParams(useLocation().search).get('fold')
  const [fold, setFold] = useState<null | 'names' | 'holiday' | 'packs'>(asked === 'names' ? 'names' : null)
  const closeFold = () => setFold(null)

  if (!data || !householdId) return null
  const { chores, logs, old, prefs, members } = data
  const logsOf = (id: string) => logs.filter((l) => l.chore_id === id)
  const nameOf = (id: string | null) => memberName(members, id, userId)
  const entries = chores.map((c) => ({ chore: c, state: choreState(c, day, logsOf(c.id)) }))
  // On a light day, or past the cap, flexible chores wait (HSE-09).
  const held = heldBack(entries.map((e) => ({ id: e.chore.id, mode: e.chore.mode, dueness: e.state.dueness, doneToday: e.state.doneToday })), day, prefs)
  const dueNow = entries.filter((e) => (e.state.shows || (e.chore.mode === 'flexible' && e.state.dueness >= 1)) && !e.state.doneToday && !held.has(e.chore.id)).length

  async function tick(c: Chore) {
    const was = logsOf(c.id).find((l) => l.done_on === day)
    await toggleChore(c.id, day, userId)
    // Done: the checklist starts fresh for next time.
    if (!was && c.note && checklistProgress(c.note).done > 0) await saveChore({ ...c, note: clearTicks(c.note) }, ['note'])
  }

  const row = (e: { chore: Chore; state: ChoreState }) => (
    <ChoreRow key={e.chore.id} chore={e.chore} state={e.state} logs={logsOf(e.chore.id)} day={day} today={today}
      held={held.has(e.chore.id)} nameOf={nameOf} open={open === e.chore.id}
      onToggle={() => setOpen(open === e.chore.id ? null : e.chore.id)} onTick={() => void tick(e.chore)}
      onEdit={() => setSheet(e.chore)} canUp={chores[0]?.id !== e.chore.id} canDown={chores.at(-1)?.id !== e.chore.id}
      onMove={(dir) => void moveInList('chore', chores, e.chore.id, dir)}
      onDelete={async () => {
        setOpen(null)
        await deleteChore(e.chore)
        offerUndo(`${e.chore.name} deleted`, () => saveChore({ ...e.chore, deleted_at: null }, ['deleted_at']))
      }} />
  )

  return (
    <section aria-labelledby="chores-title" className="track">
      {onPage && (
        <ModuleMenu items={[
          chores.length > 0 && { label: view === 'when' ? 'Group by room' : 'Group by when', onSelect: () => group(view === 'when' ? 'room' : 'when') },
          chores.length > 0 && { label: 'Starter packs…', onSelect: () => setFold('packs') },
          { label: 'Holiday and light days…', onSelect: () => setFold('holiday') },
          { label: 'Names in the household…', onSelect: () => setFold('names') },
          // A shared household: Today shows each member their own chores, or everyone's (v18).
          members.length > 1 && {
            label: mineOnly(prefs, members.length) ? 'Today: show everyone’s chores' : 'Today: show only my chores',
            onSelect: () => void saveChorePrefs(profileId, { ...prefs, mine_only: !mineOnly(prefs, members.length) }),
          },
        ]} />
      )}
      <div className="track-head">
        <h2 className="section-title" id="chores-title">Chores</h2>
        {chores.length > 0 && <span className="track-count">{dueNow ? `${dueNow} to do now` : 'Nothing waiting'}</span>}
      </div>
      {prefs.light_days.includes(weekdayOf(day)) && chores.some((c) => c.mode === 'flexible') && (
        <p className="chore-note">A light day: flexible chores wait for tomorrow.</p>
      )}

      {old.length > 0 && <OldChores records={old} householdId={householdId} nextOrder={nextSortOrder(chores)} today={today} />}
      {chores.length === 0 ? (
        <div className="empty">
          <p style={{ margin: '0 0 var(--space-3)' }}>Chores everyone in the household shares. Start from a pack, or add your own.</p>
          <Packs householdId={householdId} chores={chores} />
        </div>
      ) : (
        <>
          {view === 'when'
            ? choreSections(entries, day).map((s) => (
              <div key={s.key}>
                <h3 className="track-group">{s.label}</h3>
                {s.entries.map(row)}
              </div>
            ))
            : choreRooms(chores).map((r) => (
              <div key={r.room ?? '—'}>
                <h3 className="track-group">{r.room ?? 'No room'}</h3>
                {r.chores.map((c) => row(entries.find((e) => e.chore.id === c.id)!))}
              </div>
            ))}
        </>
      )}

      {/* One add on the page: the round + (CALM-01). Elsewhere the row stays. */}
      {!onPage && <button className="track-add" onClick={() => setSheet('new')}><PlusGlyph />Add a chore</button>}
      {fold === 'packs' && (
        <PlainSheet title="Starter packs" onClose={closeFold}><Packs householdId={householdId} chores={chores} onAdded={closeFold} /></PlainSheet>
      )}
      {fold === 'holiday' && (
        <PlainSheet title="Holiday, light days and a daily limit" onClose={closeFold}><HolidayFold profileId={profileId} chores={chores} prefs={prefs} today={today} /></PlainSheet>
      )}
      {fold === 'names' && (
        <PlainSheet title="Names in the household" onClose={closeFold}>
          <Names householdId={householdId} userId={userId} members={members} online={online} profileName={profile?.name ?? ''} />
        </PlainSheet>
      )}

      {onPage && <button type="button" className="fab" aria-label="Add a chore" onClick={() => setSheet('new')}>+</button>}
      {sheet && (
        <ChoreSheet householdId={householdId} chore={sheet === 'new' ? null : sheet} chores={chores} members={members} userId={userId}
          today={today} nextOrder={nextSortOrder(chores)} onClose={() => setSheet(null)} />
      )}
    </section>
  )
}

function ChoreRow({ chore: c, state: st, logs, day, today, held, nameOf, open, onToggle, onTick, onEdit, onMove, canUp, canDown, onDelete }: {
  chore: Chore
  state: ChoreState
  logs: ChoreLog[]
  day: string
  today: string
  held: boolean
  nameOf: (id: string | null) => string
  open: boolean
  onToggle: () => void
  onTick: () => void
  onEdit: () => void
  onMove: (dir: -1 | 1) => void
  canUp: boolean
  canDown: boolean
  onDelete: () => void
}) {
  const status = choreStatus(c, st, day)
  const fill = duenessFill(c, st)
  const last = [...logs].filter((l) => !l.deleted_at && l.done_on <= day).sort((a, b) => b.done_on.localeCompare(a.done_on))[0]
  const who = choreAssignee(c, day, logs).map(nameOf).filter(Boolean)
  // One quiet line (CALM-06): how due it is, where, and whose turn; the
  // schedule, the minutes and who did it last are in the opened row.
  const line = [
    `${status.text}${held ? ' · waits for another day' : ''}`, c.room,
    who.length ? (c.rotation !== 'none' && c.assignees.length > 1 ? `${who.join(', ')}’s turn` : who.join(', ')) : null,
  ].filter(Boolean).join(' · ')
  const facts = [choreScheduleText({ ...c, paused: false }, today), c.minutes ? `${c.minutes} min` : null,
    lastDoneText(last?.done_on ?? null, last ? nameOf(last.done_by) : null, day)].filter(Boolean).join(' · ')

  return (
    <div className={`track-item${open ? ' is-open' : ''}`}>
      <div className={`track-row chore-row${st.doneToday ? ' is-done' : ''}${st.paused ? ' is-off' : ''}`}>
        <div className="track-text">
          <div className="row-name">
            <button type="button" onClick={onToggle} aria-expanded={open}>{c.name}</button>
            {hasNote(c.note) && <span className="row-notemark" aria-label="Has a note"> ▤</span>}
          </div>
          <div className="chore-status">
            <span className={`chore-bar tone-${status.tone}`} aria-hidden="true"><i style={{ width: `${Math.round(fill * 100)}%` }} /></span>
            <span className="row-meta chore-words">{line}</span>
          </div>
        </div>
        <div className="track-right">
          <button className="tick" aria-pressed={st.doneToday} aria-label={`${c.name}, ${st.doneToday ? 'done' : 'not done'}`} onClick={onTick}>
            {st.doneToday && <TickGlyph />}
          </button>
          <button type="button" className="track-more" aria-label={`More for ${c.name}`} aria-expanded={open} onClick={onToggle}>⋮</button>
        </div>
      </div>
      {open && (
        <div className="track-open">
          <p className="hist-kept">{facts}</p>
          <div className="track-actions">
            <button type="button" className="btn" onClick={onEdit}>Edit</button>
            <button type="button" className="btn" onClick={() => void saveChore({ ...c, paused: !c.paused }, ['paused'])}>{c.paused ? 'Resume' : 'Pause'}</button>
            <button type="button" className="btn" disabled={!canUp} onClick={() => onMove(-1)}>Move up</button>
            <button type="button" className="btn" disabled={!canDown} onClick={() => onMove(1)}>Move down</button>
            <button type="button" className="btn" onClick={onDelete}>Delete</button>
          </div>
          {hasNote(c.note) && <ChoreNote chore={c} />}
          <ChoreHistory logs={logs} nameOf={nameOf} />
        </div>
      )}
    </div>
  )
}

/** The chore's note, its checklist tickable here. The ticks are the
 *  household's (everyone sees them), and they clear when the chore is done. */
function ChoreNote({ chore: c }: { chore: Chore }) {
  const blocks = parseNote(c.note)
  return (
    <div className="track-checks">
      {blocks.map((b, i) => b.kind === 'list' ? (
        <ul key={i} className="np-list">
          {b.items.map((it) => (
            <li key={it.line} className={`np-item${it.done ? ' is-done' : ''}`} style={it.depth ? { marginLeft: it.depth * 22 } : undefined}>
              {it.kind === 'check' ? (
                <label className="np-check">
                  <input type="checkbox" checked={it.done} onChange={() => void saveChore({ ...c, note: toggleCheck(c.note ?? '', it.line) }, ['note'])} />
                  <span className="np-words">{it.spans.map((s) => s.text).join('')}</span>
                </label>
              ) : <span className="np-words">• {it.spans.map((s) => s.text).join('')}</span>}
            </li>
          ))}
        </ul>
      ) : b.kind === 'heading' ? <p key={i} className="track-note"><b>{b.spans.map((s) => s.text).join('')}</b></p>
        : <p key={i} className="track-note">{b.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')}</p>)}
    </div>
  )
}

function ChoreHistory({ logs, nameOf }: { logs: ChoreLog[]; nameOf: (id: string | null) => string }) {
  const done = logs.filter((l) => !l.deleted_at).sort((a, b) => b.done_on.localeCompare(a.done_on)).slice(0, 8)
  if (!done.length) return <p className="hist-kept">Not done yet.</p>
  return (
    <div>
      <p className="hist-kept">Done lately</p>
      <ul className="chore-hist">
        {done.map((l) => <li key={l.id}>{shortDate(l.done_on)}{l.done_by ? ` · ${nameOf(l.done_by)}` : ''}</li>)}
      </ul>
    </div>
  )
}

/** Chores from before version 16 were records with a name and a label. They
 *  are brought over as real chores on request, then kept out of the way
 *  (Undo puts them back); nothing is lost. */
function OldChores({ records, householdId, nextOrder, today }: { records: ModuleRecord[]; householdId: string; nextOrder: number; today: string }) {
  async function bring() {
    const made: Chore[] = []
    let order = nextOrder
    for (const r of records) {
      const c = choreFromRecord(r.data ?? {}, today)
      if (!c) continue
      made.push(await saveChore(blankChore(householdId, {
        name: c.name, mode: 'fixed', rule: c.rule ?? 'weekly', rule_config: c.rule_config ?? {}, note: c.note, start_date: today, sort_order: order++,
      })))
      await edit('module_record', r, { deleted_at: new Date().toISOString() })
    }
    offerUndo(`${made.length} chores brought over`, async () => {
      for (const c of made) await deleteChore(c)
      for (const r of records) await edit('module_record', r, { deleted_at: null })
    })
  }
  return (
    <div className="chore-fold chore-old">
      <p className="tp-title">{records.length} {records.length === 1 ? 'chore' : 'chores'} from the old Household list</p>
      <p className="tp-empty">They had a label but no real schedule. Bring them over as chores that come round, are shared with the household and reach Today.</p>
      <div className="track-actions"><button type="button" className="btn btn-primary" onClick={() => void bring()}>Bring them over</button></div>
    </div>
  )
}

/** Starter packs (HSE-10): every chore of the pack listed and ticked; the
 *  person unticks what they do not need, then adds the rest. */
function Packs({ householdId, chores, onAdded }: { householdId: string; chores: Chore[]; onAdded?: () => void }) {
  const [pack, setPack] = useState<StarterPack | null>(null)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  if (!pack) {
    return (
      <div className="chore-packs">
        {STARTER_PACKS.map((p) => (
          <button key={p.key} type="button" className="chore-pack" onClick={() => { setPack(p); setOff(new Set()) }}>
            <span className="tp-name">{p.name}</span>
            <span className="tp-sum">{p.about} {p.chores.length} chores.</span>
          </button>
        ))}
      </div>
    )
  }
  const toAdd = packChoresToAdd(pack, chores)
  async function add() {
    setBusy(true)
    const made: Chore[] = []
    let order = nextSortOrder(chores)
    for (const pc of toAdd) {
      if (off.has(pc.name + pc.room)) continue
      made.push(await saveChore(blankChore(householdId, {
        name: pc.name, room: pc.room, mode: pc.mode, rule: pc.mode === 'fixed' ? pc.rule ?? 'weekly' : null, rule_config: pc.rule_config ?? {},
        every_days: pc.every_days ?? null, minutes: pc.minutes ?? null, start_date: format(new Date(), 'yyyy-MM-dd'), sort_order: order++,
      })))
    }
    setBusy(false)
    setPack(null)
    if (made.length) offerUndo(`${made.length} chores added`, async () => { for (const c of made) await deleteChore(c) })
    if (made.length) onAdded?.()
  }
  return (
    <div className="chore-packs">
      <p className="tp-title">{pack.name}: untick what you do not need</p>
      {toAdd.length === 0 && <p className="tp-empty">Every chore of this pack is in the household already.</p>}
      <ul className="tp-list">
        {toAdd.map((pc) => {
          const k = pc.name + pc.room
          return (
            <li key={k}>
              <button type="button" className="tp-item ri-item" aria-pressed={!off.has(k)}
                onClick={() => { const n = new Set(off); if (n.has(k)) n.delete(k); else n.add(k); setOff(n) }}>
                <span className="ri-box" aria-hidden="true">{off.has(k) ? '' : '✓'}</span>
                <span className="tp-name">{pc.name} <span className="tp-sum">· {pc.room} · {pc.mode === 'fixed' ? 'on set days' : pc.mode === 'after' ? `${pc.every_days} days after last done` : `about every ${pc.every_days} days`}</span></span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="track-actions">
        <button type="button" className="btn btn-primary" disabled={busy || toAdd.length - off.size <= 0} onClick={() => void add()}>
          Add {toAdd.filter((pc) => !off.has(pc.name + pc.room)).length} chores
        </button>
        <button type="button" className="btn" onClick={() => setPack(null)}>Back</button>
      </div>
    </div>
  )
}

/** A holiday for every chore (HSE-08), the person's light days and a daily
 *  limit for flexible chores (HSE-09). */
function HolidayFold({ profileId, chores, prefs, today }: { profileId: string; chores: Chore[]; prefs: ChorePrefs; today: string }) {
  const away = chores.find((c) => c.paused_until && c.paused_until >= today)
  const [from, setFrom] = useState(away?.paused_from ?? today)
  const [until, setUntil] = useState(away?.paused_until ?? '')
  const save = (p: ChorePrefs) => saveChorePrefs(profileId, p)
  return (
    <div className="chore-fold">
      <p className="tp-title">Holiday</p>
      <p className="tp-empty">Pauses every chore for everyone in the household; what falls due meanwhile is let go.</p>
      <div className="supp-slot-row">
        <label className="chore-date">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="chore-date">Until <input type="date" value={until} min={from} onChange={(e) => setUntil(e.target.value)} /></label>
      </div>
      <div className="track-actions">
        <button type="button" className="btn btn-primary" disabled={!until || until < from || !chores.length}
          onClick={async () => {
            const before = chores.map((c) => ({ ...c }))
            await pauseAll(chores, from || today, until)
            offerUndo('Holiday set', async () => { for (const c of before) await saveChore(c, ['paused_from', 'paused_until']) })
          }}>{away ? 'Change the holiday' : 'Pause every chore'}</button>
        {away && <button type="button" className="btn" onClick={() => void pauseAll(chores, null, null)}>End the holiday</button>}
      </div>
      {away && <p className="chore-note">Paused until {shortDate(away.paused_until!)}.</p>}

      <p className="tp-title">Light days</p>
      <p className="tp-empty">Days with no flexible chores for you. Chores on set days still come.</p>
      <div className="track-choices" role="group" aria-label="Light days">
        {WEEK_ORDER.map((d) => (
          <button key={d} type="button" className="track-choice" aria-pressed={prefs.light_days.includes(d)}
            onClick={() => void save({ ...prefs, light_days: prefs.light_days.includes(d) ? prefs.light_days.filter((x) => x !== d) : [...prefs.light_days, d].sort() })}>
            {dayName(d)}
          </button>
        ))}
      </div>
      <div className="ts-field">
        <span className="ts-field-name">Flexible chores a day, at most</span>
        <Dropdown label="Flexible chores a day, at most" value={prefs.cap == null ? 'none' : String(prefs.cap)}
          options={[{ value: 'none', label: 'No limit' }, ...[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: String(n), label: String(n) }))]}
          onChange={(v) => void save({ ...prefs, cap: v === 'none' ? null : Number(v) })} />
      </div>
    </div>
  )
}

/** Names in the household (HSE-07): each member names themselves; the
 *  name shows on the chores they are given and the ones they did. */
function Names({ householdId, userId, members, online, profileName }: { householdId: string; userId: string | null; members: Member[]; online: boolean; profileName: string }) {
  const navigate = useNavigate()
  const mine = members.find((m) => m.user_id === userId)?.display_name ?? ''
  const [name, setName] = useState(mine)
  const [msg, setMsg] = useState<string | null>(null)
  if (!userId) return null
  return (
    <div className="chore-fold">
      <label className="chore-name">Your name in the household
        <input className="serif" value={name} onChange={(e) => setName(e.target.value)} placeholder={profileName || 'Sam'} maxLength={40} />
      </label>
      <div className="track-actions">
        <button type="button" className="btn btn-primary" disabled={!cleanMemberName(name) || name.trim() === mine}
          onClick={async () => {
            const r = await setMyMemberName(householdId, userId, cleanMemberName(name))
            setMsg(r === 'saved' ? 'Saved. Everyone in the household sees it.' : 'Kept on this phone; it is sent as soon as there is a connection.')
          }}>Save my name</button>
      </div>
      {msg && <p className="chore-note" role="status">{msg}</p>}
      <p className="tp-title">Members</p>
      {members.length === 0 ? (
        <p className="tp-empty">{online ? 'Loading the members…' : 'The members show once there is a connection.'}</p>
      ) : (
        <ul className="chore-hist">{members.map((m) => <li key={m.user_id}>{memberName(members, m.user_id, userId)}{m.user_id === userId ? ' (you)' : ''}{m.role === 'owner' ? ' · owner' : ''}</li>)}</ul>
      )}
      <p className="tp-empty">
        {members.length <= 1
          ? 'Only you so far. Invite the people you live with and the chores, the cupboard and the shopping list are shared with them.'
          : 'Invite someone else, or leave the household, under Settings, Household.'}
      </p>
      <div className="track-actions">
        <button type="button" className="btn" onClick={() => navigate('/more?section=Profile&find=Household')}>
          {members.length <= 1 ? 'Invite someone' : 'Household settings'}
        </button>
      </div>
    </div>
  )
}

/** Make or change a chore. */
export function ChoreSheet({ householdId, chore, chores, members, userId, today, nextOrder, onClose }: {
  householdId: string
  chore: Chore | null
  chores: Chore[]
  members: Member[]
  userId: string | null
  today: string
  nextOrder: number
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Chore>(() => chore ?? blankChore(householdId, { start_date: today, sort_order: nextOrder, rule: 'weekly', rule_config: {} }))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Chore>(k: K, v: Chore[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const start = draft.start_date ?? today
  const rooms = useMemo(() => [...new Set([...roomsIn(chores), 'Kitchen', 'Bathroom', 'Living room', 'Bedroom', 'Garden'])], [chores])
  // One repeat control (GEN-22): on set days, or after / about every few days.
  const repeat: RepeatValue = repeatOfChore(draft)
  const people = members.length ? members : userId ? [{ user_id: userId, display_name: null }] : []
  const moreSummary = [
    chore && draft.start_date && draft.start_date > today ? `from ${draft.start_date}` : null,
    draft.minutes ? `${draft.minutes} min` : null,
    draft.time_of_day ? `at ${draft.time_of_day.slice(0, 5)}` : null,
    draft.note ? 'note' : null,
    draft.paused ? 'paused' : null,
  ].filter(Boolean).join(' · ') || null
  const [moreSet] = useState(() => !!(chore && (chore.minutes || chore.time_of_day || chore.note || chore.paused)))

  async function save() {
    const every = Math.floor(Number(draft.every_days ?? 7))
    if (draft.end_date && draft.end_date < start) return setError('The last day is before the first.')
    if (draft.paused_until && draft.paused_from && draft.paused_until < draft.paused_from) return setError('The pause ends before it starts.')
    const name = cleanName(draft.name)
    if (!name) return setError('A chore needs a name.')
    const row: Chore = {
      ...draft, name: name.slice(0, 120), room: draft.room?.trim().slice(0, 40) || null, start_date: start,
      rule: draft.mode === 'fixed' ? draft.rule ?? 'weekly' : null, rule_config: draft.mode === 'fixed' ? draft.rule_config ?? {} : {},
      every_days: draft.mode === 'fixed' ? null : every,
      rotation: draft.assignees.length > 1 ? draft.rotation : 'none',
    }
    const changed = chore ? CHORE_FIELDS.filter((f) => JSON.stringify(row[f] ?? null) !== JSON.stringify(chore[f] ?? null)) : undefined
    await saveChore(row, changed)
    onClose()
  }

  return (
    <TrackSheet label={chore ? 'Edit chore' : 'New chore'} onClose={onClose} onSubmit={() => void save()}>
      <div className="two">
        <label>Name
          <input className="serif" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Clean the bathroom" autoFocus={!chore} maxLength={120} />
        </label>
        <label>Room
          <input value={draft.room ?? ''} onChange={(e) => set('room', e.target.value || null)} placeholder="Bathroom" list="chore-rooms" maxLength={40} />
          <datalist id="chore-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
        </label>
      </div>
      <RepeatPicker value={repeat} start={start} today={today} kinds={[...CHORE_KINDS]} allowNone={false} loose
        onChange={(v) => setDraft((d) => ({ ...d, ...choreOfRepeat(v) }))} />
      <div className="two">
        <label>Starts on
          <input type="date" value={start} onChange={(e) => set('start_date', e.target.value || today)} />
        </label>
        <label>Minutes it takes
          <input type="number" inputMode="numeric" min={0} max={1440} value={draft.minutes ?? ''} onChange={(e) => set('minutes', e.target.value === '' ? null : Math.max(0, Math.min(1440, Math.round(Number(e.target.value)))))} />
        </label>
      </div>
      <label>At a time (optional)
        <input type="time" value={draft.time_of_day?.slice(0, 5) ?? ''} onChange={(e) => set('time_of_day', e.target.value || null)} />
      </label>
      {people.length > 0 && (
        <div className="ts-field">
          <span className="ts-field-name">Who does it</span>
          <div className="track-choices" role="group" aria-label="Who does it">
            {people.map((m) => (
              <button key={m.user_id} type="button" className="track-choice" aria-pressed={draft.assignees.includes(m.user_id)}
                onClick={() => set('assignees', draft.assignees.includes(m.user_id) ? draft.assignees.filter((x) => x !== m.user_id) : [...draft.assignees, m.user_id])}>
                {memberName(people, m.user_id, userId)}
              </button>
            ))}
          </div>
          {!draft.assignees.length && <span className="row-meta">Nobody chosen: anyone can do it.</span>}
        </div>
      )}
      {draft.assignees.length > 1 && (
        <Choices label="Taking turns" value={draft.rotation} onChange={(r) => set('rotation', r)}
          options={[{ value: 'none', label: 'All of them' }, { value: 'each_time', label: 'Each time' }, { value: 'each_week', label: 'Each week' }, { value: 'least_recent', label: 'Whoever did it longest ago' }]} />
      )}
      {/* What makes the chore is above; the rest waits here (CALM-08). */}
      <MoreOptions open={moreSet} summary={moreSummary}>
      <div className="two">
        <label>Starts on
          <input type="date" value={start} onChange={(e) => set('start_date', e.target.value || today)} />
        </label>
        <label>Minutes it takes
          <input type="number" inputMode="numeric" min={0} max={1440} value={draft.minutes ?? ''} onChange={(e) => set('minutes', e.target.value === '' ? null : Math.max(0, Math.min(1440, Math.round(Number(e.target.value)))))} />
        </label>
      </div>
      <label>At a time (optional)
        <input type="time" value={draft.time_of_day?.slice(0, 5) ?? ''} onChange={(e) => set('time_of_day', e.target.value || null)} />
      </label>
      <NoteEditor label="Note" value={draft.note ?? ''} onChange={(t) => set('note', t || null)} afterDone={false} context={{ day: today, title: draft.name }} />
      <SwitchRow label="Paused" hint="Kept, but it does not come round until resumed." on={draft.paused} onChange={(v) => set('paused', v)} />
      </MoreOptions>
      {error && <p className="track-error" role="alert">{error}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!draft.name.trim()}>Save</button>
      </div>
    </TrackSheet>
  )
}
