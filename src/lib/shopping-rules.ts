/** Pure rules for the shopping list: reading what a person types ("2 kg
 *  apples"), which aisle a thing is in, what the meal plan and the cupboard
 *  put on the list, how the list is grouped and filtered by shop, the
 *  "recently bought" tiles, prices and the trip's total, and when the
 *  shopping trip goes on the plan. No database, no React and no clock: every
 *  rule is checked in plain Node (src/test/shopping.check.mjs). The reading
 *  and writing is in shopping.ts.
 *
 *  Grams stay the one truth, as everywhere: a millilitre of a drink counts
 *  as a gram, and a count ("6 eggs") is turned into grams only when the food
 *  says what one weighs. */

import { rawGrams } from './calc.ts'
import { fold, search } from './search-rules.ts'
import { addDays, weekdayOf, WEEK_ORDER } from './schedule-rules.ts'
import {
  addCounts, countOf, findUnit, foodWord, formatCount, formatQty, gramsLabel, plainFractions, readQty, readUnits, unitKey, wholeToBuy,
  GRAMS_MAX, QTY_MAX, type AmountChoice, type Count, type FoodUnit,
} from './units-rules.ts'
import type { Food, MealPlanSlot, RecipeLine, ShoppingEntry } from './types'

/** The database's limits for a list item (026, 028), so nothing is offered that it refuses. */
export const NAME_MAX = 120
export const NOTE_MAX = 200
export const AISLE_MAX = 40
export const SHOP_MAX = 60
export const LIST_MAX = 40
export const UNIT_MAX = 24

// ---- reading what was typed ------------------------------------------------------

/** Words that weigh or measure: the factor to grams (a millilitre counts as
 *  a gram), and the short form the list shows. */
const MEASURES: Record<string, { unit: 'g' | 'kg' | 'ml' | 'l'; factor: number }> = {
  g: { unit: 'g', factor: 1 }, gr: { unit: 'g', factor: 1 }, gram: { unit: 'g', factor: 1 }, grams: { unit: 'g', factor: 1 },
  gramme: { unit: 'g', factor: 1 }, grammes: { unit: 'g', factor: 1 },
  kg: { unit: 'kg', factor: 1000 }, kilo: { unit: 'kg', factor: 1000 }, kilos: { unit: 'kg', factor: 1000 },
  kilogram: { unit: 'kg', factor: 1000 }, kilograms: { unit: 'kg', factor: 1000 },
  ml: { unit: 'ml', factor: 1 }, millilitre: { unit: 'ml', factor: 1 }, millilitres: { unit: 'ml', factor: 1 },
  milliliter: { unit: 'ml', factor: 1 }, milliliters: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 }, dl: { unit: 'ml', factor: 100 },
  l: { unit: 'l', factor: 1000 }, ltr: { unit: 'l', factor: 1000 }, litre: { unit: 'l', factor: 1000 }, litres: { unit: 'l', factor: 1000 },
  liter: { unit: 'l', factor: 1000 }, liters: { unit: 'l', factor: 1000 },
}

/** Words that count the way a shop sells: the singular the list keeps. Dutch
 *  shop words too, as a Dutch phone's keyboard suggests them. */
const COUNT_WORDS: Record<string, string> = {
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack', pak: 'pack', pakken: 'pack', pakje: 'pack', pakjes: 'pack',
  bag: 'bag', bags: 'bag', zak: 'bag', zakken: 'bag', zakje: 'bag', zakjes: 'bag',
  bottle: 'bottle', bottles: 'bottle', fles: 'bottle', flessen: 'bottle', flesje: 'bottle', flesjes: 'bottle',
  tin: 'tin', tins: 'tin', can: 'can', cans: 'can', blik: 'tin', blikken: 'tin', blikje: 'can', blikjes: 'can',
  jar: 'jar', jars: 'jar', pot: 'jar', potten: 'jar', potje: 'jar', potjes: 'jar',
  box: 'box', boxes: 'box', doos: 'box', dozen: 'box', doosje: 'box', doosjes: 'box',
  bunch: 'bunch', bunches: 'bunch', bos: 'bunch', bossen: 'bunch', bosje: 'bunch', bosjes: 'bunch',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', stuk: 'piece', stuks: 'piece', st: 'piece',
  slice: 'slice', slices: 'slice', plak: 'slice', plakken: 'slice',
  loaf: 'loaf', loaves: 'loaf', carton: 'carton', cartons: 'carton', tub: 'tub', tubs: 'tub', bak: 'tub', bakje: 'tub', bakjes: 'tub',
  roll: 'roll', rolls: 'roll', rol: 'roll', rollen: 'roll', tray: 'tray', trays: 'tray', net: 'net', nets: 'net', crate: 'crate', krat: 'crate',
}

/** What a typed line comes to: the item, and how much of it when that was said. */
export interface ParsedItem {
  name: string
  /** How many, in `unit` (or bare: "6 eggs" is 6). Null when no amount was typed. */
  qty: number | null
  /** 'g', 'kg', 'ml', 'l', a shop word ('pack', 'bottle'), or null for a bare count. */
  unit: string | null
  /** The grams it comes to, when the amount was a weight or a volume. */
  grams: number | null
}

const AMOUNT = String.raw`(\d+ \d+ ?\/ ?\d+|\d+ ?\/ ?\d+|\d+(?:[.,]\d+)?)`

/** A unit word, as typed, in what the list keeps; null when it is not one. */
function unitOf(word: string | undefined): { unit: string; factor: number | null } | null {
  if (!word) return null
  const w = word.toLowerCase().replace(/\.$/, '')
  if (MEASURES[w]) return { unit: MEASURES[w].unit, factor: MEASURES[w].factor }
  if (COUNT_WORDS[w]) return { unit: COUNT_WORDS[w], factor: null }
  return null
}

/** The item's name as kept: spaces tidied, "of" dropped from the front, the
 *  first letter a capital, at most 120 characters. */
export function cleanName(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim().replace(/^(of|van)\s+/i, '').replace(/[,;:.]+$/, '').trim()
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, NAME_MAX)
}

/** An amount and its unit, checked against what the database takes. */
function amountOf(qtyText: string, unitWord: string | undefined, times = 1): Omit<ParsedItem, 'name'> | null {
  const q = readQty(qtyText)
  if (q === null || q <= 0) return null
  const qty = Math.round(q * times * 1000) / 1000
  if (qty > QTY_MAX) return null
  const u = unitOf(unitWord)
  if (unitWord && !u) return null
  const grams = u?.factor ? Math.round(qty * u.factor * 100) / 100 : null
  if (grams !== null && grams > GRAMS_MAX) return null
  return { qty, unit: u?.unit ?? null, grams }
}

/** Reads one typed line: "2 kg apples", "6 eggs", "1,5 l milk", "2x yoghurt",
 *  "a dozen eggs", "apples 2 kg", "milk x2", "toilet paper". An amount it
 *  cannot read stays part of the name, so nothing typed is ever lost. Null
 *  for an empty line. */
