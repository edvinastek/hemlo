import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { readSavedMeals, SAVED_KEY, type SavedMeal } from './saved-meals-rules'
import type { ModuleInstance } from './types'

/** Saved meals (MEAL-08) live in the Nutrition module's own settings for the
 *  profile, so they sync with everything else and need no table of their
 *  own. The rules (reading, adding, renaming) are in saved-meals-rules.ts. */

async function nutritionRow(profileId: string): Promise<ModuleInstance | undefined> {
  return db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'nutrition').first()
}

export async function savedMeals(profileId: string): Promise<SavedMeal[]> {
  return readSavedMeals((await nutritionRow(profileId))?.settings)
}

/** The saved meals, live, for a screen. */
export function useSavedMeals(profileId: string | null | undefined): SavedMeal[] {
  return useLiveQuery(async () => (profileId ? savedMeals(profileId) : []), [profileId], [] as SavedMeal[])
}

/** Replace the whole list. The module's other settings (its rule switches,
 *  its field changes) are kept as they are. */
export async function writeSavedMeals(profileId: string, list: SavedMeal[]): Promise<void> {
  const row = await nutritionRow(profileId)
  if (row) {
    await edit('module_instance', row, { settings: { ...(row.settings ?? {}), [SAVED_KEY]: list } })
    return
  }
  // No row on this phone yet: one is sent with the list; the sync folds it
  // into the server's row for the module by its natural key.
  const fresh = { id: crypto.randomUUID(), sort_order: 0, enabled: true, updated_at: new Date().toISOString() } as ModuleInstance
  await edit<ModuleInstance>('module_instance', fresh, { profile_id: profileId, module_key: 'nutrition', settings: { [SAVED_KEY]: list } })
}
