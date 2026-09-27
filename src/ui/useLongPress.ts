import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

/** Press and hold to pick something up, then drag it. Works with a finger
 *  and a mouse alike, through pointer events, with no library.
 *
 *  A quick tap is left alone, so buttons inside still tick and open as
 *  before. Moving more than a few pixels before the hold is up means the
 *  person is scrolling or swiping, and the press is forgotten. Once the hold
 *  is up, the page no longer scrolls under the finger and the sideways swipe
 *  between pages never sees the drag: its touch moves are stopped at the
 *  window, before they reach the swipe's listener. The click that would
 *  follow letting go is swallowed, so a drag never ticks a task by accident. */

export interface PressPoint { x: number; y: number }

export interface LongPressOptions<K> {
  /** How long to hold, in ms. */
  delay?: number
  /** The hold is up. Return false to refuse (nothing is picked up). */
  onStart: (key: K, at: PressPoint, el: HTMLElement) => boolean | void
  onMove?: (key: K, at: PressPoint) => void
  /** Let go after the hold. */
  onDrop?: (key: K, at: PressPoint) => void
  /** Taken away mid-drag (Escape, a phone call, the app hidden). */
  onCancel?: (key: K) => void
}

/** Past this, before the hold is up, it is a scroll and not a press. */
const SLOP = 8

interface Press<K> {
  key: K
  pointer: number
  x: number
  y: number
  el: HTMLElement
  timer: number
  active: boolean
}

export function useLongPress<K>(options: LongPressOptions<K>) {
  const opts = useRef(options)
  opts.current = options
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
    if (press.current?.active) opts.current.onCancel?.(press.current.key)
    end()
  }, [end])

  const begin = useCallback((key: K, e: ReactPointerEvent<HTMLElement>) => {
    if (press.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    const el = e.currentTarget
    const p: Press<K> = { key, pointer: e.pointerId, x: e.clientX, y: e.clientY, el, timer: 0, active: false }
    press.current = p

    p.timer = window.setTimeout(() => {
      if (press.current !== p) return
      if (opts.current.onStart(key, { x: p.x, y: p.y }, el) === false) return end()
      p.active = true
      document.documentElement.classList.add('is-holding')
      window.getSelection?.()?.removeAllRanges()
      // A small buzz on phones that allow it; nothing where they do not.
      try { navigator.vibrate?.(8) } catch { /* not allowed here */ }
    }, opts.current.delay ?? 350)

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return
      if (!p.active) {
        if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > SLOP) end()
        return
      }
      ev.preventDefault()
      opts.current.onMove?.(key, { x: ev.clientX, y: ev.clientY })
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return
      const was = p.active
      end()
      if (!was) return
      swallowClick()
      opts.current.onDrop?.(key, { x: ev.clientX, y: ev.clientY })
    }
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== p.pointer) return
      const was = p.active
      end()
      if (was) opts.current.onCancel?.(key)
    }
    // Touch moves: while holding, no scrolling and no page swipe. Captured at
    // the window so they are stopped before the swipe's listener sees them.
    const touch = (ev: TouchEvent) => {
      if (!p.active) return
      if (ev.cancelable) ev.preventDefault()
      ev.stopPropagation()
    }
    const key_ = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !p.active) return
      end()
      opts.current.onCancel?.(key)
    }
    const hidden = () => {
      if (!document.hidden) return
      const was = p.active
      end()
      if (was) opts.current.onCancel?.(key)
    }

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
  }, [end])

  /** Spread onto the thing that can be held. */
  const bind = useCallback((key: K) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => begin(key, e),
    // A phone's own long-press menu (copy, select) would open over the drag.
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
