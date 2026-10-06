/** Recipes as rules with no database and no React: what a recipe is for,
 *  how the list is searched and sorted, a recipe scaled to a number of
 *  portions, a variation's name and a ready meal (what to buy for one is in
 *  recipe-shop-rules.ts). Checked in plain Node (src/test/recipe.check.mjs). */

import { rawGrams } from './calc.ts'
import { figureOf, type LabelKey } from './eu-label-rules.ts'
import { countOf as unitCount, readUnits, type Count } from './units-rules.ts'
import type { Food, Recipe, RecipeLine } from './types'

// ---- what a recipe is for -----------------------------------------------------------

export interface RoleOption { value: string; label: string }

/** The roles offered in the editor. A ready meal is one product as one
 *  portion (PROD-10, REC-21). */
export const ROLES: RoleOption[] = [
  { value: '', label: 'Any meal' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'shake', label: 'Shake' },
  { value: 'main', label: 'Main meal' },
  { value: 'ready', label: 'Ready meal' },
]
/** Older roles the database still knows; shown, never offered for a new one. */
const OLD_ROLES: Record<string, string> = { egg_meal: 'Egg meal', kwark: 'Quark bowl' }

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Any meal'
  return ROLES.find((r) => r.value === role)?.label ?? OLD_ROLES[role] ?? role
}

/** The roles for an editor: the usual ones, and the recipe's own old one. */
export function rolesFor(current: string | null | undefined): RoleOption[] {
  return current && OLD_ROLES[current] ? [...ROLES, { value: current, label: OLD_ROLES[current] }] : ROLES
}

export const isReady = (r: Pick<Recipe, 'role'>) => r.role === 'ready'

// ---- searching and sorting (REC-01) ----------------------------------------------------

/** What the one search looks in besides a recipe's name: its ingredients
 *  (as the recipe says them and as the foods are named, Dutch too) and what
 *  it is for. */
export function recipeSearchText(r: Pick<Recipe, 'id' | 'role'>, lines: RecipeLine[], foods: Map<string, Food>): string {
  const words: string[] = [roleLabel(r.role)]
  for (const l of lines) {
    if (l.recipe_id !== r.id) continue
    if (l.raw_text) words.push(l.raw_text)
    const f = l.food_id ? foods.get(l.food_id) : undefined
    if (f) words.push(f.name, f.name_nl ?? '')
  }
  return words.filter(Boolean).join(' ')
}

export type RecipeSort = 'name' | 'kcal' | 'recent' | 'cooked'
export const SORTS: { value: RecipeSort; label: string }[] = [
  { value: 'name', label: 'Best match, then A to Z' },
  { value: 'kcal', label: 'Calories a portion' },
  { value: 'recent', label: 'Recently used' },
  { value: 'cooked', label: 'Most cooked' },
]

export interface Usage { last: string | null; count: number }

/** When each recipe was last planned or eaten, and how often it was eaten:
 *  from the person's food log and meal plan. */
export function usage(logs: { recipe_id: string | null; log_date: string; planned?: boolean; deleted_at?: string | null }[],
  slots: { recipe_id: string | null; slot_date: string; deleted_at?: string | null }[]): Map<string, Usage> {
  const out = new Map<string, Usage>()
  const at = (id: string) => out.get(id) ?? (out.set(id, { last: null, count: 0 }), out.get(id)!)
  for (const l of logs) {
    if (!l.recipe_id || l.deleted_at) continue
    const u = at(l.recipe_id)
    u.count++
    if (!u.last || l.log_date > u.last) u.last = l.log_date
  }
  for (const s of slots) {
    if (!s.recipe_id || s.deleted_at) continue
    const u = at(s.recipe_id)
    if (!u.last || s.slot_date > u.last) u.last = s.slot_date
  }
  return out
}

/** The order a sort asks for; none for "best match", which is the one
 *  search's own. Ties go A to Z. A recipe with no calories known goes last. */
export function recipeOrder<T extends { id: string; name: string; kcal?: number | null }>(sort: RecipeSort, use: Map<string, Usage>):
  ((a: T, b: T) => number) | undefined {
  const az = (a: T, b: T) => a.name.localeCompare(b.name)
  if (sort === 'kcal') return (a, b) => (a.kcal ?? Infinity) - (b.kcal ?? Infinity) || az(a, b)
  if (sort === 'recent') return (a, b) => (use.get(b.id)?.last ?? '').localeCompare(use.get(a.id)?.last ?? '') || az(a, b)
  if (sort === 'cooked') return (a, b) => (use.get(b.id)?.count ?? 0) - (use.get(a.id)?.count ?? 0) || az(a, b)
  return undefined
}

