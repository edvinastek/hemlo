import type { Task } from '../lib/types'

interface Props {
  task: Task
  onTick: (t: Task) => void
  onPush: (t: Task, minutes: number) => void
}

const PUSH_STEPS = [15, 30, 60]

/** Left to right: time in the margin, rail dot, name, meta, state, push.
 *  A locked item shows the lock and no push control — nothing may move it. */
export function TaskRow({ task, onTick, onPush }: Props) {
  const done = task.status === 'done'
  const slipped = task.status === 'stuck' || task.needs_review

  const meta = [
    task.duration_min ? `${task.duration_min} min` : null,
    task.category,
    !slipped && task.push_count > 0 ? `pushed ${task.push_count}×` : null,
  ].filter(Boolean).join(' · ')

  return (
    <article className={`row${done ? ' is-done' : ''}${slipped ? ' is-slipped' : ''}`}>
      <span className="row-time">{task.planned_time?.slice(0, 5) ?? ''}</span>
      <span className="row-dot" aria-hidden="true" />

      <div>
        <div className="row-name">{task.title}</div>
        {meta && <div className="row-meta">{meta}</div>}
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
