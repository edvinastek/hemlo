import { liveQuery, type Subscription } from 'dexie'
import { db } from './db'
import { queueChange } from './sync'
import { edit } from './write'
import { readSettings, type Shop } from './settings'
import { addStock, stockFor } from './stock'
import { mealNeeds } from './stock-rules'
import { enabledModules } from './day'
import { blankTask, saveTask } from './tasks'
import { uuidV5 } from './sync-rules'
import { findUnit, readUnits } from './units-rules'
import {
  amountText, boughtFor, doneGrams, entryGrams, guessAisle, itemKey, listName, listNames, listWindow, matchFood,
  mergeAmounts, nextSort, planNeeds, plannedLines, planTrip, readShoppingModule, recentTiles, resolveAisle,
  sameShop, isTripTask, type FoodChoice, type ListItem, type ParsedItem, type RecentTile, type ShoppingModuleSettings,
} from './shopping-rules'
import type { ShopPrice } from './shopping-types'
import type { Food, ModuleInstance, Profile, RecipeLine, ShoppingEntry, Stock, Task } from './types'
import { planToday } from './day-edge'

/** The household's shopping list, read from and written to the local copy
 *  first, so it works in a shop with no signal, then queued for the server
 *  and shared with everyone in the household. The rules (what goes on the
 *  list, in what order, for which shop) are in shopping-rules.ts; this file
 *  reads rows, puts them together and writes changes.
 *
 *  What the meal plan needs is worked out live and never stored; a planned
 *  item gets a row only once something is said about it (ticked, moved,
 *  given an aisle, or dealt with), keyed by its food (plan_key). Items typed
 *  by hand are rows of their own. A bought item is soft-deleted with the
 *  time it was bought, which is what the "recently bought" tiles are made of. */

export const today = () => planToday()

// ---- writing rows ------------------------------------------------------------------

const BASE_FIELDS: (keyof ShoppingEntry & string)[] = [
  'household_id', 'plan_key', 'food_id', 'name', 'qty', 'unit', 'grams', 'note', 'aisle', 'shop',
  'checked', 'checked_at', 'sort_order', 'added_by', 'deleted_at',
]
/** The columns 028 added go only when they hold something, so a row that
 *  does not use them is taken by a server that has not been given them yet. */
const LATER_FIELDS: (keyof ShoppingEntry & string)[] = ['list', 'bought_at', 'done_until']

function fieldsOf(row: ShoppingEntry): (keyof ShoppingEntry & string)[] {
  return [...BASE_FIELDS, ...LATER_FIELDS.filter((f) => row[f] !== null && row[f] !== undefined)]
}

function blankEntry(householdId: string, profileId: string | null, part: Partial<ShoppingEntry>): ShoppingEntry {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), household_id: householdId, plan_key: null, food_id: null, name: null, qty: null, unit: null,
    grams: null, note: null, aisle: null, shop: null, checked: false, checked_at: null, sort_order: 0, added_by: profileId,
    list: null, bought_at: null, done_until: null, created_at: now, updated_at: now, deleted_at: null, ...part,
  }
}

async function putNew(row: ShoppingEntry): Promise<ShoppingEntry> {
  await db.shopping_entry.put(row)
  await queueChange('shopping_entry', row, fieldsOf(row))
  return row
}

/** Change a row; the fields changed are what is sent. */
export function updateEntry(row: ShoppingEntry, changes: Partial<ShoppingEntry>): Promise<ShoppingEntry> {
  return edit('shopping_entry', row, changes)
}

/** A row put back exactly as it was before an action (for Undo). The row as
 *  it is now is read first, so only what the action changed is written. */
async function restoreEntry(before: ShoppingEntry | null, id: string): Promise<void> {
  const now = await db.shopping_entry.get(id)
  if (!before) {
    // It was made by the action: taking it away again.
    if (now && !now.deleted_at) await updateEntry(now, { deleted_at: new Date().toISOString() })
    return
  }
  if (!now) { await putNew(before); return }
  const changes: Partial<ShoppingEntry> = {}
  for (const k of [...BASE_FIELDS, ...LATER_FIELDS]) {
    if ((before as unknown as Record<string, unknown>)[k] !== (now as unknown as Record<string, unknown>)[k]) {
      (changes as Record<string, unknown>)[k] = (before as unknown as Record<string, unknown>)[k] ?? null
    }
  }
  if (Object.keys(changes).length) await updateEntry(now, changes)
}

