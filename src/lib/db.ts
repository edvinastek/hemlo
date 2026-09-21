import Dexie, { type Table } from 'dexie'
import type {
  Profile, Task, Food, Recipe, RecipeLine, Target, BodyLog,
  FoodLogEntry, ModuleInstance, PendingChange, ConflictEntry,
} from './types'

/** The local copy. Every device holds the whole account, so the app works
 *  with no connection at all and merges when one comes back. */
class GetItDB extends Dexie {
  profile!: Table<Profile, string>
  task!: Table<Task, string>
  food!: Table<Food, string>
  recipe!: Table<Recipe, string>
  recipe_line!: Table<RecipeLine, string>
  target!: Table<Target, string>
  body_log!: Table<BodyLog, string>
  food_log!: Table<FoodLogEntry, string>
  module_instance!: Table<ModuleInstance, string>
  pending!: Table<PendingChange, number>
  conflicts!: Table<ConflictEntry, number>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('getit')
    this.version(1).stores({
      profile: 'id, household_id',
      task: 'id, profile_id, planned_date, status, [profile_id+planned_date]',
      food: 'id, name, owner_id',
      recipe: 'id, name, owner_id',
      recipe_line: 'id, recipe_id, food_id',
      target: 'id, profile_id, from_date',
      body_log: 'id, profile_id, log_date',
      food_log: 'id, profile_id, log_date',
      module_instance: 'id, profile_id, module_key',
      pending: '++id, table, row_id',
      conflicts: '++id, table, row_id, at',
      meta: 'key',
    })
  }
}

export const db = new GetItDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return (row?.value as T) ?? fallback
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
