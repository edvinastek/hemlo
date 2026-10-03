import { db, getMeta, setMeta } from './db'
import { queueChange } from './sync'
import { edit } from './write'
import { readSettings } from './settings'
import { applyDelta, cleanMin, cleanNote, cleanPlace, mealNeeds, putBack, stockStep, takeOut, takesStock, tidy, MAX_GRAMS } from './stock-rules'
import { readUnits, stockUnitColumns } from './units-rules'
import type { Food, FoodLogEntry, MealPlanSlot, Stock } from './types'

/** The household's cupboard, kept like every other table: written here first
 *  so it works with no signal, then queued for the server. The maths lives in
 *  stock-rules.ts; this file only reads and writes rows.
 *
 *  Amounts are stored, not deltas, so two phones changing the same food while
 *  both offline end on whichever sent last. For a cupboard that is the right
 *  trade: the last person to look in it is the one to believe. */

const NEW_FIELDS: (keyof Stock & string)[] = ['household_id', 'food_id', 'grams_on_hand', 'note', 'deleted_at']

/** Before two devices' rows for one food are folded together on the server
 *  (NATURAL_KEYS.stock), this device can briefly hold both. The newest wins. */
function newestPerFood(rows: Stock[]): Stock[] {
  const by = new Map<string, Stock>()
  for (const r of rows) {
    const had = by.get(r.food_id)
    if (!had || (r.updated_at ?? '') > (had.updated_at ?? '')) by.set(r.food_id, r)
  }
  return [...by.values()]
}

/** What the household has, removed rows left out. Items at 0 g stay: they are
 *  "out", which is worth knowing until someone removes them. */
export async function stockFor(householdId: string): Promise<Stock[]> {
  const rows = await db.stock.where('household_id').equals(householdId).toArray()
  return newestPerFood(rows.filter((r) => !r.deleted_at))
}

/** Grams on hand per food, as the shopping trip takes it. */
export async function stockMap(householdId: string): Promise<Map<string, number>> {
  return new Map((await stockFor(householdId)).map((r) => [r.food_id, Number(r.grams_on_hand) || 0]))
}

/** The one row for this food, live or removed. A removed one is brought back
 *  rather than a second made, because the database allows one per food. */
async function rowFor(householdId: string, foodId: string): Promise<Stock | undefined> {
  const rows = await db.stock.where('[household_id+food_id]').equals([householdId, foodId]).toArray()
  const live = rows.filter((r) => !r.deleted_at)
  return newestPerFood(live.length ? live : rows)[0]
}

/** The unit columns that go with an amount: how many of the unit the grams
 *  come to ("600 g" of 50 g eggs is 12), so what Postgres holds reads the
 *  same as the screen. `unit` undefined keeps the unit the row shows in; null
 *  goes back to grams. A unit the food no longer has goes back to grams too.
 *  Grams on a row that never had a unit write no unit columns, so a server
 *  without them (before 022) still takes it.
 *
 *  A food this device does not have (a housemate scanned it, and it has not
 *  arrived yet) says nothing about its units, so the row's unit is left as
 *  it is rather than wiped: the columns are not written at all. */
async function unitFor(row: Stock | undefined, foodId: string, grams: number, unit: string | null | undefined): Promise<Partial<Stock>> {
  const food = await db.food.get(foodId)
  return stockUnitColumns(row, food ? readUnits(food.units) : null, grams, unit)
}

/** Set the amount of a food outright, making the row if there is none.
 *  A note left undefined is kept; null or empty clears it. `unit` is the
 *  food's unit to show it in ("egg"), null for grams, undefined to keep. */
