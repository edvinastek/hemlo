import Dexie, { type Table } from 'dexie'
import type {
  Profile, Task, Food, Recipe, RecipeLine, Target, BodyLog,
  FoodLogEntry, MealPlanSlot, ModuleInstance, PendingChange, ConflictEntry,
  Series, SeriesException, Habit, HabitLog, Supplement, SupplementLog,
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
  meal_plan_slot!: Table<MealPlanSlot, string>
  module_instance!: Table<ModuleInstance, string>
  series!: Table<Series, string>
  series_exception!: Table<SeriesException, string>
  habit!: Table<Habit, string>
  habit_log!: Table<HabitLog, string>
  supplement!: Table<Supplement, string>
  supplement_log!: Table<SupplementLog, string>
  pending!: Table<PendingChange, number>
  conflicts!: Table<ConflictEntry, number>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('getit')
    // Version 2 adds meal_plan_slot; Dexie migrates the existing copy in place.
    this.version(2).stores({
      profile: 'id, household_id',
      task: 'id, profile_id, planned_date, status, [profile_id+planned_date]',
      food: 'id, name, owner_id',
      recipe: 'id, name, owner_id',
      recipe_line: 'id, recipe_id, food_id',
      target: 'id, profile_id, from_date',
      body_log: 'id, profile_id, log_date',
      food_log: 'id, profile_id, log_date',
      meal_plan_slot: 'id, profile_id, slot_date',
      module_instance: 'id, profile_id, module_key',
      pending: '++id, table, row_id',
      conflicts: '++id, table, row_id, at',
      meta: 'key',
    })
    // Version 3 adds recurring series, habits and supplements.
    this.version(3).stores({
      profile: 'id, household_id',
      task: 'id, profile_id, planned_date, status, [profile_id+planned_date]',
      food: 'id, name, owner_id',
      recipe: 'id, name, owner_id',
      recipe_line: 'id, recipe_id, food_id',
      target: 'id, profile_id, from_date',
      body_log: 'id, profile_id, log_date',
      food_log: 'id, profile_id, log_date',
      meal_plan_slot: 'id, profile_id, slot_date',
      module_instance: 'id, profile_id, module_key',
      pending: '++id, table, row_id',
      conflicts: '++id, table, row_id, at',
      meta: 'key',
      series: 'id, profile_id',
      series_exception: 'id, series_id, [series_id+exception_date]',
      habit: 'id, profile_id',
      habit_log: 'id, habit_id, log_date, [habit_id+log_date]',
      supplement: 'id, profile_id',
      supplement_log: 'id, supplement_id, log_date, [supplement_id+log_date]',
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

/** Forget everything this device holds. Called on sign-out and whenever a
 *  different account signs in, so one person's health data is never shown to
 *  the next person who uses the same browser or phone. */
/** Other copies of the account's data kept outside this database (the
 *  home-screen widget's) register here, so every way of forgetting the
 *  account forgets them too. */
const resetHooks: (() => Promise<void>)[] = []
export function onResetLocal(fn: () => Promise<void>) { resetHooks.push(fn) }

export async function resetLocal(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
  await Promise.all(resetHooks.map((fn) => fn().catch(() => undefined)))
}

/** The account this device's copy belongs to. */
export async function localOwner(): Promise<string | null> {
  return getMeta<string | null>('owner', null)
}
