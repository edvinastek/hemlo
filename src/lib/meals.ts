import { db } from './db'
import { queueChange } from './sync'
import { recipeMacros, type Macros } from './calc'
import { blankTask, saveTask } from './tasks'
import { consumeForMeal } from './stock'
import type { Food, FoodLogEntry, MealPlanSlot, Recipe } from './types'

/** The day's meals, with the times their tasks and reminders use. */
export const SLOTS = [
  { key: 'breakfast', label: 'Breakfast', time: '08:00' },
  { key: 'lunch', label: 'Lunch', time: '12:00' },
  { key: 'snack', label: 'Snack', time: '15:00' },
  { key: 'dinner', label: 'Dinner', time: '18:30' },
] as const
export type SlotKey = typeof SLOTS[number]['key']
/** The rotating main meal is the one sized to close the day's gap. */
export const MAIN_SLOT: SlotKey = 'dinner'

const SLOT_FIELDS: (keyof MealPlanSlot & string)[] =
  ['profile_id', 'slot_date', 'slot', 'recipe_id', 'portion_multiplier', 'status', 'deleted_at']

export async function slotsFor(profileId: string, day: string): Promise<MealPlanSlot[]> {
  return (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => s.slot_date === day && !s.deleted_at)
}

async function saveSlot(slot: MealPlanSlot) {
  const row = { ...slot, updated_at: new Date().toISOString() }
  await db.meal_plan_slot.put(row)
  await queueChange('meal_plan_slot', row, SLOT_FIELDS)
  return row
}

/** Keep the meal's task on Today in step with the plan, so the meal shows on
 *  the rail at its time and gets a reminder like anything else. */
async function syncMealTask(slot: MealPlanSlot, recipe: Recipe | undefined) {
  const def = SLOTS.find((s) => s.key === slot.slot)!
  const existing = (await db.task.where('profile_id').equals(slot.profile_id).toArray())
    .find((t) => t.source === 'meal' && t.source_ref === slot.id)

  if (slot.deleted_at || !recipe) {
    if (existing && !existing.deleted_at) await saveTask({ ...existing, deleted_at: new Date().toISOString() }, ['deleted_at'])
    return
  }
  const portions = Math.round(slot.portion_multiplier * 10) / 10
  const title = `${def.label}: ${recipe.name}${portions !== 1 ? ` (${portions}×)` : ''}`
  const status = slot.status === 'eaten' ? 'done' : existing?.status === 'done' ? 'todo' : existing?.status ?? 'todo'
  if (existing) {
    await saveTask({ ...existing, title, planned_date: slot.slot_date, status, deleted_at: null },
      ['title', 'planned_date', 'status', 'deleted_at'])
  } else {
    await saveTask(blankTask(slot.profile_id, slot.slot_date, {
      title, category: 'Meal', planned_time: def.time, duration_min: 20,
      source: 'meal', source_ref: slot.id, module_key: 'nutrition', status,
    }))
  }
}

export async function planMeal(profileId: string, day: string, slotKey: SlotKey, recipeId: string | null, portions = 1) {
  const recipe = recipeId ? await db.recipe.get(recipeId) : undefined
  const current = (await slotsFor(profileId, day)).find((s) => s.slot === slotKey)
  const slot: MealPlanSlot = current
    ? { ...current, recipe_id: recipeId, portion_multiplier: portions, deleted_at: recipeId ? null : new Date().toISOString() }
    : {
        id: crypto.randomUUID(), profile_id: profileId, slot_date: day, slot: slotKey, recipe_id: recipeId,
        portion_multiplier: portions, status: 'planned', updated_at: new Date().toISOString(), deleted_at: null,
      }
  if (!current && !recipeId) return
  const saved = await saveSlot(slot)
  await syncMealTask(saved, recipe)
}

/** Eating a planned meal logs it, which is what moves the day's protein bar. */
export async function markEaten(slot: MealPlanSlot, eaten: boolean) {
  await consumeForMeal(slot, eaten ? 1 : -1)   // stock, if they switched that on; the slot is still the old one here
  const saved = await saveSlot({ ...slot, status: eaten ? 'eaten' : 'planned' })
  const logs = (await db.food_log.where('profile_id').equals(slot.profile_id).toArray())
    .filter((l) => l.log_date === slot.slot_date && l.recipe_id === slot.recipe_id && !l.deleted_at)
  if (eaten && logs.length === 0) {
    const log: FoodLogEntry = {
      id: crypto.randomUUID(), profile_id: slot.profile_id, log_date: slot.slot_date, log_time: null,
      food_id: null, recipe_id: slot.recipe_id, grams: null, portions: slot.portion_multiplier, planned: true,
      updated_at: new Date().toISOString(), deleted_at: null,
    }
    await db.food_log.put(log)
    await queueChange('food_log', log, ['profile_id', 'log_date', 'recipe_id', 'portions', 'planned'])
  }
  if (!eaten) {
    for (const l of logs) {
      const gone = { ...l, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      await db.food_log.put(gone)
      await queueChange('food_log', gone, ['deleted_at'])
    }
  }
  await syncMealTask(saved, saved.recipe_id ? await db.recipe.get(saved.recipe_id) : undefined)
}

export function macrosFor(recipeId: string, lines: { recipe_id: string }[], foods: Map<string, Food>): Macros {
  return recipeMacros(lines.filter((l) => l.recipe_id === recipeId) as never, foods)
}
