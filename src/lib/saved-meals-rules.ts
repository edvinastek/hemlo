import { num, LIMITS } from './quick-food.ts'
import { cleanUnitName, QTY_MAX } from './units-rules.ts'
import { groupKey, type Item, type PlateItem } from './meal-rules.ts'
import { fold } from './search-rules.ts'

/** Saved meals (MEAL-08): a named group of foods, recipes and plain numbers,
 *  logged in one tap and "exploded" back into its items when one needs
 *  changing. Kept in the Nutrition module's own settings (synced per
 *  profile), under `saved_meals`. Pure: read strictly, so nothing another
 *  device or an old version wrote can break the add sheet. Checked in
 *  src/test/savedmeals.check.mjs. */

export const SAVED_KEY = 'saved_meals'
export const SAVED_MAX = 60
export const SAVED_ITEMS_MAX = 30
export const SAVED_NAME_MAX = 60

export type SavedItem =
  | { kind: 'food'; food_id: string; grams: number; unit?: string; unit_qty?: number }
  | { kind: 'recipe'; recipe_id: string; portions: number }
  | { kind: 'quick'; label: string | null; kcal: number; grams: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null }

export interface SavedMeal { id: string; name: string; items: SavedItem[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tidy = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '')
const inRange = (v: unknown, min: number, max: number): number | null => {
  const n = num(v as string | number | null)
  return n != null && n >= min && n <= max ? Math.round(n * 100) / 100 : null
}

function readItem(v: unknown): SavedItem | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (r.kind === 'food') {
    const grams = inRange(r.grams, 0.1, LIMITS.grams)
    if (typeof r.food_id !== 'string' || !UUID.test(r.food_id) || grams == null) return null
    const unit = cleanUnitName(r.unit)
    const qty = inRange(r.unit_qty, 0.001, QTY_MAX)
    return unit && qty != null ? { kind: 'food', food_id: r.food_id, grams, unit, unit_qty: qty } : { kind: 'food', food_id: r.food_id, grams }
  }
  if (r.kind === 'recipe') {
    const portions = inRange(r.portions, 0.01, 99)
    if (typeof r.recipe_id !== 'string' || !UUID.test(r.recipe_id) || portions == null) return null
    return { kind: 'recipe', recipe_id: r.recipe_id, portions }
  }
  if (r.kind === 'quick') {
    const kcal = inRange(r.kcal, 0, LIMITS.kcal)
    if (kcal == null) return null
    const m = (k: string) => inRange(r[k], 0, LIMITS.macro)
    return {
      kind: 'quick', label: tidy(r.label, LIMITS.label) || null, kcal, grams: inRange(r.grams, 0, LIMITS.grams),
      protein_g: m('protein_g'), carbs_g: m('carbs_g'), fat_g: m('fat_g'), fiber_g: m('fiber_g'),
    }
  }
  return null
}

/** The saved meals in a module's settings, read strictly: a broken one is
 *  left out, a repeated id keeps the first, and empty meals go. */
