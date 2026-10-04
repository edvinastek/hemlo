import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { loadReview, reviewSettings, reviewTask, setReviewTime, DEFAULT_REVIEW_TIME } from '../lib/review'
import {
  addDays, canPick, carriedNote, earliestPick, limitNote, reviewOpen, summaryLine, tomorrowFor,
  type ReviewAction,
} from '../lib/review-rules'
import { db } from '../lib/db'
import { planToday } from '../lib/day-edge'
import { flexibleSeriesIds } from '../lib/series'
import { carryOver } from '../lib/day-items-rules'
import { carry, type CarryAction } from '../lib/rail-actions'
import { TaskSheet } from '../ui/TaskSheet'
import { CloseDay } from './CloseDay'
import { MoreMenu } from '../ui/MoreMenu'
import { offerUndo } from '../ui/Undo'
import type { Task } from '../lib/types'
import './review.css'

/** A clock that moves twice a minute, so the compact line appears at the review
 *  time without the person having to leave and come back. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** The evening review of what is still open. Compact at the top of Today: one
 *  line after the review time, which opens into the list. Full on the Night
 *  tab: always the list, and the review time for this device. */
export function ReviewCard({ profileId, day, variant }: { profileId: string; day: string; variant: 'compact' | 'full' }) {
  const persona = useApp((s) => s.profile?.ai_persona_name ?? null)
  const now = useNow()
  const today = planToday(now)
  const [open, setOpen] = useState(false)

  const tasks = useLiveQuery(() => loadReview(profileId, day), [profileId, day], null)
  const settings = useLiveQuery(() => reviewSettings(), [], null)

  // A different day is a different review; do not carry the open state over.
  useEffect(() => { setOpen(false) }, [day])

  if (!tasks || !settings) return null

  if (variant === 'compact') {
    if (!reviewOpen(day, now, settings.time, today) || tasks.length === 0) return null
    return (
      <section className="review review-compact" aria-label="Evening review">
        <button className="assistant review-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {persona ? `${persona}: ` : ''}{summaryLine(tasks, day, today)}
          <span className="review-toggle">{open ? 'Hide' : 'Review'}</span>
        </button>
        {/* Close the day first, in sight: the whole day in one go (TOD-23). */}
        {open && day === today && <CloseDayButton profileId={profileId} day={day} />}
        {open && <ReviewList tasks={tasks} day={day} today={today} />}
      </section>
    )
  }

  return (
    <section className="review review-full" aria-label="Evening review">
      <h2 className="section-title">Review</h2>
      {tasks.length === 0
        ? <p className="empty">Nothing left to review.</p>
        : <>
          {day === today && <CloseDayButton profileId={profileId} day={day} />}
          <ReviewList tasks={tasks} day={day} today={today} />
        </>}
      <ReviewTimeControl time={settings.time} />
    </section>
  )
}

function ReviewList({ tasks, day, today }: { tasks: Task[]; day: string; today: string }) {
  const [editing, setEditing] = useState<Task | null>(null)
  return (
    <>
      <ul className="review-list">
        {tasks.map((t) => (
          <ReviewItem key={t.id} task={t} day={day} today={today} onEdit={setEditing} />
        ))}
      </ul>
      {editing && <TaskSheet task={editing} isNew={false} onClose={() => setEditing(null)} />}
    </>
  )
}