export async function setStock(householdId: string, foodId: string, grams: number, note?: string | null, unit?: string | null): Promise<Stock> {
  const g = Math.min(MAX_GRAMS, Math.max(0, tidy(grams)))
  const row = await rowFor(householdId, foodId)
  if (row) {
    const changes: Partial<Stock> = { grams_on_hand: g, ...(await unitFor(row, foodId, g, unit)) }
    if (row.deleted_at) {
      changes.deleted_at = null
      // A note from before it was removed described a different bag.
      changes.note = cleanNote(note)
      // So did its date; where it is kept and the minimum still hold.
      if (row.best_before) changes.best_before = null
    } else if (note !== undefined) {
      changes.note = cleanNote(note)
    }
    return edit('stock', row, changes)
  }
  const units = await unitFor(undefined, foodId, g, unit)
  const fresh: Stock = {
    id: crypto.randomUUID(), household_id: householdId, food_id: foodId, grams_on_hand: g,
    note: cleanNote(note), ...units, updated_at: new Date().toISOString(), deleted_at: null,
  }
  await db.stock.put(fresh)
  await queueChange('stock', fresh, [...NEW_FIELDS, ...(Object.keys(units) as (keyof Stock & string)[])])
  return fresh
}

/** Add to what is there (or start from nothing): the add form and a finished
 *  shopping trip both mean "more of this". */
export async function addStock(householdId: string, foodId: string, grams: number, note?: string | null, unit?: string | null): Promise<Stock> {
  const row = await rowFor(householdId, foodId)
  const have = row && !row.deleted_at ? Number(row.grams_on_hand) || 0 : 0
  // Added in a unit, the row shows in it; added in grams to a row shown in
  // eggs, it stays in eggs (the grams are what count either way).
  return setStock(householdId, foodId, applyDelta(have, grams).next, note, unit ?? undefined)
}

/** One tap of − or +, worked out from the row as stored rather than from
 *  what the screen last drew, so quick taps each count. Stock shown in a
 *  unit moves by one of it: one egg more or less. */
export async function nudgeStock(householdId: string, foodId: string, dir: 1 | -1): Promise<Stock | undefined> {
  const row = await rowFor(householdId, foodId)
  if (!row || row.deleted_at) return undefined
  const food = await db.food.get(foodId)
  // A food not on this device moves by grams, and its unit is left alone.
  return setStock(householdId, foodId, stockStep(Number(row.grams_on_hand) || 0, row.unit, food ? readUnits(food.units) : null, dir))
}

/** Take the row off the list. Soft, so the removal reaches the other phones. */
export async function removeStock(row: Stock): Promise<Stock> {
  return edit('stock', row, { deleted_at: new Date().toISOString() })
}

/** What a meal took, kept on this device so unticking it puts back exactly
 *  that. Without it, ticking a meal with 20 g of rice left and unticking it
 *  would conjure the other 60 g. */
const takenKey = (slotId: string) => `stock:taken:${slotId}`

/** A meal marked eaten (sign 1) takes its ingredients out of stock; unticked
 *  (sign -1) it puts them back. Called with the slot as it was before the
 *  change, so a meal already eaten is never taken twice.
 *
 *  A recipe meal (a ready meal is a recipe of one line) takes its
 *  ingredients times the portions; a meal of one food takes that food's
 *  grams. Only when the person eating has chosen it (settings.stock_auto):
 *  most people cook from a rough cupboard and do not want it to count for
 *  them. A meal typed as plain numbers has no food and changes nothing. */
export async function consumeForMeal(slot: MealPlanSlot, sign: 1 | -1): Promise<void> {
  if (!takesStock(slot)) return
  if (sign === 1 && slot.status === 'eaten') return
  if (sign === -1 && slot.status !== 'eaten') return
  await consume(slot.profile_id, takenKey(slot.id), () => slotNeeds(slot), sign)
}

/** The same for food logged as eaten without a planned meal (the add-food
 *  sheet): `sign` 1 when it is logged, -1 when the entry is removed. Called
 *  by whoever writes the food log, once per change; a second call with the
 *  same sign does nothing, because what was taken is remembered per entry. */
