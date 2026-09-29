import { format } from 'date-fns'
import { db } from './db'
import { queueChange } from './sync'
import { recipeMacros, type Macros } from './calc'
import { blankTask, saveTask } from './tasks'
import { mealTime, readSettings, type ProfileSettings } from './settings'
import { isQuick, quickTitle, type QuickEntry } from './quick-food'
import { consumeForMeal } from './stock'
import { readUnits } from './units-rules'
import { builtinRuleOn } from '../modules/rule-switch'
import type { Food, FoodLogEntry, MealPlanSlot, Recipe } from './types'

/** The day's meals. They have no time of their own: a time comes from the
 *  meal itself on that day, or from a default the person set, or not at all
 *  (see mealTime in settings.ts). */
export const SLOTS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Snack' },
  { key: 'dinner', label: 'Dinner' },
] as const
export type SlotKey = typeof SLOTS[number]['key']
/** The rotating main meal is the one sized to close the day's gap. */
export const MAIN_SLOT: SlotKey = 'dinner'

const NUMBER_FIELDS = ['label', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'grams'] as const
const SLOT_FIELDS: (keyof MealPlanSlot & string)[] =
  ['profile_id', 'slot_date', 'slot', 'recipe_id', 'portion_multiplier', 'status', 'slot_time', ...NUMBER_FIELDS, 'deleted_at']
const QUICK_LOG_FIELDS: (keyof FoodLogEntry & string)[] =
  ['profile_id', 'log_date', 'recipe_id', 'grams', 'portions', 'planned',
    'label', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'deleted_at']

/** A slot's own numbers cleared: what a recipe, or nothing, leaves behind. */
const NO_NUMBERS = { label: null, kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, grams: null }

/** A slot with nothing to eat in it: kept only to hold a time for the day. */
export const isEmptySlot = (s: MealPlanSlot) => !s.recipe_id && !isQuick(s)

export async function slotsFor(profileId: string, day: string): Promise<MealPlanSlot[]> {
  return (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => s.slot_date === day && !s.deleted_at)
}

/** The unit columns go with a row only when it has them (set, or cleared
 *  from a unit it had), so a server without them yet (before 022) still takes
 *  every meal that was not counted in a unit. */
const unitKeys = (row: { unit?: unknown; unit_qty?: unknown }): ('unit' | 'unit_qty')[] =>
  row.unit !== undefined || row.unit_qty !== undefined ? ['unit', 'unit_qty'] : []

/** A slot's unit cleared: only when it had one. */
const noUnit = (slot: MealPlanSlot | undefined) => (slot?.unit ? { unit: null, unit_qty: null } : {})

async function saveSlot(slot: MealPlanSlot) {
  const row = { ...slot, updated_at: new Date().toISOString() }
  await db.meal_plan_slot.put(row)
  await queueChange('meal_plan_slot', row, [...SLOT_FIELDS, ...unitKeys(row)])
  return row
}

async function settingsFor(profileId: string): Promise<ProfileSettings> {
  return readSettings(await db.profile.get(profileId))
}

function newSlot(profileId: string, day: string, slotKey: SlotKey): MealPlanSlot {
  return {
    id: crypto.randomUUID(), profile_id: profileId, slot_date: day, slot: slotKey, recipe_id: null,
    portion_multiplier: 1, status: 'planned', slot_time: null, ...NO_NUMBERS,
    updated_at: new Date().toISOString(), deleted_at: null,
  }
}

/** Keep the meal's task on Today in step with the plan, so the meal shows on
 *  the rail (at its time, if it has one) and gets a reminder like anything
 *  else. The task's time is only set when the task is made or the meal's time
 *  is changed (`retime`): ticking a meal eaten must not undo a push on Today. */
