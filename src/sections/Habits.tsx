import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { Habit, HabitLog } from '../lib/types'
import { addHabit, archiveHabit, moduleEnabled, renameHabit, toggleHabit } from '../lib/tracking'
import {
  SCHEDULES, SCHEDULE_LABEL, currentStreak, doneDays, doneThisWeek, isScheduled, pickLog, streakText,
  type HabitSchedule,
} from '../lib/tracking-rules'
import './tracking.css'

/** The day's habits on Today's Body tab: a tick for the day, the current run
 *  as a plain number, an inline add, rename and archive. Nothing here
 *  celebrates a run; the number is reported, not praised. */
export function Habits({ profileId, day }: { profileId: string; day: string }) {
  const data = useLiveQuery(async () => {
    if (!(await moduleEnabled(profileId, 'habits'))) return null
    const habits = (await db.habit.where('profile_id').equals(profileId).toArray())
      .filter((h) => h.active && !h.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    const logs = habits.length
      ? await db.habit_log.where('habit_id').anyOf(habits.map((h) => h.id)).toArray()
      : []
    return { habits, logs }
  }, [profileId])

  const [editing, setEditing] = useState<string | null>(null)

  // Still loading, or the module is switched off: nothing is shown either way.
  if (!data) return null
  const { habits, logs } = data

  return (
    <section aria-labelledby="habits-title">
      <h2 className="section-title" id="habits-title">Habits</h2>
      {habits.length === 0 && <p className="empty">Add a habit below to tick it off each day.</p>}
      {habits.map((h) => editing === h.id
        ? <HabitEdit key={h.id} habit={h} onDone={() => setEditing(null)} />
        : <HabitRow key={h.id} habit={h} logs={logs.filter((l) => l.habit_id === h.id)} day={day}
            onEdit={() => setEditing(h.id)} />)}
      <HabitAdd profileId={profileId} />
    </section>
  )
}

function HabitRow({ habit, logs, day, onEdit }: { habit: Habit; logs: HabitLog[]; day: string; onEdit: () => void }) {
  const today = pickLog(logs.filter((l) => l.log_date === day))
  const done = !!today?.done
  const days = doneDays(logs)
  const due = isScheduled(habit.schedule, day)
  const streak = currentStreak(habit.schedule, days, day)

  const meta = [
    SCHEDULE_LABEL[habit.schedule],
    !due ? 'not due today' : null,
    habit.schedule === 'weekly' && !done && doneThisWeek(days, day) ? 'done this week' : null,
    streakText(habit.schedule, streak),
  ].filter(Boolean).join(' · ')

  return (
    <div className={`track-row${done ? ' is-done' : ''}${!due && !done ? ' is-off' : ''}`}>
      <div>
        <div className="row-name"><button onClick={onEdit} title="Rename or archive">{habit.name}</button></div>
        <div className="row-meta">{meta}</div>
      </div>
      <div className="track-right">
        <button className="tick" aria-pressed={done} aria-label={`${habit.name}, ${done ? 'done' : 'not done'}`}
          onClick={() => void toggleHabit(habit.id, day)}>
          {done && <TickGlyph />}
        </button>
      </div>
    </div>
  )
}

function HabitEdit({ habit, onDone }: { habit: Habit; onDone: () => void }) {
  const [name, setName] = useState(habit.name)
  const [confirm, setConfirm] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await renameHabit(habit, name)
    onDone()
  }

  return (
    <form className="track-form" onSubmit={save}>
      <div className="fields">
        <input className="name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Habit name" autoFocus />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Save</button>
      </div>
      <div className="actions">
        {confirm ? (
          <>
            <span className="row-meta">Archive it? Its past ticks are kept.</span>
            <button type="button" className="btn warn grow" onClick={async () => { await archiveHabit(habit); onDone() }}>Archive</button>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => setConfirm(true)}>Archive</button>
            <button type="button" className="btn grow" onClick={onDone}>Cancel</button>
          </>
        )}
      </div>
    </form>
  )
}

function HabitAdd({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState<HabitSchedule>('daily')

  if (!open) {
    return (
      <button className="track-add" onClick={() => setOpen(true)}>
        <PlusGlyph />Add a habit
      </button>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!(await addHabit(profileId, name, schedule))) return
    // The form stays open for the next one; most people add a few at once.
    setName('')
  }

  return (
    <form className="track-form" onSubmit={submit}>
      <div className="fields">
        <input className="name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Mobility" aria-label="Habit name" autoFocus />
        <select value={schedule} onChange={(e) => setSchedule(e.target.value as HabitSchedule)} aria-label="How often">
          {SCHEDULES.map((s) => <option key={s} value={s}>{SCHEDULE_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Add</button>
        <button type="button" className="btn grow" onClick={() => { setOpen(false); setName('') }}>Done</button>
      </div>
    </form>
  )
}

/** The row tick, drawn at the weight of the other row glyphs. */
export function TickGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6.5 4.8 9.2 10 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PlusGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
