import { useApp } from './store'
import { dayEdges, planDay, type DayEdges } from './day-edge-rules'

/** The person's today (GEN-70), for code that is not a screen: the open
 *  profile's day start and day end decide whether a moment just after
 *  midnight still belongs to the day before (day-edge-rules.ts). Every
 *  place that asks "which day is it" for Today, ticks, food logs and the
 *  review asks this, so they can never disagree. */
export function planToday(now: Date = new Date()): string {
  return planDay(now, useApp.getState().profile)
}

/** The person's day of a stored moment (an ISO time such as completed_at),
 *  or of now when there is none. */
export function planDayOf(at: string | Date | null | undefined): string {
  const d = at instanceof Date ? at : at ? new Date(at) : new Date()
  return planToday(Number.isFinite(d.getTime()) ? d : new Date())
}

/** The open profile's day edges, live: a change in Settings redraws. */
export function useDayEdges(): DayEdges {
  const start = useApp((s) => s.profile?.day_start ?? null)
  const end = useApp((s) => s.profile?.day_end ?? null)
  return dayEdges({ day_start: start, day_end: end })
}
