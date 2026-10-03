/** The two-stage hold (TOD-10, GEN-52), as plain rules with no React and no
 *  timers, so every case can be checked in Node (src/test/hold.check.mjs).
 *  src/ui/useLongPress.ts feeds it the finger's events and a clock.
 *
 *  What the person feels:
 *  - A tap opens the item, as it always did.
 *  - Moving the finger before the short hold is up is a scroll: the press is
 *    forgotten, so scrolling never starts a drag.
 *  - Held still for the short hold (about 0.35 s) the row is "ready": a light
 *    buzz, and from now on moving the finger drags it.
 *  - Held still for longer (about 0.8 s) the row opens in place instead: a
 *    second buzz. Letting go between the two does nothing at all, and never
 *    opens the editor by surprise.
 *  - A row that cannot be dragged (a habit, an event) skips the middle stage:
 *    only the long hold, which expands it. */

export interface HoldTimes {
  /** From the press to "ready to drag", in ms. */
  drag_ms: number
  /** From the press to "expand in place", in ms. Always later than drag_ms. */
  expand_ms: number
}

export const DEFAULT_HOLD: HoldTimes = { drag_ms: 350, expand_ms: 800 }

/** Past this many pixels the finger is moving, not holding. */
export const SLOP = 8

/** The slider limits in settings, the same the settings reader enforces. */
export const HOLD_LIMITS = { drag: [150, 1500], expand: [300, 3000], gap: 200 } as const

export type HoldPhase = 'idle' | 'pressing' | 'armed' | 'dragging' | 'expanded'

export interface HoldState {
  phase: HoldPhase
  /** Where and when the finger went down. */
  x: number
  y: number
  t: number
  canDrag: boolean
  canExpand: boolean
}

export type HoldEvent =
  | { type: 'down'; x: number; y: number; t: number; canDrag: boolean; canExpand: boolean }
  | { type: 'move'; x: number; y: number }
  /** The clock: sent when nextAt() says something may happen. */
  | { type: 'time'; t: number }
  | { type: 'up' }
  /** Taken away: Escape, a phone call, the app hidden. */
  | { type: 'cancel' }

/** What the screen should do after an event.
 *  - 'arm': buzz; the row is ready to be dragged.
 *  - 'drag': the drag begins (the finger has moved while ready).
 *  - 'drag-move': the dragged row follows the finger.
 *  - 'drop': let go after dragging.
 *  - 'expand': buzz; open the row in place (or close it if open).
 *  - 'tap': a plain tap; let the click through.
 *  - 'quiet': let go after holding; swallow the click, do nothing else.
 *  - 'forget': it was a scroll; nothing happens.
 *  - 'cancel-drag': the drag was taken away; put the row back. */
export type HoldAction = 'none' | 'arm' | 'drag' | 'drag-move' | 'drop' | 'expand' | 'tap' | 'quiet' | 'forget' | 'cancel-drag'

export const IDLE: HoldState = { phase: 'idle', x: 0, y: 0, t: 0, canDrag: false, canExpand: false }

const moved = (s: HoldState, x: number, y: number) => Math.hypot(x - s.x, y - s.y) > SLOP

/** The times kept sane: whole milliseconds inside the limits, and the long
 *  hold at least 200 ms after the short one, or the drag could never begin. */
export function cleanHold(v: Partial<HoldTimes> | null | undefined): HoldTimes {
  const ms = (x: unknown, [lo, hi]: readonly [number, number], d: number) => {
    const n = Number(x)
    return x != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d
  }
  const drag_ms = ms(v?.drag_ms, HOLD_LIMITS.drag, DEFAULT_HOLD.drag_ms)
  const expand_ms = Math.max(drag_ms + HOLD_LIMITS.gap, ms(v?.expand_ms, HOLD_LIMITS.expand, DEFAULT_HOLD.expand_ms))
  return { drag_ms, expand_ms }
}

/** One step of the hold. Pure: the same state and event always give the
 *  same answer. */
export function holdStep(s: HoldState, e: HoldEvent, times: HoldTimes): { state: HoldState; action: HoldAction } {
  const same = (action: HoldAction = 'none') => ({ state: s, action })
  const to = (phase: HoldPhase, action: HoldAction) => ({ state: phase === 'idle' ? IDLE : { ...s, phase }, action })

  if (e.type === 'down') {
    if (s.phase !== 'idle') return same()
    return { state: { phase: 'pressing', x: e.x, y: e.y, t: e.t, canDrag: e.canDrag, canExpand: e.canExpand }, action: 'none' }
  }
  if (s.phase === 'idle') return same()

  if (e.type === 'cancel') return to('idle', s.phase === 'dragging' ? 'cancel-drag' : 'forget')

  if (e.type === 'up') {
    if (s.phase === 'pressing') return to('idle', 'tap')
    if (s.phase === 'dragging') return to('idle', 'drop')
    // Ready but never moved, or already expanded: the click is not a tap.
    return to('idle', 'quiet')
  }

  if (e.type === 'move') {
    if (s.phase === 'pressing') return moved(s, e.x, e.y) ? to('idle', 'forget') : same()
    if (s.phase === 'armed') return moved(s, e.x, e.y) ? to('dragging', 'drag') : same()
    if (s.phase === 'dragging') return same('drag-move')
    // Expanded: the finger may wander while it is let go of.
    return same()
  }

  // The clock.
  const held = e.t - s.t
  if (s.phase === 'pressing' || s.phase === 'armed') {
    if (s.canExpand && held >= times.expand_ms) return to('expanded', 'expand')
    if (s.phase === 'pressing' && s.canDrag && held >= times.drag_ms) return to('armed', 'arm')
  }
  return same()
}

/** When the clock next matters, as a time after the press, or null when
 *  nothing more can happen by waiting. */
export function nextAt(s: HoldState, times: HoldTimes): number | null {
  if (s.phase === 'pressing') {
    if (s.canDrag) return s.t + times.drag_ms
    if (s.canExpand) return s.t + times.expand_ms
    return null
  }
  if (s.phase === 'armed') return s.canExpand ? s.t + times.expand_ms : null
  return null
}

/** "0.35 s" for the settings panel. */
export const seconds = (ms: number) => `${Math.round(ms / 10) / 100} s`
