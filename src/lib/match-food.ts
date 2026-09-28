/** Turns the text of a workbook into rows: ingredient lines parsed, each one
 *  matched to a food, and the whole import planned before anything is saved.
 *  Nothing here touches the database, so all of it can be checked in Node. */

import type { ImportPreview } from './excel'
import { readUnits, unitFromText } from './units-rules.ts'

// ---- names and tokens ----------------------------------------------------

/** "Brown rice (cooked)" and "brown  RICE (cooked)" are the same name. */
export function normalName(s: string): string {
  return s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

const PARENS = /\([^)]*\)/g

/** Words that say how a food was bought or cut rather than what it is. Left
 *  in, "Sliced strawberries" would score as close to "Sliced ham" as to
 *  "Strawberry". This is the list the catalogue was matched with. */
const STOP = new Set([
  'and', 'with', 'or', 'in', 'the', 'a', 'of', 'sliced', 'slices', 'sticks', 'fillet', 'breast',
  'plain', 'mixed', 'frozen', 'fresh', 'low-fat', 'lean', 'unsweetened', 'firm', 'whole', 'large',
  'medium', 'small', 'water', 'canned',
])

/** One form per word, so "Blueberries" meets "Blueberry" and "Walnuts" meets
 *  "Walnut". Short words are left alone: "oats" and "peas" are already the
 *  form the catalogue uses. */
function singular(w: string): string {
  if (w.length <= 4) return w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.endsWith('oes')) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** The meaningful words of a name. What is in brackets is how it was cooked
 *  or bought, not what it is, so it does not count towards the match. */
export function tokens(s: string): Set<string> {
  const plain = normalName(s).replace(PARENS, ' ').replace(/[^a-z\s-]/g, ' ')
  const out = new Set<string>()
  for (const w of plain.split(/\s+/)) {
    const word = w.replace(/^-+|-+$/g, '')
    if (word.length > 2 && !STOP.has(word)) out.add(singular(word))
  }
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / (a.size + b.size - inter)
}

// ---- matching --------------------------------------------------------------

/** Names the catalogue gives a food that no amount of word overlap would
 *  find: D_Food is a USDA-style list with inverted names ("Fish Cod
 *  Atlantic"), and a recipe says "Hard-boiled egg". Taken from the notes in
 *  seed/match2.py, with three targets corrected to the names the catalogue
 *  really uses (Turkey Breast Meat+Skin, Beef Sirloin Top, Tomato Red). */
export const ALIAS: Record<string, string> = {
  'peanut butter': 'Butter Peanut Smooth',
  'hard-boiled egg': 'Egg Chicken',
  'baked cod': 'Fish Cod Atlantic',
  'grilled chicken breast': 'Chicken Broiler/Fryer Breast Meat',
  'turkey breast (grilled)': 'Turkey Breast Meat+Skin',
  'salmon fillet (grilled or baked)': 'Fish Salmon Atlantic Farmed',
  'tuna (canned in water, drained)': 'Fish Tuna Skipjack',
  'greek yogurt (plain)': 'Yogurt Greek',
  'greek yogurt (plain, low-fat)': 'Yogurt Greek',
  'romaine lettuce': 'Lettuce Cos/Romaine',
  'mixed greens': 'Lettuce Green Leaf',
  'red bell pepper': 'Bell Peppers',
  'cucumber slices': 'Cucumber (with peel)',
  'cucumber': 'Cucumber (with peel)',
  'carrot sticks': 'Carrot',
  'cherry tomatoes': 'Tomato Red',
  'sliced strawberries': 'Strawberry',
  'frozen berries': 'Strawberry',
  'berries (mixed)': 'Strawberry',
  'steamed broccoli': 'Broccoli',
  'zucchini (grilled)': 'Squash Winter Zucchini (with skin)',
  'tofu (firm, grilled)': 'Tofu Firm',
  'blueberries': 'Blueberry',
  'raspberries': 'Raspberry',
  'whole-wheat toast': 'Whole-wheat bread',
  'beef steak (grilled, lean)': 'Beef Sirloin Top',
}

/** Below this, two names share a word by accident ("Almond milk" and
 *  "Almond oil"), and a wrong food is worse than none: an unmatched line is
 *  shown as such, a wrong one quietly miscounts every meal it is in. */
export const MIN_SCORE = 0.45

export type MatchHow = 'exact' | 'alias' | 'token' | 'none'
export interface Match<T> { food: T | null; how: MatchHow; score: number }

/** Finds the food an ingredient line means. Built once per import, because a
 *  workbook has a few hundred lines and the catalogue eight hundred foods. */
export class FoodMatcher<T extends { name: string }> {
  private byName = new Map<string, T>()
  private cands: { food: T; toks: Set<string> }[] = []

  constructor(foods: Iterable<T>) {
    for (const f of foods) this.add(f)
  }

  /** The first food with a name wins, so pass the foods a person owns before
   *  the shared catalogue if theirs should be preferred. */
  add(food: T) {
    const key = normalName(food.name)
    if (!this.byName.has(key)) this.byName.set(key, food)
    const toks = tokens(food.name)
    if (toks.size) this.cands.push({ food, toks })
  }