// ---- scaled to a number of portions (REC-02, REC-06) ------------------------------------

export interface ScaledLine {
  id: string
  /** The food's name, or the free text ("Salt to taste"). */
  name: string
  /** What the recipe calls it, when it says ("Peanut butter"). */
  said: string | null
  food: Food | null
  /** Grams for the portions asked, or null for a line without an amount. */
  grams: number | null
  /** The count when the line was typed in a unit ("3 eggs"). */
  count: Count | null
  state: string | null
  note: string | null
}

/** The recipe's lines for a number of portions, in the recipe's order: a
 *  portion's grams times the portions, counts scaled the same way. */
export function scaleLines(recipeId: string, lines: RecipeLine[], foods: Map<string, Food>, portions: number): ScaledLine[] {
  const p = portions > 0 ? portions : 1
  return lines
    .filter((l) => l.recipe_id === recipeId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((l) => {
      const food = l.food_id ? foods.get(l.food_id) ?? null : null
      const grams = l.grams_per_portion == null ? null : Math.round(Number(l.grams_per_portion) * p * 100) / 100
      const count = unitCount({ ...l, grams: l.grams_per_portion }, readUnits(food?.units), p)
      return {
        id: l.id, name: food?.name ?? (l.raw_text?.trim() || 'A food not on this device'), said: l.raw_text?.trim() || null, food, grams, count,
        state: l.state ?? null, note: l.note ?? null,
      }
    })
}

/** A recipe's figures for a number of portions, for any line of the label:
 *  each ingredient's figure per 100 g times its raw grams. `missing` counts
 *  the ingredients that do not give the figure, so the total is never shown
 *  as if it were complete when it is not (P8). */
export function recipeFigures(lines: RecipeLine[], foods: Map<string, Food>, keys: LabelKey[], portions = 1):
  Record<string, { value: number; missing: number }> {
  const out: Record<string, { value: number; missing: number }> = {}
  for (const k of keys) out[k] = { value: 0, missing: 0 }
  for (const l of lines) {
    const food = l.food_id ? foods.get(l.food_id) : undefined
    if (!food || l.grams_per_portion == null) continue
    const factor = (rawGrams(l, food) / 100) * portions
    for (const k of keys) {
      const v = figureOf(food as never, k)
      if (v === null) out[k].missing++
      else out[k].value += v * factor
    }
  }
  return out
}

// ---- a variation (REC-05) ------------------------------------------------------------------

/** "Chicken curry (variation)", then "(variation 2)" and on, never a name
 *  the person already has. At most 120 characters, like any recipe name. */
export function variationName(name: string, taken: string[]): string {
  const base = name.replace(/\s*\(variation(?: \d+)?\)$/i, '').trim()
  const have = new Set(taken.map((t) => t.trim().toLowerCase()))
  for (let i = 1; i < 1000; i++) {
    const tail = i === 1 ? ' (variation)' : ` (variation ${i})`
    const n = `${base.slice(0, 120 - tail.length).trim()}${tail}`
    if (!have.has(n.toLowerCase())) return n
  }
  return `${base.slice(0, 100)} (variation)`
}

// What to buy for a recipe (REC-08, REC-20) is worked out the meal plan's way
// in recipe-shop-rules.ts, the one path from recipes to the shopping list.

// ---- a ready meal (REC-21) -------------------------------------------------------------

/** The product a ready meal is made of, and how much one portion is: its
 *  one line. Null when the recipe is not a ready meal. */
export function readyProduct(r: Pick<Recipe, 'id' | 'role'>, lines: RecipeLine[], foods: Map<string, Food>):
  { food: Food | null; grams: number | null; line: RecipeLine } | null {
  if (!isReady(r)) return null
  const line = lines.find((l) => l.recipe_id === r.id)
  if (!line) return null
  return { food: line.food_id ? foods.get(line.food_id) ?? null : null, grams: line.grams_per_portion == null ? null : Number(line.grams_per_portion), line }
}
