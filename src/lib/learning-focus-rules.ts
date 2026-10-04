/** The focus timer (LRN-06), worked out with no database, no React and no
 *  clock of its own (checked in src/test/learning.check.mjs).
 *
 *  The timer is kept as the moment it started and the time spent paused,
 *  never as a counter that ticks: a page change, a locked screen or the app
 *  being closed cannot lose time, because the time is always worked out
 *  again from the clock. Times are milliseconds since 1970. */

export type FocusMode = 'up' | 'down'

export interface FocusState {
  subject: string
  /** When it started. */
  started_at: number
  mode: FocusMode
  /** Minutes to count down from; null when counting up. */
  length_min: number | null
  /** When it was paused, while it is. */
  paused_at: number | null
  /** Time spent paused before the current pause. */
  paused_ms: number
}

/** Ready-made lengths for counting down. */
export const FOCUS_LENGTHS = [25, 50] as const
/** Longest a timer may run, either way: a day. */
export const FOCUS_MAX_MIN = 24 * 60

export function startFocus(subject: string, mode: FocusMode, lengthMin: number | null, now: number): FocusState {
  const len = mode === 'down' ? Math.max(1, Math.min(FOCUS_MAX_MIN, Math.round(lengthMin ?? 25))) : null
  return { subject: subject.trim().slice(0, 200) || 'Study', started_at: now, mode, length_min: len, paused_at: null, paused_ms: 0 }
}

/** Time focused so far (pauses left out), never past the length when counting down. */
export function elapsedMs(s: FocusState, now: number): number {
  const until = s.paused_at ?? now
  const ms = Math.max(0, until - s.started_at - s.paused_ms)
  return s.length_min != null ? Math.min(ms, s.length_min * 60_000) : Math.min(ms, FOCUS_MAX_MIN * 60_000)
}

/** Time left when counting down; null when counting up. */
export const remainingMs = (s: FocusState, now: number): number | null =>
  s.length_min == null ? null : Math.max(0, s.length_min * 60_000 - elapsedMs(s, now))

/** A countdown has run out (or a count-up has hit the day's limit). */
export const isFinished = (s: FocusState, now: number) =>
  s.paused_at == null && (s.length_min != null ? remainingMs(s, now) === 0 : elapsedMs(s, now) >= FOCUS_MAX_MIN * 60_000)

export const pauseFocus = (s: FocusState, now: number): FocusState => (s.paused_at != null ? s : { ...s, paused_at: now })
export const resumeFocus = (s: FocusState, now: number): FocusState =>
  s.paused_at == null ? s : { ...s, paused_ms: s.paused_ms + Math.max(0, now - s.paused_at), paused_at: null }

/** When a running countdown ends, for the notification; null when paused or counting up. */
export const endsAt = (s: FocusState): number | null =>
  s.length_min == null || s.paused_at != null ? null : s.started_at + s.paused_ms + s.length_min * 60_000

/** Whole minutes to log, rounded to the nearest; under half a minute is nothing. */
export const minutesToLog = (s: FocusState, now: number): number => Math.round(elapsedMs(s, now) / 60_000)

/** "12:05" (minutes and seconds), "1:02:05" past an hour. */
export function clock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`
}

/** A stored timer, checked: anything odd is no timer at all. */
export function readFocus(v: unknown): FocusState | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  const started = num(r.started_at)
  if (started == null || typeof r.subject !== 'string' || (r.mode !== 'up' && r.mode !== 'down')) return null
  const len = num(r.length_min)
  if (r.mode === 'down' && (len == null || len < 1 || len > FOCUS_MAX_MIN)) return null
  return {
    subject: r.subject.slice(0, 200) || 'Study', started_at: started, mode: r.mode,
    length_min: r.mode === 'down' ? len : null, paused_at: num(r.paused_at), paused_ms: Math.max(0, num(r.paused_ms) ?? 0),
  }
}

/** The study record a finished timer leaves: the day and time it started,
 *  the minutes focused, marked as logged so it puts no task on the plan. */
export function focusRecord(s: FocusState, now: number, toLocal: (ms: number) => { day: string; time: string }): { subject: string; block_date: string; start: string; minutes: number; logged: true } | null {
  const minutes = minutesToLog(s, now)
  if (minutes < 1) return null
  const at = toLocal(s.started_at)
  return { subject: s.subject, block_date: at.day, start: at.time, minutes, logged: true }
}
