import { useEffect, useRef } from 'react'

/** Swipe sideways on a page to reach the next or previous page on the bar.
 *
 *  The rule the owner set: a swipe moves the thing it started on. So a swipe
 *  that starts on something that moves sideways by itself (the week strip,
 *  the section tabs, a wide table, a map), on something being typed into, or
 *  inside a sheet or dialog, belongs to that thing and is left alone. Only a
 *  clearly sideways swipe counts: vertical scrolling is never taken over, and
 *  the listeners are passive, so the browser scrolls exactly as it would
 *  without them. */

interface Options {
  enabled: boolean
  /** Called with +1 for the next page (finger moved left), -1 for the previous. */
  onSwipe: (dir: 1 | -1) => boolean
}

/** Past this the swipe counts, if it was quick or went a quarter of the way. */
const MIN_DX = 60
/** Sideways must beat downwards by this much, so a slanted scroll stays a scroll. */
const RATIO = 1.5
/** px per ms: a flick. */
const FAST = 0.35

const LEAVE_ALONE = [
  '.week-strip', '.tabs', '[role="tablist"]', '.bottom-nav', '.bottom-sheet', '.sheet-scrim',
  '[role="dialog"]', '[aria-modal="true"]', '[role="listbox"]', '[role="slider"]',
  'input', 'textarea', 'select', '[contenteditable=""]', '[contenteditable="true"]',
  '.map', '.leaflet-container', '.maplibregl-map', 'canvas', '[data-no-swipe]',
].join(',')

/** Whether a swipe that starts on this element belongs to something else. */
export function ownsSwipe(target: EventTarget | null, root: HTMLElement): boolean {
  if (!(target instanceof Element)) return true
  if (target.closest(LEAVE_ALONE)) return true
  // Anything that itself scrolls sideways: tables, strips, the year grid.
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const o = getComputedStyle(el).overflowX
      if (o === 'auto' || o === 'scroll') return true
    }
  }
  // A sheet or dialog open anywhere means the page underneath is not in play.
  return !!document.querySelector('[aria-modal="true"], .bottom-sheet')
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** `root` is the element itself, not a ref: the app's frame mounts after
 *  the pages are known (a new account's wizard, "Setting up your profile"
 *  first), and an effect keyed on a ref never ran again once it did, so
 *  swiping stayed off until the app was opened again. */
export function useSwipe(root: HTMLElement | null, { enabled, onSwipe }: Options) {
  // The latest callback without re-adding listeners on every render.
  const swipe = useRef(onSwipe)
  swipe.current = onSwipe

  useEffect(() => {
    if (!root || !enabled) return

    let start: { x: number; y: number; t: number } | null = null
    // null until the gesture has shown its direction; then it is decided.
    let sideways: boolean | null = null
    let page: HTMLElement | null = null
    const still = reducedMotion()

    const settle = (el: HTMLElement | null) => {
      if (!el) return
      // A short spring back; cheap, since only transform changes.
      el.style.transition = 'transform 160ms ease-out'
      el.style.transform = ''
      window.setTimeout(() => { el.style.transition = '' }, 170)
    }

    const down = (e: TouchEvent) => {
      start = null; sideways = null; page = null
      if (e.touches.length !== 1) return
      if (ownsSwipe(e.target, root)) return
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, t: performance.now() }
      // The page's content moves, not the page: the add button and any sheet
      // are fixed to the screen, and a transform on their parent would pull
      // them along.
      page = (e.target as Element).closest('.page')?.querySelector<HTMLElement>(':scope > .page-inner') ?? null
    }

    const move = (e: TouchEvent) => {
      if (!start) return
      if (e.touches.length !== 1) { settle(page); start = null; return }
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (sideways === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        sideways = Math.abs(dx) > RATIO * Math.abs(dy)
        // A scroll: forget the gesture entirely.
        if (!sideways) { start = null; return }
      }
      // The page follows the finger a little, so the swipe is felt before it
      // lands. Capped at 40 px: a hint, not a carousel.
      if (page && !still) page.style.transform = `translateX(${Math.max(-40, Math.min(40, dx * 0.3))}px)`
    }

    const up = (e: TouchEvent) => {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const dt = Math.max(1, performance.now() - start.t)
      const el = page
      start = null
      const counts = sideways === true && Math.abs(dx) > MIN_DX && Math.abs(dx) > RATIO * Math.abs(dy)
        && (Math.abs(dx) / dt > FAST || Math.abs(dx) > root.clientWidth / 4)
      if (counts && swipe.current(dx < 0 ? 1 : -1)) {
        // The new page slides in from the side the finger came from.
        if (el) { el.style.transform = ''; el.style.transition = '' }
        if (!still) {
          root.dataset.swipe = dx < 0 ? 'next' : 'prev'
          window.setTimeout(() => { delete root.dataset.swipe }, 220)
        }
        return
      }
      settle(el)
    }

    const cancel = () => { settle(page); start = null; sideways = null }

    root.addEventListener('touchstart', down, { passive: true })
    root.addEventListener('touchmove', move, { passive: true })
    root.addEventListener('touchend', up, { passive: true })
    root.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      root.removeEventListener('touchstart', down)
      root.removeEventListener('touchmove', move)
      root.removeEventListener('touchend', up)
      root.removeEventListener('touchcancel', cancel)
    }
  }, [root, enabled])
}
