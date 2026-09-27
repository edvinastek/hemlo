import type { CSSProperties } from 'react'
import type { Task } from '../lib/types'
import { checklistProgress, hasNote } from '../lib/notes'
import './colours.css'

interface Props {
  task: Task
  onTick: (t: Task) => void
  onPush: (t: Task, minutes: number) => void
  onEdit: (t: Task) => void
  /** The task's module colour when colours are on, else nothing. */
  colour?: string | null
  /** The module's name, shown in the meta line when the task has no section,
   *  so the colour is never the only thing that says what it is. */
  moduleName?: string | null
}

const PUSH_STEPS = [15, 30, 60]

/** Left to right: time in the margin, rail dot, name, meta, state, push.
 *  A locked item shows the lock and no push control — nothing may move it. */
export function TaskRow({ task, onTick, onPush, onEdit, colour, moduleName }: Props) {
  const done = task.status === 'done'
  const slipped = task.status === 'stuck' || task.needs_review

  const meta = [
    task.duration_min ? `${task.duration_min} min` : null,
    task.category ?? (colour ? moduleName : null),
    !slipped && task.push_count > 0 ? `pushed ${task.push_count}×` : null,
  ].filter(Boolean).join(' · ')

  // A checklist in the note shows how far along it is; any other note just
  // shows that there is one. The mark joins the small line under the name
  // when there is one, else the name's own line, so it never adds a line.
  const list = checklistProgress(task.notes)
  const mark = list.total > 0 ? (
    <span className={`row-chip${list.done === list.total ? ' is-complete' : ''}`}
      aria-label={`${list.done} of ${list.total} checklist items done`}>{list.done}/{list.total}</span>
  ) : hasNote(task.notes) ? (
    <span className="row-notemark" role="img" aria-label="Has a note">
      <svg width="10" height="11" viewBox="0 0 10 11" fill="none" aria-hidden="true">
        <path d="M1.5 0.5h5l2 2v8h-7z" stroke="currentColor" />
        <path d="M3 5h4M3 7.5h3" stroke="currentColor" />
      </svg>
    </span>
  ) : null

  return (
    <article className={`row${done ? ' is-done' : ''}${slipped ? ' is-slipped' : ''}${colour ? ' has-mod' : ''}`}
      style={colour ? ({ '--row-mod': colour } as CSSProperties) : undefined}>
      <span className="row-time">{task.planned_time?.slice(0, 5) ?? ''}</span>
      <span className="row-dot" aria-hidden="true" />

      <div>
        <div className="row-name"><button onClick={() => onEdit(task)}>{task.title}</button>{!meta && mark}</div>
        {meta && <div className="row-meta">{meta}{mark}</div>}
        {slipped && <div className="row-note">pushed {task.push_count}×, needs a new time</div>}
      </div>

      <div className="row-right">
        {task.locked ? (
          <span className="lock" title="Locked — nothing may move this" aria-label="Locked">
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden="true">
              <rect x="0.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" />
              <path d="M2.75 5.5V3.75a2.75 2.75 0 0 1 5.5 0V5.5" stroke="currentColor" />
            </svg>
          </span>
        ) : (
          <div className="push">
            {PUSH_STEPS.map((m) => (
              <button key={m} onClick={() => onPush(task, m)} title={`Push ${m} minutes`}>
                {m}
              </button>
            ))}
          </div>
        )}
        <button className="tick" onClick={() => onTick(task)} aria-pressed={done} title={done ? 'Untick' : 'Tick'}>
          {done ? '✓' : ''}
        </button>
      </div>
    </article>
  )
}
