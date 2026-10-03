import type { MealSettings, MealSlotKey, Nutrient } from './settings.ts'
import type { MealPlanSlot } from './types'
import { isQuick, num, quickAmount, quickMacros, LIMITS, type QuickEntry } from './quick-food.ts'
import {
  amountChoices, entryText, findUnit, formatQty, readAmount, readUnits, unitKey, type Amount, type FoodUnit,
} from './units-rules.ts'
import { fold } from './search-rules.ts'

/** Meals as the person eats them (MEAL-01 to MEAL-20). Pure: no database, no
 *  React, so every rule here is checked in src/test/mealrules.check.mjs.
 *
 *  A day's food is a list of items. Each item is one row of meal_plan_slot:
 *  a food and how much of it, a recipe (or a ready meal) and how many
 *  portions, or plain numbers ("a sandwich, 450 kcal"). An item can carry a
 *  meal label (`slot`: one of the person's own meals, a one-off name, or
 *  none) and a time. Items that share a label, or with no label the same
 *  time, make one meal; items with neither sit under "Any time". There are no
 *  fixed meals: only the ones the person defined appear as cards when empty. */

export type Item = Pick<MealPlanSlot, 'id' | 'slot' | 'slot_date' | 'status' | 'recipe_id' | 'portion_multiplier'>
  & Partial<Pick<MealPlanSlot, 'slot_time' | 'food_id' | 'sort_order' | 'label' | 'kcal' | 'protein_g' | 'carbs_g'
    | 'fat_g' | 'fiber_g' | 'grams' | 'unit' | 'unit_qty' | 'updated_at' | 'deleted_at' | 'profile_id'>>

/** What the meal rules need from the person's settings. */
export interface MealsCtx {
  meals: Pick<MealSettings, 'names' | 'cards' | 'main'>
  /** The old default times of the four old meals (before named meals). */
  meal_times?: Partial<Record<MealSlotKey, string>>
}

export type Macros = Record<Nutrient, number>
export const ZERO: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
export const addMacros = (a: Macros, b: Macros, n = 1): Macros => ({
  kcal: a.kcal + b.kcal * n, protein_g: a.protein_g + b.protein_g * n, carbs_g: a.carbs_g + b.carbs_g * n,
  fat_g: a.fat_g + b.fat_g * n, fiber_g: a.fiber_g + b.fiber_g * n,
})

/* ---------- meal names ------------------------------------------------------- */

/** The four meals every day had before meals became the person's own. Rows
 *  saved then keep these keys, and still read as these names. */
const LEGACY: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' }
export const MEAL_KEY = /^[a-z0-9_-]{1,24}$/
export const MEAL_NAME_MAX = 30

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

/** "pre-workout" → "Pre workout": a key whose meal was removed from settings
 *  still reads as words, so nothing logged under it is lost or garbled. */