  has(name: string): boolean {
    return this.byName.has(normalName(name))
  }

  match(raw: string): Match<T> {
    const key = normalName(raw)
    if (!key) return { food: null, how: 'none', score: 0 }

    const exact = this.byName.get(key)
    if (exact) return { food: exact, how: 'exact', score: 1 }

    const alias = ALIAS[key] && this.byName.get(normalName(ALIAS[key]))
    if (alias) return { food: alias, how: 'alias', score: 1 }

    // "Lentils (cooked)" is the food "Lentils"; the bracket is its state.
    const bare = normalName(key.replace(PARENS, ' '))
    const exactBare = bare !== key ? this.byName.get(bare) : undefined
    if (exactBare) return { food: exactBare, how: 'exact', score: 1 }

    const want = tokens(raw)
    if (want.size === 0) return { food: null, how: 'none', score: 0 }
    let best: T | null = null
    let bestScore = 0
    for (const c of this.cands) {
      let inter = 0
      for (const w of want) if (c.toks.has(w)) inter++
      if (inter === 0) continue
      // Every word of the line found in the food is a stronger sign than the
      // same overlap with words missing: "Protein powder" is "Whey protein
      // powder", not a food that merely mentions protein.
      const score = inter / (want.size + c.toks.size - inter) + (inter === want.size ? 0.15 : 0)
      if (score > bestScore) { best = c.food; bestScore = score }
    }
    return bestScore >= MIN_SCORE && best
      ? { food: best, how: 'token', score: bestScore }
      : { food: null, how: 'none', score: bestScore }
  }
}

// ---- ingredient lines ------------------------------------------------------

export interface ParsedLine {
  /** The food as the recipe names it: "Brown rice (cooked)". */
  food: string
  /** The last number followed by g, or null when the amount is not in grams. */
  grams: number | null
  /** What came after the dash: "1 large (50g)", "150ml". */
  qty: string | null
  state: 'raw' | 'cooked' | 'canned'
}

const GRAMS = /(\d+(?:[.,]\d+)?)\s*g\b/gi

/** The largest values the server columns hold: numeric(7,2) for the macros
 *  and numeric(8,2) for grams. A bigger number is refused with an error the
 *  sync layer treats as temporary, so that row would be retried forever. */
export const MAX_MACRO = 99999.99
export const MAX_GRAMS = 999999.99

/** A number the server can store, or unknown. A negative amount or a figure
 *  past the column is a typing slip in the workbook, not a value to keep. */
export function fit(n: number | null | undefined, max: number): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max ? n : null
}
const COOKED = /\b(cooked|steamed|grilled|baked|boiled|roasted|drained)\b/i

