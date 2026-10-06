import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { WHAT_MOVED, movedShows, readMoved } from '../lib/tips-rules'
import { claimTip, saveTipState, useTipState } from '../lib/tips'
import './what-moved.css'
import { useBackClose } from './useBackClose'

/** "What moved where" (NAV-26, CALM-18): once, after updating to this
 *  version, a short note on every function that moved and where it is now.
 *  Only for someone who used Hemlo before (tips-rules movedShows); a new
 *  account never sees it. It takes the session's one tip place, so no tip
 *  shows on top of it. Mounted once in App; the list can be read again from
 *  Settings → Reminders and tips (`<WhatMovedList />`). */
export function WhatMoved() {
  const profile = useApp((s) => s.profile)
  const s = useTipState()
  const box = useRef<HTMLDivElement>(null)
  const due = movedShows(s, profile as unknown as { id: string; created_at?: string | null } | null)
  // Claimed once due, and kept: reading it marks it read, which would
  // otherwise let a tip take the place straight after.
  const [mine, setMine] = useState(false)
  useEffect(() => { if (due && !mine && claimTip('what-moved')) setMine(true) }, [due, mine])
  const show = due && mine
  useEffect(() => {
    if (!show) return
    box.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') saveTipState(readMoved(s)) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [show, s])
  useBackClose(() => saveTipState(readMoved(s)), show)
  if (!show) return null
  const done = () => saveTipState(readMoved(s))
  return (
    <>
      <div className="sheet-scrim" onClick={done} />
      <div ref={box} className="bottom-sheet wm" role="dialog" aria-modal="true" aria-labelledby="wm-title">
        <h2 id="wm-title">What moved where</h2>
        <p className="wm-lead">Hemlo is calmer. Nothing was taken away: here is where each thing is now.</p>
        <WhatMovedList />
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary grow" onClick={done}>Got it</button>
        </div>
      </div>
    </>
  )
}

export function WhatMovedList() {
  return (
    <dl className="wm-list">
      {WHAT_MOVED.map((m) => (
        <div key={m.was} className="wm-item">
          <dt>{m.was}</dt>
          <dd>{m.now}</dd>
        </div>
      ))}
    </dl>
  )
}