export function humanise(key: string): string {
  const t = tidy(key.replace(/[-_]+/g, ' '))
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

/** The name a meal label shows as: the person's name for one of their meals,
 *  the old meals' names, a one-off name as typed, or null for no meal. */
export function mealName(slot: string | null | undefined, ctx: Pick<MealsCtx, 'meals'>): string | null {
  const s = tidy(slot ?? '')
  if (!s) return null
  const own = ctx.meals.names.find((m) => m.key === s)
  if (own) return own.name
  if (LEGACY[s]) return LEGACY[s]
  if (MEAL_KEY.test(s)) return humanise(s)
  return s
}

/** What a typed meal name is stored as: the key of one of the person's meals
 *  when it names one ("lunch" or "Lunch"), an old meal's key, else the name
 *  itself, tidied. Empty for no meal. */
export function resolveMeal(typed: string | null | undefined, ctx: Pick<MealsCtx, 'meals'>): string {
  const t = tidy(typed ?? '').slice(0, MEAL_NAME_MAX).trim()
  if (!t) return ''
  const f = fold(t)
  const own = ctx.meals.names.find((m) => m.key === t || fold(m.name) === f)
  if (own) return own.key
  const legacy = Object.entries(LEGACY).find(([k, name]) => k === t || fold(name) === f)
  if (legacy) return legacy[0]
  return t
}

/** A key for a new meal from its name: "Pre-workout" → "pre-workout", made
 *  unique among the keys already taken ("snack-2"). */
export function mealKeyFor(name: string, taken: string[]): string {
  const base = fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'meal'
  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`.slice(0, 24)
  return key
}

/* ---------- times -------------------------------------------------------------- */

const hm = (t: string | null | undefined) => (t && /^\d\d:\d\d/.test(t) ? t.slice(0, 5) : null)

/** A meal's default time: the person's own meal's, else the old setting's. */
export function defaultTime(slot: string, ctx: MealsCtx): string | null {
  const own = ctx.meals.names.find((m) => m.key === slot)
  if (own) return hm(own.time)
  return hm(ctx.meal_times?.[slot as MealSlotKey])
}

/** The time an item has on its day: its own, else its meal's default, else none. */
export function itemTime(item: Pick<Item, 'slot' | 'slot_time'>, ctx: MealsCtx): string | null {
  return hm(item.slot_time) ?? defaultTime(item.slot ?? '', ctx)
}

export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/* ---------- what an item is ------------------------------------------------------ */

export type ItemKind = 'food' | 'recipe' | 'quick' | 'empty'

/** A food (MEAL-16), a recipe or ready meal, plain numbers, or a row that
 *  only holds a meal's time or its "skipped" on a day. */
export function itemKind(item: Pick<Item, 'recipe_id' | 'food_id' | 'kcal'>): ItemKind {
  if (item.recipe_id) return 'recipe'
  if (item.food_id) return 'food'
  if (isQuick(item)) return 'quick'
  return 'empty'
}
export const isContent = (item: Pick<Item, 'recipe_id' | 'food_id' | 'kcal'>) => itemKind(item) !== 'empty'

/** The figures of a food the rules need. */
export interface FoodFacts {
  name: string
  kcal: number | string | null
  protein_g?: number | string | null
  carbs_g?: number | string | null
  fat_g?: number | string | null
  fiber_g?: number | string | null
  units?: unknown
  per_ml?: boolean | null
}
export interface RecipeFacts { name: string; role?: string | null }

/** Where the rules look foods and recipes up, and a recipe's figures per portion. */
export interface Lookup {
  foods: Map<string, FoodFacts>
  recipes: Map<string, RecipeFacts>
  perPortion: (recipeId: string) => Macros | null
}

/** What one item comes to. Null when it cannot be known: a food with no
 *  calories listed, or one not on this device yet. Unknown is never zero. */
export function itemMacros(item: Item, look: Lookup): Macros | null {
  switch (itemKind(item)) {
    case 'quick': return quickMacros(item)
    case 'food': {
      const f = look.foods.get(item.food_id!)
      const k = num(f?.kcal ?? null)
      if (!f || k == null) return null
      const by = (num(item.grams ?? null) ?? 0) / 100
      const n = (v: unknown) => (num(v as string | number | null) ?? 0) * by
      return { kcal: k * by, protein_g: n(f.protein_g), carbs_g: n(f.carbs_g), fat_g: n(f.fat_g), fiber_g: n(f.fiber_g) }
    }
    case 'recipe': {
      const per = look.perPortion(item.recipe_id!)
      return per ? addMacros(ZERO, per, Number(item.portion_multiplier) || 1) : null
    }
    default: return null
  }
}

/** Which of an item's figures are actually known: a quick entry's macros
 *  left empty, or a food's that the food does not list, are unknown and are
 *  not shown as 0 (P8). Calories count as known when the item has them. */
export function knownKeys(item: Item, look: Pick<Lookup, 'foods'>, keys: Nutrient[]): Nutrient[] {
  const kind = itemKind(item)
  if (kind === 'recipe') return keys
  const src: Record<string, unknown> = kind === 'food' ? (look.foods.get(item.food_id!) ?? {}) as Record<string, unknown> : item as Record<string, unknown>
  return keys.filter((k) => num((src[k] ?? null) as string | number | null) != null)
}

/** The sum of some items. Items whose figures are unknown add nothing, and
 *  are counted so the screen can say "2 items without calories". */
export function sumItems(items: Item[], look: Lookup): { total: Macros; unknown: number } {
  let total = { ...ZERO }
  let unknown = 0
  for (const i of items) {
    if (!isContent(i) || i.status === 'skipped') continue
    const m = itemMacros(i, look)
    if (m) total = addMacros(total, m)
    else unknown++
  }
  return { total, unknown }
}

/** The item's name: the food's or recipe's, or what the numbers were called. */
export function itemName(item: Item, look: Pick<Lookup, 'foods' | 'recipes'>): string {
  switch (itemKind(item)) {
    case 'food': return look.foods.get(item.food_id!)?.name ?? 'A food not on this phone yet'
    case 'recipe': return look.recipes.get(item.recipe_id!)?.name ?? 'A recipe not on this phone yet'
    case 'quick': return tidy(item.label ?? '') || 'Quick entry'
    default: return ''
  }
}

/** "1 portion", "1.5 portions". */
export const portionsText = (n: number) => `${formatQty(n)} ${n > 0 && n <= 1 ? 'portion' : 'portions'}`

/** How much: "2 eggs (100 g)", "150 g", "1.5 portions", or null. */
export function itemAmount(item: Item, look: Pick<Lookup, 'foods'>): string | null {
  switch (itemKind(item)) {
    case 'food': {
      const g = num(item.grams ?? null)
      if (g == null) return null
      return entryText({ grams: g, unit: item.unit, unit_qty: item.unit_qty }, readUnits(look.foods.get(item.food_id!)?.units))
    }
    case 'recipe': return portionsText(Number(item.portion_multiplier) || 1)
    case 'quick': return quickAmount(item)
    default: return null
  }
}

/* ---------- a day's meals ------------------------------------------------------------ */

export interface MealGroup {
  /** 'm:<label>' for a labelled meal, 't:HH:MM' for unlabelled food at a
   *  time, 'any' for food with neither. */
  key: string
  /** The label the items carry ('' for none). */
  meal: string
  /** As shown: "Lunch", "15:00" is shown by time instead, so null there. */
  name: string | null
  time: string | null
  /** What is in it, in order. */
  items: Item[]
  /** Rows that only hold the meal's time or its "skipped" on this day. */
  holders: Item[]
  /** One of the person's own meals (it has a card even when empty). */
  defined: boolean
  /** Marked skipped (MEAL-06): every row of it skipped. */
  skipped: boolean
  /** Every item in it eaten (and at least one item). */
  eaten: boolean
}

/** Which meal an item belongs to on its day. */
export function groupKey(item: Pick<Item, 'slot' | 'slot_time'>, _ctx?: MealsCtx): string {
  const label = tidy(item.slot ?? '')
  if (label) return `m:${label}`
  const t = hm(item.slot_time)
  return t ? `t:${t}` : 'any'
}

const bySort = (a: Item, b: Item) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.updated_at ?? '').localeCompare(b.updated_at ?? '') || a.id.localeCompare(b.id)

/** The day's items as meals, in the order of the day: meals with a time by
 *  time, then the person's own meals without one (in their order), then
 *  other named ones, then "Any time" (MEAL-09). With cards on, each of the
 *  person's meals is there even before anything is in it (MEAL-02). */
export function groupDay(rows: Item[], ctx: MealsCtx): MealGroup[] {
  const live = rows.filter((r) => !r.deleted_at)
  const map = new Map<string, Item[]>()
  for (const r of live) {
    const k = groupKey(r, ctx)
    map.set(k, [...(map.get(k) ?? []), r])
  }
  if (ctx.meals.cards) {
    for (const m of ctx.meals.names) if (!map.has(`m:${m.key}`)) map.set(`m:${m.key}`, [])
  }
  const order = ctx.meals.names.map((m) => m.key)
  const groups: MealGroup[] = [...map.entries()].map(([key, all]) => {
    const meal = key.startsWith('m:') ? key.slice(2) : ''
    const items = all.filter(isContent).sort(bySort)
    const holders = all.filter((r) => !isContent(r))
    const own = all.map((r) => hm(r.slot_time)).find(Boolean) ?? null
    const time = key.startsWith('t:') ? key.slice(2) : own ?? (meal ? defaultTime(meal, ctx) : null)
    const content = items.filter((i) => i.status !== 'skipped')
    return {
      key, meal, name: meal ? mealName(meal, ctx) : null, time, items, holders,
      defined: order.includes(meal),
      skipped: all.length > 0 && all.every((r) => r.status === 'skipped'),
      eaten: content.length > 0 && content.every((i) => i.status === 'eaten'),
    }
  })
  const rank = (g: MealGroup) => {
    if (g.key === 'any') return [3, 0, '']
    if (g.time) return [0, minutesOf(g.time), String(order.indexOf(g.meal))]
    if (g.defined) return [1, order.indexOf(g.meal), '']
    // The old four meals keep their old order; other names A to Z.
    const old = Object.keys(LEGACY).indexOf(g.meal)
    return [2, old >= 0 ? old : 10, g.name ?? '']
  }
  return groups.sort((a, b) => {
    const x = rank(a); const y = rank(b)
    for (let i = 0; i < 3; i++) {
      if (x[i] < y[i]) return -1
      if (x[i] > y[i]) return 1
    }
    return 0
  })
}

/** The heading a meal shows: its name, else its time, else "Any time". */
export const groupTitle = (g: Pick<MealGroup, 'name' | 'time' | 'key'>) => g.name ?? (g.key === 'any' ? 'Any time' : g.time ?? 'Any time')

/** The next order number in a meal, so new items go at its end. */
export function nextSort(items: Pick<Item, 'sort_order'>[]): number {
  return items.reduce((m, i) => Math.max(m, (i.sort_order ?? 0) + 1), 0)
}

/* ---------- the meal's task on Today (MEAL-17, GEN-31) ------------------------------- */

/** The task a meal becomes: "Lunch: Oats (1.5×), banana · 640 kcal". At most
 *  three things named; the rest counted. */
export function taskTitle(g: Pick<MealGroup, 'name' | 'time' | 'key' | 'items'>, look: Lookup): string {
  const items = g.items.filter((i) => i.status !== 'skipped')
  const names = items.map((i) => {
    const n = itemName(i, look)
    const p = Number(i.portion_multiplier) || 1
    return itemKind(i) === 'recipe' && p !== 1 ? `${n} (${formatQty(p)}×)` : n
  })
  const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names
  const { total, unknown } = sumItems(items, look)
  const kcal = unknown === items.length ? '' : ` · ${Math.round(total.kcal)} kcal`
  const head = g.name ?? 'Food'
  return `${head}: ${shown.join(', ')}${kcal}`.slice(0, 200)
}

/** A meal's task is found again by an id worked out from the profile, the
 *  day and the meal: the same on every device, with nothing stored to keep
 *  it. Four rounds of FNV-1a over the text, shaped as a UUID (version 8). */
export function groupRef(profileId: string, day: string, key: string): string {
  const text = `getit-meal:${profileId}:${day}:${key}`
  const parts: string[] = []
  for (let seed = 0; seed < 4; seed++) {
    let h = (0x811c9dc5 ^ (seed * 0x9e3779b1)) >>> 0
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    parts.push(h.toString(16).padStart(8, '0'))
  }
  const hex = parts.join('').split('')
  hex[12] = '8'
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** What a meal's task should be: its status follows the meal (all eaten:
 *  done), but a task someone ticked stays as it is until the meal says
 *  otherwise. Null: the meal has no task (nothing in it, or skipped). */
export function taskStatus(g: Pick<MealGroup, 'items' | 'eaten' | 'skipped'>, current: string | null): 'done' | 'todo' | string | null {
  if (g.skipped || !g.items.some((i) => i.status !== 'skipped')) return null
  if (g.eaten) return 'done'
  if (current === 'done') return 'todo'
  return current ?? 'todo'
}

/* ---------- copying (MEAL-07) --------------------------------------------------------------- */

const CONTENT_FIELDS = ['slot', 'slot_time', 'recipe_id', 'food_id', 'portion_multiplier', 'sort_order', 'label', 'kcal',
  'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'grams', 'unit', 'unit_qty'] as const

/** The items of the chosen meals ('all', or a list of meal keys), as new
 *  planned items on another day, after anything already in that meal there. */
export function copyItems(groups: MealGroup[], which: 'all' | string[], toDay: string, existing: Item[], ctx: MealsCtx, newId: () => string): Item[] {
  const out: Item[] = []
  for (const g of groups) {
    if (which !== 'all' && !which.includes(g.key)) continue
    const there = existing.filter((e) => !e.deleted_at && groupKey(e, ctx) === g.key)
    let sort = nextSort([...there, ...out.filter((o) => groupKey(o, ctx) === g.key)])
    for (const i of g.items) {
      const row: Record<string, unknown> = { id: newId(), slot_date: toDay, status: 'planned', deleted_at: null }
      for (const f of CONTENT_FIELDS) if (i[f] !== undefined) row[f] = i[f]
      row.sort_order = sort++
      out.push(row as unknown as Item)
    }
  }
  return out
}

/* ---------- the add sheet's first step (MEAL-11) ------------------------------------------- */

export type When = 'now' | 'meal' | 'at' | 'any'

/** The meal the sheet starts on: one of the person's meals whose time is
 *  within 90 minutes of now (the nearest), else the meal most often logged
 *  around this hour, else none. */
export function defaultMeal(nowHM: string, ctx: MealsCtx, history: Item[] = [], today?: string): string {
  const now = minutesOf(nowHM)
  let best: { key: string; d: number } | null = null
  for (const m of ctx.meals.names) {
    const t = hm(m.time)
    if (!t) continue
    const d = Math.abs(minutesOf(t) - now)
    if (d <= 90 && (!best || d < best.d)) best = { key: m.key, d }
  }
  if (best) return best.key
  const counts = new Map<string, number>()
  for (const r of recentRows(history, today, 60)) {
    const label = tidy(r.slot ?? '')
    const t = itemTime(r, ctx)
    if (!label || !t || Math.abs(minutesOf(t) - now) > 60) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return top && top[1] >= 2 ? top[0] : ''
}

/** When the sheet starts: today, "at the meal's time" when the meal has one
 *  near now, else now; another day, the meal's time when it has one, else
 *  any time. */
export function defaultWhen(day: string, today: string, nowHM: string, mealTime: string | null): When {
  if (day !== today) return mealTime ? 'meal' : 'any'
  if (mealTime && Math.abs(minutesOf(mealTime) - minutesOf(nowHM)) <= 90) return 'meal'
  return 'now'
}

/** The time an entry gets: now, a time typed, or none (the meal's own
 *  default, if it has one, then applies by itself). */
export function whenTime(when: When, nowHM: string, at: string | null): string | null {
  if (when === 'now') return nowHM
  if (when === 'at') return hm(at)
  return null
}

/** Whether what is added counts as eaten already: a past day yes, a future
 *  day no; today, unless it is for later than a quarter of an hour from now. */
export function eatenByDefault(day: string, today: string, nowHM: string, time: string | null): boolean {
  if (day < today) return true
  if (day > today) return false
  return !time || minutesOf(time) <= minutesOf(nowHM) + 15
}

/* ---------- what was eaten before (MEAL-20) ---------------------------------------------------- */

/** One thing as the person thinks of it, whatever day it was on. */
export function identity(item: Item): string | null {
  switch (itemKind(item)) {
    case 'food': return `f:${item.food_id}`
    case 'recipe': return `r:${item.recipe_id}`
    case 'quick': return `q:${fold(item.label ?? '')}|${Math.round(num(item.kcal ?? null) ?? 0)}`
    default: return null
  }
}

const whenOf = (r: Item) => `${r.slot_date} ${hm(r.slot_time) ?? '99:99'} ${r.updated_at ?? ''}`

/** Rows that count as having been eaten or planned, newest first, from the
 *  last `days` days up to today (when today is given). */
function recentRows(history: Item[], today: string | undefined, days: number): Item[] {
  const from = today ? shiftDay(today, -days) : ''
  return history
    .filter((r) => !r.deleted_at && isContent(r) && r.status !== 'skipped' && (!today || (r.slot_date >= from && r.slot_date <= today)))
    .sort((a, b) => whenOf(b).localeCompare(whenOf(a)))
}

/** The things eaten lately, each once, newest first: the Recent tab. */
export function recentItems(history: Item[], today?: string, limit = 30): Item[] {
  const seen = new Set<string>()
  const out: Item[] = []
  for (const r of recentRows(history, today, 365)) {
    const id = identity(r)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}

/** "Usually at this time": what has been eaten within an hour of now on at
 *  least two days of the last two months, most days first. */
export function goTos(history: Item[], ctx: MealsCtx, nowHM: string, today: string, limit = 5): Item[] {
  const now = minutesOf(nowHM)
  const days = new Map<string, Set<string>>()
  const latest = new Map<string, Item>()
  for (const r of recentRows(history, today, 60)) {
    const t = itemTime(r, ctx)
    if (!t || Math.abs(minutesOf(t) - now) > 60) continue
    const id = identity(r)!
    if (!days.has(id)) days.set(id, new Set())
    days.get(id)!.add(r.slot_date)
    if (!latest.has(id)) latest.set(id, r)
  }
  return [...days.entries()]
    .filter(([, d]) => d.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || whenOf(latest.get(b[0])!).localeCompare(whenOf(latest.get(a[0])!)))
    .slice(0, limit)
    .map(([id]) => latest.get(id)!)
}

/** How much of this food was had last time: what the plate starts with. */
export function lastAmount(history: Item[], foodId: string): Pick<Item, 'grams' | 'unit' | 'unit_qty'> | null {
  const hit = recentRows(history, undefined, 0).find((r) => r.food_id === foodId && num(r.grams ?? null) != null)
  return hit ? { grams: num(hit.grams ?? null), unit: hit.unit ?? null, unit_qty: hit.unit_qty ?? null } : null
}

/** How many portions of this recipe were had last time. */
export function lastPortions(history: Item[], recipeId: string): number | null {
  const hit = recentRows(history, undefined, 0).find((r) => r.recipe_id === recipeId)
  return hit ? Number(hit.portion_multiplier) || 1 : null
}

/** A day moved by n days: "2026-10-03" − 1 = "2026-10-02". */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/* ---------- the plate (MEAL-12) -------------------------------------------------------------- */

/** One thing on the plate, with its amount as typed (UNIT-02). */
export type PlateItem =
  | { key: string; kind: 'food'; food_id: string; text: string; choice: string }
  | { key: string; kind: 'recipe'; recipe_id: string; text: string }
  | { key: string; kind: 'quick'; entry: QuickEntry }

/** What a food goes on the plate as: the amount last eaten (in the unit it
 *  was counted in, while the food still has it); else one "medium" or one of
 *  its first unit (UNIT-12); else one serving or pack when scanned; else
 *  100 g. */
export function startAmount(units: FoodUnit[], last: Pick<Item, 'grams' | 'unit' | 'unit_qty'> | null, fallback?: { grams: number; pack?: boolean } | null): { text: string; choice: string } {
  if (last && last.unit && last.unit_qty != null && findUnit(units, last.unit)) {
    return { text: formatQty(Number(last.unit_qty)), choice: unitKey(findUnit(units, last.unit)!.name) }
  }
  if (last && num(last.grams ?? null) != null) return { text: formatQty(num(last.grams ?? null)!), choice: 'g' }
  const medium = units.find((u) => u.name.toLowerCase() === 'medium') ?? units[0]
  if (medium) return { text: '1', choice: unitKey(medium.name) }
  // A scanned pack: one pack, when the food knows its pack size.
  if (fallback && fallback.grams > 0) return fallback.pack ? { text: '1', choice: 'packs' } : { text: formatQty(fallback.grams), choice: 'g' }
  return { text: '100', choice: 'g' }
}

/** A plate item read into the columns of a meal item, or what stops it. */
export function plateFields(p: PlateItem, units: FoodUnit[] = [], pack: number | null = null): { fields: Partial<Item> } | { error: string } {
  if (p.kind === 'quick') {
    const { unit, unit_qty, ...rest } = p.entry
    return { fields: { ...rest, recipe_id: null, food_id: null, portion_multiplier: 1, ...(unit && unit_qty != null ? { unit, unit_qty } : {}) } }
  }
  if (p.kind === 'recipe') {
    const n = num(p.text.replace(/[×x]\s*$/, ''))
    if (n == null || n <= 0) return { error: 'Say how many portions.' }
    if (n > 99) return { error: 'At most 99 portions at once.' }
    return { fields: { recipe_id: p.recipe_id, food_id: null, portion_multiplier: Math.round(n * 100) / 100 } }
  }
  const choices = amountChoices(units, { pack })
  const choice = choices.find((c) => c.key === p.choice) ?? choices.find((c) => c.key === 'g')!
  const a: Amount | null = readAmount(p.text, choice)
  if (!a || a.grams <= 0) return { error: 'Say how much.' }
  if (a.grams > LIMITS.grams) return { error: `At most ${LIMITS.grams} g at once.` }
  return {
    fields: {
      food_id: p.food_id, recipe_id: null, portion_multiplier: 1, grams: Math.round(a.grams * 10) / 10,
      ...(a.unit && a.unit_qty != null ? { unit: a.unit, unit_qty: a.unit_qty } : { unit: null, unit_qty: null }),
    },
  }
}

/* ---------- sizing the main meal (MEAL-04) ---------------------------------------------------- */

/** The main meal's portions that reach the calorie target: the person marks
 *  which meal is main; when it holds exactly one recipe, that recipe is
 *  sized to fill what everything else leaves, within 0.5 to 3 portions.
 *  Null when there is nothing to suggest. */
export function sizeMain(groups: MealGroup[], mainKey: string | null, targetKcal: number, look: Lookup): { item: Item; portions: number } | null {
  if (!mainKey || !(targetKcal > 0)) return null
  const main = groups.find((g) => g.meal === mainKey)
  if (!main || main.skipped) return null
  const recipes = main.items.filter((i) => itemKind(i) === 'recipe' && i.status !== 'skipped')
  if (recipes.length !== 1) return null
  const item = recipes[0]
  const per = look.perPortion(item.recipe_id!)
  if (!per || per.kcal <= 0) return null
  const rest = groups.flatMap((g) => g.items).filter((i) => i.id !== item.id)
  const fixed = sumItems(rest, look).total.kcal
  const portions = Math.round(Math.min(3, Math.max(0.5, (targetKcal - fixed) / per.kcal)) * 10) / 10
  return Math.abs(portions - (Number(item.portion_multiplier) || 1)) >= 0.1 ? { item, portions } : null
}

/** "450 kcal" or "kcal unknown": a sum that left something out says so. */
export function kcalText(total: Macros, unknown: number): string {
  if (unknown > 0 && total.kcal === 0) return 'kcal unknown'
  return `${Math.round(total.kcal)} kcal${unknown > 0 ? ` + ${unknown} unknown` : ''}`
}
