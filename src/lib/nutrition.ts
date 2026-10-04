import { db } from './db'
import { recipeMacros, type Macros } from './calc'
import { quickMacros } from './quick-food'
import { readDoseNutrients, type MicroDose } from './micros-rules'
import { pickLog } from './tracking-rules'
import type { Food } from './types'

const ZERO: Macros = { kcal: 0, carbs_g: 0, fiber_g: 0, fat_g: 0, protein_g: 0 }

/** What has actually been eaten on a day, computed from the catalogue — the
 *  same path a recipe's macros take, so a logged meal and a planned one can
 *  never disagree. A log with its own numbers (a quick entry) counts those:
 *  there is no food or recipe behind it to work them out from. */
export async function dayTotals(profileId: string, day: string): Promise<Macros> {
  const logs = (await db.food_log.where('profile_id').equals(profileId).toArray())
    .filter((l) => l.log_date === day && !l.deleted_at)
  if (logs.length === 0) return { ...ZERO }

  const foods = new Map<string, Food>((await db.food.toArray()).map((f) => [f.id, f]))
  let total = { ...ZERO }

  for (const log of logs) {
    if (log.kcal != null) {
      const own = quickMacros(log)
      total = {
        kcal: total.kcal + own.kcal,
        carbs_g: total.carbs_g + own.carbs_g,
        fiber_g: total.fiber_g + own.fiber_g,
        fat_g: total.fat_g + own.fat_g,
        protein_g: total.protein_g + own.protein_g,
      }
    } else if (log.food_id) {
      const food = foods.get(log.food_id)
      if (!food) continue
      const factor = (log.grams ?? 0) / 100
      total = {
        kcal: total.kcal + (food.kcal ?? 0) * factor,
        carbs_g: total.carbs_g + (food.carbs_g ?? 0) * factor,
        fiber_g: total.fiber_g + (food.fiber_g ?? 0) * factor,
        fat_g: total.fat_g + (food.fat_g ?? 0) * factor,
        protein_g: total.protein_g + (food.protein_g ?? 0) * factor,
      }
    } else if (log.recipe_id) {
      const lines = await db.recipe_line.where('recipe_id').equals(log.recipe_id).toArray()
      const per = recipeMacros(lines, foods)
      const n = log.portions ?? 1
      total = {
        kcal: total.kcal + per.kcal * n,
        carbs_g: total.carbs_g + per.carbs_g * n,
        fiber_g: total.fiber_g + per.fiber_g * n,
        fat_g: total.fat_g + per.fat_g * n,
        protein_g: total.protein_g + per.protein_g * n,
      }
    }
  }
  return total
}

/** Calories eaten on each day from `from` to `to` (only days with something
 *  logged), worked out exactly as dayTotals does: for the adaptive estimate
 *  of maintenance (BODY-17). */
export async function eatenByDay(profileId: string, from: string, to: string): Promise<{ day: string; kcal: number }[]> {
  const logs = (await db.food_log.where('profile_id').equals(profileId).toArray())
    .filter((l) => !l.deleted_at && l.log_date >= from && l.log_date <= to)
  if (!logs.length) return []
  const foods = new Map<string, Food>((await db.food.toArray()).map((f) => [f.id, f]))
  const perRecipe = new Map<string, number>()
  const byDay = new Map<string, number>()
  for (const log of logs) {
    let kcal = 0
    if (log.kcal != null) kcal = quickMacros(log).kcal
    else if (log.food_id) kcal = (foods.get(log.food_id)?.kcal ?? 0) * ((log.grams ?? 0) / 100)
    else if (log.recipe_id) {
      if (!perRecipe.has(log.recipe_id)) perRecipe.set(log.recipe_id, recipeMacros(await db.recipe_line.where('recipe_id').equals(log.recipe_id).toArray(), foods).kcal)
      kcal = perRecipe.get(log.recipe_id)! * (log.portions ?? 1)
    }
    byDay.set(log.log_date, (byDay.get(log.log_date) ?? 0) + kcal)
  }
  return [...byDay].map(([day, kcal]) => ({ day, kcal }))
}

/** The supplements ticked on a day that count towards vitamins and
 *  minerals (SUP-07): what one dose of each gives. */
export async function dayDoses(profileId: string, day: string): Promise<MicroDose[]> {
  const counting = (await db.supplement.where('profile_id').equals(profileId).toArray())
    .filter((s) => !s.deleted_at && Object.keys(readDoseNutrients(s.nutrients)).length)
  if (!counting.length) return []
  const logs = await db.supplement_log.where('[supplement_id+log_date]').anyOf(counting.map((s) => [s.id, day])).toArray()
  return counting
    .filter((s) => pickLog(logs.filter((l) => l.supplement_id === s.id))?.done)
    .map((s) => ({ amounts: readDoseNutrients(s.nutrients) }))
}