async function syncMealTask(slot: MealPlanSlot, recipe: Recipe | undefined, retime = false) {
  const def = SLOTS.find((s) => s.key === slot.slot)!
  const existing = (await db.task.where('profile_id').equals(slot.profile_id).toArray())
    .find((t) => t.source === 'meal' && t.source_ref === slot.id)
  const quick = isQuick(slot)
  // The Nutrition rule "every planned meal becomes a task", which can be
  // switched off in Edit module. Off, a meal already eaten keeps its ticked
  // task as a record of the day; the rest go.
  const on = await builtinRuleOn(slot.profile_id, 'nutrition', 'meal_tasks')

  if (slot.deleted_at || (!recipe && !quick) || !on) {
    if (existing && !existing.deleted_at && (on || existing.status !== 'done')) {
      await saveTask({ ...existing, deleted_at: new Date().toISOString() }, ['deleted_at'])
    }
    return
  }
  const time = mealTime(slot, await settingsFor(slot.profile_id))
  const portions = Math.round(slot.portion_multiplier * 10) / 10
  // A counted quick meal keeps the food's name as its label: that food's
  // units say what one weighs, so a stale count shows as grams.
  // Of the foods with that name, the one that has this unit.
  const labelled = quick && slot.unit && slot.label
    ? (await db.food.where('name').equals(slot.label).toArray()).find((f) => readUnits(f.units).some((u) => u.name === slot.unit))
    : undefined
  const title = quick
    ? quickTitle(def.label, slot, readUnits(labelled?.units))
    : `${def.label}: ${recipe!.name}${portions !== 1 ? ` (${portions}×)` : ''}`
  const status = slot.status === 'eaten' ? 'done' : existing?.status === 'done' ? 'todo' : existing?.status ?? 'todo'
  if (existing) {
    // A task coming back from deletion takes the meal's current time too.
    const setTime = retime || !!existing.deleted_at
    await saveTask({ ...existing, title, planned_date: slot.slot_date, status, deleted_at: null, ...(setTime ? { planned_time: time } : {}) },
      ['title', 'planned_date', 'status', 'deleted_at', ...(setTime ? ['planned_time' as const] : [])])
  } else {
    await saveTask(blankTask(slot.profile_id, slot.slot_date, {
      title, category: 'Meal', planned_time: time, duration_min: 20,
      source: 'meal', source_ref: slot.id, module_key: 'nutrition', status,
    }))
  }
}

export async function planMeal(profileId: string, day: string, slotKey: SlotKey, recipeId: string | null, portions = 1) {
  const recipe = recipeId ? await db.recipe.get(recipeId) : undefined
  let current = (await slotsFor(profileId, day)).find((s) => s.slot === slotKey)
  if (!current && !recipeId) return
  // Swapping what the meal is means the old one was not eaten after all.
  if (current && current.status === 'eaten' && (isQuick(current) || current.recipe_id !== recipeId)) {
    await markEaten(current, false)
    current = { ...current, status: 'planned' }
  }
  const slot: MealPlanSlot = current
    ? {
        ...current, recipe_id: recipeId, portion_multiplier: portions, ...NO_NUMBERS, ...noUnit(current),
        // Cleared, the slot stays only if it still holds a time for the day.
        deleted_at: recipeId || current.slot_time ? null : new Date().toISOString(),
      }
    : { ...newSlot(profileId, day, slotKey), recipe_id: recipeId, portion_multiplier: portions }
  const saved = await saveSlot(slot)
  await syncMealTask(saved, recipe)
}

/** Plan a meal as plain numbers. Correcting the numbers of a meal already
 *  eaten corrects what was logged, so the day's totals follow. */
export async function planQuick(profileId: string, day: string, slotKey: SlotKey, entry: QuickEntry) {
  let current = (await slotsFor(profileId, day)).find((s) => s.slot === slotKey)
  if (current && current.status === 'eaten' && !isQuick(current)) {
    await markEaten(current, false)
    current = { ...current, status: 'planned' }
  }
  // Counted in a unit ("2 eggs"), the slot keeps it; typed as numbers, a
  // unit it had goes.
  const { unit, unit_qty, ...numbers } = entry
  const saved = await saveSlot({
    ...(current ?? newSlot(profileId, day, slotKey)),
    recipe_id: null, portion_multiplier: 1, ...numbers,
    ...(unit && unit_qty != null ? { unit, unit_qty } : noUnit(current)), deleted_at: null,
  })
  if (saved.status === 'eaten') await logQuick(saved)
  await syncMealTask(saved, undefined)
}