export function parseItem(text: string): ParsedItem | null {
  const t = plainFractions(String(text ?? '')).replace(/\s+/g, ' ').trim()
  if (!t) return null
  const plain = (name: string): ParsedItem | null => {
    const n = cleanName(name)
    return n ? { name: n, qty: null, unit: null, grams: null } : null
  }
  const withName = (name: string, a: Omit<ParsedItem, 'name'> | null): ParsedItem | null => {
    const n = cleanName(name)
    if (!n) return plain(t)
    return a ? { name: n, ...a } : plain(t)
  }

  // "a dozen eggs", "half a dozen eggs", "dozen eggs"
  const dozen = /^(?:(half)\s+(?:a\s+)?|(a|an|one|\d+)\s+)?dozen\s+(.+)$/i.exec(t)
  if (dozen) {
    const n = dozen[1] ? 6 : dozen[2] && /^\d+$/.test(dozen[2]) ? Number(dozen[2]) * 12 : 12
    return withName(dozen[3], amountOf(String(n), undefined))
  }
  // "2x yoghurt", "2 x yoghurt", "3 × milk"
  let m = new RegExp(`^${AMOUNT}\\s*[x×]\\s+(.+)$`, 'i').exec(t) ?? new RegExp(`^${AMOUNT}[x×](\\S.*)$`, 'i').exec(t)
  if (m) return withName(m[2], amountOf(m[1], undefined))
  // "2 kg apples", "2kg apples", "6 eggs", "1 pack of rice", "500 g of mince"
  m = new RegExp(`^${AMOUNT}\\s*([a-zà-ž]+\\.?)\\s+(.+)$`, 'i').exec(t)
  if (m && unitOf(m[2])) return withName(m[3], amountOf(m[1], m[2]))
  m = new RegExp(`^${AMOUNT}\\s+(.+)$`, 'i').exec(t)
  // "2 kg" with nothing after it names nothing: it is kept as typed.
  if (m && !unitOf(m[2])) return withName(m[2], amountOf(m[1], undefined))
  // "apples 2 kg", "apples, 2kg", "milk 2 bottles"
  m = new RegExp(`^(.+?)[,\\s]\\s*${AMOUNT}\\s*([a-zà-ž]+\\.?)$`, 'i').exec(t)
  if (m && unitOf(m[3])) return withName(m[1], amountOf(m[2], m[3]))
  // "milk x2", "milk 2x", "milk ×2", "milk, 2"
  m = new RegExp(`^(.+?)\\s*(?:[x×]\\s*${AMOUNT}|\\s${AMOUNT}\\s*[x×])$`, 'i').exec(t)
  if (m) return withName(m[1], amountOf(m[2] ?? m[3], undefined))
  m = new RegExp(`^(.+?)\\s*,\\s*${AMOUNT}$`, 'i').exec(t)
  if (m) return withName(m[1], amountOf(m[2], undefined))
  return plain(t)
}

/** An amount typed on its own ("2 kg", "6", "2 packs", "½ l"), as an item
 *  keeps it. Empty is no amount; null is "that is not an amount". */
export function parseAmount(text: string): Omit<ParsedItem, 'name'> | null {
  const t = plainFractions(String(text ?? '')).replace(/\s+/g, ' ').trim()
  if (!t) return { qty: null, unit: null, grams: null }
  const m = new RegExp(`^${AMOUNT}\\s*([a-zà-ž]+\\.?)?$`, 'i').exec(t)
  return m ? amountOf(m[1], m[2]) : null
}

/** An amount as the list shows it: "2 kg", "500 g", "1.5 l", "2 packs",
 *  "6". `units` are the food's: a bare count of a food that counts in eggs
 *  reads "6 eggs". Empty when there is no amount. */
export function amountText(e: { qty?: number | null; unit?: string | null; grams?: number | null }, units: FoodUnit[] = []): string {
  const qty = e.qty === null || e.qty === undefined ? null : Number(e.qty)
  if (qty === null || !Number.isFinite(qty) || qty <= 0) {
    return e.grams ? gramsLabel(Number(e.grams)) : ''
  }
  const unit = e.unit ?? null
  if (unit && ['g', 'kg', 'ml', 'l'].includes(unit)) return `${formatQty(qty)} ${unit}`
  if (unit) {
    const own = findUnit(units, unit)
    return formatCount(qty, own ?? { name: unit })
  }
  // A bare count of a food that is counted in units is that unit.
  if (units.length === 1) return formatCount(qty, units[0])
  return formatQty(qty)
}

/** The grams a manual item comes to, when that can be said: its own grams,
 *  or a count of one of the food's units ("6 eggs" of 50 g is 300 g). */
export function entryGrams(e: { qty?: number | null; unit?: string | null; grams?: number | null }, food: Pick<Food, 'units' | 'pack_size_g'> | undefined): number | null {
  if (e.grams && Number(e.grams) > 0) return Number(e.grams)
  const qty = Number(e.qty)
  if (!food || !Number.isFinite(qty) || qty <= 0) return null
  const units = readUnits(food.units)
  if (e.unit === 'pack' && food.pack_size_g) return Math.round(qty * Number(food.pack_size_g) * 10) / 10
  const u = e.unit ? findUnit(units, e.unit) : units.length === 1 ? units[0] : undefined
  return u ? Math.round(qty * u.g * 10) / 10 : null
}

// ---- the amount field of an item linked to a food (UNIT-02) ---------------------------

/** An item with no food is typed as on paper ("2 kg", "6", "2 packs"); one
 *  linked to a food gets the one amount field every screen uses
 *  (ui/AmountInput.tsx): a number and the food's choices. Those are packs
 *  (when the pack size is known), a plain count in the food's own word when
 *  it has neither units nor a pack size ("6 apples"), grams and kilos
 *  (millilitres and litres for a drink) and its own units ("egg"). A shop word the item was saved in
 *  ("2 bottles") stays on offer, so opening an item never changes it.
 *
 *  Keys: 'packs', 'n' (a plain count), 'g', 'kg', 'u:egg' (a unit of the
 *  food), 'w:bottle' (a shop word kept). */
type FoodLike = Pick<Food, 'name' | 'pack_size_g'> & { units?: unknown; per_ml?: boolean | null }

export function listAmountChoices(food: FoodLike, keep: { qty?: number | null; unit?: string | null } | null = null): AmountChoice[] {
  const units = readUnits(food.units)
  const out: AmountChoice[] = []
  const pack = Number(food.pack_size_g)
  if (pack > 0) out.push({ key: 'packs', label: 'packs', g: pack, unit: null })
  // A plain count ("6 apples") for a food with neither units nor a pack
  // size: one sold in packs is counted in packs ("2 milk" is 2 packs).
  const bare = !!keep && !keep.unit && Number(keep.qty) > 0 && units.length !== 1
  if (!(pack > 0) && (!units.length || bare)) out.push({ key: 'n', label: foodWord(food.name), g: 0, unit: { name: foodWord(food.name), g: 0 } })
  out.push({ key: 'g', label: food.per_ml ? 'ml' : 'g', g: 1, unit: null })
  out.push({ key: 'kg', label: food.per_ml ? 'l' : 'kg', g: 1000, unit: null })
  for (const u of units) out.push({ key: unitKey(u.name), label: u.name, g: u.g, unit: u })
  const word = keep?.unit?.trim().toLowerCase()
  if (word && !(word === 'pack' && pack > 0) && !['g', 'kg', 'ml', 'l'].includes(word) && !findUnit(units, word)) {
    out.push({ key: `w:${word}`, label: word, g: 0, unit: { name: word, g: 0 } })
  }
  return out
}

