import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { edit } from '../lib/write'
import {
  clampTarget, moveWarnings, planMove, previewOrder, stepTarget,
  type Change, type Warning, type WorkWindow,
} from '../lib/reorder-rules'
import type { Task } from '../lib/types'
import { useLongPress } from './useLongPress'
import { MoveSheet } from './MoveSheet'
import './move.css'

interface Props {
  /** The tasks shown, in the order shown. */
  tasks: Task[]
  /** Every task on the day, for the clash check (a tab shows only some). */
  day: Task[]
  /** 'yyyy-MM-dd', for the work hours. */
  date: string
  work: WorkWindow
  /** Draws one task; `more` is its ⋮ button, for the row to place. */
  renderRow: (task: Task, more: ReactNode) => ReactNode
}

/** A drag in progress. Measured once when the task is picked up; the list
 *  does not change underneath while it is held. */
interface Drag {
  from: number
  ids: string[]
  /** Each row's top, its height, and the room it takes (height and gap). */
  tops: number[]
  heights: number[]
  room: number[]
  /** Where the finger was, against the list, when the hold was up. */
  startY: number
  /** The finger now, against the screen, and where it was picked up. */
  y: number
  y0: number
  to: number
  /** Where each row sits for that drop. */
  at: number[]
  frame: number
  scroller: HTMLElement | null
}

/** Today's rows, each of which can be held and dragged up or down (see
 *  lib/reorder-rules.ts for what a drop does). The ⋮ on each row has Move up
 *  and Move down, for anyone who cannot or would rather not drag. */
export function DragList({ tasks, day, date, work, renderRow }: Props) {
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
  const latest = useRef({ tasks, day })
  latest.current = { tasks, day }

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
  }, [tasks])

  /** Where each row goes for a drop at `to`, as pixels to move it by. */
  function layout() {
    const d = drag.current
    const list = listRef.current
    if (!d || !list) return
    const dy = d.y - list.getBoundingClientRect().top - d.startY
    const centre = d.tops[d.from] + d.heights[d.from] / 2 + dy
    // It lands on the row whose place the middle of the held row is over
    // (past either end, the first or last row), so dropping one row onto
    // another's middle always means that row.
    const last = d.tops.length - 1
    let raw = centre < d.tops[0] ? 0 : centre >= d.tops[last] + d.room[last] ? last : d.from
    d.tops.forEach((top, j) => { if (centre >= top && centre < top + d.room[j]) raw = j })
    d.to = clampTarget(latest.current.tasks, d.from, raw)

    const order = previewOrder(latest.current.tasks, d.from, d.to)
    const at: number[] = []
    let top = d.tops[0]
    for (const i of order) { at[i] = top; top += d.room[i] }
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

  const hold = useLongPress<string>({
    onStart: (id, at) => {
      const list = listRef.current
      const now = latest.current.tasks
      const from = now.findIndex((t) => t.id === id)
      if (!list || from < 0 || ask || expecting.current) return false
      const ids = now.map((t) => t.id)
      const els = ids.map((i) => rows.current.get(i))
      if (els.some((el) => !el)) return false
      setMenu(null)
      const tops = els.map((el) => el!.offsetTop)
      const heights = els.map((el) => el!.offsetHeight)
      const room = tops.map((t, i) => (i < tops.length - 1 ? tops[i + 1] - t : heights[i]))
      const y = at.y - list.getBoundingClientRect().top
      drag.current = {
        from, ids, tops, heights, room, startY: y, y: at.y, y0: at.y, to: from, at: tops, frame: 0,
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

  /** Through edit(), one task at a time, so each change syncs. */
  async function apply(changes: Change[], moved: Task) {
    for (const c of changes) {
      const row = latest.current.day.find((t) => t.id === c.id)
      if (!row) continue
      const { id: _id, ...fields } = c
      await edit('task', row, fields as Partial<Task>)
    }
    const time = changes.find((c) => c.id === moved.id)?.planned_time
    say(time ? `${moved.title} moved to ${time.slice(0, 5)}` : `${moved.title} moved`)
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

  function focusMore(id: string) {
    requestAnimationFrame(() => rows.current.get(id)?.querySelector<HTMLButtonElement>('.row-more')?.focus())
  }

  return (
    <div className="drag-list" ref={listRef}>
      <div className="drag-slot" ref={slotRef} aria-hidden="true" />
      {tasks.map((t, i) => {
        const open = menu === t.id
        const more = (
          <button type="button" className="row-more" aria-label={`Move ${t.title || 'task'}`}
            aria-haspopup="menu" aria-expanded={open}
            onClick={() => setMenu(open ? null : t.id)}>
            <svg width="4" height="14" viewBox="0 0 4 14" aria-hidden="true">
              <circle cx="2" cy="2" r="1.5" fill="currentColor" /><circle cx="2" cy="7" r="1.5" fill="currentColor" />
              <circle cx="2" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </button>
        )
        return (
          <div key={t.id} className="drag-item" data-task={t.id}
            ref={(el) => { if (el) rows.current.set(t.id, el); else rows.current.delete(t.id) }}
            {...hold.bind(t.id)}>
            {renderRow(t, more)}
            {open && (
              <MoveMenu
                up={stepTarget(tasks, i, -1) !== null}
                down={stepTarget(tasks, i, 1) !== null}
                onStep={(dir) => step(t, dir)}
                onClose={() => { setMenu(null); focusMore(t.id) }}
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

/** The ⋮ menu: Move up, Move down, and a word on dragging. */
function MoveMenu({ up, down, onStep, onClose }: {
  up: boolean; down: boolean; onStep: (dir: -1 | 1) => void; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    // Opens upwards when there is no room below (the last rows, the add button).
    setAbove(el.getBoundingClientRect().bottom > window.innerHeight - 96)
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

  return (
    <div ref={box} className={`move-menu${above ? ' is-above' : ''}`} role="menu" data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" role="menuitem" disabled={!up} onClick={() => onStep(-1)}>Move up</button>
      <button type="button" role="menuitem" disabled={!down} onClick={() => onStep(1)}>Move down</button>
      <p className="move-menu-hint">Or hold a task and drag it.</p>
    </div>
  )
}
