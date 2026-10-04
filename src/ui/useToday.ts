import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { calendarDay, planDay } from '../lib/day-edge-rules'

/** The person's today on this phone, kept fresh: past the day's cut-off
 *  (midnight, or day end for a day that runs past it, GEN-70) it moves on
 *  by itself, and on coming back to the app it is read again. `now` is the
 *  clock; `late` says it is in the hours after midnight that still belong
 *  to the day, so the "now" line goes after the evening. */
export function useToday(): { today: string; now: string; late: boolean } {
  const start = useApp((s) => s.profile?.day_start ?? null)
  const end = useApp((s) => s.profile?.day_end ?? null)
  const read = useCallback(() => {
    const d = new Date()
    const today = planDay(d, { day_start: start, day_end: end })
    return { today, now: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, late: today !== calendarDay(d) }
  }, [start, end])
  const [state, setState] = useState(read)
  useEffect(() => {
    const tick = () => setState((s) => { const n = read(); return n.today === s.today && n.now === s.now && n.late === s.late ? s : n })
    tick()
    const id = window.setInterval(tick, 30_000)
    const seen = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', seen)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', seen) }
  }, [read])
  return state
}

/** Only the person's today, for screens that do not show the clock: it
 *  redraws when the day changes, not every minute. */
export function usePlanToday(): string {
  const start = useApp((s) => s.profile?.day_start ?? null)
  const end = useApp((s) => s.profile?.day_end ?? null)
  const read = useCallback(() => planDay(new Date(), { day_start: start, day_end: end }), [start, end])
  const [today, setToday] = useState(read)
  useEffect(() => {
    const tick = () => setToday(read())
    tick()
    const id = window.setInterval(tick, 30_000)
    const seen = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', seen)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', seen) }
  }, [read])
  return today
}
