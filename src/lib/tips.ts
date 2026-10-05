import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { version as appVersion } from '../../package.json'
import { meetProfile, NO_TIPS, noteFirstDay, noteRun, readTipState, versionKey, type TipState } from './tips-rules'

/** What tips this device has seen, and which versions have run here. Kept
 *  on the device, in local storage rather than the database: signing out
 *  clears the database, and a version's first run must outlive that, or a
 *  new account signed in later would look like an old one. A private
 *  window that forgets simply shows a tip again. */
// The name from before Visuma, kept: renaming it would lose what is stored under it.
const KEY = 'getit-tips'
const listeners = new Set<(s: TipState) => void>()

/** The version running now, as people know it ("17"). */
export const RUNNING = versionKey(appVersion)

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
    // The first day Visuma is opened here, written once, for the tips that wait.
    const now = tipState()
    if (!now.first) saveTipState(noteFirstDay(now, format(new Date(), 'yyyy-MM-dd')))
    return () => { listeners.delete(setS) }
  }, [])
  return s
}

/** The first run of this version here, noted once, at start-up: before
 *  anyone signs in, so a new account is always newer than it. */
export function noteThisRun() {
  const s = tipState()
  const next = noteRun(s, RUNNING, new Date().toISOString())
  if (next !== s) saveTipState(next)
}

/** The open profile, met by this version: noted once, set up or not. */
export function noteProfileMet(id: string, setUp: boolean) {
  const s = tipState()
  const next = meetProfile(s, RUNNING, id, setUp)
  if (next !== s) saveTipState(next)
}

/* ---------- one tip a session (CALM-14) ------------------------------------- */

/** The one tip this session may show: the first to ask gets it, and keeps
 *  it while the app is open, so the rest wait for another session. The note
 *  on what moved takes the place too. Kept by id, not by component: React
 *  draws a component twice in development, each time with a new identity. */
let slot: string | null = null

export function claimTip(id: string): boolean {
  if (!slot) slot = id
  return slot === id
}

/** Whether a tip could still claim the place (for choosing among several). */
export const tipPlaceFree = (id: string) => !slot || slot === id
