import { formatQty, gramsLabel, readUnits, type FoodUnit } from './units-rules.ts'

/** Ready meals (PROD-10, REC-21): a pack bought ready to eat, kept as a
 *  recipe of one line, so it is logged, planned, copied and shopped for like
 *  any recipe, and shows in the Recipes tab with the rest.
 *
 *  The shape, agreed with the recipes work:
 *  - recipe: role 'ready', portions_per_batch 1, owned by the person,
 *    private, no steps;
 *  - one recipe_line: the product's food, grams_per_portion = one portion
 *    (the whole pack, or the serving the pack states), and the serving's
 *    unit and count when a portion is a serving ("1 tray").
 *  One portion of the recipe is therefore exactly what the person chose.
 *  Pure, checked in src/test/readymeal.check.mjs. */

export const READY_ROLE = 'ready'

export const isReadyMeal = (r: { role?: string | null }) => r.role === READY_ROLE

/** What one portion can be: the whole pack, or the stated serving. */
export interface PortionChoice {
  key: 'pack' | 'serving'
  grams: number
  /** For a serving with a name ("tray"): it is counted in it. */
  unit: FoodUnit | null
  label: string
}

/** The portions a product offers, the whole pack first when it is known
 *  (a ready meal is usually eaten whole), then the serving. */
export function portionChoices(p: { pack?: number | string | null; packUnit?: 'g' | 'ml' | null; serving?: FoodUnit | null; units?: unknown }): PortionChoice[] {
  const out: PortionChoice[] = []
  const pack = Number(p.pack ?? 0)
  const ml = p.packUnit === 'ml'
  if (pack > 0 && pack <= 5000) out.push({ key: 'pack', grams: pack, unit: null, label: `The whole pack (${ml ? `${formatQty(pack)} ml` : gramsLabel(pack)})` })
  const serving = p.serving ?? readUnits(p.units)[0] ?? null
  if (serving && serving.g > 0 && Math.abs(serving.g - pack) > 0.5) {
    const named = serving.name !== 'portion'
    out.push({
      key: 'serving', grams: serving.g, unit: named ? serving : null,
      label: named ? `1 ${serving.name} (${gramsLabel(serving.g)})` : `One serving (${gramsLabel(serving.g)})`,
    })
  }
  return out
}

/** The recipe and its one line for a ready meal of this food. */
export function readyMealRows(food: { id: string; name: string }, portion: Pick<PortionChoice, 'grams' | 'unit'>, ownerId: string, ids: { recipe: string; line: string }) {
  const name = food.name.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Ready meal'
  return {
    recipe: {
      id: ids.recipe, owner_id: ownerId, name, role: READY_ROLE, portions_per_batch: 1, cook_minutes: null, steps: null,
    },
    line: {
      id: ids.line, recipe_id: ids.recipe, food_id: food.id, raw_text: null, state: null, sort_order: 0,
      grams_per_portion: Math.round(portion.grams * 10) / 10,
      ...(portion.unit ? { unit: portion.unit.name, unit_qty: 1 } : {}),
    },
  }
}

/** A ready meal of this food that is already there (the person's own, not
 *  deleted), so scanning the same pack again does not make a second one. */
export function findReadyMeal<R extends { id: string; role?: string | null; owner_id: string | null; deleted_at?: string | null }>(
  recipes: R[], lines: { recipe_id: string; food_id: string | null }[], foodId: string, ownerId: string,
): R | null {
  for (const r of recipes) {
    if (r.deleted_at || !isReadyMeal(r) || r.owner_id !== ownerId) continue
    const own = lines.filter((l) => l.recipe_id === r.id)
    if (own.length === 1 && own[0].food_id === foodId) return r
  }
  return null
}
