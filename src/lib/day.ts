import { db } from './db'
import { loadReview } from './review'
import type { ProfileSettings } from './settings'
import type { ModuleRow } from './types'
import type { DayInput } from './day-tabs'

/** The modules switched on for a profile. A built-in module counts only with
 *  a row that says it is on, the way More → Modules shows it. A module the
 *  person built is theirs and on from the moment it exists, unless a row
 *  switches it off. */
export async function enabledModules(profileId: string, built: ModuleRow[]): Promise<string[]> {
  const rows = await db.module_instance.where('profile_id').equals(profileId).toArray()
  const byKey = new Map(rows.map((r) => [r.module_key, r.enabled]))
  const on = rows.filter((r) => r.enabled).map((r) => r.module_key)
  for (const m of built) if (!m.deleted_at && byKey.get(m.key) !== false && !on.includes(m.key)) on.push(m.key)
  return on
}

/** Everything the tab rules in day-tabs.ts look at, for one day, read from
 *  the local copy. Only what a rule needs is counted: a flag or a number,
 *  never the rows, so the live query stays small. */
export async function loadDayInput(
  profileId: string, day: string, today: string, settings: Pick<ProfileSettings, 'work'>,
): Promise<DayInput> {
  const built = (await db.module.toArray()).filter((m) => !m.builtin && !m.deleted_at)
  const [enabled, tasks, habits, supplements, bodyRows, sleepRows, review, records] = await Promise.all([
    enabledModules(profileId, built),
    db.task.where('[profile_id+planned_date]').equals([profileId, day]).toArray(),
    db.habit.where('profile_id').equals(profileId).toArray(),
    db.supplement.where('profile_id').equals(profileId).toArray(),
    db.body_log.where('log_date').equals(day).filter((r) => r.profile_id === profileId && !r.deleted_at).count(),
    db.sleep_log.where('[profile_id+log_date]').equals([profileId, day]).filter((r) => !r.deleted_at).count(),
    loadReview(profileId, day),
    db.module_record.where('record_date').equals(day)
      .filter((r) => r.profile_id === profileId && !r.deleted_at).toArray(),
  ])
  return {
    day,
    today,
    enabled,
    work: { on: settings.work.on, days: settings.work.days },
    tasks: tasks.filter((t) => !t.deleted_at),
    habits,
    supplements,
    weighIn: bodyRows > 0,
    sleepLog: sleepRows > 0,
    review: review.length,
    records: records.map((r) => r.module_key),
    names: Object.fromEntries(built.map((m) => [m.key, m.name])),
  }
}
