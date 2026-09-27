import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from './db'
import { fillHorizon, plannedRepeats, type PlannedRepeat } from './series-rules'

/** The planned repeats landing between from and to, by day. A series is only
 *  turned into real tasks eight weeks ahead; past that, this works out from
 *  the series themselves where they will land, so a far-off week or the year
 *  view still shows them. The rules are in series-rules (plannedRepeats). */
export function usePlannedRepeats(profileId: string | undefined, from: string, to: string): Map<string, PlannedRepeat[]> {
  const today = format(new Date(), 'yyyy-MM-dd')
  const horizon = fillHorizon(today)
  const list = useLiveQuery(async () => {
    // Nothing is planned up to the horizon, so a window before it costs nothing.
    if (!profileId || to <= horizon) return []
    const series = (await db.series.where('profile_id').equals(profileId).toArray())
      .filter((s) => s.active && !s.deleted_at)
    if (series.length === 0) return []
    const exceptions = await db.series_exception.where('series_id').anyOf(series.map((s) => s.id)).toArray()
    // Deleted tasks count: a day taken off stays off.
    const tasks = await db.task.where('profile_id').equals(profileId).filter((t) => !!t.series_id).toArray()
    return plannedRepeats(series, exceptions, tasks, from, to, horizon)
  }, [profileId, from, to, horizon], [] as PlannedRepeat[])

  return useMemo(() => {
    const byDay = new Map<string, PlannedRepeat[]>()
    for (const r of list) {
      const day = byDay.get(r.date) ?? []
      day.push(r)
      byDay.set(r.date, day)
    }
    return byDay
  }, [list])
}