/** What the field shows for an item's amount: the number and the choice. An
 *  item with no amount opens on packs, else the food's first unit, else a
 *  plain count, with the number empty. */
export function amountToField(e: { qty?: number | null; unit?: string | null; grams?: number | null }, choices: AmountChoice[]): { text: string; key: string } {
  const has = (k: string) => choices.some((c) => c.key === k)
  const first = has('packs') ? 'packs' : choices.find((c) => c.key.startsWith('u:'))?.key ?? (has('n') ? 'n' : 'g')
  const qty = e.qty === null || e.qty === undefined ? null : Number(e.qty)
  if (qty === null || !Number.isFinite(qty) || qty <= 0) {
    // Grams with no count (from an older row): shown in grams.
    const g = Number(e.grams)
    return g > 0 ? { text: formatQty(g >= 1000 ? g / 1000 : g), key: g >= 1000 ? 'kg' : 'g' } : { text: '', key: first }
  }
  const unit = e.unit?.trim().toLowerCase() ?? null
  if (unit === 'g' || unit === 'ml') return { text: formatQty(qty), key: 'g' }
  if (unit === 'kg' || unit === 'l') return { text: formatQty(qty), key: 'kg' }
  if (unit === 'pack' && has('packs')) return { text: formatQty(qty), key: 'packs' }
  if (unit) {
    const own = choices.find((c) => c.key.startsWith('u:') && c.unit && (c.unit.name.toLowerCase() === unit || findUnit([c.unit], unit)))
    if (own) return { text: formatQty(qty), key: own.key }
    if (has(`w:${unit}`)) return { text: formatQty(qty), key: `w:${unit}` }
  }
  // A plain count: the food's one unit when it has one, else its packs,
  // else the count.
  const units = choices.filter((c) => c.key.startsWith('u:'))
  if (!unit && units.length === 1) return { text: formatQty(qty), key: units[0].key }
  return { text: formatQty(qty), key: has('packs') ? 'packs' : has('n') ? 'n' : first }
}

/** What the list keeps for the number and choice typed, in the same shape
 *  as a typed line (parseAmount): the count, its word, and the grams for a
 *  weight or a volume. An empty field is no amount; null is not an amount. */
export function fieldToAmount(text: string, key: string, choices: AmountChoice[]): Omit<ParsedItem, 'name'> | null {
  if (!String(text ?? '').trim()) return { qty: null, unit: null, grams: null }
  const choice = choices.find((c) => c.key === key)
  if (!choice) return null
  const metric = key === 'g' || key === 'kg'
  const q = readQty(text, metric ? GRAMS_MAX : QTY_MAX)
  if (q === null || q <= 0) return null
  const qty = Math.round(q * 1000) / 1000
  if (metric) {
    const grams = Math.round(qty * choice.g * 100) / 100
    if (grams > GRAMS_MAX) return null
    const drink = choice.label === 'ml' || choice.label === 'l'
    return { qty, unit: key === 'g' ? (drink ? 'ml' : 'g') : (drink ? 'l' : 'kg'), grams }
  }
  if (key === 'packs') return { qty, unit: 'pack', grams: null }
  if (key === 'n') return { qty, unit: null, grams: null }
  // A unit of the food or a shop word: the count in that word; the grams
  // follow from the food (entryGrams), as for a typed "6 eggs".
  return { qty, unit: choice.unit?.name.slice(0, UNIT_MAX) ?? null, grams: null }
}

// ---- matching a typed item to a food ---------------------------------------------

