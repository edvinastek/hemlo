import { db } from './db'
import { queueChange } from './sync'
import { mergeSettings, readSettings, type ProfileSettings } from './settings'
import type { Profile } from './types'

/** One path for every change: write locally so the screen updates at once,
 *  then queue it for the server. Nothing in the app writes to Supabase
 *  directly, which is what makes offline the normal case rather than a mode. */
export async function edit<T extends { id: string; updated_at?: string }>(
  table: 'task' | 'target' | 'body_log' | 'food_log' | 'profile' | 'module_instance' | 'food' | 'recipe'
    | 'series' | 'series_exception' | 'habit' | 'habit_log' | 'supplement' | 'supplement_log' | 'recipe_line'
    | 'stock' | 'meal_plan_slot',
  row: T,
  changes: Partial<T>,
): Promise<T> {
  const next = { ...row, ...changes, updated_at: new Date().toISOString() } as T
  await (db as never as Record<string, { put: (r: T) => Promise<unknown> }>)[table].put(next)
  await queueChange(table, next, Object.keys(changes) as (keyof T & string)[])
  return next
}

/** Change some of a profile's settings; the rest stay as they are. */
export async function saveSettings(profile: Profile, change: Partial<ProfileSettings>): Promise<Profile> {
  const settings = mergeSettings(readSettings(profile), change)
  return edit('profile', profile, { settings })
}