function ReviewItem({ task, day, today, onEdit }: {
  task: Task; day: string; today: string; onEdit: (t: Task) => void
}) {
  const [picking, setPicking] = useState(false)
  const [to, setTo] = useState(() => tomorrowFor(task, day, today))
  const [busy, setBusy] = useState(false)

  const flag = limitNote(task)
  const meta = [
    task.planned_time?.slice(0, 5),
    task.duration_min ? `${task.duration_min} min` : null,
    task.category,
    carriedNote(task, day, today),
  ].filter(Boolean).join(' · ')

  // One action at a time per task, so a double tap cannot move it two days.
  async function act(action: ReviewAction) {
    if (busy) return
    setBusy(true)
    try {
      await reviewTask(task, action, day)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`review-item${flag ? ' is-flagged' : ''}`}>
      <div className="row-name">
        <button onClick={() => onEdit(task)}>{task.title || 'Untitled'}</button>
      </div>
      {meta && <div className="row-meta">{meta}</div>}
      {flag && <div className="review-note">{flag}</div>}

      {/* The two everyday answers as chips; the rest in the ⋮ (CALM-06). */}
      <div className="review-actions">
        <button className="chip" disabled={busy} onClick={() => void act({ kind: 'tomorrow' })}>Tomorrow</button>
        <button className="chip" disabled={busy} onClick={() => void act({ kind: 'done' })}>Done</button>
        <MoreMenu label={`More for ${task.title || 'this task'}`} items={[
          { label: picking ? 'Close the day picker' : 'Pick a day…', disabled: busy, onSelect: () => setPicking((p) => !p) },
          { label: 'Drop', danger: true, disabled: busy, onSelect: () => void act({ kind: 'drop' }) },
        ]} />
      </div>

      {picking && (
        <form className="review-pick" onSubmit={(e) => {
          e.preventDefault()
          if (canPick(to, today)) void act({ kind: 'pick', to })
        }}>
          <label>
            <span>Move to</span>
            <input type="date" value={to} min={earliestPick(today)} required
              onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy || !canPick(to, today)}>Move</button>
        </form>
      )}
    </li>
  )
}

/** Close the day (TOD-23) at review time: today's leftovers to tomorrow or
 *  the Inbox in one go. */
function CloseDayButton({ profileId, day }: { profileId: string; day: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="review-close">
        <button type="button" className="btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>Close the day…</button>
      </div>
      {open && <CloseDay profileId={profileId} day={day} onClose={() => setOpen(false)} />}
    </>
  )
}

function ReviewTimeControl({ time }: { time: string }) {
  return (
    <div className="setting-row review-time">
      <div>
        <div className="row-name">Review time</div>
        <div className="row-meta">After this time, Today offers the review. For this device only.</div>
      </div>
      <input className="btn" type="time" value={time} aria-label="Review time"
        onChange={(e) => void setReviewTime(e.target.value || DEFAULT_REVIEW_TIME)} />
    </div>
  )
}

/* ---------- carry-over (TOD-03) ----------------------------------------------- */

const CARRY_WORDS: Record<CarryAction, string> = {
  today: 'moved to today', tomorrow: 'moved to tomorrow', pick: 'moved', inbox: 'sent to the Inbox', done: 'marked done', drop: 'dropped',
}
const plural = (n: number) => (n === 1 ? '1 task' : `${n} tasks`)

/** Unfinished tasks from earlier days, in one row at the top of Today that
 *  opens into the list. Each can go to today or tomorrow with one tap, and
 *  from its ⋮ to a day picked or the Inbox, or be marked done or dropped;
 *  all of them at once from the card's ⋮. Every choice can be undone for a
 *  few seconds. The evening review stays as it
 *  was; this is the same decision, offered in the morning too. */