function lastGrams(s: string): number | null {
  const all = [...s.matchAll(GRAMS)]
  if (all.length === 0) return null
  const n = Number(all[all.length - 1][1].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** A cooked weight is converted back to raw before macros are applied, so the
 *  wording decides it. Drained tuna is weighed after the tin, like cooked. */
export function stateOf(raw: string): ParsedLine['state'] {
  if (COOKED.test(raw)) return 'cooked'
  if (/\bcanned\b/i.test(raw)) return 'canned'
  return 'raw'
}

/** "Brown rice (cooked) – 60g" or "Hard-boiled egg – 1 large (50g)". */
export function parseIngredientLine(line: string): ParsedLine | null {
  const text = line.normalize('NFKC').replace(/^[\s•·*]+/, '').trim()
  if (!text) return null
  let food: string
  let qty: string | null
  const dash = text.split(/\s[–—-]\s/)
  if (dash.length > 1) {
    food = dash[0]
    qty = dash.slice(1).join(' - ').trim() || null
  } else {
    // No dash: "Rice 60g" still has its amount at the end.
    const tail = text.match(/^(.*?\D)\s+(\d+(?:[.,]\d+)?\s*g)$/i)
    food = tail ? tail[1] : text
    qty = tail ? tail[2] : null
  }
  food = food.replace(/^[\s–—-]+|[\s–—-]+$/g, '').trim()
  if (!food) return null
  // When the line has an amount, only the amount can give the grams: in
  // "Protein bar (20g protein) – 1 bar" the 20g describes the food, and
  // reading it as the portion would count a fifth of a bar.
  const grams = fit(qty ? lastGrams(qty) : lastGrams(text), MAX_GRAMS)
  return { food, grams, qty, state: stateOf(food) }
}

export function parseIngredients(text: string): ParsedLine[] {
  return text.split(/\r?\n/).map(parseIngredientLine).filter((l): l is ParsedLine => l !== null)
}

// ---- the plan --------------------------------------------------------------

export interface FoodRowPlan {
  id: string; owner_id: string; name: string
  kcal: number | null; carbs_g: number | null; fiber_g: number | null; fat_g: number | null; protein_g: number | null
  state: 'raw'; cook_yield: null; pack_size_g: null; store_section: null
  source: 'import'; updated_at: string; deleted_at: null
}
export interface RecipeRowPlan {
  id: string; owner_id: string; name: string; role: null; portions_per_batch: number
  cook_minutes: null; steps: null
  kcal: number | null; carbs_g: number | null; fiber_g: number | null; fat_g: number | null; protein_g: number | null
  updated_at: string; deleted_at: null
}
export interface LineRowPlan {
  id: string; recipe_id: string; food_id: string | null
  raw_text: string; grams_per_portion: number | null; state: string; note: string | null; sort_order: number
  /** Only on a line whose amount names one of the food's units ("2 slices"). */
  unit?: string; unit_qty?: number
}

export interface ImportPlan {
  foods: FoodRowPlan[]
  recipes: { recipe: RecipeRowPlan; lines: LineRowPlan[] }[]
  foodsExisting: number
  recipesExisting: number
  linesMatched: number
  linesUnmatched: number
  /** The lines no food was found for, as the recipe wrote them. */
  unmatched: string[]
  exercises: number
}

type Macros = { kcal: number | null; carbs_g: number | null; fiber_g: number | null; fat_g: number | null; protein_g: number | null }

function macros(m: Partial<Macros>): Macros {
  return {
    kcal: fit(m.kcal, MAX_MACRO), carbs_g: fit(m.carbs_g, MAX_MACRO), fiber_g: fit(m.fiber_g, MAX_MACRO),
    fat_g: fit(m.fat_g, MAX_MACRO), protein_g: fit(m.protein_g, MAX_MACRO),
  }
}

/** One entry for the sync queue, in the shape queueChange writes: the fields
 *  listed and their values, so the server receives exactly what was set. */
export function pendingEntry<T extends { id: string }>(table: string, row: T, fields: (keyof T & string)[], at: string) {
  return {
    table,
    row_id: row.id,
    op: 'upsert' as const,
    payload: Object.fromEntries(fields.map((f) => [f, row[f]])) as Record<string, unknown>,
    fields: [...fields] as string[],
    changed_at: at,
  }
}

/** Decides every row an import would write, without writing any. Foods and
 *  recipes whose name is already visible (shared catalogue or the person's
 *  own) are skipped and counted: importing the workbook the catalogue was
 *  built from should add nothing, not a second copy of everything. */
export function planImport(
  preview: ImportPreview,
  existing: { foods: { id: string; name: string; units?: unknown }[]; recipes: { name: string }[] },
  ownerId: string,
  newId: () => string,
  now: string,
): ImportPlan {
  // Foods are matched in the order given, so the caller passes the person's
  // own foods before the catalogue to have theirs preferred.
  const matcher = new FoodMatcher<{ id: string; name: string; units?: unknown }>(existing.foods)
  const plan: ImportPlan = {
    foods: [], recipes: [], foodsExisting: 0, recipesExisting: 0,
    linesMatched: 0, linesUnmatched: 0, unmatched: [], exercises: preview.exercises.length,
  }

  for (const f of preview.foods) {
    if (matcher.has(f.name)) { plan.foodsExisting++; continue }
    const row: FoodRowPlan = {
      id: newId(), owner_id: ownerId, name: f.name.trim(),
      ...macros(f),
      state: 'raw', cook_yield: null, pack_size_g: null, store_section: null,
      source: 'import', updated_at: now, deleted_at: null,
    }
    plan.foods.push(row)
    // A recipe further down may use a food this same workbook adds.
    matcher.add(row)
  }

  const recipeNames = new Set(existing.recipes.map((r) => normalName(r.name)))
  for (const r of preview.recipes) {
    const key = normalName(r.name)
    if (!key || recipeNames.has(key)) { plan.recipesExisting++; continue }
    recipeNames.add(key)
    const recipe: RecipeRowPlan = {
      id: newId(), owner_id: ownerId, name: r.name.trim(), role: null, portions_per_batch: 1,
      cook_minutes: null, steps: null,
      ...macros(r),
      updated_at: now, deleted_at: null,
    }
    const lines = parseIngredients(r.ingredients).map((p, i): LineRowPlan => {
      const m = matcher.match(p.food)
      if (m.food) plan.linesMatched++
      else { plan.linesUnmatched++; plan.unmatched.push(p.qty ? `${p.food} – ${p.qty}` : p.food) }
      // raw_text is the food as the recipe says it, which the shopping list
      // shows; the amount as written goes in the note, so a line that is not
      // in grams ("150ml") keeps what it said.
      const line: LineRowPlan = {
        id: newId(), recipe_id: recipe.id, food_id: m.food?.id ?? null,
        raw_text: p.food, grams_per_portion: p.grams, state: p.state, note: p.qty, sort_order: i,
      }
      // "Hard-boiled egg – 1 large (50g)" or "Bread – 2 slices", for a food
      // counted in units, is kept as 1 egg or 2 slices; the grams the line
      // states stand, and without them come from the unit.
      const counted = m.food ? unitFromText(p.qty, readUnits(m.food.units), p.grams) : null
      if (counted?.unit && counted.unit_qty !== null && fit(counted.grams, MAX_GRAMS) !== null) {
        line.grams_per_portion = counted.grams
        line.unit = counted.unit
        line.unit_qty = counted.unit_qty
      }
      return line
    })
    plan.recipes.push({ recipe, lines })
  }
  return plan
}
