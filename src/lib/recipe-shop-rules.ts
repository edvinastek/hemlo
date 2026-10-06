/** Recipes onto the shopping list (REC-08, SHOP-14), as rules with no
 *  database, no React and no clock (checked in src/test/recipeshop.check.mjs).
 *
 *  There is one way a recipe's ingredients become things to buy, and it is
 *  the meal plan's: each picked recipe counts as a planned meal of so many
 *  servings (planNeeds), and what that needs is put in what a shop sells,
 *  less what is at home when the person wants that (plannedLines). Only the
 *  last step is this file's own: fitting the result onto the list as it is,
 *  where the same food in the same unit (or g and kg, ml and l) takes the
 *  amount on top and anything else is a line of its own, so a sum is never
 *  wrong. The writing is in shopping.ts (addRecipesToList). */

import {
  itemKey, mergeAmounts, planNeeds, plannedLines, NOTE_MAX, type PlanNeed, type PlannedLine, type StockLevel,
} from './shopping-rules.ts'
import type { Food, Recipe, RecipeLine, ShoppingEntry } from './types'

/** One recipe picked, and for how many servings. */
export interface RecipePick { recipe_id: string; servings: number }

export const SERVINGS_MIN = 0.5
export const SERVINGS_MAX = 50

/** A recipe's servings when the person says nothing: one batch. */
export const defaultServings = (r: Pick<Recipe, 'portions_per_batch'>): number =>
  Number(r.portions_per_batch) > 0 ? Math.min(SERVINGS_MAX, Number(r.portions_per_batch)) : 1

/** The quiet −/+ stepper: halves below one, whole servings from one up. */
export function stepServings(n: number, dir: 1 | -1): number {
  const next = dir > 0 ? (n < 1 ? n + 0.5 : Math.floor(n) + 1) : (n > 1 ? Math.ceil(n) - 1 : n - 0.5)
  return Math.min(SERVINGS_MAX, Math.max(SERVINGS_MIN, next))
}

/** "4 servings", "½ serving", "1½ servings". */
export function servingsText(n: number): string {
  const whole = Math.floor(n)
  const half = n - whole >= 0.5 ? '½' : ''
  const num = whole === 0 && half ? '½' : `${whole}${half}`
  return `${num} ${n === 1 || n === 0.5 ? 'serving' : 'servings'}`
}

/** Whether to ask before adding: only when the servings were not said
 *  already (the recipe's page has its own portions) or something the
 *  recipes need is at home, so the person can choose to leave it out. */
export const shouldAsk = (servingsKnown: boolean, atHome: number) => !servingsKnown || atHome > 0

/** A day the picks are treated as planned on; any day does, as only the
 *  picks are counted. */
const ANY_DAY = '2000-01-01'

/** What the picked recipes need, per food, worked out exactly as for the
 *  meal plan: each recipe a planned meal of that many servings (ready meals
 *  too), ingredients times the servings, cooked weights bought raw, counts
 *  kept while every line said the same unit. Lines without a food ("salt to
 *  taste") are left out, as on the plan. */
export function recipeNeeds(picks: RecipePick[], linesByRecipe: Map<string, RecipeLine[]>, foods: Map<string, Food>): PlanNeed[] {
  const slots = picks.filter((p) => p.servings > 0).map((p) => ({
    slot_date: ANY_DAY, status: null, recipe_id: p.recipe_id, portion_multiplier: p.servings,
    food_id: null, grams: null, unit: null, unit_qty: null, deleted_at: null,
  }))
  return planNeeds(slots as never, linesByRecipe, foods, ANY_DAY, ANY_DAY)
}

/** The foods of these needs that something is at home of (Stock), by name. */
export function atHome(needs: PlanNeed[], stock: Map<string, number>, foods: Map<string, Food>): string[] {
  return needs.filter((n) => (stock.get(n.food_id) ?? 0) > 0).map((n) => n.said ?? foods.get(n.food_id)?.name ?? 'Unknown food')
}

/** What to buy, in what a shop sells (whole packs, whole ones, else grams):
 *  the meal plan's own rule. With `stock`, what is at home is taken off and
 *  a food fully covered drops out; a minimum kept in Stock is the list's
 *  business, not this action's, so it is not added here. */
export function recipeBuy(needs: PlanNeed[], foods: Map<string, Food>, stock: Map<string, number> | null): PlannedLine[] {
  const levels = new Map<string, StockLevel>()
  if (stock) for (const n of needs) { const g = stock.get(n.food_id) ?? 0; if (g > 0) levels.set(n.food_id, { grams: g, min: null }) }
  return plannedLines(needs, levels, foods)
}

export interface Amount { qty: number | null; unit: string | null; grams: number | null }

const tenth = (n: number) => Math.round(n * 10) / 10

/** A line to buy as the list keeps an amount: packs, a count in the food's
 *  unit ("3 onion"), else grams or kilos (millilitres or litres for a drink). */
export function listAmount(line: PlannedLine, food: Pick<Food, 'per_ml'> | undefined): Amount {
  if (line.packs !== null && line.pack_size_g) return { qty: line.packs, unit: 'pack', grams: tenth(line.packs * line.pack_size_g) }
  if (line.count !== null && line.unit && line.unit_g) return { qty: line.count, unit: line.unit.name, grams: tenth(line.count * line.unit_g) }
  const g = Math.round(line.buy_g)
  const drink = !!food?.per_ml
  return g >= 1000
    ? { qty: Math.round(g) / 1000, unit: drink ? 'l' : 'kg', grams: g }
    : { qty: g, unit: drink ? 'ml' : 'g', grams: g }
}

