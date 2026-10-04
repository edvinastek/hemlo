import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useApp } from './store'
import { moduleView, modulesOn } from './module-view-rules'
import { loadReview } from './review'
import type { ProfileSettings } from './settings'
import type { ModuleRow } from './types'
import type { DayInput } from './day-tabs'
import { builtinRuleOn } from '../modules/rule-switch'
import { readWeighInPlan } from './body-measure-rules'

/** The modules switched on for a profile. A built-in module counts only with
 *  a row that says it is on, the way More → Modules shows it. A module the
 *  person built is theirs and on from the moment it exists, unless a row
 *  switches it off. */
export async function enabledModules(profileId: string, built: ModuleRow[]): Promise<string[]> {
  const rows = await db.module_instance.where('profile_id').equals(profileId).toArray()
  // The one rule (module-view-rules.ts), the same the page bar uses: a module
  // is on when its switch is on, and a built module also has to exist, so a
  // tab never leads to a page the bar does not have.
  return [...modulesOn(rows, built)]
}

/** Whether one module is on for a profile, by the same rule. For code that
 *  asks about a single module (a figure on Today, a section's own check). */
export async function isModuleOn(profileId: string, key: string): Promise<boolean> {
  const built = key.startsWith('u_') ? await db.module.where('key').equals(key).toArray() : []
  return (await enabledModules(profileId, built)).includes(key)
}

/** The modules on for the open profile, live: switching one off in More, the
 *  hub or on another device takes it out of every list that reads this
 *  within the same moment, with no reload. Undefined while loading. */
export function useModulesOn(): Set<string> | undefined {
  const profileId = useApp((s) => s.profile?.id ?? null)
  return useLiveQuery(async () => {
    if (!profileId) return new Set<string>()
    const built = await db.module.toArray()
    return new Set(await enabledModules(profileId, built))
  }, [profileId])
}

/** Everything the tab rules in day-tabs.ts look at, for one day, read from
 *  the local copy. Only what a rule needs is counted: a flag or a number,
 *  never the rows, so the live query stays small. */
export async function loadDayInput(
  profileId: string, day: string, today: string, settings: Pick<ProfileSettings, 'work'> & Partial<Pick<ProfileSettings, 'module_views'>>,
): Promise<DayInput> {
  const built = (await db.module.toArray()).filter((m) => !m.builtin && !m.deleted_at)
  const [enabled, tasks, allHabits, supplements, bodyRows, sleepRows, review, records, habitsDaily] = await Promise.all([
    enabledModules(profileId, built),
    db.task.where('[profile_id+planned_date]').equals([profileId, day]).toArray(),
    db.habit.where('profile_id').equals(profileId).toArray(),
    db.supplement.where('profile_id').equals(profileId).toArray(),
    db.body_log.where('log_date').equals(day).filter((r) => r.profile_id === profileId && !r.deleted_at).count(),
    db.sleep_log.where('[profile_id+log_date]').equals([profileId, day]).filter((r) => !r.deleted_at).count(),
    loadReview(profileId, day),
    db.module_record.where('record_date').equals(day)
      .filter((r) => r.profile_id === profileId && !r.deleted_at).toArray(),
    // The Habits rule "a daily habit appears on every day"; switched off in
    // Edit module, habits stay on their page and leave the day.
    builtinRuleOn(profileId, 'habits', 'daily'),
  ])
  const habits = habitsDaily ? allHabits : []
  return {
    day,
    today,
    enabled,
    // Show on Today switched off (GEN-03): the module's items leave Today,
    // and with them its tab (HAB-23 for habits).
    offToday: enabled.filter((k) => !moduleView(settings.module_views ?? {}, k).today),
    work: { on: settings.work.on, days: settings.work.days },
    tasks: tasks.filter((t) => !t.deleted_at),
    habits,
    supplements,
    weighIn: bodyRows > 0,
    weighInDay: readWeighInPlan((await db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'health').first())?.settings).day,
    sleepLog: sleepRows > 0,
    review: review.length,
    records: records.map((r) => r.module_key),
    names: Object.fromEntries(built.map((m) => [m.key, m.name])),
  }
}
