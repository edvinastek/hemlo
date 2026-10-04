import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useBackClose } from './useBackClose'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { singleMoveWarnings, suggestPushTime, type Warning } from '../lib/reorder-rules'
import { fillTemplate } from '../lib/template-rules'
import { pendingAfterDone, resolveAfterDone } from '../lib/after-done-rules'
import { saveNote, moveTo } from '../lib/rail-actions'
import { PUSH_STEPS, pushWords } from './TaskRow'
import { useModuleDef } from '../modules/defs'
import { listRecords, useLookups, type Rec } from '../modules/records'
import { RecordSheet } from '../modules/RecordSheet'
import { NoteEditor } from './NoteEditor'
import { FollowedSheet } from './FollowedEvents'
import { offerUndo } from './Undo'
import type { CalendarEvent, Task } from '../lib/types'
import './move.css'
import { planToday } from '../lib/day-edge'

/** The small sheets the day's rail opens: a time for an untimed push, Move
 *  to…, "Mark it done?", the note a template asks for after done, and a
 *  record or event opened from the rail. Each is one step, never a sheet on
 *  a sheet (GEN-51), and closes on Back and Escape (CALM-10). */

function Sheet({ label, onClose, children, onSubmit }: {
  label: string; onClose: () => void; children: ReactNode; onSubmit?: (e: FormEvent) => void
}) {
  useBackClose(onClose)
  const Tag = onSubmit ? 'form' : 'div'
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <Tag className="bottom-sheet rail-sheet" role="dialog" aria-modal="true" aria-label={label}
        onSubmit={onSubmit as never} data-no-swipe>
        {children}
      </Tag>
    </>
  )
}

const nowHHMM = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "Push…" from a row's ⋮: 15 min, 30 min or 1 h, one tap each. The open
 *  row has the same three as buttons. */
