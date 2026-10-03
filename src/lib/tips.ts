import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { NO_TIPS, noteFirstDay, readTipState, type TipState } from './tips-rules'

/** What tips this device has seen. Kept on the device: a tip is about using
 *  this phone, and a private window that forgets simply shows it again. */
const KEY = 'getit-tips'
const listeners = new Set<(s: TipState) => void>()

export function tipState(): TipState {
  try { return readTipState(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return NO_TIPS }
}

export function saveTipState(s: TipState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* not kept: fine */ }
  listeners.forEach((fn) => fn(s))
}

export function useTipState(): TipState {
  const [s, setS] = useState<TipState>(tipState)
  useEffect(() => {
    listeners.add(setS)
    // The first day GetIt is opened here, written once, for the tips that wait.
    const now = tipState()
    if (!now.first) saveTipState(noteFirstDay(now, format(new Date(), 'yyyy-MM-dd')))
    return () => { listeners.delete(setS) }
  }, [])
  return s
}
