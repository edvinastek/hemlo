import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { holdStep, nextAt, IDLE, type HoldAction, type HoldState, type HoldTimes } from '../lib/hold-rules'

/** Press and hold, with a finger or a mouse, through pointer events and no
 *  library. The rules of the hold are in lib/hold-rules.ts; this feeds them
 *  the finger and a clock, and calls back.
 *
 *  Two ways to use it:
 *  - Drag only (Plan's week, boards, tables): hold for the short time and the
 *    thing is picked up (onStart); moving drags it, letting go drops it.
 *  - Two stages (Today and Plan's Day view, TOD-10): pass onExpand. The short
 *    hold makes the row ready (onArm, a light buzz) and the drag starts only
 *    when the finger then moves (onStart); holding still for the long time
 *    expands the row instead (onExpand, a second buzz).
 *
 *  Both times come from the person's settings (More → Hold times) unless a
 *  list passes its own. Moving before the short hold is up is a scroll and
 *  the press is forgotten. While ready or dragging the page does not scroll
 *  and the sideways swipe between pages never sees the move: touch moves are
 *  stopped at the window, before the swipe's listener. The click that would
 *  follow letting go after a hold is swallowed, so a hold never ticks or
 *  opens anything by accident. */

export interface PressPoint { x: number; y: number }

export interface LongPressOptions<K> {
  /** The short hold, in ms. Default: the person's drag time. */
  delay?: number
  /** The long hold, in ms. Default: the person's expand time. */
  expandDelay?: number
  /** Drag begins (drag only: when the hold is up; two stages: on the first
   *  move after it). Return false to refuse: nothing is picked up. */
  onStart: (key: K, at: PressPoint, el: HTMLElement) => boolean | void
  onMove?: (key: K, at: PressPoint) => void
  /** Let go after dragging (drag only: also after holding without moving). */
  onDrop?: (key: K, at: PressPoint) => void
  /** Taken away mid-drag (Escape, a phone call, the app hidden). */
  onCancel?: (key: K) => void
  /** Two stages: held still for the long hold. */
  onExpand?: (key: K, el: HTMLElement) => void
  /** Two stages: ready to drag (true), or no longer (false). */
  onArm?: (key: K, el: HTMLElement, ready: boolean) => void
  /** Two stages: whether this one can be dragged at all (a habit cannot);
   *  if not, only the long hold does anything. Default: yes. */
  canDrag?: (key: K) => boolean
}

interface Press<K> {
  key: K
  pointer: number
  el: HTMLElement
  state: HoldState
  timer: number
  last: PressPoint
  twoStage: boolean
}

/** A light buzz on phones that allow it; nothing where they do not. */
export function buzz(ms = 8) {
  try { navigator.vibrate?.(ms) } catch { /* not allowed here */ }
}

/** The person's hold times, from their settings. */
export function useHoldTimes(): HoldTimes {
  const settings = useApp((s) => s.profile?.settings)
  return useMemo(() => readSettings({ settings: settings ?? {} }).hold, [settings])
}

