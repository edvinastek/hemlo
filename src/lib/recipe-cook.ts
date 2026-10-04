import { create } from 'zustand'
import { isDue, pauseTimer, resumeTimer, startTimer, toRing, type RunningTimer } from './cook-rules'
import { haptic } from './native'

/** Cook mode's timers (REC-12), kept for the whole app rather than inside
 *  the cook screen: a timer started on step 2 keeps running on step 5, when
 *  the cook screen is closed and opened again, and while the phone sleeps,
 *  because each keeps the moment it ends (cook-rules.ts). A ticker checks
 *  them twice a second while any run, and a timer that reaches zero plays
 *  a short sound and buzzes once, wherever the person is in the app. */

interface CookTimers { timers: RunningTimer[]; now: number }

export const useCookTimers = create<CookTimers>(() => ({ timers: [], now: Date.now() }))

let ticker: number | null = null
/** Told when a timer has rung, so a screen can say so (the bar at the foot). */
let onRing: ((t: RunningTimer) => void) | null = null
export const whenTimerRings = (fn: ((t: RunningTimer) => void) | null) => { onRing = fn }

function tick() {
  const now = Date.now()
  const { timers } = useCookTimers.getState()
  const ringing = toRing(timers, now)
  if (ringing.length) {
    ring()
    ringing.forEach((t) => onRing?.(t))
  }
  useCookTimers.setState({ now, timers: ringing.length ? timers.map((t) => (ringing.some((r) => r.id === t.id) ? { ...t, rang: true } : t)) : timers })
  const live = useCookTimers.getState().timers.some((t) => !t.rang)
  if (!live && ticker !== null) { window.clearInterval(ticker); ticker = null }
}

function run() {
  if (ticker === null && typeof window !== 'undefined') ticker = window.setInterval(tick, 500)
  tick()
}

// Back from the background: catch up at once rather than on the next tick.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden && useCookTimers.getState().timers.length) run() })

export function startCookTimer(id: string, label: string, seconds: number) {
  const now = Date.now()
  const rest = useCookTimers.getState().timers.filter((t) => t.id !== id)
  useCookTimers.setState({ now, timers: [...rest, startTimer(id, label, seconds, now)] })
  run()
}

export function pauseCookTimer(id: string) {
  const now = Date.now()
  useCookTimers.setState((s) => ({ now, timers: s.timers.map((t) => (t.id === id ? pauseTimer(t, now) : t)) }))
}

export function resumeCookTimer(id: string) {
  const now = Date.now()
  useCookTimers.setState((s) => ({ now, timers: s.timers.map((t) => (t.id === id ? resumeTimer(t, now) : t)) }))
  run()
}

export function stopCookTimer(id: string) {
  useCookTimers.setState((s) => ({ timers: s.timers.filter((t) => t.id !== id) }))
}

/** Timers that are done and were seen go when cook mode is closed. */
export function clearRungTimers() {
  const now = Date.now()
  useCookTimers.setState((s) => ({ timers: s.timers.filter((t) => !t.rang && !isDue(t, now)) }))
}

/** A short sound (three soft beeps, made here, no file) and one buzz. The
 *  sound needs the page to have been touched first, which starting the
 *  timer always is. */
let audio: AudioContext | null = null
function ring() {
  haptic('hold')
  try { navigator.vibrate?.([200, 100, 200]) } catch { /* not every device buzzes */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audio = audio ?? new Ctx()
    void audio.resume()
    const start = audio.currentTime + 0.05
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start + i * 0.3)
      gain.gain.exponentialRampToValueAtTime(0.25, start + i * 0.3 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.3 + 0.2)
      osc.connect(gain).connect(audio.destination)
      osc.start(start + i * 0.3)
      osc.stop(start + i * 0.3 + 0.22)
    }
  } catch { /* no sound on this device: the buzz and the screen say it */ }
}

/** Ready the sound on a tap (browsers start audio only after one). */
export function primeSound() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) { audio = audio ?? new Ctx(); void audio.resume() }
  } catch { /* fine without */ }
}

// ---- keeping the screen on -----------------------------------------------------------

/** The screen kept on while cook mode is open: the Wake Lock API, which the
 *  Android app's WebView (Chromium) and current browsers have. The lock goes
 *  when the app is hidden, so it is taken again on return. Returns a release
 *  function; does nothing where the API is missing. */
export function keepScreenOn(): () => void {
  type Sentinel = { release: () => Promise<void>; released?: boolean }
  const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }
  if (!nav.wakeLock) return () => undefined
  let lock: Sentinel | null = null
  let done = false
  const take = async () => {
    if (done || document.hidden) return
    try { lock = await nav.wakeLock!.request('screen') } catch { lock = null }
    if (done) void lock?.release().catch(() => undefined)
  }
  const again = () => { if (!document.hidden && (!lock || lock.released)) void take() }
  document.addEventListener('visibilitychange', again)
  void take()
  return () => {
    done = true
    document.removeEventListener('visibilitychange', again)
    void lock?.release().catch(() => undefined)
  }
}

/** Whether this device can keep the screen on. */
export const canKeepScreenOn = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator
