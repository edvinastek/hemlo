import { db, getMeta, setMeta } from './db'
import { queueChange } from './sync'
import { edit } from './write'
import { readSettings } from './settings'
import { applyDelta, cleanNote, mealNeeds, nudge, putBack, takeOut, tidy, MAX_GRAMS } from './stock-rules'
import type { Food, MealPlanSlot, Stock } from './types'

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

/** Set the amount of a food outright, making the row if there is none.
 *  A note left undefined is kept; null or empty clears it. */
export async function setStock(householdId: string, foodId: string, grams: number, note?: string | null): Promise<Stock> {
  const g = Math.min(MAX_GRAMS, Math.max(0, tidy(grams)))
  const row = await rowFor(householdId, foodId)
  if (row) {
    const changes: Partial<Stock> = { grams_on_hand: g }
    if (row.deleted_at) {
      changes.deleted_at = null
      // A note from before it was removed described a different bag.
      changes.note = cleanNote(note)
    } else if (note !== undefined) {
      changes.note = cleanNote(note)
    }
    return edit('stock', row, changes)
  }
  const fresh: Stock = {
    id: crypto.randomUUID(), household_id: householdId, food_id: foodId, grams_on_hand: g,
    note: cleanNote(note), updated_at: new Date().toISOString(), deleted_at: null,
  }
  await db.stock.put(fresh)
  await queueChange('stock', fresh, NEW_FIELDS)
  return fresh
}

/** Add to what is there (or start from nothing): the add form and a finished
 *  shopping trip both mean "more of this". */
export async function addStock(householdId: string, foodId: string, grams: number, note?: string | null): Promise<Stock> {
  const row = await rowFor(householdId, foodId)
  const have = row && !row.deleted_at ? Number(row.grams_on_hand) || 0 : 0
  return setStock(householdId, foodId, applyDelta(have, grams).next, note)
}

/** One tap of − or +, worked out from the row as stored rather than from
 *  what the screen last drew, so quick taps each count. */
export async function nudgeStock(householdId: string, foodId: string, dir: 1 | -1): Promise<Stock | undefined> {
  const row = await rowFor(householdId, foodId)
  if (!row || row.deleted_at) return undefined
  return setStock(householdId, foodId, nudge(Number(row.grams_on_hand) || 0, dir))
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
 *  Only when the person eating has chosen it (settings.stock_auto): most people
 *  cook from a rough cupboard and do not want it to count for them. A meal
 *  typed as plain numbers has no ingredients and changes nothing. */
export async function consumeForMeal(slot: MealPlanSlot, sign: 1 | -1): Promise<void> {
  if (!slot.recipe_id) return
  if (sign === 1 && slot.status === 'eaten') return
  if (sign === -1 && slot.status !== 'eaten') return

  const profile = await db.profile.get(slot.profile_id)
  if (!profile) return
  const householdId = profile.household_id
  const on = readSettings(profile).stock_auto
  const key = takenKey(slot.id)
  const recorded = await getMeta<Record<string, number> | null>(key, null)

  // Undoing what this device took is always right, even if the switch has
  // been turned off since. With nothing recorded (the meal was ticked on
  // another phone) the recipe's amounts go back, if the switch is on.
  if (sign === -1 && !recorded && !on) return
  if (sign === 1 && !on) return

  const rows = await stockFor(householdId)
  const have = new Map(rows.map((r) => [r.food_id, Number(r.grams_on_hand) || 0]))
  const byFood = new Map(rows.map((r) => [r.food_id, r]))

  let next: Map<string, number>
  if (sign === 1) {
    const needs = await needsFor(slot)
    const out = takeOut(needs, have)
    next = out.next
    await setMeta(key, out.taken)
  } else {
    const taken = recorded ?? Object.fromEntries(await needsFor(slot))
    next = putBack(taken, have)
    await db.meta.delete(key)
  }

  for (const [foodId, grams] of next) {
    const row = byFood.get(foodId)
    if (row && grams !== have.get(foodId)) await edit('stock', row, { grams_on_hand: grams })
  }
}

async function needsFor(slot: MealPlanSlot): Promise<Map<string, number>> {
  const lines = await db.recipe_line.where('recipe_id').equals(slot.recipe_id!).toArray()
  const ids = [...new Set(lines.map((l) => l.food_id).filter((id): id is string => !!id))]
  const foods = new Map((await db.food.bulkGet(ids)).filter((f): f is Food => !!f).map((f) => [f.id, f]))
  return mealNeeds(lines, foods, slot.portion_multiplier ?? 1)
}
