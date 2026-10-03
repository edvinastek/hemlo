/** Turns the text of a workbook into rows: ingredient lines parsed, each one
 *  matched to a food, and the whole import planned before anything is saved.
 *  Nothing here touches the database, so all of it can be checked in Node. */

import type { ImportPreview } from './excel'
import { AMOUNT_AT_START, PORTION_MAX_G, leadingAmount, plainFractions, readUnits, unitFromText } from './units-rules.ts'

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
  'medium', 'small', 'water', 'canned', 'average', 'raw', 'unprepared', 'without',
])

/** One form per word, so "Blueberries" meets "Blueberry" and "Walnuts" meets
 *  "Walnut". Short words are left alone: "oats" and "peas" are already the
 *  form the catalogue uses. */
function singular(w: string): string {
  if (w === 'oats') return 'oat'
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

/** What a recipe says, and the food in the shared catalogue (NEVO-online
 *  2025/9.0 since migration 027, with the few old foods kept) it means, where
 *  word overlap alone would land on the wrong one ("Apple" on dried apples,
 *  "Milk" on milk chocolate). The workbook's 26 recipes and the plainest
 *  words people type. A cooked line points at the raw food when the food
 *  knows its cook yield (rice, oats, pulses, meat, fish), so the cooked
 *  weight is turned back into raw. */
export const ALIAS: Record<string, string> = {
  'apple': 'Apple with skin average',
  'almonds': 'Almonds with skin unsalted',
  'almond milk (unsweetened)': 'Almond drink unsweetened',
  'asparagus': 'Green asparagus, raw',
  'baked cod': 'Cod, raw',
  'beef steak (grilled, lean)': 'Beef rump steak, raw',
  'berries (mixed)': 'Fruit forest average',
  'broccoli (steamed)': 'Broccoli, raw',
  'brown rice (cooked)': 'Brown rice, boiled',
  'butter': 'Butter unsalted',
  'carrot': 'Carrot, raw average',
  'carrot sticks': 'Carrot, raw average',
  'cauliflower (steamed)': 'Cauliflower, raw',
  'cherry tomatoes': 'Cherry tomato, raw',
  'chia seeds': 'Chia seeds, dried',
  'chicken breast': 'Chicken fillet, raw',
  'chickpeas (cooked)': 'Chickpeas, boiled',
  'courgette': 'Courgettes, raw',
  'cucumber': 'Cucumber with skin, raw',
  'cucumber slices': 'Cucumber with skin, raw',
  'egg': 'Egg average, raw',
  'eggs': 'Egg average, raw',
  'flour': 'Wheat flour white',
  'frozen berries': 'Fruit forest average',
  'garlic': 'Garlic, raw',
  'greek yogurt (plain)': 'Greek yoghurt full fat',
  'greek yogurt (plain, low-fat)': 'Greek yoghurt skimmed',
  'grilled chicken breast': 'Chicken fillet, raw',
  'hard-boiled egg': 'Egg average, boiled',
  'hummus': 'Hummus natural',
  'lentils (cooked)': 'Lentils green and brown, dried',
  'milk': 'Semi-skimmed milk',
  'mixed greens': 'Lettuce average, raw',
  'mixed nuts': 'Mixed nuts unsalted',
  'oats': 'Oat flakes',
  'oats (cooked)': 'Oat flakes',
  'onion': 'Onions, raw',
  'potato': 'Potatoes, raw',
  'quinoa (cooked)': 'Quinoa, raw',
  'red bell pepper': 'Sweet pepper red, raw',
  'rice': 'White rice, raw',
  'romaine lettuce': 'Romaine lettuce, raw',
  'salmon fillet (grilled or baked)': 'Salmon farmed, raw',
  'shrimp (grilled or steamed)': 'Shrimp, raw',
  'sliced strawberries': 'Strawberries',
  'spinach': 'Spinach, raw',
  'steamed broccoli': 'Broccoli, raw',
  'sugar': 'Granulated sugar',
  'sweet potato (baked)': 'Sweet potato, raw',
  'tofu (firm, grilled)': 'Tofu, unprepared',
  'tomato': 'Tomato average, raw',
  'tuna (canned in water, drained)': 'Tuna in water, tinned',
  'turkey breast (grilled)': 'Turkey fillet, raw',
  'walnuts': 'Walnuts unsalted',
  'whole-wheat pasta (cooked)': 'Wholemeal pasta, boiled',
  'whole-wheat pita': 'Wholemeal pitta bread',
  'whole-wheat toast': 'Wheat bread wholemeal average fine and coarse',
  'zucchini': 'Courgettes, raw',
  'zucchini (grilled)': 'Courgettes, raw',
}

/** Words that make a food something made from another: "Almond drink" is
 *  not almonds, "Rice flour" is not rice. */
const MADE_FROM = /\b(drink|juice|sauce|flour|paste|powder|dried|tinned|canned|glass|soup|salad|pie|cake|cakes|biscuit|biscuits|bread|oil|syrup|spread|product|processed|chocolate|sweets|dessert|pudding|cereal|bar|chips|crisps|fried|baked|meal|dish|mix|candied|coated|filled|stuffed|marinated|pickled|smoked|frozen|instant|formula|infant|toddler|liqueur|wine|beer)\b/

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

    // "2 eggs" names the food "Egg": a plural of an exact name is that name.
    const one = /[^s]s$/.test(bare) ? this.byName.get(bare.slice(0, -1)) : undefined
    if (one) return { food: one, how: 'exact', score: 1 }

    const want = tokens(raw)
    if (want.size === 0) return { food: null, how: 'none', score: 0 }

    // Every word of the line at the start of a word of the food's name,
    // the plainest such food first: "Walnuts" is "Walnuts unsalted", not a
    // food that only shares a word with it. Foods made from it (a drink, a
    // sauce, a flour, a dried or tinned one) come after the food itself.
    const words = [...want]
    let plain: T | null = null
    let plainScore = Infinity
    for (const c of this.cands) {
      const name = normalName(c.food.name)
      const parts = name.split(/[^a-z]+/).filter(Boolean).map(singular)
      if (!words.every((w) => parts.some((p) => p.startsWith(w)))) continue
      const score = (MADE_FROM.test(name) ? 1000 : 0) + name.length
      if (score < plainScore) { plain = c.food; plainScore = score }
    }
    if (plain) return { food: plain, how: 'token', score: 0.9 }
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
  /** Set when the amount cannot be right (more than 10 kg a portion): the
   *  line is kept without grams and the preview says so. */
  problem?: string
  /** For a line read amount-first ("2 eggs"): the whole line, in case it is
   *  a food whose name starts with a number ("7 Up"). */
  whole?: string
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

/** "Brown rice (cooked) – 60g", "Hard-boiled egg – 1 large (50g)",
 *  "Milk – 200" (grams), "Avocado – ½", "½ avocado (75g)" or "2 eggs".
 *
 *  Fractions are made plain first ("½" is "1/2", "1½" is "1 1/2"): Unicode's
 *  tidying (NFKC) would turn "½" into "1⁄2" with a fraction slash, which read
 *  as a bare "1", and "1½" into "11⁄2". A bare number after the dash is
 *  grams; a bare fraction is that much of the food, counted in its unit when
 *  it has one (see unitFromText). More than 10 kg a portion is a slip, not an
 *  amount: the line keeps no grams and says why in `problem`. */
export function parseIngredientLine(line: string): ParsedLine | null {
  const text = plainFractions(line).normalize('NFKC').replace(/\s*⁄\s*/g, '/').replace(/^[\s•·*]+/, '').trim()
  if (!text) return null
  let food: string
  let qty: string | null
  let whole: string | undefined
  const dash = text.split(/\s[–—-]\s/)
  const tail = dash.length > 1 ? null : /^(.*?\D)\s+(\d+(?:[.,]\d+)?\s*g)$/i.exec(text)
  const lead = new RegExp(`^${AMOUNT_AT_START}\\s*(g|gr|grams?)?\\s+(\\p{L}.*)$`, 'iu').exec(text)
  if (dash.length > 1) {
    food = dash[0]
    qty = dash.slice(1).join(' - ').trim() || null
  } else if (tail) {
    // No dash: "Rice 60g" still has its amount at the end.
    food = tail[1]
    qty = tail[2]
  } else if (lead) {
    // The amount first: "2 eggs", "½ avocado (75g)", "100g oats". Grams in
    // brackets at the end belong to the amount, not to the food's name.
    food = lead[3].replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*g\s*\)\s*$/i, '')
    qty = lead[2] ? `${lead[1]} g` : text
    whole = text
  } else {
    food = text
    qty = null
  }
  food = food.replace(/^[\s–—-]+|[\s–—-]+$/g, '').trim()
  if (!food) return null
  // When the line has an amount, only the amount can give the grams: in
  // "Protein bar (20g protein) – 1 bar" the 20g describes the food, and
  // reading it as the portion would count a fifth of a bar.
  let grams = qty ? lastGrams(qty) : lastGrams(text)
  // "Milk – 200": a number and nothing else is grams. A bare fraction is not.
  const bare = qty ? leadingAmount(qty) : null
  if (grams === null && qty && bare && !bare.fraction && new RegExp(`^${AMOUNT_AT_START}$`).test(qty)) grams = bare.qty
  if (grams !== null && grams > PORTION_MAX_G) {
    return { food, grams: null, qty, state: stateOf(food), problem: `${gramsText(grams)} a portion is more than 10 kg`, ...(whole ? { whole } : {}) }
  }
  return { food, grams: fit(grams, MAX_GRAMS), qty, state: stateOf(food), ...(whole ? { whole } : {}) }
}

