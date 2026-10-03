import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { db } from '../lib/db'
import { edit } from '../lib/write'
import {
  clampTarget, moveWarnings, planMove, previewOrder, stepTarget,
  type Change, type Warning, type WorkWindow,
} from '../lib/reorder-rules'
import type { Task } from '../lib/types'
import { useLongPress } from './useLongPress'
import { MoveSheet } from './MoveSheet'
import { offerUndo } from './Undo'
import './move.css'

/** One line of the rail: an item (a task or anything else on the day), a
 *  group heading ("Any time"), or the "now" line. */
export type RailEntry =
  | { type: 'item'; key: string; task?: Task; label: string; static?: boolean; expandable?: boolean }
  | { type: 'heading'; key: string; label: string }
  | { type: 'now'; key: string; label: string }

/** One action in a row's ⋮ menu. */
export interface MenuAction {
  label: string
  run: () => void
  disabled?: boolean
  /** Shown last and in the warning colour (Delete). */
  danger?: boolean
}

interface Props {
  /** The lines, in the order shown. */
  entries: RailEntry[]
  /** Every task on the day, for the clash check (a tab shows only some). */
  day: Task[]
  /** 'yyyy-MM-dd', for the work hours. */
  date: string
  work: WorkWindow
  /** Draws one item; `more` is its ⋮ button, for the row to place. */
  renderItem: (entry: Extract<RailEntry, { type: 'item' }>, more: ReactNode) => ReactNode
  /** The row's own actions for its ⋮ menu (Move up and Move down are added). */
  actionsFor?: (entry: Extract<RailEntry, { type: 'item' }>) => MenuAction[]
  /** The key of the row open in place, if any. */
  expanded?: string | null
  /** The long hold: open the row in place, or close it again. */
  onExpand?: (key: string) => void
}

/** A drag in progress. Measured once when the task is picked up; the list
 *  does not change underneath while it is held. */
interface Drag {
  /** The dragged task's place among the tasks. */
  from: number
  /** The tasks, in order, as shown. */
  ids: string[]
  tops: number[]
  heights: number[]
  /** Where the finger was, against the list, when the drag began. */
  startY: number
  /** The finger now, against the screen, and where it was picked up. */
  y: number
  y0: number
  to: number
  /** Where each task sits for that drop, against the list. */
  at: number[]
  frame: number
  scroller: HTMLElement | null
}

/** A day's rail, where every task can be held and dragged among the other
 *  tasks (lib/reorder-rules.ts says what a drop does), and every row can be
 *  held still to open it in place. Things that are not tasks (habits,
 *  events, chores) stay where the clock puts them; a dragged task passes
 *  over them. The ⋮ on each row holds all of its actions, Move up and Move
 *  down too, for anyone who cannot or would rather not drag (GEN-52, P9). */
