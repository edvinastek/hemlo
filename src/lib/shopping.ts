import { db } from './db'
import { rawGrams, shoppingQuantity } from './calc'
import { addCounts, countOf, readUnits, wholeToBuy, type Count } from './units-rules'
import type { Food } from './types'

export interface TripLine {
  id: string
  name: string
  needed_g: number
  from_stock_g: number
  pack_size_g: number | null
  packs: number | null
  section: string
  checked: boolean
  /** Set when every line of the plan used this food in the same unit: the
   *  list then says "6 eggs" rather than "300 g". */
  count: Count | null
  /** What one of that unit weighs here: the plan's grams over its count. */
  unit_g: number | null
}

/** How many of a counted food to buy: what is still needed after stock, in
 *  whole ones (a shop sells whole eggs). Null for a food bought by weight. */
export function unitsToBuy(line: Pick<TripLine, 'count' | 'unit_g' | 'needed_g' | 'from_stock_g'>): number | null {
  if (!line.count || !line.unit_g || line.unit_g <= 0) return null
  return wholeToBuy(Math.max(0, line.needed_g - line.from_stock_g) / line.unit_g)
}

/** Build a trip from the plan rather than from memory: every meal slot in the
 *  window is expanded into its ingredients, the grams are summed per food,
 *  what is in stock is taken off, and the rest is rounded up to whole packs. */
export async function tripFromPlan(
  profileId: string,
  from: string,
  to: string,
  stock: Map<string, number> = new Map(),
): Promise<TripLine[]> {
  const inWindow = (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => !s.deleted_at && s.slot_date >= from && s.slot_date <= to && s.status !== 'skipped')
  if (inWindow.length === 0) return []

  const foods = new Map<string, Food>((await db.food.toArray()).map((f) => [f.id, f]))
  const allLines = await db.recipe_line.toArray()
  const needed = new Map<string, number>()
  // Per food: its count while every line used the same unit, null once not.
  const counts = new Map<string, Count | null>()
  const said = new Map<string, string>()   // what the recipe calls it: "Peanut butter", not "Butter Peanut Smooth"

  for (const slot of inWindow) {
    if (!slot.recipe_id) continue
    for (const line of allLines.filter((l) => l.recipe_id === slot.recipe_id)) {
      if (!line.food_id) continue
      const food = foods.get(line.food_id)
      // Shopping is done in raw weight, because that is what a shop sells.
      const grams = rawGrams(line, food) * (slot.portion_multiplier ?? 1)
      needed.set(line.food_id, (needed.get(line.food_id) ?? 0) + grams)
      const c = countOf(line, readUnits(food?.units), slot.portion_multiplier ?? 1)
      counts.set(line.food_id, counts.has(line.food_id) ? addCounts(counts.get(line.food_id) ?? null, c) : c)
      if (line.raw_text && !said.has(line.food_id)) said.set(line.food_id, cleanName(line.raw_text))
    }
  }

  return [...needed.entries()]
    .map(([foodId, grams]) => {
      const food = foods.get(foodId)
      const have = stock.get(foodId) ?? 0
      const { packs } = shoppingQuantity(grams, have, food?.pack_size_g ?? null)
      const count = counts.get(foodId) ?? null
      return {
        id: foodId,
        name: said.get(foodId) ?? food?.name ?? 'Unknown',
        needed_g: Math.round(grams),
        from_stock_g: Math.round(have),
        pack_size_g: food?.pack_size_g ?? null,
        packs,
        section: food?.store_section ?? 'Other',
        checked: false,
        count,
        unit_g: count && count.qty > 0 ? grams / count.qty : null,
      }
    })
    .filter((line) => line.needed_g > line.from_stock_g)
    .sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name))
}

/** "Brown rice (cooked)" is how a recipe says it; on a shopping list it is rice
 *  you buy dry, so the cooking note goes. */
function cleanName(raw: string): string {
  const name = raw.replace(/\s*\((cooked|steamed|grilled|baked|boiled|roasted|drained|grilled or baked)[^)]*\)/i, '').trim()
  return name.charAt(0).toUpperCase() + name.slice(1)
}