/** Give a meal its own time on a day, or clear it (back to the default, if
 *  one is set). An empty slot can hold a time before anything is planned. */
export async function setMealTime(profileId: string, day: string, slotKey: SlotKey, time: string | null) {
  const current = (await slotsFor(profileId, day)).find((s) => s.slot === slotKey)
  if (!current && !time) return
  const slot: MealPlanSlot = { ...(current ?? newSlot(profileId, day, slotKey)), slot_time: time }
  if (!time && isEmptySlot(slot)) slot.deleted_at = new Date().toISOString()
  const saved = await saveSlot(slot)
  await syncMealTask(saved, saved.recipe_id ? await db.recipe.get(saved.recipe_id) : undefined, true)
}

/** After the default meal times change: meals from today on that follow the
 *  default move with it. A meal with its own time, or one moved by hand on
 *  Today, keeps where it is. */
export async function retimeMeals(profileId: string, before: ProfileSettings, after: ProfileSettings) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const slots = (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => !s.deleted_at && !s.slot_time && s.slot_date >= today)
  if (slots.length === 0) return
  const tasks = (await db.task.where('profile_id').equals(profileId).toArray())
    .filter((t) => t.source === 'meal' && !t.deleted_at)
  for (const slot of slots) {
    const was = mealTime(slot, before)
    const now = mealTime(slot, after)
    if (was === now) continue
    const task = tasks.find((t) => t.source_ref === slot.id)
    if (!task || (task.planned_time?.slice(0, 5) ?? null) !== was) continue
    await saveTask({ ...task, planned_time: now }, ['planned_time'])
  }
}

/** After the meal-task rule is switched on or off: every meal from today on
 *  gets its task back, or loses it. Past days are left as they were. */
export async function syncMealTasks(profileId: string) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const slots = (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => !s.deleted_at && s.slot_date >= today)
  for (const slot of slots) await syncMealTask(slot, slot.recipe_id ? await db.recipe.get(slot.recipe_id) : undefined)
}

/** A quick entry's log is kept under the slot's own id: unticking finds
 *  exactly that log, ticking again revives it, and a correction reaches it. */
async function logQuick(slot: MealPlanSlot) {
  const log: FoodLogEntry = {
    id: slot.id, profile_id: slot.profile_id, log_date: slot.slot_date, log_time: null,
    food_id: null, recipe_id: null, grams: slot.grams ?? null, portions: 1, planned: true,
    label: slot.label ?? null, kcal: slot.kcal ?? null, protein_g: slot.protein_g ?? null,
    carbs_g: slot.carbs_g ?? null, fat_g: slot.fat_g ?? null, fiber_g: slot.fiber_g ?? null,
    // What was eaten in a unit is logged in it too.
    ...(unitKeys(slot).length ? { unit: slot.unit ?? null, unit_qty: slot.unit_qty ?? null } : {}),
    updated_at: new Date().toISOString(), deleted_at: null,
  }
  await db.food_log.put(log)
  await queueChange('food_log', log, [...QUICK_LOG_FIELDS, ...unitKeys(log)])
}

/** Eating a planned meal logs it, which is what moves the day's totals. */
export async function markEaten(slot: MealPlanSlot, eaten: boolean) {
  await consumeForMeal(slot, eaten ? 1 : -1)   // stock, if they switched that on; the slot is still the old one here
  const saved = await saveSlot({ ...slot, status: eaten ? 'eaten' : 'planned' })
  const quick = isQuick(slot)
  const logs = (await db.food_log.where('profile_id').equals(slot.profile_id).toArray())
    .filter((l) => l.log_date === slot.slot_date && !l.deleted_at && (quick ? l.id === slot.id : l.recipe_id === slot.recipe_id))
  if (eaten && logs.length === 0 && quick) await logQuick(saved)
  if (eaten && logs.length === 0 && !quick) {
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
