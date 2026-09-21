import { db } from './db'
import { recipeMacros, type Macros } from './calc'
import type { Food } from './types'

const ZERO: Macros = { kcal: 0, carbs_g: 0, fiber_g: 0, fat_g: 0, protein_g: 0 }

/** What has actually been eaten on a day, computed from the catalogue — the
 *  same path a recipe's macros take, so a logged meal and a planned one can
 *  never disagree. */
export async function dayTotals(profileId: string, day: string): Promise<Macros> {
  const logs = (await db.food_log.where('profile_id').equals(profileId).toArray())
    .filter((l) => l.log_date === day)
  if (logs.length === 0) return { ...ZERO }

  const foods = new Map<string, Food>((await db.food.toArray()).map((f) => [f.id, f]))
  let total = { ...ZERO }

  for (const log of logs) {
    if (log.food_id) {
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
