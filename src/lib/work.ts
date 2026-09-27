import { format } from 'date-fns'
import { db } from './db'
import { startSeries, stopSeries } from './series'
import { blankTask } from './tasks'
import { edit } from './write'
import type { ProfileSettings } from './settings'
import type { Profile } from './types'
import { planWorkChanges, workSpecs, type ManagedTemplate, type WorkChanges } from './work-rules'

/** Only one run at a time. Two runs side by side (a quick double save) would
 *  each see no work series and each start one. */
let running: Promise<unknown> = Promise.resolve()

/** Put work hours and the commute into the plan, or take them out, to match
 *  the settings. A series that already matches is left alone; one that no
 *  longer does is stopped the way "Stop repeating" stops it (today stays,
 *  later days that are not done go) and a new one starts tomorrow. Everything
 *  is written locally and queued, so it works offline. Returns what it did. */
export function applyWorkPlan(profile: Profile, settings: ProfileSettings, now: Date = new Date()): Promise<WorkChanges> {
  const next = running.then(() => apply(profile, settings, now))
  running = next.catch(() => undefined)
  return next
}

async function apply(profile: Profile, settings: ProfileSettings, now: Date) {
  const today = format(now, 'yyyy-MM-dd')
  const existing = await db.series.where('profile_id').equals(profile.id).toArray()
  const changes = planWorkChanges(existing, workSpecs(settings), today)

  for (const s of changes.stop) await stopSeries(s, now)

  for (const { spec, start_date } of changes.start) {
    const first = blankTask(profile.id, start_date, {
      title: spec.title, category: spec.category, planned_time: spec.time_of_day,
      duration_min: spec.duration_min, locked: spec.locked, notes: spec.notes, source: 'module',
    })
    const series = await startSeries(first, { kind: 'weekly', weekdays: spec.weekdays, endDate: null }, true)
    // The marker is what finds this series again next time. It goes on once
    // the series exists: a row not sent yet goes up with it, one already
    // sent gets it as an update.
    const template: ManagedTemplate = { ...series.task_template, managed: spec.key }
    await edit('series', series, { task_template: template })
  }
  return changes
}
