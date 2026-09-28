import { useSyncExternalStore } from 'react'

/** The three shapes the app is laid out in:
 *  - 'bar': a phone held upright. The page bar sits along the bottom. This is
 *    the layout everything was designed for, and nothing below changes it.
 *  - 'rail': a phone turned sideways (short and wide). The page bar becomes a
 *    slim rail down the left, and the pages use the width.
 *  - 'wide': a desktop, a tablet or any screen 900 px or wider that is not
 *    short. The sidebar sits on the left, as it always has.
 *
 *  The answer is also written on <html> as data-layout="bar|rail|wide", so a
 *  stylesheet can say `[data-layout="rail"] .something { … }` and leave the
 *  upright phone alone. */
export type Layout = 'bar' | 'rail' | 'wide'

/** Sideways and no taller than 500 px: a phone on its side (a small
 *  landscape tablet is taller than this and gets the wide layout). */
export const RAIL_QUERY = '(orientation: landscape) and (max-height: 500px)'
export const WIDE_QUERY = '(min-width: 900px)'

const listeners = new Set<() => void>()
let current: Layout = 'bar'

function read(): Layout {
  if (typeof window === 'undefined' || !window.matchMedia) return 'bar'
  // A sideways phone can be 900 px wide or more (932 × 430), so the rail is
  // checked first: it is the shape of the screen that decides, not its width.
  if (window.matchMedia(RAIL_QUERY).matches) return 'rail'
  if (window.matchMedia(WIDE_QUERY).matches) return 'wide'
  return 'bar'
}

function update() {
  const next = read()
  if (typeof document !== 'undefined') document.documentElement.dataset.layout = next
  if (next === current) return
  current = next
  listeners.forEach((l) => l())
}

// Set once as soon as this file loads, before the first paint, so the page
// never draws in the wrong shape first; then kept up to date as the phone
// turns or the window is resized.
if (typeof window !== 'undefined' && window.matchMedia) {
  current = read()
  update()
  for (const q of [RAIL_QUERY, WIDE_QUERY]) window.matchMedia(q).addEventListener('change', update)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Which layout the screen is in now; the component redraws when it changes. */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, () => current, () => 'bar')
}
