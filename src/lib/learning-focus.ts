import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { readFocus, endsAt, focusRecord, type FocusState } from './learning-focus-rules'
import { cancelFocusEnd, scheduleFocusEnd } from './notify'
import { logStudySession } from './learning'
import type { ModuleRecord } from './types'

/** The running focus timer on this device (LRN-06). It is kept in the
 *  browser's own storage, not synced: a timer belongs to the phone it runs
 *  on. Only its start and its pauses are stored, so leaving the page, a
 *  locked screen or a closed app loses nothing (learning-focus-rules.ts). */

// The name from before Visuma, kept: renaming it would lose what is stored under it.
const KEY = 'getit.focus'
const listeners = new Set<(s: FocusState | null) => void>()

export function loadFocus(): FocusState | null {
  try { return readFocus(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return null }
}

/** Keep the timer (null: none) and set its end notification to match. */
export function saveFocus(next: FocusState | null): void {
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch { /* storage refused: the timer still runs while the page is open */ }
  listeners.forEach((fn) => fn(next))
  const end = next ? endsAt(next) : null
  void (end && end > Date.now() ? scheduleFocusEnd(new Date(end), next!.subject) : cancelFocusEnd())
}

/** The timer, live across the app's pages and other tabs. */
export function useFocus(): FocusState | null {
  const [state, setState] = useState<FocusState | null>(loadFocus)
  useEffect(() => {
    listeners.add(setState)
    const other = (e: StorageEvent) => { if (e.key === KEY) setState(loadFocus()) }
    window.addEventListener('storage', other)
    return () => { listeners.delete(setState); window.removeEventListener('storage', other) }
  }, [])
  return state
}

/** A clock that ticks once a second while `on`, for drawing the time. */
export function useNow(on: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    // Back from a locked screen: draw the right time at once.
    const seen = () => setNow(Date.now())
    document.addEventListener('visibilitychange', seen)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', seen) }
  }, [on])
  return now
}

const local = (ms: number) => ({ day: format(ms, 'yyyy-MM-dd'), time: format(ms, 'HH:mm') })

/** Stop the timer and log what was focused as a study session. Returns the
 *  record, or null when under a minute was focused (nothing to log). */
export async function stopFocus(profileId: string, s: FocusState, now = Date.now()): Promise<ModuleRecord | null> {
  saveFocus(null)
  const data = focusRecord(s, now, local)
  return data ? logStudySession(profileId, data) : null
}