export function CarryOverRow({ profileId, today }: { profileId: string; today: string }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [busy, setBusy] = useState(false)
  const tasks = useLiveQuery(async () => {
    const rows = await db.task.where('[profile_id+planned_date]')
      .between([profileId, ''], [profileId, addDays(today, -1)], true, true).toArray()
    return carryOver(rows, today, await flexibleSeriesIds(profileId))
  }, [profileId, today], null)

  if (!tasks || tasks.length === 0) return null

  async function run(list: Task[], action: CarryAction, to?: string) {
    if (busy || list.length === 0) return
    setBusy(true)
    try {
      const undo = await carry(list, action, today, to)
      const what = list.length === 1 ? (list[0].title || 'Task') : plural(list.length)
      offerUndo(`${what} ${CARRY_WORDS[action]}`, undo)
    } finally { setBusy(false) }
  }

  const undated = tasks.filter((t) => !t.series_id)
  return (
    <section className="carry" aria-label="Left from earlier days">
      <div className="carry-top">
        <button type="button" className="carry-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="carry-count">{tasks.length}</span>
          <span className="carry-title">{tasks.length === 1 ? 'task left from earlier days' : 'tasks left from earlier days'}</span>
          <span className="carry-toggle">{open ? 'Hide' : 'Show'}</span>
        </button>
        {/* All of them at once: in the card's ⋮, not a row of chips. */}
        {tasks.length > 1 && (
          <MoreMenu className="carry-more" label="All tasks left from earlier days" items={[
            { label: 'All to today', disabled: busy, onSelect: () => void run(tasks, 'today') },
            { label: 'All to tomorrow', disabled: busy, onSelect: () => void run(tasks, 'tomorrow') },
            undated.length > 0 && {
              label: `All to the Inbox${undated.length < tasks.length ? ` (${undated.length})` : ''}`,
              disabled: busy, onSelect: () => void run(undated, 'inbox'),
            },
            { label: 'Drop all', danger: true, disabled: busy, onSelect: () => void run(tasks, 'drop') },
          ]} />
        )}
      </div>
      {open && (
        <ul className="review-list">
          {tasks.map((t) => <CarryItem key={t.id} task={t} today={today} busy={busy} onRun={run} onEdit={setEditing} />)}
        </ul>
      )}
      {editing && <TaskSheet task={editing} isNew={false} onClose={() => setEditing(null)} />}
    </section>
  )
}

function CarryItem({ task, today, busy, onRun, onEdit }: {
  task: Task; today: string; busy: boolean
  onRun: (list: Task[], action: CarryAction, to?: string) => Promise<void>
  onEdit: (t: Task) => void
}) {
  const [picking, setPicking] = useState(false)
  const [to, setTo] = useState(() => addDays(today, 1))
  const flag = limitNote(task)
  const meta = [
    task.planned_time?.slice(0, 5),
    task.duration_min ? `${task.duration_min} min` : null,
    task.category,
    carriedNote(task, today, today),
  ].filter(Boolean).join(' · ')
  return (
    <li className={`review-item${flag ? ' is-flagged' : ''}`}>
      <div className="row-name"><button onClick={() => onEdit(task)}>{task.title || 'Untitled'}</button></div>
      {meta && <div className="row-meta">{meta}</div>}
      {flag && <div className="review-note">{flag}</div>}
      {/* Today and Tomorrow as chips; the rest in the ⋮ (CALM-06). */}
      <div className="review-actions">
        <button className="chip" disabled={busy} onClick={() => void onRun([task], 'today')}>Today</button>
        <button className="chip" disabled={busy} onClick={() => void onRun([task], 'tomorrow')}>Tomorrow</button>
        <MoreMenu label={`More for ${task.title || 'this task'}`} items={[
          { label: picking ? 'Close the day picker' : 'Pick a day…', disabled: busy, onSelect: () => setPicking((p) => !p) },
          // A repeating task keeps its day in its series; it cannot go undated.
          !task.series_id && { label: 'Send to the Inbox', disabled: busy, onSelect: () => void onRun([task], 'inbox') },
          { label: 'Mark done', disabled: busy, onSelect: () => void onRun([task], 'done') },
          { label: 'Drop', danger: true, disabled: busy, onSelect: () => void onRun([task], 'drop') },
        ]} />
      </div>
      {picking && (
        <form className="review-pick" onSubmit={(e) => {
          e.preventDefault()
          if (canPick(to, today)) void onRun([task], 'pick', to).then(() => setPicking(false))
        }}>
          <label>
            <span>Move to</span>
            <input type="date" value={to} min={earliestPick(today)} required onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy || !canPick(to, today)}>Move</button>
        </form>
      )}
    </li>
  )
}
