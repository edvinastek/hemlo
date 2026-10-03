import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { readPlanPrefs, type PlanPrefs } from './plan-view-rules'
import type { ModuleInstance } from './types'

/** The person's Plan choices (week length, hidden calendars, the copy
 *  dialog's last choices, their own sections, day and week templates) live
 *  in the core module's settings: per profile, synced, and checked on every
 *  read (plan-view-rules.ts). Nothing here goes in settings.ts. */

async function coreRow(profileId: string): Promise<ModuleInstance | undefined> {
  return db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'core').first()
}

const EMPTY = readPlanPrefs(null)

/** The Plan choices, kept live: a change on another device shows here. */
export function usePlanPrefs(profileId: string | null | undefined): PlanPrefs {
  return useLiveQuery(async () => (profileId ? readPlanPrefs((await coreRow(profileId))?.settings) : EMPTY), [profileId], EMPTY) ?? EMPTY
}

export async function loadPlanPrefs(profileId: string): Promise<PlanPrefs> {
  return readPlanPrefs((await coreRow(profileId))?.settings)
}

/** Change some Plan choices; every other key in the core settings (Plan's
 *  or anyone else's) stays as it is. The row is read fresh first, so two
 *  quick changes never undo each other. A profile with no core row yet
 *  (an old account) gets one; the sync folds it into the server's row for
 *  the same module by its natural key. */
export async function savePlanPrefs(profileId: string, change: Partial<PlanPrefs>) {
  const row = await coreRow(profileId)
  if (row) {
    await edit('module_instance', row, { settings: { ...(row.settings ?? {}), ...change } })
    return
  }
  const fresh = { id: crypto.randomUUID(), sort_order: 0, updated_at: new Date().toISOString() } as ModuleInstance
  await edit<ModuleInstance>('module_instance', fresh, { profile_id: profileId, module_key: 'core', enabled: true, settings: { ...change } })
}