/** What an action did, so Undo can put every row back. */
export type Undo = () => Promise<void>
function undoFor(befores: { id: string; row: ShoppingEntry | null }[], stockBefore: Stock[] = [], stockMade: string[] = []): Undo {
  return async () => {
    for (const b of befores) await restoreEntry(b.row, b.id)
    for (const s of stockBefore) {
      const now = await db.stock.get(s.id)
      if (now) await edit('stock', now, { grams_on_hand: s.grams_on_hand, unit: s.unit ?? null, unit_qty: s.unit_qty ?? null, deleted_at: s.deleted_at })
    }
    for (const id of stockMade) {
      const now = await db.stock.get(id)
      if (now && !now.deleted_at) await edit('stock', now, { deleted_at: new Date().toISOString() })
    }
  }
}

// ---- the Shopping module's settings --------------------------------------------------

async function shoppingInstance(profileId: string): Promise<ModuleInstance | undefined> {
  return db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'shopping').first()
}

export async function moduleSettings(profileId: string): Promise<ShoppingModuleSettings> {
  return readShoppingModule((await shoppingInstance(profileId))?.settings)
}

/** Keep the aisles or the list names; the module's other settings stay. */
export async function saveModuleSettings(profileId: string, change: Partial<ShoppingModuleSettings>): Promise<void> {
  const inst = await shoppingInstance(profileId)
  if (!inst) return
  await edit<ModuleInstance>('module_instance', inst, { settings: { ...(inst.settings ?? {}), ...change } })
}

// ---- reading the list -------------------------------------------------------------------

export interface ShoppingView {
  window: { from: string; to: string }
  /** Every item on every list, for every shop. */
  items: ListItem[]
  /** Items from the plan that the cupboard covers in full. */
  covered: number
  lists: string[]
  module: ShoppingModuleSettings
  shops: Shop[]
  prices: ShopPrice[]
  recents: RecentTile[]
  /** Foods the list mentions, to show their details. */
  foods: Map<string, Food>
  /** Every row of the list, removed ones too (for Undo and the tiles). */
  entries: ShoppingEntry[]
}

/** Everything the Shop page and the trip need, from the local copy. */
export async function loadShopping(profile: Profile, day = today()): Promise<ShoppingView> {
  const settings = readSettings(profile).shopping
  const window = listWindow(day, settings.trip.days, settings.window_days)
  const [inst, slots, entries, stockRows, prices] = await Promise.all([
    shoppingInstance(profile.id),
    db.meal_plan_slot.where('profile_id').equals(profile.id).toArray(),
    db.shopping_entry.where('household_id').equals(profile.household_id).toArray(),
    stockFor(profile.household_id),
    db.shop_price.where('household_id').equals(profile.household_id).toArray(),
  ])
  const module = readShoppingModule(inst?.settings)
  const inWindow = slots.filter((s) => !s.deleted_at && s.slot_date >= window.from && s.slot_date <= window.to)
  const recipeIds = [...new Set(inWindow.map((s) => s.recipe_id).filter((id): id is string => !!id))]
  const lines = recipeIds.length ? await db.recipe_line.where('recipe_id').anyOf(recipeIds).toArray() : []
  const linesByRecipe = new Map<string, RecipeLine[]>()
  for (const l of lines) linesByRecipe.set(l.recipe_id, [...(linesByRecipe.get(l.recipe_id) ?? []), l])

  const live = entries.filter((e) => !e.deleted_at)
  const foodIds = new Set<string>([
    ...lines.map((l) => l.food_id), ...inWindow.map((s) => s.food_id), ...stockRows.map((s) => s.food_id),
    ...entries.map((e) => e.food_id),
  ].filter((id): id is string => !!id))
  const foods = new Map((await db.food.bulkGet([...foodIds])).filter((f): f is Food => !!f).map((f) => [f.id, f]))

  const needs = planNeeds(inWindow, linesByRecipe, foods, window.from, window.to)
  const levels = new Map(stockRows.map((s) => [s.food_id, { grams: Number(s.grams_on_hand) || 0, min: s.min_grams ? Number(s.min_grams) : null, unit: s.unit ?? null }]))
  const planned = plannedLines(needs, levels, foods, doneGrams(live, day))
  const withoutStock = plannedLines(needs, new Map(), foods, doneGrams(live, day)).length
  const ticks = new Map(live.filter((e) => e.plan_key).map((e) => [e.plan_key as string, e]))

  const aisleFor = (e: ShoppingEntry | null | undefined, food: Food | undefined, name: string) =>
    resolveAisle(e?.aisle || food?.store_section || guessAisle(name) || null, module.aisles)
  const soldAt = (food: Food | undefined) => (Array.isArray(food?.stores) ? food!.stores.filter((s) => typeof s === 'string') : [])

  const items: ListItem[] = []
  for (const line of planned) {
    const e = ticks.get(line.food_id) ?? null
    const food = foods.get(line.food_id)
    items.push({
      key: `plan:${line.food_id}`, kind: 'plan', entry: e, food_id: line.food_id, name: line.name, amount: line.amount,
      grams: line.packs && line.pack_size_g ? line.packs * line.pack_size_g : line.count !== null && line.unit_g ? line.count * line.unit_g : line.buy_g,
      pieces: line.packs ?? line.count, aisle: aisleFor(e, food, line.name), shop: e?.shop ?? null, sold_at: soldAt(food),
      note: e?.note ?? null, checked: !!e?.checked, list: null, why: line.why, sort: e?.sort_order ?? 0, line,
    })
  }
  for (const e of live) {
    if (e.plan_key) continue
    const food = e.food_id ? foods.get(e.food_id) : undefined
    const name = e.name ?? food?.name ?? 'Unknown item'
    items.push({
      key: `entry:${e.id}`, kind: 'manual', entry: e, food_id: e.food_id, name,
      amount: amountText(e, readUnits(food?.units)), grams: entryGrams(e, food),
      pieces: e.qty && (!e.unit || !['g', 'kg', 'ml', 'l'].includes(e.unit)) ? Number(e.qty) : null,
      aisle: aisleFor(e, food, name), shop: e.shop, sold_at: soldAt(food), note: e.note, checked: e.checked,
      list: e.list ?? null, why: '', sort: e.sort_order,
    })
  }

  const names = new Map([...foods.values()].map((f) => [f.id, f.name]))
  const onListKeys = new Set(items.filter((i) => !i.checked).map((i) => itemKey({ food_id: i.food_id, name: i.name })))
  return {
    window, items, covered: Math.max(0, withoutStock - planned.filter((l) => l.meals > 0).length),
    lists: listNames(live, module.lists), module, shops: readSettings(profile).shopping.shops,
    prices: prices.filter((p) => !p.deleted_at), recents: recentTiles(entries, onListKeys, new Date().toISOString(), 12, names),
    foods, entries,
  }
}

// ---- adding --------------------------------------------------------------------------------

/** The foods a typed item could be: everything on this device, the person's
 *  own, those in the cupboard and those bought lately marked so they win. */
export async function foodChoices(householdId: string, userId: string | null): Promise<FoodChoice[]> {
  const [foods, stock, entries] = await Promise.all([
    db.food.toArray(), stockFor(householdId), db.shopping_entry.where('household_id').equals(householdId).toArray(),
  ])
  const inStock = new Set(stock.map((s) => s.food_id))
  const recent = new Map<string, number>()
  for (const e of entries) if (e.food_id && e.bought_at) recent.set(e.food_id, (recent.get(e.food_id) ?? 0) + 1)
  return foods.filter((f) => !f.deleted_at).map((f) => ({
    id: f.id, name: f.name, mine: !!userId && f.owner_id === userId, inStock: inStock.has(f.id), recent: recent.get(f.id) ?? 0,
  }))
}

/** The food a typed name means, when one clearly fits (shopping-rules.ts). */
export async function matchTyped(householdId: string, userId: string | null, name: string): Promise<Food | null> {
  const id = matchFood(name, await foodChoices(householdId, userId))
  return id ? (await db.food.get(id)) ?? null : null
}

export interface NewItem extends Partial<ParsedItem> {
  name: string
  food_id?: string | null
  aisle?: string | null
  shop?: string | null
  note?: string | null
  list?: string | null
}

/** Put an item on the list. The same item already there, not yet in the
 *  basket and on the same list, takes the new amount on top ("6 eggs" and
 *  "6 eggs" are 12) when the two add up; otherwise it is a row of its own.
 *  Returns the row, and Undo for it. */
export async function addItem(profile: Profile, item: NewItem): Promise<{ entry: ShoppingEntry; merged: boolean; undo: Undo }> {
  const rows = await db.shopping_entry.where('household_id').equals(profile.household_id).toArray()
  const live = rows.filter((e) => !e.deleted_at && !e.plan_key)
  const key = itemKey({ food_id: item.food_id ?? null, name: item.name })
  const list = item.list ?? null
  const same = live.find((e) => !e.checked && (e.list ?? null) === list && itemKey(e) === key)
  const add = { qty: item.qty ?? null, unit: item.unit ?? null, grams: item.grams ?? null }
  if (same) {
    const merged = mergeAmounts({ qty: same.qty, unit: same.unit ?? null, grams: same.grams }, add)
    if (merged) {
      const next = await updateEntry(same, {
        ...merged,
        ...(item.note && !same.note ? { note: item.note } : {}),
        ...(item.shop && !same.shop ? { shop: item.shop } : {}),
      })
      return { entry: next, merged: true, undo: undoFor([{ id: same.id, row: same }]) }
    }
  }
  const row = await putNew(blankEntry(profile.household_id, profile.id, {
    name: item.name, food_id: item.food_id ?? null, ...add, aisle: item.aisle ?? null, shop: item.shop ?? null,
    note: item.note ?? null, list, sort_order: nextSort(live),
  }))
  return { entry: row, merged: false, undo: undoFor([{ id: row.id, row: null }]) }
}

/** One tap on a "recently bought" tile: the item as it was last bought. */
export function addRecent(profile: Profile, tile: RecentTile, list: string | null) {
  return addItem(profile, {
    name: tile.name, food_id: tile.food_id, qty: tile.qty, unit: tile.unit, grams: tile.grams,
    aisle: tile.aisle, shop: tile.shop, list,
  })
}

/** Recipes' ingredients onto the list (SHOP-14), for the portions chosen,
 *  less what is in the cupboard, in whole packs or whole ones where that is
 *  known. Each food is one item; one already on the list takes the amount on
 *  top. Lines without a food (a pinch of salt) are left out. */
export async function addRecipesToList(profile: Profile, picks: { recipe_id: string; portions: number }[], list: string | null = null):
  Promise<{ added: number; covered: number; undo: Undo }> {
  const needs = new Map<string, number>()
  const said = new Map<string, string>()
  const counts = new Map<string, { qty: number; unit: string } | null>()
  for (const pick of picks) {
    const lines = await db.recipe_line.where('recipe_id').equals(pick.recipe_id).toArray()
    const ids = [...new Set(lines.map((l) => l.food_id).filter((id): id is string => !!id))]
    const foods = new Map((await db.food.bulkGet(ids)).filter((f): f is Food => !!f).map((f) => [f.id, f]))
    for (const [id, g] of mealNeeds(lines, foods, pick.portions)) needs.set(id, (needs.get(id) ?? 0) + g)
    for (const l of lines) {
      if (!l.food_id) continue
      if (l.raw_text && !said.has(l.food_id)) said.set(l.food_id, listName(l.raw_text))
      const c = l.unit && l.unit_qty ? { qty: Number(l.unit_qty) * pick.portions, unit: l.unit } : null
      const had = counts.get(l.food_id)
      counts.set(l.food_id, had === undefined ? c : had && c && had.unit === c.unit ? { qty: had.qty + c.qty, unit: c.unit } : null)
    }
  }
  const stock = new Map((await stockFor(profile.household_id)).map((s) => [s.food_id, Number(s.grams_on_hand) || 0]))
  const foods = new Map((await db.food.bulkGet([...needs.keys()])).filter((f): f is Food => !!f).map((f) => [f.id, f]))
  const undos: Undo[] = []
  let added = 0
  let covered = 0
  for (const [id, g] of needs) {
    const buy = Math.round(Math.max(0, g - (stock.get(id) ?? 0)) * 10) / 10
    if (buy <= 0) { covered++; continue }
    const food = foods.get(id)
    const pack = food?.pack_size_g ? Number(food.pack_size_g) : null
    const c = counts.get(id)
    const unit = c ? findUnit(readUnits(food?.units), c.unit) : undefined
    let amount: Pick<ParsedItem, 'qty' | 'unit' | 'grams'>
    if (pack) {
      const packs = Math.ceil(buy / pack - 1e-9)
      amount = { qty: packs, unit: 'pack', grams: Math.round(packs * pack * 10) / 10 }
    } else if (c && unit) {
      const n = Math.max(1, Math.ceil(buy / unit.g - 0.01))
      amount = { qty: n, unit: unit.name, grams: Math.round(n * unit.g * 10) / 10 }
    } else {
      amount = buy >= 1000 ? { qty: Math.round(buy) / 1000, unit: 'kg', grams: Math.round(buy) } : { qty: Math.round(buy), unit: 'g', grams: Math.round(buy) }
    }
    const r = await addItem(profile, { name: said.get(id) ?? food?.name ?? 'Unknown food', food_id: id, ...amount, list })
    undos.push(r.undo)
    added++
  }
  return { added, covered, undo: async () => { for (const u of undos.reverse()) await u() } }
}

// ---- ticking, moving, removing ---------------------------------------------------------

/** The row a planned item's choices are kept in, made when first needed. */
async function rowForPlanned(profile: Profile, item: ListItem): Promise<{ row: ShoppingEntry; made: boolean }> {
  if (item.entry && !item.entry.deleted_at) return { row: item.entry, made: false }
  const fresh = await db.shopping_entry.where('household_id').equals(profile.household_id)
    .filter((e) => !e.deleted_at && e.plan_key === item.food_id).first()
  if (fresh) return { row: fresh, made: false }
  const row = await putNew(blankEntry(profile.household_id, profile.id, { plan_key: item.food_id, food_id: item.food_id, name: item.name }))
  return { row, made: true }
}

/** Change an item, planned or typed: tick, aisle, shop, note, list, order. */
export async function changeItem(profile: Profile, item: ListItem, changes: Partial<ShoppingEntry>): Promise<Undo> {
  if (item.kind === 'manual' && item.entry) {
    const before = item.entry
    await updateEntry(before, changes)
    return undoFor([{ id: before.id, row: before }])
  }
  const { row, made } = await rowForPlanned(profile, item)
  await updateEntry(row, changes)
  return undoFor([{ id: row.id, row: made ? null : row }])
}

/** In the basket, or out of it. */
export function tick(profile: Profile, item: ListItem, checked: boolean) {
  return changeItem(profile, item, { checked, checked_at: checked ? new Date().toISOString() : null })
}

/** Take a typed item off the list (Undo brings it back). A planned item is
 *  "not needed this time": what the plan needs now counts as dealt with
 *  until the window's last day, so it comes back only if more is planned. */
export async function removeItem(profile: Profile, item: ListItem, until: string): Promise<Undo> {
  if (item.kind === 'manual' && item.entry) return changeItem(profile, item, { deleted_at: new Date().toISOString() })
  const { row, made } = await rowForPlanned(profile, item)
  const day = today()
  const already = row.done_until && row.done_until >= day ? Number(row.grams) || 0 : 0
  await updateEntry(row, { done_until: until, grams: Math.round((already + (item.line?.buy_g ?? 0)) * 10) / 10, checked: false, checked_at: null })
  return undoFor([{ id: row.id, row: made ? null : row }])
}

/** Several items' places within an aisle, after one was moved up or down. */
export async function setOrder(profile: Profile, items: ListItem[], sorts: { key: string; sort: number }[]): Promise<Undo> {
  const undos: Undo[] = []
  for (const s of sorts) {
    const item = items.find((i) => i.key === s.key)
    if (item) undos.push(await changeItem(profile, item, { sort_order: s.sort }))
  }
  return async () => { for (const u of undos.reverse()) await u() }
}

/** Home from the shop: what is in the basket goes in the cupboard and off
 *  the list. A planned item goes in as bought (whole packs, whole ones);
 *  a typed item linked to a food goes in when its amount says how much; a
 *  plain item ("Toilet paper") is just bought. Undo puts every row back. */
export async function putInStock(profile: Profile, basket: ListItem[]): Promise<{ stocked: number; bought: number; undo: Undo }> {
  const now = new Date().toISOString()
  const befores: { id: string; row: ShoppingEntry | null }[] = []
  const stockBefore: Stock[] = []
  const stockMade: string[] = []
  let stocked = 0
  const remember = async (foodId: string) => {
    const had = await db.stock.where('[household_id+food_id]').equals([profile.household_id, foodId]).toArray()
    if (had.length) stockBefore.push(...had.filter((h) => !stockBefore.some((s) => s.id === h.id)))
  }
  for (const item of basket) {
    let grams: number | null = null
    let unit: string | undefined
    const food = item.food_id ? await db.food.get(item.food_id) : undefined
    if (item.kind === 'plan' && item.line) {
      grams = boughtFor(item.line)
      unit = !item.line.packs && item.line.count !== null && item.line.unit && food && findUnit(readUnits(food.units), item.line.unit.name)
        ? item.line.unit.name : undefined
    } else if (item.entry && food) {
      grams = entryGrams(item.entry, food)
      if (grams === null && food.pack_size_g) grams = Number(food.pack_size_g) * (Number(item.entry.qty) || 1)
      const u = item.entry.unit ? findUnit(readUnits(food.units), item.entry.unit) : undefined
      unit = u?.name
    }
    if (item.food_id && grams && grams > 0) {
      await remember(item.food_id)
      const made = await addStock(profile.household_id, item.food_id, grams, undefined, unit)
      if (!stockBefore.some((s) => s.id === made.id)) stockMade.push(made.id)
      stocked++
    }
    if (item.entry && !item.entry.deleted_at) {
      befores.push({ id: item.entry.id, row: item.entry })
      await updateEntry(item.entry, { deleted_at: now, bought_at: now, name: item.entry.name ?? item.name })
    }
  }
  return { stocked, bought: basket.length, undo: undoFor(befores, stockBefore, stockMade) }
}

/** The shopping trip ticked off on Today or Plan (SHOP-22): with things in
 *  the basket, the bar at the bottom offers at once to put them in stock,
 *  without opening the list or a sheet. Nothing in the basket, nothing said.
 *  Called by rail-actions' tick. */
export async function offerStockAfterTrip(task: Pick<Task, 'source' | 'profile_id' | 'planned_date' | 'status'>): Promise<void> {
  if (!isTripTask(task) || task.status !== 'done') return
  const profile = await db.profile.get(task.profile_id)
  if (!profile) return
  const view = await loadShopping(profile, task.planned_date ?? today())
  const basket = view.items.filter((i) => i.checked)
  if (!basket.length) return
  const { offerAction, offerUndo } = await import('../ui/Undo')
  const n = basket.length
  offerAction(`Shopping done. Put the ${n} bought ${n === 1 ? 'item' : 'items'} in stock?`, 'Put in stock', async () => {
    // Read again: the basket may have changed while the offer showed.
    const fresh = (await loadShopping(profile, task.planned_date ?? today())).items.filter((i) => i.checked)
    if (!fresh.length) return
    const r = await putInStock(profile, fresh)
    offerUndo(`Basket put away${r.stocked ? `, ${r.stocked} in stock` : ''}`, r.undo)
  })
}

/** Home from the shop without the cupboard: the basket is bought and goes
 *  off the list. A planned item counts as dealt with until the window's
 *  last day, so it does not come back while the same meals are planned. */
export async function clearBasket(_profile: Profile, basket: ListItem[], until: string): Promise<{ bought: number; undo: Undo }> {
  const now = new Date().toISOString()
  const befores: { id: string; row: ShoppingEntry | null }[] = []
  for (const item of basket) {
    if (!item.entry || item.entry.deleted_at) continue
    befores.push({ id: item.entry.id, row: item.entry })
    if (item.kind === 'plan') {
      const already = item.entry.done_until && item.entry.done_until >= today() ? Number(item.entry.grams) || 0 : 0
      await updateEntry(item.entry, {
        checked: false, checked_at: null, done_until: until, bought_at: now,
        grams: Math.round((already + (item.line?.buy_g ?? 0)) * 10) / 10, name: item.entry.name ?? item.name,
      })
    } else {
      await updateEntry(item.entry, { deleted_at: now, bought_at: now })
    }
  }
  return { bought: befores.length, undo: undoFor(befores) }
}

// ---- prices ----------------------------------------------------------------------------

const PRICE_FIELDS: (keyof ShopPrice & string)[] = [
  'household_id', 'shop', 'item_key', 'food_id', 'name', 'price', 'amount_g', 'noted_on', 'added_by', 'deleted_at',
]

/** Note a price at a shop: it replaces the one noted before for that item there. */
export async function notePrice(profile: Profile, shop: string, item: { food_id: string | null; name: string }, price: number, amountG: number | null): Promise<ShopPrice> {
  const key = itemKey(item)
  const rows = await db.shop_price.where('household_id').equals(profile.household_id).toArray()
  const had = rows.find((r) => !r.deleted_at && r.item_key === key && sameShop(r.shop, shop))
  const noted_on = today()
  if (had) {
    const next = { ...had, price, amount_g: amountG, noted_on, name: item.name, updated_at: new Date().toISOString() }
    await db.shop_price.put(next)
    await queueChange('shop_price', next, ['price', 'amount_g', 'noted_on', 'name'])
    return next
  }
  const row: ShopPrice = {
    id: crypto.randomUUID(), household_id: profile.household_id, shop, item_key: key, food_id: item.food_id, name: item.name,
    price, amount_g: amountG, noted_on, added_by: profile.id, created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), deleted_at: null,
  }
  await db.shop_price.put(row)
  await queueChange('shop_price', row, PRICE_FIELDS)
  return row
}

