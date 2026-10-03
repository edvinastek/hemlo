import { useEffect, useRef } from 'react'
import { useApp } from '../lib/store'
import { WHAT_MOVED, movedShows, readMoved } from '../lib/tips-rules'
import { saveTipState, useTipState } from '../lib/tips'
import './what-moved.css'

/** "What moved where" (NAV-26): once, after updating to this version, a
 *  short note on every function that moved and where it is now. Nothing was
 *  removed; this says where to find it. Mounted once in App; the list can be
 *  read again from Settings → Reminders → Tips (`<WhatMovedList />`). */
export function WhatMoved() {
  const profile = useApp((s) => s.profile)
  const s = useTipState()
  const since = (profile as unknown as { created_at?: string } | null)?.created_at ?? null
  const box = useRef<HTMLDivElement>(null)
  const show = !!profile && movedShows(s, since)
  useEffect(() => {
    if (!show) return
    box.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') saveTipState(readMoved(s)) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [show, s])
  if (!show) return null
  const done = () => saveTipState(readMoved(s))
  return (
    <>
      <div className="sheet-scrim" onClick={done} />
      <div ref={box} className="bottom-sheet wm" role="dialog" aria-modal="true" aria-labelledby="wm-title">
        <h2 id="wm-title">What moved where</h2>
        <p className="wm-lead">GetIt has a new shape. Nothing was taken away: here is where each thing is now.</p>
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
