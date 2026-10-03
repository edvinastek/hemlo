import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { cleanHold, DEFAULT_HOLD, HOLD_LIMITS, seconds, type HoldTimes } from '../lib/hold-rules'
import { useLongPress } from '../ui/useLongPress'
import './hold-settings.css'

/** Settings → Planning → Hold times (TOD-10): how long a row is held before it can be
 *  dragged, and before it opens in place. Both apply to every list that is
 *  held. A row to try them on, so the person feels the change before
 *  leaving. Kept in profile settings (hold), so every device follows. */
export function HoldSettings() {
  const profile = useApp((s) => s.profile)
  const stored = readSettings(profile).hold
  const [times, setTimes] = useState<HoldTimes>(stored)
  const timer = useRef(0)

  // Another device (or a reset) changed them: show the new ones.
  useEffect(() => { setTimes(stored) }, [stored.drag_ms, stored.expand_ms])

  if (!profile) return null

  function change(next: Partial<HoldTimes>) {
    const clean = cleanHold({ ...times, ...next })
    setTimes(clean)
    // Saved a moment after the slider stops, not on every step.
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { if (profile) void saveSettings(profile, { hold: clean }) }, 400)
  }

  const isDefault = times.drag_ms === DEFAULT_HOLD.drag_ms && times.expand_ms === DEFAULT_HOLD.expand_ms
  return (
    <section className="hs" aria-labelledby="hs-title">
      <p className="section-title" id="hs-title">Hold times</p>
      <label className="hs-row">
        <span className="hs-label">Ready to drag after <b>{seconds(times.drag_ms)}</b></span>
        <input type="range" min={HOLD_LIMITS.drag[0]} max={1000} step={50} value={times.drag_ms}
          aria-valuetext={seconds(times.drag_ms)} onChange={(e) => change({ drag_ms: Number(e.target.value) })} />
      </label>
      <label className="hs-row">
        <span className="hs-label">Open in place after <b>{seconds(times.expand_ms)}</b></span>
        <input type="range" min={times.drag_ms + HOLD_LIMITS.gap} max={2000} step={50} value={times.expand_ms}
          aria-valuetext={seconds(times.expand_ms)} onChange={(e) => change({ expand_ms: Number(e.target.value) })} />
      </label>
      <TryIt times={times} />
      {!isDefault && (
        <div className="hs-actions">
          <button type="button" className="btn" onClick={() => change(DEFAULT_HOLD)}>Back to 0.35 s and 0.8 s</button>
        </div>
      )}
    </section>
  )
}

/** A row to hold, which says what the hold did. */
function TryIt({ times }: { times: HoldTimes }) {
  const [said, setSaid] = useState('Try it: tap, hold, or hold and move')
  const [ready, setReady] = useState(false)
  const hold = useLongPress<string>({
    delay: times.drag_ms,
    expandDelay: times.expand_ms,
    onArm: (_k, _el, on) => { setReady(on); if (on) setSaid('Ready: move your finger to drag, or keep still') },
    onStart: () => { setSaid('Dragging. Let go to drop it.') },
    onDrop: () => { setReady(false); setSaid('Dropped. That was a drag.') },
    onCancel: () => { setReady(false); setSaid('Drag stopped.') },
    onExpand: () => { setReady(false); setSaid('Opened in place. That was a long hold.') },
  })
  return (
    <div className={`hs-try${ready ? ' is-ready' : ''}`} {...hold.bind('try')}>
      <button type="button" className="hs-try-btn" onClick={() => setSaid('A tap: that opens it.')}>Practice row</button>
      <span className="hs-try-said" aria-live="polite">{said}</span>
    </div>
  )
}