/** One form per word, so "Eggs" meets "Egg" and "Tomatoes" meets "Tomato". */
function singular(w: string): string {
  if (w.length <= 3) return w
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.endsWith('oes')) return w.slice(0, -2)
  if (/(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** A name reduced to what it means: folded, brackets and commas gone, each
 *  word singular. "Eggs" and "egg" are the same item; "Rice (cooked)" is rice. */
export function nameKey(name: string): string {
  return fold(String(name ?? '').replace(/\([^)]*\)/g, ' ')).replace(/[.,/]/g, ' ').split(' ').filter(Boolean).map(singular).join(' ')
}

/** Which item a list row is, for merging, ticks, prices and the recent
 *  tiles: the food's id, or 'name:' and its meaning. */
export function itemKey(e: { food_id?: string | null; name?: string | null }): string {
  return e.food_id ? e.food_id : `name:${nameKey(e.name ?? '')}`.slice(0, 140)
}

export interface FoodChoice {
  id: string
  name: string
  /** The person's own food, one in stock, or one bought or eaten lately. */
  mine?: boolean
  inStock?: boolean
  recent?: number
}

/** The food a typed item means, when one clearly fits; null otherwise, and
 *  the item stays a plain one ("Toilet paper"). Only a food whose name means
 *  the same ("Eggs" is "Egg") counts, or, among the person's own, in-stock
 *  and recent foods, one whose name starts with it ("Milk" is their "Milk
 *  semi-skimmed"). Of several, their own and recent ones first, then the
 *  plainest name. */
export function matchFood(name: string, foods: FoodChoice[]): string | null {
  const key = nameKey(name)
  if (!key) return null
  const rank = (f: FoodChoice) => (f.mine || f.inStock ? 0 : 1) * 1e6 - (f.recent ?? 0) * 10 + f.name.length / 1000
  const exact = foods.filter((f) => nameKey(f.name) === key).sort((a, b) => rank(a) - rank(b))
  if (exact.length) return exact[0].id
  const close = foods.filter((f) => (f.mine || f.inStock || (f.recent ?? 0) > 0) && nameKey(f.name).startsWith(`${key} `))
    .sort((a, b) => rank(a) - rank(b))
  return close[0]?.id ?? null
}

/** One thing the add box can suggest: a food, or a name bought before. */
export interface AddChoice { key: string; name: string; food_id: string | null; mine?: boolean; inStock?: boolean; recent?: number; onList?: boolean }

/** What the add box suggests as the person types (GEN-13, the one search):
 *  the household's own things first (bought before, in stock, their own
 *  foods), then any food, every typed word in any order, accents ignored.
 *  The amount typed is left out of the search ("2 kg appl" finds Apples).
 *  One entry per item; the name typed exactly is not suggested back. */
export function addSuggestions(typed: string, choices: AddChoice[], limit = 6): AddChoice[] {
  const parsed = parseItem(typed)
  const name = parsed?.name ?? ''
  if (fold(name).length < 2) return []
  const seen = new Set<string>()
  const own = (c: AddChoice) => !!(c.mine || c.inStock || (c.recent ?? 0) > 0)
  const ranked = search(choices.map((c) => ({ ...c, mine: own(c) })), name)
  const out: AddChoice[] = []
  for (const c of ranked) {
    const k = c.food_id ?? `name:${nameKey(c.name)}`
    if (seen.has(k) || seen.has(`name:${nameKey(c.name)}`)) continue
    seen.add(k); seen.add(`name:${nameKey(c.name)}`)
    if (nameKey(c.name) === nameKey(name) && !c.food_id) continue
    out.push(choices.find((x) => x.key === c.key) ?? c)
    if (out.length >= limit) break
  }
  return out
}

// ---- aisles -------------------------------------------------------------------------

/** The aisles a list starts with, in the order of a walk round a typical
 *  Dutch supermarket. The person renames, reorders and adds to them. */
export const DEFAULT_AISLES = [
  'Fruit and veg', 'Bakery', 'Meat', 'Fish', 'Dairy', 'Cheese', 'Breakfast', 'Spreads', 'Pasta and rice',
  'Tins and jars', 'Sauces', 'Baking and spices', 'Snacks', 'Drinks', 'Frozen', 'Household', 'Personal care', 'Other',
]
export const OTHER = 'Other'

/** Words (folded, singular) that say which aisle a thing is in, English and
 *  Dutch. Phrases are tried first, then the words from the last one back,
 *  because the last word names the thing ("chocolate milk" is milk). */
const AISLE_PHRASES: [string, string][] = [
  ['toilet paper', 'Household'], ['toilet roll', 'Household'], ['kitchen roll', 'Household'], ['kitchen paper', 'Household'],
  ['washing up liquid', 'Household'], ['washing powder', 'Household'], ['bin bag', 'Household'], ['cling film', 'Household'],
  ['aluminium foil', 'Household'], ['baking paper', 'Household'], ['dishwasher tablet', 'Household'],
  ['peanut butter', 'Spreads'], ['chocolate spread', 'Spreads'], ['ice cream', 'Frozen'], ['stock cube', 'Sauces'],
  ['olive oil', 'Sauces'], ['sour cream', 'Dairy'], ['cream cheese', 'Dairy'], ['cottage cheese', 'Dairy'],
  ['spring onion', 'Fruit and veg'], ['sweet potato', 'Fruit and veg'], ['baking powder', 'Baking and spices'],
  ['tooth paste', 'Personal care'], ['tooth brush', 'Personal care'], ['shower gel', 'Personal care'],
  ['soy sauce', 'Sauces'], ['coconut milk', 'Tins and jars'], ['tomato paste', 'Tins and jars'], ['tomato puree', 'Tins and jars'],
]
const AISLE_WORDS: Record<string, string> = {}
const add = (aisle: string, words: string) => { for (const w of words.split(' ')) AISLE_WORDS[w] = aisle }
add('Fruit and veg', 'apple banana pear orange lemon lime grape berry strawberry raspberry blueberry kiwi mango pineapple melon ' +
  'avocado tomato cucumber lettuce salad spinach onion garlic potato carrot pepper broccoli cauliflower courgette zucchini ' +
  'aubergine eggplant mushroom ginger herb basil parsley coriander mint leek celery cabbage kale beetroot radish rocket ' +
  'appel banaan peer sinaasappel citroen druif aardbei framboos tomaat komkommer sla spinazie ui knoflook aardappel ' +
  'wortel paprika champignon prei kool boerenkool bloemkool courgette fruit groente veg vegetable')
add('Bakery', 'bread roll bun croissant bagel wrap tortilla pita baguette brood broodje beschuit crackers cracker')
add('Meat', 'chicken beef pork mince steak bacon ham sausage turkey lamb burger kip gehakt rund varken worst spek kalkoen vlees meat')
add('Fish', 'salmon cod shrimp prawn fish haddock mackerel herring zalm kabeljauw vis garnaal makreel haring tuna tonijn')
add('Dairy', 'milk yogurt yoghurt cream butter egg quark kwark skyr melk room boter ei eieren margarine vla custard')
add('Cheese', 'cheese kaas mozzarella cheddar parmesan feta brie gouda')
add('Breakfast', 'cereal muesli granola oat oats havermout cornflake cornflakes porridge')
add('Spreads', 'jam honey hagelslag pindakaas honing marmalade spread')
add('Pasta and rice', 'pasta spaghetti penne macaroni fusilli lasagne rice noodle couscous quinoa bulgur rijst mie')
add('Tins and jars', 'bean beans chickpea lentil soup bonen kikkererwt kikkererwten linzen soep tinned canned passata')
add('Sauces', 'sauce ketchup mayonnaise mayo mustard oil vinegar pesto saus mosterd olie azijn dressing')
add('Baking and spices', 'flour sugar yeast salt spice cinnamon cumin oregano meel bloem suiker gist zout kruiden')
add('Snacks', 'crisp crisps chip chips chocolate biscuit cookie nut nuts popcorn sweet sweets candy koek koekje noten snoep')
add('Drinks', 'water juice coffee tea beer wine soda cola lemonade sap koffie thee bier wijn frisdrank drink')
add('Frozen', 'frozen diepvries ijs')
add('Household', 'detergent sponge battery batteries bulb foil wasmiddel afwasmiddel toiletpapier keukenrol vuilniszak bleach')
add('Personal care', 'shampoo soap toothpaste toothbrush deodorant deo razor tampon plaster conditioner tandpasta zeep lotion')

/** The aisle a thing is in, worked out from its name; null when the name
 *  says nothing about it. "Frozen peas" are in Frozen. */
export function guessAisle(name: string): string | null {
  const key = nameKey(name)
  if (!key) return null
  for (const [phrase, aisle] of AISLE_PHRASES) {
    if (` ${key} `.includes(` ${nameKey(phrase)} `)) return aisle
  }
  const words = key.split(' ')
  if (words.includes('frozen') || words.includes('diepvries')) return 'Frozen'
  for (let i = words.length - 1; i >= 0; i--) {
    const a = AISLE_WORDS[words[i]]
    if (a) return a
  }
  // A Dutch compound ends in the thing: "volkorenbrood" is bread.
  for (let i = words.length - 1; i >= 0; i--) {
    for (const [w, a] of Object.entries(AISLE_WORDS)) {
      if (w.length >= 4 && words[i].length > w.length && words[i].endsWith(w)) return a
    }
  }
  return null
}

/** A name as kept for an aisle, shop or list: spaces tidied, cut to fit. */
export const cleanLabel = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''

/** The person's own aisle settings (kept in the Shopping module's settings):
 *  the order, and what each renamed or removed aisle is called now. */
export interface AisleSettings {
  aisles: string[]
  /** An old aisle name to its new one; 'Other' for one taken off the list. */
  renamed: Record<string, string>
}

/** Stored aisle settings, checked: names tidied, no doubles (case aside),
 *  at most 40; renames only between real names, no loops. Nothing stored is
 *  the default order. */
export function readAisles(v: unknown): AisleSettings {
  const o = (v ?? {}) as Partial<AisleSettings>
  const seen = new Set<string>()
  const aisles: string[] = []
  for (const a of Array.isArray(o.aisles) ? o.aisles : DEFAULT_AISLES) {
    const n = cleanLabel(a, AISLE_MAX)
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    aisles.push(n)
    if (aisles.length >= 40) break
  }
  if (!seen.has(OTHER.toLowerCase())) aisles.push(OTHER)
  const renamed: Record<string, string> = {}
  if (o.renamed && typeof o.renamed === 'object') {
    for (const [from, to] of Object.entries(o.renamed)) {
      const f = cleanLabel(from, AISLE_MAX)
      const t = cleanLabel(to, AISLE_MAX)
      if (f && t && f.toLowerCase() !== t.toLowerCase()) renamed[f] = t
      if (Object.keys(renamed).length >= 80) break
    }
  }
  return { aisles, renamed }
}

/** What an aisle is called now, after the person's renames (followed a few
 *  steps, never round in a circle). */
export function resolveAisle(name: string | null | undefined, s: Pick<AisleSettings, 'renamed'>): string {
  let n = cleanLabel(name, AISLE_MAX) || OTHER
  const seen = new Set<string>()
  while (s.renamed[n] && !seen.has(n) && seen.size < 10) {
    seen.add(n)
    n = s.renamed[n]
  }
  return n
}

/** Renaming an aisle: in the order, and remembered, so items that carry the
 *  old name (or are guessed into it) show under the new one. */
export function renameAisle(s: AisleSettings, from: string, to: string): AisleSettings {
  const t = cleanLabel(to, AISLE_MAX)
  if (!t || t === from) return s
  const clash = s.aisles.some((a) => a !== from && a.toLowerCase() === t.toLowerCase())
  if (clash || from === OTHER) return s
  const renamed = { ...s.renamed, [from]: t }
  // A name that pointed at the old one now points at the new one.
  for (const [k, v] of Object.entries(renamed)) if (v === from) renamed[k] = t
  delete renamed[t]
  return { aisles: s.aisles.map((a) => (a === from ? t : a)), renamed }
}

/** Adding an aisle, before Other. A name already there is not added twice. */
export function addAisle(s: AisleSettings, name: string): AisleSettings {
  const n = cleanLabel(name, AISLE_MAX)
  if (!n || s.aisles.some((a) => a.toLowerCase() === n.toLowerCase()) || s.aisles.length >= 40) return s
  const at = s.aisles.indexOf(OTHER)
  const aisles = [...s.aisles]
  aisles.splice(at < 0 ? aisles.length : at, 0, n)
  const renamed = { ...s.renamed }
  delete renamed[n]
  return { aisles, renamed }
}

/** Taking an aisle off the list: its items go under Other. Other stays. */
export function removeAisle(s: AisleSettings, name: string): AisleSettings {
  if (name === OTHER) return s
  const renamed = { ...s.renamed, [name]: OTHER }
  for (const [k, v] of Object.entries(renamed)) if (v === name) renamed[k] = OTHER
  return { aisles: s.aisles.filter((a) => a !== name), renamed }
}

/** One aisle up or down the order. */
export function moveInList<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** The aisles in the order to walk them: the shop's own order when it has
 *  one, else the person's; aisles in neither come after, A to Z, and Other
 *  is always last. */
export function sortAisles(names: string[], order: string[]): string[] {
  const at = new Map(order.map((a, i) => [a.toLowerCase(), i]))
  const rank = (n: string) => (n === OTHER ? 2e6 : at.get(n.toLowerCase()) ?? 1e6)
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** A shop's aisle order, kept in line with the person's aisles: the shop's
 *  own order first, then any aisle it does not mention yet, where it falls. */
export function shopAisles(shop: { aisles: string[] } | null | undefined, s: Pick<AisleSettings, 'aisles' | 'renamed'>): string[] {
  const own = (shop?.aisles ?? []).map((a) => resolveAisle(a, s)).filter((a) => s.aisles.includes(a))
  const out = [...new Set(own)]
  for (const a of s.aisles) if (!out.includes(a)) out.push(a)
  return out
}

// ---- what the meal plan and the cupboard put on the list ---------------------------

export interface PlanNeed {
  food_id: string
  /** Raw grams the meals need: the weight a shop sells. */
  grams: number
  /** Set while every meal counted it in the same unit: "6 eggs". */
  count: Count | null
  /** What the recipe calls it ("Peanut butter"), when one did. */
  said: string | null
  /** How many planned meals use it. */
  meals: number
}

/** "Brown rice (cooked)" is how a recipe says it; on a shopping list it is
 *  rice bought dry, so the cooking note goes. */
export function listName(raw: string): string {
  const name = raw.replace(/\s*\((cooked|steamed|grilled|baked|boiled|roasted|drained|grilled or baked)[^)]*\)/i, '').trim()
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** What the planned meals of the window need, per food. Recipe meals (and
 *  ready meals, which are recipes of one line) by their ingredients times
 *  the portions; a meal of one food by its grams. Meals already eaten or
 *  skipped need nothing more, and a meal typed as plain numbers names no
 *  food to buy. */
export function planNeeds(
  slots: Pick<MealPlanSlot, 'slot_date' | 'status' | 'recipe_id' | 'portion_multiplier' | 'food_id' | 'grams' | 'unit' | 'unit_qty' | 'deleted_at'>[],
  linesByRecipe: Map<string, RecipeLine[]>,
  foods: Map<string, Food>,
  from: string,
  to: string,
): PlanNeed[] {
  const out = new Map<string, PlanNeed>()
  const put = (foodId: string, grams: number, count: Count | null, said: string | null) => {
    if (!(grams > 0)) return
    const had = out.get(foodId)
    if (!had) { out.set(foodId, { food_id: foodId, grams, count, said, meals: 1 }); return }
    had.grams += grams
    had.count = addCounts(had.count, count)
    had.said = had.said ?? said
    had.meals++
  }
  for (const slot of slots) {
    if (slot.deleted_at || slot.slot_date < from || slot.slot_date > to) continue
    if (slot.status === 'eaten' || slot.status === 'skipped') continue
    const times = Number(slot.portion_multiplier) > 0 ? Number(slot.portion_multiplier) : 1
    if (slot.recipe_id) {
      for (const line of linesByRecipe.get(slot.recipe_id) ?? []) {
        if (!line.food_id) continue
        const food = foods.get(line.food_id)
        const c = countOf({ ...line, grams: line.grams_per_portion }, readUnits(food?.units), times)
        put(line.food_id, rawGrams(line, food) * times, c, line.raw_text ? listName(line.raw_text) : null)
      }
    } else if (slot.food_id && Number(slot.grams) > 0) {
      const food = foods.get(slot.food_id)
      put(slot.food_id, Number(slot.grams), countOf({ unit: slot.unit, unit_qty: slot.unit_qty, grams: slot.grams }, readUnits(food?.units)), null)
    }
  }
  return [...out.values()].map((n) => ({ ...n, grams: Math.round(n.grams * 10) / 10 }))
}

/** What the cupboard says about one food: how much is there and the
 *  minimum the person wants kept. */
export interface StockLevel { grams: number; min: number | null; unit?: string | null }

/** One item the plan or a minimum puts on the list. */
export interface PlannedLine {
  food_id: string
  name: string
  /** What the plan needs plus the minimum to keep, before the cupboard. */
  need_g: number
  from_stock_g: number
  /** Already bought, or set aside as not needed, this time. */
  done_g: number
  /** What is left to buy. */
  buy_g: number
  pack_size_g: number | null
  packs: number | null
  /** Whole ones to buy, for a food counted in a unit. */
  count: number | null
  unit: Pick<FoodUnit, 'name' | 'plural'> | null
  unit_g: number | null
  meals: number
  min_g: number | null
  /** How it reads: "2 packs", "6 eggs", "450 g". */
  amount: string
  /** Why it is on the list: "for 3 meals", "keeps 250 g in", both. */
  why: string
}

/** What the plan needs, less what is in the cupboard and what was already
 *  dealt with, plus what a minimum asks for, in what a shop sells: whole
 *  packs where the pack size is known, whole ones of a counted food, else
 *  grams. A minimum means "keep this much once the meals are cooked", so it
 *  adds to what the plan needs. Lines with nothing left to buy are left out. */
export function plannedLines(
  needs: PlanNeed[],
  stock: Map<string, StockLevel>,
  foods: Map<string, Food>,
  done: Map<string, number> = new Map(),
): PlannedLine[] {
  const ids = new Set([...needs.map((n) => n.food_id), ...[...stock.entries()].filter(([, s]) => s.min && s.min > 0).map(([id]) => id)])
  const byFood = new Map(needs.map((n) => [n.food_id, n]))
  const out: PlannedLine[] = []
  for (const id of ids) {
    const n = byFood.get(id)
    const s = stock.get(id)
    const food = foods.get(id)
    const min = s?.min && s.min > 0 ? s.min : null
    const planned = n?.grams ?? 0
    const have = s?.grams ?? 0
    // A minimum on its own matters only once the cupboard is below it.
    if (!n && min !== null && have >= min) continue
    const need = planned + (min ?? 0)
    const doneG = done.get(id) ?? 0
    const buy = Math.round(Math.max(0, need - have - doneG) * 10) / 10
    if (buy <= 0.05) continue
    const pack = food?.pack_size_g && Number(food.pack_size_g) > 0 ? Number(food.pack_size_g) : null
    const units = readUnits(food?.units)
    // A count: from the plan when every meal said one, else the cupboard's
    // own unit for a food kept in one ("12 eggs").
    let unit: Pick<FoodUnit, 'name' | 'plural'> | null = null
    let unitG: number | null = null
    if (n?.count && n.count.qty > 0 && planned > 0) {
      unit = n.count.unit
      unitG = findUnit(units, n.count.unit.name)?.g ?? planned / n.count.qty
    } else if (s?.unit) {
      const u = findUnit(units, s.unit)
      if (u) { unit = u; unitG = u.g }
    }
    const packs = pack ? Math.ceil(buy / pack - 1e-9) : null
    const count = !pack && unit && unitG ? wholeToBuy(buy / unitG) : null
    // A drink is in millilitres and litres, which count the same as grams.
    const weight = (g: number) => (food?.per_ml ? gramsLabel(g).replace(/ kg$/, ' l').replace(/ g$/, ' ml') : gramsLabel(g))
    const amount = packs !== null
      ? `${packs} ${packs === 1 ? 'pack' : 'packs'} (${weight(packs * pack!)})`
      : count !== null && unit ? formatCount(count, unit) : weight(buy)
    const why = [
      n ? `for ${n.meals} ${n.meals === 1 ? 'meal' : 'meals'}` : '',
      min !== null ? `keeps ${unit && unitG ? formatCount(Math.round((min / unitG) * 10) / 10, unit) : weight(min)} in` : '',
    ].filter(Boolean).join(' · ')
    out.push({
      food_id: id,
      name: n?.said ?? food?.name ?? 'Unknown food',
      need_g: Math.round(need * 10) / 10, from_stock_g: Math.round(have * 10) / 10, done_g: doneG, buy_g: buy,
      pack_size_g: pack, packs, count, unit, unit_g: unitG, meals: n?.meals ?? 0, min_g: min, amount, why,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** What putting a bought line in the cupboard adds: whole packs where the
 *  pack size is known, whole ones of a counted food, else what was left to buy. */
export function boughtFor(line: Pick<PlannedLine, 'buy_g' | 'packs' | 'pack_size_g' | 'count' | 'unit_g'>): number {
  if (line.packs && line.pack_size_g) return Math.round(line.packs * line.pack_size_g * 10) / 10
  if (line.count !== null && line.unit_g) return Math.round(line.count * line.unit_g * 10) / 10
  return line.buy_g
}

/** How much a planned item counted as dealt with still covers: only while
 *  its day has not passed. */
export function doneGrams(entries: Pick<ShoppingEntry, 'plan_key' | 'done_until' | 'grams' | 'deleted_at'>[], today: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) {
    if (e.deleted_at || !e.plan_key || !e.done_until || e.done_until < today) continue
    out.set(e.plan_key, (out.get(e.plan_key) ?? 0) + (Number(e.grams) || 0))
  }
  return out
}

// ---- the list as it is shown ----------------------------------------------------------

/** One row of the list, from the plan or added by hand. */
export interface ListItem {
  /** 'plan:<food id>' or 'entry:<row id>'. */
  key: string
  kind: 'plan' | 'manual'
  /** The row behind it: the item itself, or a planned item's tick. */
  entry: ShoppingEntry | null
  food_id: string | null
  name: string
  amount: string
  /** Grams it comes to, when known: what a price per kilo is worked from. */
  grams: number | null
  /** How many of something sold by the piece or pack, for a price per piece. */
  pieces: number | null
  aisle: string
  /** The shop it was set to, if any. */
  shop: string | null
  /** Shops it is known to be sold at (from the product). */
  sold_at: string[]
  note: string | null
  checked: boolean
  list: string | null
  /** Why it is there: "for 3 meals", "added by Anna". */
  why: string
  sort: number
  line?: PlannedLine
}

/** Shop names compare without case, accents or spaces: "albert heijn" is "Albert Heijn". */
export const sameShop = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && fold(a).replace(/\s+/g, '') === fold(b).replace(/\s+/g, '')

/** Is the item for this shop? Everything is, under "Any shop" (null);
 *  otherwise an item set to another shop is not, and the rest are. */
export function forShop(item: Pick<ListItem, 'shop'>, shop: string | null): boolean {
  if (!shop || !item.shop) return true
  return sameShop(item.shop, shop)
}

/** Is the item on this list? The main list is null. */
export const onList = (item: Pick<ListItem, 'list'>, list: string | null) =>
  (item.list ?? null) === null ? list === null : list !== null && item.list!.toLowerCase() === list.toLowerCase()

export interface AisleGroup { aisle: string; items: ListItem[] }

/** The list as walked through the shop: what is still to get, by aisle in
 *  the shop's order (and the person's order within an aisle), then what is
 *  already in the basket. */
export function groupList(items: ListItem[], order: string[]): { aisles: AisleGroup[]; basket: ListItem[] } {
  const open = items.filter((i) => !i.checked)
  const names = sortAisles(open.map((i) => i.aisle), order)
  const aisles = names.map((aisle) => ({
    aisle,
    items: open.filter((i) => i.aisle === aisle).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
  }))
  const basket = items.filter((i) => i.checked).sort((a, b) => a.name.localeCompare(b.name))
  return { aisles, basket }
}

/** A manual item's place when it is moved up or down within its aisle: the
 *  sort numbers the rows of that aisle get, in their new order. Only the
 *  rows whose number changes are returned. */
export function reorderWithin(items: Pick<ListItem, 'key' | 'sort'>[], key: string, dir: -1 | 1): { key: string; sort: number }[] {
  const i = items.findIndex((x) => x.key === key)
  const moved = moveInList(items, i, dir)
  if (moved === items) return []
  return moved.map((x, n) => ({ key: x.key, sort: (n + 1) * 10 })).filter((x, n) => moved[n].sort !== x.sort)
}

/** Where a new manual item goes in the order: after everything there. */
export const nextSort = (entries: Pick<ShoppingEntry, 'sort_order'>[]) =>
  entries.reduce((m, e) => Math.max(m, Number(e.sort_order) || 0), 0) + 10

/** Adding an item already on the list (not yet in the basket) adds to it
 *  when both amounts are in the same unit, or both bare; otherwise it is a
 *  separate row. Returns the new amount, or null for "add a row". */
export function mergeAmounts(
  had: Pick<ParsedItem, 'qty' | 'unit' | 'grams'>, add: Pick<ParsedItem, 'qty' | 'unit' | 'grams'>,
): Pick<ParsedItem, 'qty' | 'unit' | 'grams'> | null {
  if (had.qty === null && add.qty === null) return { qty: null, unit: null, grams: null }
  if (had.qty === null) return add
  if (add.qty === null) return had
  const weight = (u: string | null) => (u === 'g' || u === 'kg' ? 'g' : u === 'ml' || u === 'l' ? 'ml' : null)
  if ((had.unit ?? null) === (add.unit ?? null)) {
    const qty = Math.round((Number(had.qty) + Number(add.qty)) * 1000) / 1000
    if (qty > QTY_MAX) return null
    const grams = had.grams !== null && add.grams !== null ? Math.round((Number(had.grams) + Number(add.grams)) * 100) / 100 : null
    return { qty, unit: had.unit, grams }
  }
  // 500 g and 1 kg: added in grams.
  if (weight(had.unit) && weight(had.unit) === weight(add.unit) && had.grams !== null && add.grams !== null) {
    const grams = Math.round((Number(had.grams) + Number(add.grams)) * 100) / 100
    if (grams > GRAMS_MAX) return null
    const big = grams >= 1000
    const unit = weight(had.unit) === 'g' ? (big ? 'kg' : 'g') : (big ? 'l' : 'ml')
    return { qty: big ? Math.round(grams) / 1000 : grams, unit, grams }
  }
  return null
}

// ---- recently bought -----------------------------------------------------------------

export interface RecentTile {
  key: string
  name: string
  food_id: string | null
  qty: number | null
  unit: string | null
  grams: number | null
  aisle: string | null
  shop: string | null
  /** Times bought in the last three months. */
  times: number
  last: string
}

const DAY_MS = 86_400_000

/** The "recently bought" tiles: things bought before and not on the list
 *  now, the most often bought first, then the most recent. One tap puts one
 *  back as it was last bought. `now` is an ISO time. */
export function recentTiles(
  rows: Pick<ShoppingEntry, 'food_id' | 'name' | 'qty' | 'unit' | 'grams' | 'aisle' | 'shop' | 'bought_at' | 'plan_key'>[],
  onListKeys: Set<string>,
  now: string,
  max = 12,
  names: Map<string, string> = new Map(),
): RecentTile[] {
  const since = Date.parse(now) - 90 * DAY_MS
  const by = new Map<string, RecentTile>()
  for (const r of rows) {
    if (!r.bought_at) continue
    const name = r.name ?? (r.food_id ? names.get(r.food_id) : undefined)
    if (!name) continue
    const key = itemKey({ food_id: r.food_id, name })
    if (onListKeys.has(key)) continue
    const at = Date.parse(r.bought_at)
    const had = by.get(key)
    const recent = at >= since ? 1 : 0
    if (!had) {
      by.set(key, {
        key, name, food_id: r.food_id, qty: r.plan_key ? null : r.qty, unit: r.plan_key ? null : r.unit ?? null,
        grams: r.plan_key ? null : r.grams, aisle: r.aisle, shop: r.shop, times: recent, last: r.bought_at,
      })
      continue
    }
    had.times += recent
    if (r.bought_at > had.last) {
      Object.assign(had, { name, qty: r.plan_key ? null : r.qty, unit: r.plan_key ? null : r.unit ?? null, grams: r.plan_key ? null : r.grams, aisle: r.aisle, shop: r.shop, last: r.bought_at })
    }
  }
  return [...by.values()]
    .sort((a, b) => b.times - a.times || b.last.localeCompare(a.last) || a.name.localeCompare(b.name))
    .slice(0, max)
}

// ---- prices ------------------------------------------------------------------------------

/** Currencies of the countries Visuma knows well; anything else is in euros
 *  unless the person's country says otherwise. */
const CURRENCY: Record<string, string> = {
  GB: 'GBP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN',
  US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IS: 'ISK', TR: 'TRY', UA: 'UAH', RS: 'RSD',
}
export const currencyFor = (country: string | null | undefined) => CURRENCY[(country ?? '').toUpperCase()] ?? 'EUR'

/** An amount of money as the person's phone writes it: "€ 2,49" in Dutch,
 *  "€2.49" in English. */
export function formatMoney(amount: number, currency = 'EUR', locale = 'en-GB'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** A typed price: "2,49", "€2.49", "2.49 euro". Null when it is not one. */
export function readPrice(text: string): number | null {
  const t = String(text ?? '').replace(/[€$£]|eur(o|os)?|chf|gbp/gi, '').replace(/\s+/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n <= 99999 ? Math.round(n * 100) / 100 : null
}

export interface PriceLike { price: number; amount_g: number | null }

/** The price for a kilo (or a litre), when the price says what it is for. */
export function perKilo(p: PriceLike): number | null {
  if (!p.amount_g || p.amount_g <= 0) return null
  return Math.round((Number(p.price) / Number(p.amount_g)) * 1000 * 100) / 100
}

/** "€4.98 a kg" (or "a l" for a drink), or the plain price for one. */
export function priceLabel(p: PriceLike, currency = 'EUR', perMl = false): string {
  const k = perKilo(p)
  const each = formatMoney(Number(p.price), currency)
  if (k === null) return `${each} each`
  if (Number(p.amount_g) === 1000) return `${each} a ${perMl ? 'litre' : 'kg'}`
  return `${each} for ${gramsLabel(Number(p.amount_g)).replace(' g', perMl ? ' ml' : ' g').replace(' kg', perMl ? ' l' : ' kg')} · ${formatMoney(k, currency)} a ${perMl ? 'litre' : 'kg'}`
}

/** What an item will cost at a price: by weight when both say a weight
 *  (whole packs when the price is for a pack the plan rounds to), else so
 *  many times the price. Null when it cannot be said. */
export function itemCost(item: Pick<ListItem, 'grams' | 'pieces'> & { line?: Pick<PlannedLine, 'packs' | 'pack_size_g'> }, p: PriceLike): number | null {
  const price = Number(p.price)
  if (!Number.isFinite(price)) return null
  const amount = p.amount_g ? Number(p.amount_g) : null
  if (amount && item.line?.packs && item.line.pack_size_g && Math.abs(item.line.pack_size_g - amount) < 0.5) {
    return Math.round(item.line.packs * price * 100) / 100
  }
  if (amount && item.grams && item.grams > 0) return Math.round((item.grams / amount) * price * 100) / 100
  if (!amount) return Math.round((item.pieces && item.pieces > 0 ? item.pieces : 1) * price * 100) / 100
  return null
}

/** The trip's total: what the priced items come to, and how many are priced. */
export function tripTotal(items: ListItem[], priceOf: (item: ListItem) => PriceLike | null): { total: number; priced: number; of: number } {
  let total = 0
  let priced = 0
  for (const i of items) {
    const p = priceOf(i)
    const c = p ? itemCost(i, p) : null
    if (c === null) continue
    total += c
    priced++
  }
  return { total: Math.round(total * 100) / 100, priced, of: items.length }
}

/** Of several shops' prices for one item: the one at this shop, or with no
 *  shop chosen the latest one noted anywhere. */
export function pickPrice<T extends PriceLike & { shop: string; noted_on: string; deleted_at?: string | null }>(prices: T[], shop: string | null): T | null {
  const live = prices.filter((p) => !p.deleted_at)
  if (shop) return live.find((p) => sameShop(p.shop, shop)) ?? null
  return [...live].sort((a, b) => b.noted_on.localeCompare(a.noted_on))[0] ?? null
}

// ---- the window of meals, and the trip on the plan ----------------------------------------

export interface TripSettings { on: boolean; days: number[]; time: string; minutes: number; locked: boolean }

/** The next shopping day from `today` on (today included), or with no days
 *  chosen, the next day. Days already done (a trip ticked off) are passed over. */
export function nextShoppingDay(today: string, days: number[], done: Set<string> = new Set()): string {
  if (!days.length) {
    let d = addDays(today, 1)
    while (done.has(d)) d = addDays(d, 1)
    return d
  }
  for (let i = 0; i < 400; i++) {
    const d = addDays(today, i)
    if (days.includes(weekdayOf(d)) && !done.has(d)) return d
  }
  return today
}

/** The meals the list covers, from today. With shopping days chosen: up to
 *  the day before the shopping day after the next, so each trip buys for
 *  the days until the one after it. Without: the next `windowDays` days. */
export function listWindow(today: string, days: number[], windowDays: number): { from: string; to: string } {
  if (days.length) {
    const first = nextShoppingDay(today, days)
    const second = nextShoppingDay(addDays(first, 1), days)
    return { from: today, to: addDays(second, -1) }
  }
  return { from: today, to: addDays(today, Math.max(1, windowDays) - 1) }
}

const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The shopping days in words: "Saturday", "Wednesday and Saturday", "the next day". */
export function describeDays(days: number[]): string {
  if (!days.length) return 'the next day'
  const names = WEEK_ORDER.filter((d) => days.includes(d)).map((d) => FULL_DAYS[d])
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The trip task's title. */
export const tripTitle = (n: number) => `Shopping (${n} ${n === 1 ? 'item' : 'items'})`

export interface TripTaskLike {
  id: string
  planned_date: string | null
  planned_time: string | null
  duration_min: number | null
  locked: boolean
  title: string
  status: string
  deleted_at: string | null
}

export interface TripPlan {
  /** Make the task for this day (its id is worked out from the day). */
  create: { day: string; title: string; time: string; minutes: number; locked: boolean } | null
  /** Change these tasks (title, and day and time when the settings moved it). */
  update: { id: string; changes: Partial<Pick<TripTaskLike, 'title' | 'planned_date' | 'planned_time' | 'duration_min' | 'locked' | 'deleted_at'>> }[]
  /** Take these off the plan. */
  remove: string[]
}

/** What to do about the trip on the plan (SHOP-20, SHOP-21). With the
 *  setting on, the module on and something left to buy, there is one open
 *  trip task: the one already there from today on (kept where the person
 *  put it, its count kept up to date), else a new one on the next shopping
 *  day at the chosen time and length. `replace` (after the settings
 *  changed) puts it on the day and time the settings now give. Trips left
 *  open on days gone by go, as does the open trip once the list is empty.
 *  Ticked trips are left as the record of a trip made. */
export function planTrip(opts: {
  today: string
  count: number
  on: boolean
  trip: TripSettings
  tasks: TripTaskLike[]
  replace?: boolean
}): TripPlan {
  const { today, count, trip } = opts
  const plan: TripPlan = { create: null, update: [], remove: [] }
  const live = opts.tasks.filter((t) => !t.deleted_at)
  const doneDays = new Set(live.filter((t) => t.status === 'done' && t.planned_date).map((t) => t.planned_date as string))
  const open = live.filter((t) => t.status !== 'done' && t.status !== 'dropped')
  const ahead = open.filter((t) => (t.planned_date ?? '') >= today).sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
  const behind = open.filter((t) => !t.planned_date || t.planned_date < today)
  plan.remove.push(...behind.map((t) => t.id))

  const want = opts.on && trip.on && count > 0
  if (!want) {
    plan.remove.push(...ahead.map((t) => t.id))
    return plan
  }
  const title = tripTitle(count)
  const day = nextShoppingDay(today, trip.days, doneDays)
  const [keep, ...extra] = ahead
  plan.remove.push(...extra.map((t) => t.id))
  if (!keep) {
    plan.create = { day, title, time: trip.time, minutes: trip.minutes, locked: trip.locked }
    return plan
  }
  const changes: TripPlan['update'][number]['changes'] = {}
  if (keep.title !== title) changes.title = title
  if (opts.replace) {
    if (keep.planned_date !== day) changes.planned_date = day
    if ((keep.planned_time ?? '').slice(0, 5) !== trip.time) changes.planned_time = trip.time
    if (keep.duration_min !== trip.minutes) changes.duration_min = trip.minutes
    if (keep.locked !== trip.locked) changes.locked = trip.locked
  }
  if (Object.keys(changes).length) plan.update.push({ id: keep.id, changes })
  return plan
}

/** Where the trip task opens: the list. Today and Plan route a task whose
 *  source is 'shopping' here when it is tapped (SHOP-22). */
export const TRIP_ROUTE = '/shop'
export const isTripTask = (t: { source?: string | null }) => t.source === 'shopping'

// ---- several lists ---------------------------------------------------------------------

/** The household's lists: the main one (null) first, then the others by
 *  name, from the items on them and the names the person keeps. */
export function listNames(entries: Pick<ShoppingEntry, 'list' | 'deleted_at'>[], kept: string[] = []): string[] {
  const seen = new Map<string, string>()
  for (const n of [...kept, ...entries.filter((e) => !e.deleted_at).map((e) => e.list ?? '')]) {
    const c = cleanLabel(n, LIST_MAX)
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** "3 Oct", "3 to 9 Oct", "30 Sep to 3 Oct": the days a window covers. */
export function windowText(from: string, to: string): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const d = (s: string) => ({ day: Number(s.slice(8, 10)), mon: M[Number(s.slice(5, 7)) - 1] })
  const a = d(from)
  const b = d(to)
  if (from === to) return `${a.day} ${a.mon}`
  return a.mon === b.mon ? `${a.day} to ${b.day} ${b.mon}` : `${a.day} ${a.mon} to ${b.day} ${b.mon}`
}

// ---- the Shopping module's own settings ----------------------------------------------------

/** What the Shopping module keeps in its settings (per profile, synced):
 *  the aisles and the names of the extra lists. The shops, the trip and
 *  the window are in the profile's settings (settings.ts, `shopping`). */
export interface ShoppingModuleSettings { aisles: AisleSettings; lists: string[] }

export function readShoppingModule(settings: Record<string, unknown> | null | undefined): ShoppingModuleSettings {
  const s = settings ?? {}
  const lists: string[] = []
  const seen = new Set<string>()
  for (const l of Array.isArray(s.lists) ? s.lists : []) {
    const n = cleanLabel(l, LIST_MAX)
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    lists.push(n)
    if (lists.length >= 12) break
  }
  return { aisles: readAisles(s.aisles), lists }
}