export function readSavedMeals(settings: unknown): SavedMeal[] {
  const list = settings && typeof settings === 'object' ? (settings as Record<string, unknown>)[SAVED_KEY] : null
  if (!Array.isArray(list)) return []
  const out: SavedMeal[] = []
  const seen = new Set<string>()
  for (const v of list) {
    if (out.length >= SAVED_MAX) break
    if (!v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    const id = typeof r.id === 'string' && UUID.test(r.id) ? r.id : null
    const name = tidy(r.name, SAVED_NAME_MAX)
    if (!id || !name || seen.has(id)) continue
    const items = (Array.isArray(r.items) ? r.items : []).map(readItem).filter((x): x is SavedItem => !!x).slice(0, SAVED_ITEMS_MAX)
    if (!items.length) continue
    seen.add(id)
    out.push({ id, name, items })
  }
  return out
}

/** A meal's items as a saved meal's: what each is and how much. */
export function savedFromItems(items: Item[]): SavedItem[] {
  const out: SavedItem[] = []
  for (const i of items) {
    if (i.deleted_at || i.status === 'skipped') continue
    let s: SavedItem | null = null
    if (i.recipe_id) s = { kind: 'recipe', recipe_id: i.recipe_id, portions: Number(i.portion_multiplier) || 1 }
    else if (i.food_id) {
      const grams = num(i.grams ?? null)
      if (grams != null && grams > 0) {
        s = i.unit && i.unit_qty != null
          ? { kind: 'food', food_id: i.food_id, grams, unit: i.unit, unit_qty: Number(i.unit_qty) }
          : { kind: 'food', food_id: i.food_id, grams }
      }
    } else if (num(i.kcal ?? null) != null) {
      s = {
        kind: 'quick', label: i.label ?? null, kcal: num(i.kcal ?? null)!, grams: num(i.grams ?? null),
        protein_g: num(i.protein_g ?? null), carbs_g: num(i.carbs_g ?? null), fat_g: num(i.fat_g ?? null), fiber_g: num(i.fiber_g ?? null),
      }
    }
    const read = s && readItem(s)
    if (read) out.push(read)
  }
  return out.slice(0, SAVED_ITEMS_MAX)
}

/** A saved item as the columns of a meal item. */
export function itemFields(s: SavedItem): Partial<Item> {
  if (s.kind === 'recipe') return { recipe_id: s.recipe_id, food_id: null, portion_multiplier: s.portions }
  if (s.kind === 'food') {
    return { food_id: s.food_id, recipe_id: null, portion_multiplier: 1, grams: s.grams,
      ...(s.unit && s.unit_qty != null ? { unit: s.unit, unit_qty: s.unit_qty } : {}) }
  }
  const { kind: _k, ...numbers } = s
  return { recipe_id: null, food_id: null, portion_multiplier: 1, ...numbers }
}

/** Add one, named as the person typed; the same name again replaces that one. */
export function addSaved(list: SavedMeal[], meal: SavedMeal): { list: SavedMeal[] } | { error: string } {
  const name = tidy(meal.name, SAVED_NAME_MAX)
  if (!name) return { error: 'Give the meal a name.' }
  const items = meal.items.map(readItem).filter((x): x is SavedItem => !!x)
  if (!items.length) return { error: 'There is nothing to save yet.' }
  const rest = list.filter((m) => m.name.toLowerCase() !== name.toLowerCase() && m.id !== meal.id)
  if (rest.length >= SAVED_MAX) return { error: `At most ${SAVED_MAX} saved meals.` }
  return { list: [...rest, { id: meal.id, name, items: items.slice(0, SAVED_ITEMS_MAX) }] }
}

export function renameSaved(list: SavedMeal[], id: string, name: string): { list: SavedMeal[] } | { error: string } {
  const n = tidy(name, SAVED_NAME_MAX)
  if (!n) return { error: 'Give the meal a name.' }
  if (list.some((m) => m.id !== id && m.name.toLowerCase() === n.toLowerCase())) return { error: 'Another saved meal has that name.' }
  return { list: list.map((m) => (m.id === id ? { ...m, name: n } : m)) }
}

export const removeSaved = (list: SavedMeal[], id: string) => list.filter((m) => m.id !== id)

/** Saved meals A to Z, as the Saved tab lists them. */
export const sortSaved = (list: SavedMeal[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))

/* ---------- "Save it as a meal?" (ONB-13) ------------------------------------- */

/** What a meal item is, as one key: the same recipe, the same food, or the
 *  same numbers typed under the same name, whatever the amount. */
export function itemKey(i: Pick<Item, 'recipe_id' | 'food_id' | 'label'>): string | null {
  if (i.recipe_id) return `recipe:${i.recipe_id}`
  if (i.food_id) return `food:${i.food_id}`
  const label = fold(i.label ?? '').trim()
  return label ? `quick:${label}` : null
}

/** The plate's things as the same keys. */
export function plateKeys(plate: PlateItem[]): string[] {
  return [...new Set(plate.map((p) => (p.kind === 'recipe' ? `recipe:${p.recipe_id}` : p.kind === 'food' ? `food:${p.food_id}`
    : itemKey({ recipe_id: null, food_id: null, label: p.entry.label ?? null }))).filter((k): k is string => !!k))].sort()
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** How many meals already logged (one meal on one day) were made of exactly
 *  these things. Two before means this is the third time by hand: the
 *  moment to offer "Save it as a meal" (ONB-13). Meals of one thing only
 *  are not counted: one thing is already one tap from Recent. */
export function timesLogged(keys: string[], history: Item[]): number {
  if (keys.length < 2) return 0
  const meals = new Map<string, Set<string>>()
  for (const i of history) {
    if (i.deleted_at || i.status === 'skipped') continue
    const k = itemKey(i)
    if (!k) continue
    const g = `${i.slot_date}|${groupKey(i)}`
    meals.set(g, (meals.get(g) ?? new Set()).add(k))
  }
  let n = 0
  for (const set of meals.values()) if (sameSet([...set].sort(), keys)) n++
  return n
}

/** Whether a saved meal already holds exactly these things. */
export function isSaved(keys: string[], saved: SavedMeal[]): boolean {
  return saved.some((m) => sameSet([...new Set(m.items.map((i) => itemKey(i.kind === 'recipe' ? { recipe_id: i.recipe_id, food_id: null, label: null }
    : i.kind === 'food' ? { recipe_id: null, food_id: i.food_id, label: null } : { recipe_id: null, food_id: null, label: i.label })).filter((k): k is string => !!k))].sort(), keys))
}