/** Where an item goes on the list, as the list does it: the aisle and shop
 *  it had when the household last bought that food; none otherwise (the
 *  list then works the aisle out from the food, as for any item). */
export function lastPlaces(entries: Pick<ShoppingEntry, 'food_id' | 'aisle' | 'shop' | 'bought_at'>[]): Map<string, { aisle: string | null; shop: string | null }> {
  const out = new Map<string, { aisle: string | null; shop: string | null; at: string }>()
  for (const e of entries) {
    if (!e.food_id || !e.bought_at || (!e.aisle && !e.shop)) continue
    const had = out.get(e.food_id)
    if (!had || e.bought_at > had.at) out.set(e.food_id, { aisle: e.aisle ?? null, shop: e.shop ?? null, at: e.bought_at })
  }
  return new Map([...out].map(([k, v]) => [k, { aisle: v.aisle, shop: v.shop }]))
}

/** One thing to put on the list. */
export interface ListAdd extends Amount {
  food_id: string
  name: string
  aisle: string | null
  shop: string | null
  /** "For Chicken curry", "For Curry, Dal". */
  note: string | null
}

/** What adding does to the list: a row that takes more, or a new row. */
export type ListOp =
  | { kind: 'more'; entry_id: string; amount: Amount }
  | { kind: 'new'; item: ListAdd }

/** Fit the items onto the list as it is (one list: the main one, or a named
 *  one). An item goes on top of a row for the same food that is not in the
 *  basket yet, when the two amounts add up (mergeAmounts: the same unit, or
 *  grams and kilos); a food on the list in another unit gets a line of its
 *  own rather than a wrong sum. Rows the meal plan keeps (plan_key) are the
 *  plan's and are never added to. */
export function fitOnList(adds: ListAdd[], entries: ShoppingEntry[], list: string | null): ListOp[] {
  const rows = entries
    .filter((e) => !e.deleted_at && !e.plan_key && !e.checked && (e.list ?? null) === list)
    .map((e) => ({ id: e.id, key: itemKey(e), amount: { qty: num(e.qty), unit: e.unit ?? null, grams: num(e.grams) } as Amount }))
  const ops: ListOp[] = []
  for (const a of adds) {
    const key = itemKey(a)
    let done = false
    for (const r of rows) {
      if (r.key !== key) continue
      const sum = mergeAmounts(r.amount, { qty: a.qty, unit: a.unit, grams: a.grams })
      if (!sum) continue
      r.amount = sum
      const had = ops.find((o) => o.kind === 'more' && o.entry_id === r.id)
      if (had && had.kind === 'more') had.amount = sum
      else ops.push({ kind: 'more', entry_id: r.id, amount: sum })
      done = true
      break
    }
    if (!done) ops.push({ kind: 'new', item: a })
  }
  return ops
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

/** Which recipes use each food, for the note on a new line. */
export function recipesByFood(picks: RecipePick[], linesByRecipe: Map<string, RecipeLine[]>, names: Map<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const p of picks) {
    const name = names.get(p.recipe_id)
    if (!name) continue
    for (const l of linesByRecipe.get(p.recipe_id) ?? []) {
      if (!l.food_id) continue
      const list = out.get(l.food_id) ?? []
      if (!list.includes(name)) list.push(name)
      out.set(l.food_id, list)
    }
  }
  return out
}

/** The note a new line carries: which recipes it is for. */
export function forNote(names: string[] | undefined): string | null {
  if (!names?.length) return null
  const text = `For ${names.join(', ')}`
  return text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX - 1)}…` : text
}

/** Everything adding the picks does, from what is on the device: the needs,
 *  what is at home, the lines to buy and how they fit on the list. */
export function planRecipeAdd(opts: {
  picks: RecipePick[]
  linesByRecipe: Map<string, RecipeLine[]>
  foods: Map<string, Food>
  recipeNames: Map<string, string>
  stock: Map<string, number>
  /** Leave out what Stock says is at home. */
  skipHome: boolean
  entries: ShoppingEntry[]
  list: string | null
}): { ops: ListOp[]; atHome: string[]; covered: number } {
  const needs = recipeNeeds(opts.picks, opts.linesByRecipe, opts.foods)
  const home = atHome(needs, opts.stock, opts.foods)
  const buy = recipeBuy(needs, opts.foods, opts.skipHome ? opts.stock : null)
  const places = lastPlaces(opts.entries)
  const uses = recipesByFood(opts.picks, opts.linesByRecipe, opts.recipeNames)
  const adds: ListAdd[] = buy.map((line) => {
    const food = opts.foods.get(line.food_id)
    const place = places.get(line.food_id)
    return {
      food_id: line.food_id, name: line.name, ...listAmount(line, food),
      aisle: place?.aisle ?? null, shop: place?.shop ?? null, note: forNote(uses.get(line.food_id)),
    }
  })
  return { ops: fitOnList(adds, opts.entries, opts.list), atHome: home, covered: needs.length - buy.length }
}

/** The one line said after adding: "12 items added to Shopping". */
export const addedText = (n: number) => (n === 0 ? 'Nothing to add: it is all at home' : `${n} ${n === 1 ? 'item' : 'items'} added to Shopping`)
