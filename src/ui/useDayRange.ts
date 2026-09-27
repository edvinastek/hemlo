import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { clampDay, navRange, type DayRange } from '../lib/calendar-rules'

export interface DayRangeTools {
  /** Today as 'yyyy-MM-dd'. */
  today: string
  /** Three years back to five years ahead, whole months (lib/calendar-rules). */
  range: DayRange
  /** The same date when it is inside the range, else the nearest end of it. */
  clamp: (d: Date) => Date
}

/** How far every view lets a person move: Today's day, Plan's week, month
 *  and year, and the header's day picker all stop at the same two ends. */
export function useDayRange(): DayRangeTools {
  const today = format(new Date(), 'yyyy-MM-dd')
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
