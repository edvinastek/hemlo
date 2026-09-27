import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { moveToDays } from '../lib/series'
import {
  count, planDaySwap, singleMoveWarnings, type DaySwap, type Warning, type WorkWindow,
} from '../lib/reorder-rules'
import type { Task } from '../lib/types'
import { useLongPress } from './useLongPress'
import { MoveSheet } from './MoveSheet'
import './move.css'

/** What is held: a whole day, or one task. */
type Picked = { kind: 'day'; day: string } | { kind: 'task'; task: Task }

type Ask =
  | { kind: 'swap'; a: string; b: string; plan: DaySwap<Task> }
  | { kind: 'task'; task: Task; to: string; warnings: Warning[] }

/** "Mon 28 Sep" */
const label = (day: string) => format(parseISO(day), 'EEE d MMM')

/** Swapping days and moving tasks on Plan's week.
 *
 *  Hold a day's header, then tap another day (or drag onto it): the two days
 *  swap their movable tasks, each keeping its time. Hold a task, then tap a
 *  day (or drag onto it): the task moves there. A sheet says what will move
 *  and asks first about anything locked, fixed, repeating or clashing. The
 *  rules are in lib/reorder-rules.ts.
 *
 *  A hook, so the week grid keeps its own markup and class names: it hands
 *  back props and classes to spread onto the grid, the days and the tasks,
 *  and the bits of page (the banner and the sheet) to draw. */
export function useWeekSwap({ byDay, work }: { byDay: Map<string, Task[]>; work: WorkWindow }) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  // The held thing as the drag callbacks see it, before React has redrawn.
  const held = useRef<Picked | null>(null)
  held.current = picked

  const tasksOn = (day: string) => (byDay.get(day) ?? []).filter((t) => !t.deleted_at)

  function pick(p: Picked | null) {
    held.current = p
    setPicked(p)
    setOver(null)
  }

  /** The day under a finger or the mouse. */
  const dayAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest('[data-week-day]')?.getAttribute('data-week-day') ?? null

  /** The second day chosen: ask, or for a plain single move, just move. */
  function choose(day: string) {
    const p = held.current
    if (!p) return
    if (p.kind === 'day') {
      if (p.day === day) return pick(null)
      setAsk({ kind: 'swap', a: p.day, b: day, plan: planDaySwap(p.day, tasksOn(p.day), day, tasksOn(day), work) })
      return
    }
    const from = p.task.planned_date
    if (!from || from === day) return pick(null)
    const warnings = singleMoveWarnings(p.task, from, day, tasksOn(day), work)
    if (warnings.length) { setAsk({ kind: 'task', task: p.task, to: day, warnings }); return }
    pick(null)
    void moveToDays([{ task: p.task, to: day }])
  }

  const hold = useLongPress<string>({
    onStart: (key) => {
      if (ask) return false
      if (key.startsWith('day:')) return pick({ kind: 'day', day: key.slice(4) })
      const task = [...byDay.values()].flat().find((t) => t.id === key.slice(5))
      if (!task) return false
      pick({ kind: 'task', task })
    },
    onMove: (_, at) => setOver(dayAt(at.x, at.y)),
    onDrop: (_, at) => {
      setOver(null)
      const day = dayAt(at.x, at.y)
      const p = held.current
      // Let go on the same day: stay picked, waiting for a tap on another.
      const home = p?.kind === 'day' ? p.day : p?.task.planned_date
      if (day && day !== home) choose(day)
    },
    onCancel: () => pick(null),
  })

  // Escape lets go of whatever is picked.
  useEffect(() => {
    if (!picked || ask) return
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') pick(null) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [picked, ask])

  const pickedDay = picked?.kind === 'day' ? picked.day : null
  const pickedTask = picked?.kind === 'task' ? picked.task.id : null

  /** Enter or Space on a day's header: the keyboard's hold and tap. */
  const onHeadKey = (day: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    if (held.current) choose(day)
    else pick({ kind: 'day', day })
  }

  const ui: ReactNode = (
    <>
      {picked && !ask ? (
        <div className="week-pick" role="status">
          <span>
            {picked.kind === 'day'
              ? <>Swapping <b>{label(picked.day)}</b>. Tap the day to swap it with.</>
              : <>Moving <b>“{picked.task.title || 'task'}”</b>. Tap the day to move it to.</>}
          </span>
          <button type="button" className="btn" onClick={() => pick(null)}>Cancel</button>
        </div>
      ) : (
        <p className="week-hint">Hold a day to swap it with another, or hold a task to move it.</p>
      )}
      {ask?.kind === 'swap' && <SwapSheet ask={ask} onClose={() => { setAsk(null); pick(null) }} />}
      {ask?.kind === 'task' && (
        <MoveSheet
          title={`Move “${ask.task.title || 'task'}” to ${label(ask.to)}?`}
          lines={[ask.task.planned_time ? `It keeps its time, ${ask.task.planned_time.slice(0, 5)}.` : 'It has no time, and keeps none.']}
          warnings={ask.warnings}
          action="Move"
          onConfirm={() => moveToDays([{ task: ask.task, to: ask.to }])}
          onClose={() => { setAsk(null); pick(null) }}
        />
      )}
    </>
  )

  return {
    /** Extra classes for .week-grid. */
    gridClass: picked ? ' is-picking' : '',
    /** Onto each .week-col: marks the day, and takes the tap that chooses it. */
    colProps: (day: string) => ({
      'data-week-day': day,
      onClick: () => { if (held.current) choose(day) },
    }),
    colClass: (day: string) => (pickedDay === day ? ' is-picked' : over === day ? ' is-target' : ''),
    /** Onto each day's header: hold it to pick the day up. */
    headProps: (day: string) => ({
      ...hold.bind(`day:${day}`),
      tabIndex: 0,
      title: 'Hold to swap this day with another (or press Enter here, then on the other day)',
      onKeyDown: onHeadKey(day),
    }),
    /** Onto each .week-item: hold it to pick the task up. */
    itemProps: (task: Task) => hold.bind(`task:${task.id}`),
    itemClass: (task: Task) => (pickedTask === task.id ? ' is-picked' : ''),
    ui,
  }
}

/** Two days swapped: how many tasks go each way, what stays, and anything
 *  worth a second look. */
function SwapSheet({ ask, onClose }: { ask: Extract<Ask, { kind: 'swap' }>; onClose: () => void }) {
  const { a, b, plan } = ask
  const done = plan.stay.filter((s) => s.why === 'done').length
  const moves = (n: number) => `${count(n)} ${n === 1 ? 'moves' : 'move'}`
  const nothing = plan.there.length + plan.back.length === 0
  const lines = nothing
    ? ['Nothing on these two days can move.']
    : [
        `${moves(plan.there.length)} to ${label(b)}.`,
        `${moves(plan.back.length)} to ${label(a)}.`,
        'Each keeps its time.',
        ...(done ? [`${count(done, 'done task')} ${done === 1 ? 'stays' : 'stay'} where ${done === 1 ? 'it was' : 'they were'}.`] : []),
      ]
  return (
    <MoveSheet
      title={`Swap ${label(a)} and ${label(b)}?`}
      lines={lines}
      warnings={nothing ? [] : plan.warnings}
      action="Swap"
      nothing={nothing}
      onConfirm={() => moveToDays([
        ...plan.there.map((task) => ({ task, to: b })),
        ...plan.back.map((task) => ({ task, to: a })),
      ])}
      onClose={onClose}
    />
  )
}
