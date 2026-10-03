import type { Task } from '../lib/types'

/** The controls on the right of a task's row on the rail (ui/ItemRow.tsx
 *  draws the rest): the lock on a locked task, and the tick. Push 15 / 30 /
 *  60 live in the open row and the ⋮ (CALM-06); they come back on the row
 *  only when the person asks for them (Today's ⋮, "Show push buttons on
 *  rows"). A locked task never shows them: nothing may move it. */

export const PUSH_STEPS = [15, 30, 60]

/** "Push 15 min", "Push 1 h": a push in words, for the ⋮ and the open row. */
export const pushWords = (m: number) => (m % 60 === 0 ? `${m / 60} h` : `${m} min`)

export function LockMark() {
  return (
    <span className="lock" title="Locked — nothing may move this" aria-label="Locked" role="img">
      <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden="true">
        <rect x="0.5" y="5.5" width="10" height="7" rx="1.5" stroke="currentColor" />
        <path d="M2.75 5.5V3.75a2.75 2.75 0 0 1 5.5 0V5.5" stroke="currentColor" />
      </svg>
    </span>
  )
}

export function TaskControls({ task, onPush, onTick, more, showPush = false }: {
  task: Task
  onPush: (minutes: number) => void
  onTick: () => void
  more: React.ReactNode
  /** Push 15 / 30 / 60 on the row itself (a density choice, off by default). */
  showPush?: boolean
}) {
  const done = task.status === 'done'
  const skipped = task.status === 'dropped'
  return (
    <div className="row-right">
      {task.locked ? <LockMark /> : showPush && !done && !skipped && (
        <div className="push">
          {PUSH_STEPS.map((m) => (
            <button key={m} type="button" onClick={() => onPush(m)} title={`Push ${m} minutes`}
              aria-label={`Push ${task.title || 'task'} ${m} minutes`}>{m}</button>
          ))}
        </div>
      )}
      <TickButton done={done} label={task.title} onTick={onTick} />
      {more}
    </div>
  )
}

/** The round tick: small to look at, a full finger to press. */
export function TickButton({ done, label, onTick, partly }: { done: boolean; label: string; onTick: () => void; partly?: boolean }) {
  return (
    <button type="button" className={`tick${partly ? ' is-partly' : ''}`} onClick={onTick} aria-pressed={done}
      title={done ? 'Untick' : 'Tick'} aria-label={`${done ? 'Untick' : 'Tick'} ${label || 'item'}`}>
      {done ? '✓' : ''}
    </button>
  )
}