export async function consumeForLog(entry: Pick<FoodLogEntry, 'id' | 'profile_id' | 'food_id' | 'recipe_id' | 'grams' | 'portions'>, sign: 1 | -1): Promise<void> {
  if (!takesStock(entry)) return
  const key = takenKey(`log:${entry.id}`)
  if (sign === 1 && (await getMeta<Record<string, number> | null>(key, null))) return
  await consume(entry.profile_id, key, async () => {
    if (entry.recipe_id) return recipeNeeds(entry.recipe_id, Number(entry.portions) > 0 ? Number(entry.portions) : 1)
    return new Map([[entry.food_id!, tidy(Number(entry.grams))]])
  }, sign)
}

async function consume(profileId: string, key: string, needs: () => Promise<Map<string, number>>, sign: 1 | -1): Promise<void> {
  const profile = await db.profile.get(profileId)
  if (!profile) return
  const householdId = profile.household_id
  const on = readSettings(profile).stock_auto
  const recorded = await getMeta<Record<string, number> | null>(key, null)

  // Undoing what this device took is always right, even if the switch has
  // been turned off since. With nothing recorded (the meal was ticked on
  // another phone) the meal's amounts go back, if the switch is on.
  if (sign === -1 && !recorded && !on) return
  if (sign === 1 && !on) return

  const rows = await stockFor(householdId)
  const have = new Map(rows.map((r) => [r.food_id, Number(r.grams_on_hand) || 0]))
  const byFood = new Map(rows.map((r) => [r.food_id, r]))

  let next: Map<string, number>
  if (sign === 1) {
    const out = takeOut(await needs(), have)
    next = out.next
    await setMeta(key, out.taken)
  } else {
    const taken = recorded ?? Object.fromEntries(await needs())
    next = putBack(taken, have)
    await db.meta.delete(key)
  }

  for (const [foodId, grams] of next) {
    const row = byFood.get(foodId)
    if (row && grams !== have.get(foodId)) await edit('stock', row, { grams_on_hand: grams, ...(await unitFor(row, foodId, grams, undefined)) })
  }
}

async function slotNeeds(slot: MealPlanSlot): Promise<Map<string, number>> {
  if (slot.recipe_id) return recipeNeeds(slot.recipe_id, slot.portion_multiplier ?? 1)
  return new Map([[slot.food_id!, tidy(Number(slot.grams))]])
}

async function recipeNeeds(recipeId: string, portions: number): Promise<Map<string, number>> {
  const lines = await db.recipe_line.where('recipe_id').equals(recipeId).toArray()
  const ids = [...new Set(lines.map((l) => l.food_id).filter((id): id is string => !!id))]
  const foods = new Map((await db.food.bulkGet(ids)).filter((f): f is Food => !!f).map((f) => [f.id, f]))
  return mealNeeds(lines, foods, portions)
}

/** Where it is kept, its date and the minimum to keep (STK-03, STK-04).
 *  Only what is given changes; null clears it. */
export async function setStockDetails(row: Stock, details: Partial<Pick<Stock, 'place' | 'best_before' | 'min_grams' | 'note'>>): Promise<Stock> {
  const changes: Partial<Stock> = {}
  if ('place' in details) changes.place = cleanPlace(details.place)
  if ('best_before' in details) changes.best_before = details.best_before || null
  if ('min_grams' in details) changes.min_grams = cleanMin(details.min_grams ?? null)
  if ('note' in details) changes.note = cleanNote(details.note)
  return edit('stock', row, changes)
}

/** Back as it was before (for Undo after a removal or an edit). */
export async function restoreStock(before: Stock): Promise<void> {
  const now = await db.stock.get(before.id)
  if (!now) return
  const changes: Partial<Stock> = {}
  for (const k of ['grams_on_hand', 'unit', 'unit_qty', 'note', 'place', 'best_before', 'min_grams', 'deleted_at'] as const) {
    if ((before[k] ?? null) !== (now[k] ?? null)) (changes as Record<string, unknown>)[k] = before[k] ?? null
  }
  if (Object.keys(changes).length) await edit('stock', now, changes)
}