export function useLongPress<K>(options: LongPressOptions<K>) {
  const opts = useRef(options)
  opts.current = options
  const held = useHoldTimes()
  const times = useRef<HoldTimes>(held)
  times.current = {
    drag_ms: options.delay ?? held.drag_ms,
    expand_ms: Math.max((options.delay ?? held.drag_ms) + 200, options.expandDelay ?? held.expand_ms),
  }
  const press = useRef<Press<K> | null>(null)
  const stop = useRef<() => void>(() => {})

  const end = useCallback(() => {
    const p = press.current
    if (p) window.clearTimeout(p.timer)
    press.current = null
    stop.current()
    stop.current = () => {}
    document.documentElement.classList.remove('is-holding')
  }, [])

  // Let go of everything if the screen goes away mid-press.
  useEffect(() => () => {
    const p = press.current
    if (p && (p.state.phase === 'dragging' || (p.state.phase === 'armed' && !p.twoStage))) opts.current.onCancel?.(p.key)
    end()
  }, [end])

  const begin = useCallback((key: K, e: ReactPointerEvent<HTMLElement>) => {
    if (press.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    // A press on a field being typed in is the field's own, and a part that
    // says so (an open row's note, a menu) is never held. A read-only field
    // (a recipe's worked-out kcal in a table) is just a figure on the row.
    if ((e.target as Element | null)?.closest?.('input:not([readonly]), textarea:not([readonly]), select, [contenteditable="true"], [data-no-hold]')) return
    const el = e.currentTarget
    const twoStage = !!opts.current.onExpand
    const canDrag = twoStage ? (opts.current.canDrag?.(key) ?? true) : true
    const first = holdStep(IDLE, {
      type: 'down', x: e.clientX, y: e.clientY, t: performance.now(), canDrag, canExpand: twoStage,
    }, times.current)
    const p: Press<K> = { key, pointer: e.pointerId, el, state: first.state, timer: 0, last: { x: e.clientX, y: e.clientY }, twoStage }
    press.current = p

    /** Does what a step of the rules says. */
    const act = (action: HoldAction) => {
      const o = opts.current
      const at = p.last
      switch (action) {
        case 'arm':
          buzz(8)
          document.documentElement.classList.add('is-holding')
          window.getSelection?.()?.removeAllRanges()
          if (twoStage) { o.onArm?.(key, el, true); break }
          // Drag only: the hold itself picks the thing up.
          if (o.onStart(key, { x: p.state.x, y: p.state.y }, el) === false) { end(); return }
          break
        case 'drag':
          if (twoStage) {
            o.onArm?.(key, el, false)
            if (o.onStart(key, { x: p.state.x, y: p.state.y }, el) === false) { end(); return }
          }
          o.onMove?.(key, at)
          break
        case 'drag-move':
          o.onMove?.(key, at)
          break
        case 'drop':
          end()
          swallowClick()
          o.onDrop?.(key, at)
          return
        case 'quiet':
          end()
          swallowClick()
          if (twoStage) o.onArm?.(key, el, false)
          // Drag only: held and let go without moving is still a drop.
          else o.onDrop?.(key, at)
          return
        case 'expand':
          buzz(14)
          o.onArm?.(key, el, false)
          o.onExpand?.(key, el)
          break
        case 'tap':
        case 'forget':
          end()
          return
        case 'cancel-drag':
          end()
          o.onCancel?.(key)
          return
        default:
      }
      schedule()
    }

    const step = (ev: Parameters<typeof holdStep>[1]) => {
      if (press.current !== p) return
      const was = p.state.phase
      const r = holdStep(p.state, ev, times.current)
      p.state = r.state
      // Ready and then taken away: two stages only drop the "ready" look; a
      // drag-only list had already picked the thing up, so it is put back.
      if (ev.type === 'cancel' && was === 'armed') {
        if (twoStage) opts.current.onArm?.(key, el, false)
        else { end(); opts.current.onCancel?.(key); return }
      }
      act(r.action)
    }

    /** Sets the clock for the next moment that matters. */
    const schedule = () => {
      window.clearTimeout(p.timer)
      const at = nextAt(p.state, times.current)
      if (at == null || press.current !== p) return
      p.timer = window.setTimeout(() => step({ type: 'time', t: performance.now() }), Math.max(0, at - performance.now()))
    }

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return
      p.last = { x: ev.clientX, y: ev.clientY }
      if (p.state.phase === 'dragging' || p.state.phase === 'armed') ev.preventDefault()
      step({ type: 'move', x: ev.clientX, y: ev.clientY })
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return
      p.last = { x: ev.clientX, y: ev.clientY }
      step({ type: 'up' })
    }
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return
      step({ type: 'cancel' })
    }
    // Touch moves: while ready or dragging, no scrolling and no page swipe.
    const touch = (ev: TouchEvent) => {
      const phase = p.state.phase
      if (phase !== 'armed' && phase !== 'dragging' && phase !== 'expanded') return
      if (ev.cancelable) ev.preventDefault()
      ev.stopPropagation()
    }
    const key_ = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || p.state.phase === 'pressing') return
      step({ type: 'cancel' })
    }
    const hidden = () => { if (document.hidden) step({ type: 'cancel' }) }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('touchmove', touch, { capture: true, passive: false })
    window.addEventListener('keydown', key_)
    document.addEventListener('visibilitychange', hidden)
    stop.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('touchmove', touch, { capture: true })
      window.removeEventListener('keydown', key_)
      document.removeEventListener('visibilitychange', hidden)
    }
    schedule()
  }, [end])

  /** Spread onto the thing that can be held. */
  const bind = useCallback((key: K) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => begin(key, e),
    // A phone's own long-press menu (copy, select) would open over the hold.
    onContextMenu: (e: { preventDefault: () => void }) => { if (press.current) e.preventDefault() },
  }), [begin])

  return { bind, cancel: end }
}

/** The click a browser sends after letting go, eaten once. */
function swallowClick() {
  const eat = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); done() }
  const done = () => { window.removeEventListener('click', eat, true); window.clearTimeout(t) }
  const t = window.setTimeout(done, 500)
  window.addEventListener('click', eat, true)
}
