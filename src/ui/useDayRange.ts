import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { clampDay, navRange, type DayRange } from '../lib/calendar-rules'
import { useToday } from './useToday'

export interface DayRangeTools {
  /** The person's today as 'yyyy-MM-dd' (after midnight, still the day
   *  before until the day's cut-off, GEN-70). */
  today: string
  /** Three years back to five years ahead, whole months (lib/calendar-rules). */
  range: DayRange
  /** The same date when it is inside the range, else the nearest end of it. */
  clamp: (d: Date) => Date
}

/** How far every view lets a person move: Today's day, Plan's week, month
 *  and year, and the header's day picker all stop at the same two ends. */
export function useDayRange(): DayRangeTools {
  const { today } = useToday()
  return useMemo(() => {
    const range = navRange(today)
    return {
      today,
      range,
      clamp: (d: Date) => {
        const day = format(d, 'yyyy-MM-dd')
        const kept = clampDay(day, range)
        return kept === day ? d : parseISO(kept)
      },
    }
  }, [today])
}