export function DragList({ entries, day, date, work, renderItem, actionsFor, expanded, onExpand }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const rows = useRef(new Map<string, HTMLDivElement>())
  const drag = useRef<Drag | null>(null)
  // After a drop the rows stay where they were dropped until the list
  // arrives in its new order, so nothing jumps back for a moment.
  const expecting = useRef<string | null>(null)
  const [ask, setAsk] = useState<{ moved: Task; changes: Change[]; warnings: Warning[] } | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [said, say] = useState('')
  const tasks = entries.flatMap((e) => (e.type === 'item' && e.task ? [e.task] : []))
  const latest = useRef({ tasks, day, entries })
  latest.current = { tasks, day, entries }

  function reset() {
    expecting.current = null
    for (const el of rows.current.values()) {
      el.style.transition = 'none'
      el.style.transform = ''
      el.classList.remove('is-lifted')
    }
    listRef.current?.classList.remove('is-dragging')
    // Let the "none" land before the list's own transition comes back.
    requestAnimationFrame(() => { for (const el of rows.current.values()) el.style.transition = '' })
  }

  useLayoutEffect(() => {
    if (expecting.current && tasks.map((t) => t.id).join('|') === expecting.current) reset()
  }, [tasks.map((t) => t.id).join('|')])

  /** Where each task goes for a drop at `to`, as pixels to move it by. Only
   *  tasks move; a task takes the place (and the height) of the task it
   *  changes places with, and the rows between keep theirs. */
  function layout() {
    const d = drag.current
    const list = listRef.current
    if (!d || !list) return
    const dy = d.y - list.getBoundingClientRect().top - d.startY
    const centre = d.tops[d.from] + d.heights[d.from] / 2 + dy
    // It lands on the task whose middle is nearest the middle of the held row.
    let raw = d.from
    let best = Infinity
    d.tops.forEach((top, j) => {
      const dist = Math.abs(centre - (top + d.heights[j] / 2))
      if (dist < best) { best = dist; raw = j }
    })
    const list_ = latest.current.tasks
    d.to = clampTarget(list_, d.from, raw)

    const order = previewOrder(list_, d.from, d.to)
    // Each place keeps its top, shifted by how much taller or shorter the
    // tasks above it in the run have become.
    const at: number[] = []
    let shift = 0
    order.forEach((i, k) => {
      at[i] = d.tops[k] + shift
      shift += d.heights[i] - d.heights[k]
    })
    d.at = at
    d.ids.forEach((id, i) => {
      const el = rows.current.get(id)
      if (el) el.style.transform = `translateY(${i === d.from ? dy : at[i] - d.tops[i]}px)`
    })
    const slot = slotRef.current
    if (slot) { slot.style.top = `${at[d.from]}px`; slot.style.height = `${d.heights[d.from]}px` }
  }

  /** Near the top or bottom edge of the page, the page scrolls on its own,
   *  faster the closer the finger gets. */
  function autoScroll() {
    const d = drag.current
    if (!d) return
    const s = d.scroller
    if (s) {
      const r = s.getBoundingClientRect()
      const edge = 64
      // Only once the finger has moved towards that edge: a row picked up
      // near the bottom must not set the page scrolling on its own.
      const push = d.y < r.top + edge && d.y < d.y0 - 8 ? -(r.top + edge - d.y)
        : d.y > r.bottom - edge && d.y > d.y0 + 8 ? d.y - (r.bottom - edge) : 0
      if (push) {
        const before = s.scrollTop
        s.scrollTop += Math.max(-16, Math.min(16, Math.round(push / 4)))
        if (s.scrollTop !== before) layout()
      }
    }
    d.frame = requestAnimationFrame(autoScroll)
  }

  const entryOf = (key: string) => latest.current.entries.find((e) => e.key === key)

  const hold = useLongPress<string>({
    canDrag: (key) => {
      const e = entryOf(key)
      return !!(e && e.type === 'item' && e.task && !e.static && key !== expanded)
    },
    onArm: (_key, el, ready) => { el.classList.toggle('is-armed', ready) },
    onExpand: (key) => {
      const e = entryOf(key)
      if (e && e.type === 'item' && e.expandable !== false) { setMenu(null); onExpand?.(key) }
    },
    onStart: (key, at) => {
      const list = listRef.current
      const e = entryOf(key)
      const now = latest.current.tasks
      const from = e && e.type === 'item' && e.task ? now.findIndex((t) => t.id === e.task!.id) : -1
      if (!list || from < 0 || ask || expecting.current) return false
      const ids = now.map((t) => t.id)
      const els = ids.map((i) => rows.current.get(i))
      if (els.some((el) => !el)) return false
      setMenu(null)
      const tops = els.map((el) => el!.offsetTop)
      const heights = els.map((el) => el!.offsetHeight)
      const y = at.y - list.getBoundingClientRect().top
      drag.current = {
        from, ids, tops, heights, startY: y, y: at.y, y0: at.y, to: from, at: tops, frame: 0,
        scroller: list.closest<HTMLElement>('.page') ?? (document.scrollingElement as HTMLElement | null),
      }
      list.classList.add('is-dragging')
      els[from]!.classList.add('is-lifted')
      layout()
      drag.current.frame = requestAnimationFrame(autoScroll)
    },
    onMove: (_, at) => {
      if (!drag.current) return
      drag.current.y = at.y
      layout()
    },
    onDrop: () => {
      const d = drag.current
      if (!d) return
      cancelAnimationFrame(d.frame)
      drag.current = null
      const list = latest.current.tasks
      if (list.map((t) => t.id).join('|') !== d.ids.join('|')) return reset()
      const changes = planMove(list, d.from, d.to)
      if (changes.length === 0) return reset()
      const moved = list[d.from]
      const warnings = moveWarnings(latest.current.day, changes, moved.id, work, date)
      if (warnings.length) { reset(); setAsk({ moved, changes, warnings }); return }
      // Hold the rows where they were dropped until the list comes back in
      // its new order (or give up after a moment).
      const expected = previewOrder(list, d.from, d.to).map((i) => list[i].id).join('|')
      expecting.current = expected
      listRef.current?.classList.remove('is-dragging')
      // The held row settles into its gap.
      const held = rows.current.get(moved.id)
      if (held) { held.style.transition = 'transform 120ms ease-out'; held.style.transform = `translateY(${d.at[d.from] - d.tops[d.from]}px)` }
      window.setTimeout(() => { if (expecting.current === expected) reset() }, 900)
      void apply(changes, moved)
    },
    onCancel: () => {
      if (drag.current) cancelAnimationFrame(drag.current.frame)
      drag.current = null
      reset()
    },
  })

  // Stop the auto-scroll if the list goes away mid-drag.
  useEffect(() => () => { if (drag.current) cancelAnimationFrame(drag.current.frame) }, [])

  /** Through edit(), one task at a time, so each change syncs; then the
   *  Undo bar puts every changed field back. */
  async function apply(changes: Change[], moved: Task) {
    const before: { row: Task; fields: Partial<Task> }[] = []
    for (const c of changes) {
      const row = latest.current.day.find((t) => t.id === c.id)
      if (!row) continue
      const { id: _id, ...fields } = c
      before.push({ row, fields: Object.fromEntries(Object.keys(fields).map((k) => [k, row[k as keyof Task]])) as Partial<Task> })
      await edit('task', row, fields as Partial<Task>)
    }
    const time = changes.find((c) => c.id === moved.id)?.planned_time
    const text = time ? `${moved.title || 'Task'} moved to ${time.slice(0, 5)}` : `${moved.title || 'Task'} moved`
    say(text)
    offerUndo(text, async () => {
      for (const b of before) {
        const now = (await db.task.get(b.row.id)) ?? b.row
        await edit('task', now, b.fields)
      }
    })
  }

  /** Move up or Move down, from the ⋮ menu. */
  function step(task: Task, dir: -1 | 1) {
    setMenu(null)
    const list = latest.current.tasks
    const from = list.findIndex((t) => t.id === task.id)
    const to = from < 0 ? null : stepTarget(list, from, dir)
    if (to === null) return
    const changes = planMove(list, from, to)
    const warnings = moveWarnings(latest.current.day, changes, task.id, work, date)
    if (warnings.length) return setAsk({ moved: task, changes, warnings })
    void apply(changes, task)
    focusMore(task.id)
  }

  function focusMore(key: string) {
    requestAnimationFrame(() => rows.current.get(key)?.querySelector<HTMLButtonElement>('.row-more')?.focus())
  }

  // Rows are found by their task id while dragging (the reorder works on
  // tasks) and by their key otherwise.
  const rowKey = (e: Extract<RailEntry, { type: 'item' }>) => e.task?.id ?? e.key

  return (
    <div className="drag-list" ref={listRef}>
      <div className="drag-slot" ref={slotRef} aria-hidden="true" />
      {entries.map((e) => {
        if (e.type === 'heading') return <h3 key={e.key} className="rail-group">{e.label}</h3>
        if (e.type === 'now') {
          return <div key={e.key} className="rail-now" role="separator" aria-label={e.label}><span>{e.label}</span></div>
        }
        const open = menu === e.key
        const actions = actionsFor?.(e) ?? []
        const i = e.task ? tasks.findIndex((t) => t.id === e.task!.id) : -1
        const canStep = !!e.task && !e.static
        const more = (
          <button type="button" className="row-more" aria-label={`Actions for ${e.label || 'item'}`}
            aria-haspopup="menu" aria-expanded={open}
            onClick={() => setMenu(open ? null : e.key)}>
            <svg width="4" height="14" viewBox="0 0 4 14" aria-hidden="true">
              <circle cx="2" cy="2" r="1.5" fill="currentColor" /><circle cx="2" cy="7" r="1.5" fill="currentColor" />
              <circle cx="2" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </button>
        )
        const k = rowKey(e)
        return (
          <div key={e.key} className={`drag-item${expanded === e.key ? ' is-expanded' : ''}`} data-task={e.task?.id} data-key={e.key}
            ref={(el) => { if (el) rows.current.set(k, el); else rows.current.delete(k) }}
            {...hold.bind(e.key)}>
            {renderItem(e, more)}
            {open && (
              <RowMenu
                actions={actions}
                up={canStep && i >= 0 && stepTarget(tasks, i, -1) !== null}
                down={canStep && i >= 0 && stepTarget(tasks, i, 1) !== null}
                steps={canStep}
                onStep={(dir) => e.task && step(e.task, dir)}
                onClose={() => { setMenu(null); focusMore(k) }}
              />
            )}
          </div>
        )
      })}
      <p className="move-live" aria-live="polite">{said}</p>
      {ask && (
        <MoveSheet
          title={`Move “${ask.moved.title || 'task'}”?`}
          lines={newTimes(ask.changes, day)}
          warnings={ask.warnings}
          action="Move"
          onConfirm={() => apply(ask.changes, ask.moved)}
          onClose={() => { setAsk(null); focusMore(ask.moved.id) }}
        />
      )}
    </div>
  )
}