const gramsText = (g: number) => (g >= 1000 ? `${Math.round(g / 100) / 10} kg` : `${g} g`)

export function parseIngredients(text: string): ParsedLine[] {
  return text.split(/\r?\n/).map(parseIngredientLine).filter((l): l is ParsedLine => l !== null)
}

// ---- the plan --------------------------------------------------------------

export interface FoodRowPlan {
  id: string; owner_id: string; name: string
  kcal: number | null; carbs_g: number | null; fiber_g: number | null; fat_g: number | null; protein_g: number | null
  carb_basis: 'eu'
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
  /** Lines whose amount cannot be right (more than 10 kg a portion), as the
   *  recipe wrote them and why: saved without grams, for the person to fix. */
  problems: string[]
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
    linesMatched: 0, linesUnmatched: 0, unmatched: [], problems: [], exercises: preview.exercises.length,
  }

  for (const f of preview.foods) {
    if (matcher.has(f.name)) { plan.foodsExisting++; continue }
    // The workbook's figures come from the same US list the old catalogue
    // did: carbohydrate there includes fibre. It is kept on the EU basis, as
    // every food is since 026 (FOOD-03).
    const m = macros(f)
    const row: FoodRowPlan = {
      id: newId(), owner_id: ownerId, name: f.name.trim(),
      ...m, carbs_g: m.carbs_g === null ? null : Math.max(0, Math.round((m.carbs_g - (m.fiber_g ?? 0)) * 100) / 100),
      carb_basis: 'eu',
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
    const lines = parseIngredients(r.ingredients).map((read, i): LineRowPlan => {
      let p = read
      let m = matcher.match(p.food)
      // "7 Up" is a food, not seven of "Up": read amount-first, the line is
      // tried whole when only that matches.
      if (!m.food && p.whole) {
        const w = matcher.match(p.whole)
        if (w.food) { m = w; p = { ...p, food: p.whole, qty: null, grams: null, problem: undefined } }
      }
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
      const units = m.food ? readUnits(m.food.units) : []
      const counted = m.food ? unitFromText(p.qty, units, p.grams) : null
      if (counted?.unit && counted.unit_qty !== null && fit(counted.grams, MAX_GRAMS) !== null) {
        line.grams_per_portion = counted.grams
        line.unit = counted.unit
        line.unit_qty = counted.unit_qty
      }
      // An amount that cannot be right ("300 eggs" a portion, 200 kg of
      // rice) is kept without grams and shown in the preview, never saved as
      // if it were meant.
      const tooMuch = p.problem ?? (!counted && m.food && (unitFromText(p.qty, units, p.grams, Infinity)?.grams ?? 0) > PORTION_MAX_G
        ? 'more than 10 kg a portion' : null)
      if (tooMuch) plan.problems.push(`${p.food} – ${p.qty}: ${tooMuch}, saved without an amount`)
      return line
    })
    plan.recipes.push({ recipe, lines })
  }
  return plan
}
