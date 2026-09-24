import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { loadReview, reviewSettings, reviewTask, setReviewTime, DEFAULT_REVIEW_TIME } from '../lib/review'
import {
  canPick, carriedNote, earliestPick, limitNote, localDay, reviewOpen, summaryLine, tomorrowFor,
  type ReviewAction,
} from '../lib/review-rules'
import { TaskSheet } from '../ui/TaskSheet'
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
  const today = localDay(now)
  const [open, setOpen] = useState(false)

  const tasks = useLiveQuery(() => loadReview(profileId, day), [profileId, day], null)
  const settings = useLiveQuery(() => reviewSettings(), [], null)

  // A different day is a different review; do not carry the open state over.
  useEffect(() => { setOpen(false) }, [day])

  if (!tasks || !settings) return null

  if (variant === 'compact') {
    if (!reviewOpen(day, now, settings.time) || tasks.length === 0) return null
    return (
      <section className="review review-compact" aria-label="Evening review">
        <button className="assistant review-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {persona ? `${persona}: ` : ''}{summaryLine(tasks, day, today)}
          <span className="review-toggle">{open ? 'Hide' : 'Review'}</span>
        </button>
        {open && <ReviewList tasks={tasks} day={day} today={today} />}
      </section>
    )
  }

  return (
    <section className="review review-full" aria-label="Evening review">
      <h2 className="section-title">Review</h2>
      {tasks.length === 0
        ? <p className="empty">Nothing left to review.</p>
        : <ReviewList tasks={tasks} day={day} today={today} />}
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

      <div className="review-actions">
        <button className="chip" disabled={busy} onClick={() => void act({ kind: 'tomorrow' })}>Tomorrow</button>
        <button className="chip" disabled={busy} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
          Pick a day
        </button>
        <button className="chip" disabled={busy} onClick={() => void act({ kind: 'done' })}>Done</button>
        <button className="chip" disabled={busy} onClick={() => void act({ kind: 'drop' })}>Drop</button>
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