export function PushPickSheet({ task, onPush, onClose }: { task: Task; onPush: (minutes: number) => void; onClose: () => void }) {
  return (
    <Sheet label={`Push ${task.title || 'task'}`} onClose={onClose}>
      <h2>Push “{task.title || 'this task'}”</h2>
      <div className="rail-pushes" role="group" aria-label="By how long">
        {PUSH_STEPS.map((m, i) => (
          <button key={m} type="button" className="btn" autoFocus={i === 0} onClick={() => onPush(m)}>{pushWords(m)}</button>
        ))}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

/** An untimed task pushed: it asks for a time instead of guessing 09:00. */
export function PushTimeSheet({ task, minutes, onSet, onClose }: {
  task: Task; minutes: number; onSet: (time: string) => void; onClose: () => void
}) {
  const [time, setTime] = useState(() => suggestPushTime(nowHHMM(), minutes))
  return (
    <Sheet label="Give it a time" onClose={onClose} onSubmit={(e) => { e.preventDefault(); if (time) { onSet(time); onClose() } }}>
      <h2>It has no time yet. When should “{task.title || 'this task'}” be?</h2>
      <div className="form-grid">
        <label>
          <span>Time</span>
          <input type="time" value={time} required autoFocus onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary grow" disabled={!time}>Set time</button>
      </div>
    </Sheet>
  )
}

/** Move to… another day, with the same time, a new one, or none. Asks first
 *  when the task is locked or fixed, repeats, or would land in locked work
 *  hours or on top of another task (the same warnings as Plan). */
export function MoveToSheet({ task, today, onClose }: { task: Task; today: string; onClose: () => void }) {
  const profile = useApp((s) => s.profile)
  const [to, setTo] = useState(() => (task.planned_date && task.planned_date >= today ? addOne(task.planned_date) : addOne(today)))
  const [timeMode, setTimeMode] = useState<'keep' | 'new' | 'none'>('keep')
  const [time, setTime] = useState(task.planned_time?.slice(0, 5) ?? '09:00')
  const [warned, setWarned] = useState<Warning[] | null>(null)
  const [busy, setBusy] = useState(false)
  const newTime = timeMode === 'keep' ? task.planned_time?.slice(0, 5) ?? null : timeMode === 'new' ? time : null

  async function go(e: FormEvent) {
    e.preventDefault()
    if (!to || busy || !profile) return
    setBusy(true)
    try {
      if (!warned) {
        const there = (await db.task.where('[profile_id+planned_date]').equals([profile.id, to]).toArray()).filter((t) => !t.deleted_at)
        const w = singleMoveWarnings({ ...task, planned_time: newTime }, task.planned_date ?? today, to, there, readSettings(profile).work)
        if (w.length) { setWarned(w); return }
      }
      const undo = await moveTo(task, to, timeMode === 'keep' ? undefined : newTime)
      offerUndo(`${task.title || 'Task'} moved to ${dayWords(to, today)}`, undo)
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <Sheet label={`Move ${task.title || 'task'}`} onClose={onClose} onSubmit={(e) => void go(e)}>
      <h2>Move “{task.title || 'task'}”</h2>
      <div className="form-grid">
        <label>
          <span>To</span>
          <input type="date" value={to} required onChange={(e) => { setTo(e.target.value); setWarned(null) }} />
        </label>
        <fieldset className="rail-choice">
          <legend>Time</legend>
          {task.planned_time && (
            <label><input type="radio" name="t" checked={timeMode === 'keep'} onChange={() => { setTimeMode('keep'); setWarned(null) }} /> Keep {task.planned_time.slice(0, 5)}</label>
          )}
          {!task.planned_time && (
            <label><input type="radio" name="t" checked={timeMode === 'keep'} onChange={() => { setTimeMode('keep'); setWarned(null) }} /> No time, as now</label>
          )}
          <label><input type="radio" name="t" checked={timeMode === 'new'} onChange={() => { setTimeMode('new'); setWarned(null) }} /> A new time</label>
          {timeMode === 'new' && <input type="time" value={time} aria-label="New time" required onChange={(e) => { setTime(e.target.value); setWarned(null) }} />}
          {task.planned_time && (
            <label><input type="radio" name="t" checked={timeMode === 'none'} onChange={() => { setTimeMode('none'); setWarned(null) }} /> No time</label>
          )}
        </fieldset>
      </div>
      {warned && (
        <ul className="move-warnings" aria-label="Before you move it">
          {warned.map((w, i) => <li key={i} className={`is-${w.kind}`}>{w.text}</li>)}
        </ul>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary grow" disabled={busy || !to}>{warned?.length ? 'Move anyway' : 'Move'}</button>
      </div>
    </Sheet>
  )
}

function addOne(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const x = new Date(y, m - 1, d + 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** "today", "tomorrow", or "Mon 5 Oct". */
export function dayWords(day: string, today: string): string {
  if (day === today) return 'today'
  if (day === addOne(today)) return 'tomorrow'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** The last checklist line was ticked: done now? Never ticks silently (TOD-13). */
export function AskDoneSheet({ title, onYes, onClose }: { title: string; onYes: () => void; onClose: () => void }) {
  const yes = useRef<HTMLButtonElement>(null)
  useEffect(() => { yes.current?.focus() }, [])
  return (
    <Sheet label="Mark it done?" onClose={onClose}>
      <h2>Everything is ticked. Mark “{title || 'it'}” done?</h2>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>Not yet</button>
        <button ref={yes} type="button" className="btn btn-primary grow" onClick={() => { onYes(); onClose() }}>Yes, done</button>
      </div>
    </Sheet>
  )
}

/** A task was ticked and its note waits for a template (NOT-14): the
 *  template opens, filled in for this task; Fill in keeps what was written,
 *  Later asks again next time, Skip lets it go. */
export function AfterDoneSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const profile = useApp((s) => s.profile)
  const id = pendingAfterDone(task.notes)
  const template = readSettings(profile).note_templates.find((t) => t.id === id) ?? null
  const [text, setText] = useState(() => template
    ? fillTemplate(template.body, { day: task.planned_date ?? planToday(), title: task.title, time: task.planned_time })
    : '')
  const [busy, setBusy] = useState(false)

  async function choose(choice: 'fill' | 'skip' | 'later') {
    if (busy) return
    setBusy(true)
    try {
      if (choice !== 'later') {
        const now = (await db.task.get(task.id)) ?? task
        await saveNote(now, resolveAfterDone(now.notes, choice, text) || null)
      }
    } finally { setBusy(false) }
    onClose()
  }

  return (
    <Sheet label={template ? template.name : 'A note after done'} onClose={() => void choose('later')}>
      <h2>{template ? template.name : 'A note after done'}</h2>
      <p className="rail-sheet-why">
        {template ? `For “${task.title || 'this task'}”, now that it is done.` : 'The template this task asked for is no longer there. Write a note, or skip.'}
      </p>
      <NoteEditor value={text} onChange={setText} label="Note" autoFocus />
      <div className="sheet-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void choose('skip')}>Skip</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void choose('later')}>Later</button>
        <button type="button" className="btn btn-primary grow" disabled={busy} onClick={() => void choose('fill')}>Fill in</button>
      </div>
    </Sheet>
  )
}

/** A record or one of the person's own events, opened from the rail in the
 *  module's own sheet; a followed calendar's event in its read-only sheet.
 *  `id` absent: a new one on the day (the + menu). */
export function OpenRecord({ moduleKey, id, day, entityName, onClose }: {
  moduleKey: string; id?: string; day?: string
  /** For a new record: which of the module's kinds (its first by default). */
  entityName?: string
  onClose: () => void
}) {
  const profile = useApp((s) => s.profile)
  const def = useModuleDef(moduleKey)
  const event = useLiveQuery(async () => (moduleKey === 'agenda' && id ? db.calendar_event.get(id) : undefined), [moduleKey, id])
  const rec = useLiveQuery(async () => {
    if (!id || !profile || !def) return null
    const row = moduleKey === 'agenda' ? null : await db.module_record.get(id)
    const entity = def.entities.find((e) => (moduleKey === 'agenda' ? e.table === 'calendar_event' : e.name === row?.entity)) ?? def.entities[0]
    if (!entity) return null
    const all = await listRecords(profile.id, moduleKey, entity)
    return { entity, rec: all.find((r) => r.id === id) ?? null }
  }, [id, profile?.id, def, moduleKey])
  const entity = rec?.entity
    ?? def?.entities.find((e) => (entityName ? e.name === entityName : moduleKey === 'agenda' ? e.table === 'calendar_event' : !e.table))
    ?? def?.entities[0]
  const lookups = useLookups(profile?.id, entity?.fields ?? [])
  // The module's sheet closes on Escape itself; Back is added here (CALM-10).
  useBackClose(onClose, !event?.subscription_id)

  if (event?.subscription_id) return <FollowedSheet event={event as CalendarEvent} onClose={onClose} />
  if (!profile || !def || !entity || (id && rec === undefined)) return null
  if (id && !rec?.rec) return null
  return (
    <RecordSheet def={def} entity={entity} profileId={profile.id} rec={(rec?.rec ?? undefined) as Rec | undefined}
      day={day} lookups={lookups} onClose={onClose} />
  )
}

/** Kinds of record the record sheet can add and edit: those in the shared
 *  store, and the four built-in tables it knows. Others have screens of their own. */
export const SHEET_TABLES = ['calendar_event', 'sleep_log', 'workout_log', 'goal']