/** "“Gym” moves to 08:15." for each task whose time a move changes. */
function newTimes(changes: Change[], day: Task[]): string[] {
  return changes.flatMap((c) => {
    const t = day.find((x) => x.id === c.id)
    return t && c.planned_time ? [`“${t.title || 'Task'}” moves to ${c.planned_time.slice(0, 5)}.`] : []
  })
}

/** The ⋮ menu: the row's actions, Move up and Move down for tasks, and a
 *  word on the hold. Works with the keyboard: arrows move, Escape closes. */
function RowMenu({ actions, up, down, steps, onStep, onClose }: {
  actions: MenuAction[]; up: boolean; down: boolean; steps: boolean; onStep: (dir: -1 | 1) => void; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)
  const [room, setRoom] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // Opens on the side with more room (upwards for the last rows, clear of
    // the round +), and never past the screen's edge: a long menu scrolls
    // inside itself rather than putting its first items out of reach.
    const row = (el.offsetParent ?? el.parentElement)?.getBoundingClientRect()
    const height = el.getBoundingClientRect().height
    if (row) {
      const below = window.innerHeight - 96 - row.bottom
      const over = row.top - 8
      const up = height > below && over > below
      setAbove(up)
      const space = Math.floor(up ? over : below)
      setRoom(height > space ? Math.max(space, 160) : undefined)
    }
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (box.current?.contains(t) || t?.closest?.('.row-more[aria-expanded="true"]')) return
      onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const items = [...(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (items.length === 0) return
      e.preventDefault()
      const at = items.indexOf(document.activeElement as HTMLButtonElement)
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [onClose])

  const plain = actions.filter((a) => !a.danger)
  const danger = actions.filter((a) => a.danger)
  const run = (a: MenuAction) => { onClose(); a.run() }
  return (
    <div ref={box} className={`move-menu${above ? ' is-above' : ''}`} role="menu" data-no-swipe data-no-hold
      style={room ? { maxHeight: room, overflowY: 'auto' } : undefined}
      onPointerDown={(e) => e.stopPropagation()}>
      {plain.map((a) => (
        <button key={a.label} type="button" role="menuitem" disabled={a.disabled} onClick={() => run(a)}>{a.label}</button>
      ))}
      {steps && (
        <>
          <button type="button" role="menuitem" disabled={!up} onClick={() => onStep(-1)}>Move up</button>
          <button type="button" role="menuitem" disabled={!down} onClick={() => onStep(1)}>Move down</button>
        </>
      )}
      {danger.map((a) => (
        <button key={a.label} type="button" role="menuitem" className="is-danger" disabled={a.disabled} onClick={() => run(a)}>{a.label}</button>
      ))}
      <p className="move-menu-hint">{steps ? 'Or hold a task a moment and drag it; hold it longer to open it here.' : 'Or hold it to open it here.'}</p>
    </div>
  )
}