export async function removePrice(row: ShopPrice): Promise<Undo> {
  const gone = { ...row, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  await db.shop_price.put(gone)
  await queueChange('shop_price', gone, ['deleted_at'])
  return async () => {
    const now = await db.shop_price.get(row.id)
    if (!now) return
    const back = { ...now, deleted_at: null, updated_at: new Date().toISOString() }
    await db.shop_price.put(back)
    await queueChange('shop_price', back, ['deleted_at'])
  }
}

/** Note a price, with an Undo that puts back what was there: the price it
 *  replaced, or none at all (v17's quick price sheet). */
export async function notePriceUndoable(profile: Profile, shop: string, item: { food_id: string | null; name: string }, price: number, amountG: number | null): Promise<Undo> {
  const key = itemKey(item)
  const before = (await db.shop_price.where('household_id').equals(profile.household_id).toArray())
    .find((r) => !r.deleted_at && r.item_key === key && sameShop(r.shop, shop)) ?? null
  const row = await notePrice(profile, shop, item, price, amountG)
  return async () => {
    const now = await db.shop_price.get(row.id)
    if (!now) return
    if (!before) { await removePrice(now); return }
    const back = { ...now, price: before.price, amount_g: before.amount_g, noted_on: before.noted_on, name: before.name, updated_at: new Date().toISOString() }
    await db.shop_price.put(back)
    await queueChange('shop_price', back, ['price', 'amount_g', 'noted_on', 'name'])
  }
}

/** A shop renamed in Stores: its prices follow it. */
export async function renameShopPrices(householdId: string, from: string, to: string): Promise<void> {
  for (const r of await db.shop_price.where('household_id').equals(householdId).toArray()) {
    if (r.deleted_at || !sameShop(r.shop, from)) continue
    const next = { ...r, shop: to, updated_at: new Date().toISOString() }
    await db.shop_price.put(next)
    await queueChange('shop_price', next, ['shop'])
  }
}

// ---- the shopping trip on the plan (SHOP-20 to SHOP-23, GEN-32) --------------------------

/** Trip tasks have ids worked out from the profile and the day, so two
 *  phones that both put the trip on Saturday while offline make one task. */
const TRIP_NAMESPACE = '6b1f0e7a-3c52-4d8e-9a2f-5e7c1d0b4a93'
export const tripTaskId = (profileId: string, day: string) => uuidV5(`shopping-trip|${profileId}|${day}`, TRIP_NAMESPACE)

const TASK_FIELDS: (keyof Task & string)[] = ['title', 'planned_date', 'planned_time', 'duration_min', 'locked', 'deleted_at', 'status', 'completed_at']

/** Bring the trip on the plan in line with the list and the settings: made,
 *  its count kept up to date, moved (`replace`, after the settings
 *  changed) or removed. Safe to run any number of times. */
export async function syncTrip(profileId: string, opts: { replace?: boolean } = {}): Promise<void> {
  const profile = await db.profile.get(profileId)
  if (!profile) return
  const s = readSettings(profile).shopping
  const tasks = (await db.task.where('profile_id').equals(profileId).toArray()).filter((t) => t.source === 'shopping')
  if (!s.trip.on && !tasks.some((t) => !t.deleted_at && t.status !== 'done')) return
  const built = (await db.module.toArray()).filter((m) => !m.builtin && !m.deleted_at)
  const on = (await enabledModules(profileId, built)).includes('shopping')
  const day = today()
  const count = on && s.trip.on ? (await loadShopping(profile, day)).items.filter((i) => !i.checked).length : 0
  const plan = planTrip({ today: day, count, on, trip: s.trip, tasks, replace: opts.replace })
  const now = new Date().toISOString()
  for (const id of plan.remove) {
    const t = tasks.find((x) => x.id === id)
    if (t && !t.deleted_at) await saveTask({ ...t, deleted_at: now }, ['deleted_at'])
  }
  for (const u of plan.update) {
    const t = tasks.find((x) => x.id === u.id)
    if (t) await saveTask({ ...t, ...u.changes } as Task, Object.keys(u.changes) as (keyof Task & string)[])
  }
  if (plan.create) {
    const c = plan.create
    const id = await tripTaskId(profileId, c.day)
    const had = await db.task.get(id)
    const fields = { title: c.title, planned_date: c.day, planned_time: c.time, duration_min: c.minutes, locked: c.locked }
    if (had) {
      // Taken off the plan before (the list was empty for a while): back.
      await saveTask({ ...had, ...fields, status: 'todo', completed_at: null, deleted_at: null }, TASK_FIELDS)
    } else {
      await saveTask(blankTask(profileId, c.day, {
        id, ...fields, module_key: 'shopping', source: 'shopping',
        notes: 'The list is on the Shop page. Tick it off there as you go.',
      }))
    }
  }
}

/** What the trip depends on, as one string: when it changes, the trip is
 *  brought in line. Cheap enough to work out on every change. */
async function tripInputs(profileId: string): Promise<string> {
  const profile = await db.profile.get(profileId)
  if (!profile) return ''
  const s = readSettings(profile).shopping
  const tasks = (await db.task.where('profile_id').equals(profileId).toArray()).filter((t) => t.source === 'shopping')
  const open = tasks.filter((t) => !t.deleted_at && t.status !== 'done')
  if (!s.trip.on && open.length === 0) return 'off'
  const inst = await shoppingInstance(profileId)
  const count = s.trip.on && inst?.enabled ? (await loadShopping(profile)).items.filter((i) => !i.checked).length : 0
  return JSON.stringify([today(), s.trip, !!inst?.enabled, count, tasks.map((t) => [t.id, t.planned_date, t.status, !!t.deleted_at, t.title])])
}

let tripWatch: Subscription | undefined
let tripTimer: number | undefined
let tripClock: number | undefined
let lastTrip = ''
let tripGen = 0

/** Follow the open profile: whenever the list, the plan, the cupboard, the
 *  settings or the trip task change, a moment later the trip is brought in
 *  line. Also once an hour, so a new day moves a trip that was missed.
 *  Returns the way to stop. Mounted once (App.tsx). */
export function watchShoppingTrip(profileId: string | null): () => void {
  tripWatch?.unsubscribe()
  window.clearTimeout(tripTimer)
  window.clearInterval(tripClock)
  lastTrip = ''
  const gen = ++tripGen
  if (!profileId) return () => undefined
  const run = (inputs: string) => {
    window.clearTimeout(tripTimer)
    tripTimer = window.setTimeout(() => {
      if (gen !== tripGen || inputs === lastTrip) return
      lastTrip = inputs
      void syncTrip(profileId).catch(() => { lastTrip = '' })
    }, 1200)
  }
  tripWatch = liveQuery(() => tripInputs(profileId)).subscribe({ next: run, error: () => undefined })
  tripClock = window.setInterval(() => { lastTrip = ''; void tripInputs(profileId).then(run) }, 3_600_000)
  return () => {
    if (gen !== tripGen) return
    tripWatch?.unsubscribe()
    window.clearTimeout(tripTimer)
    window.clearInterval(tripClock)
  }
}
