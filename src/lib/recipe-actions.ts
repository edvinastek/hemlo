import { db } from './db'
import { edit } from './write'
import type { BuyLine } from './recipe-rules'
import type { ShoppingEntry } from './types'

/** Lines onto the household's shopping list, written like any change (on
 *  this device first, then the server). A food already on the list and not
 *  ticked gets the amount added to it instead of a second line; a count is
 *  kept only while both were counted in the same unit. Returns how to take
 *  it all back, for the Undo bar. */
export async function addToShoppingList(buy: BuyLine[], household: string, profileId: string, note: string): Promise<{ count: number; undo: () => Promise<void> }> {
  const list = (await db.shopping_entry.where('household_id').equals(household).toArray())
    .filter((e) => !e.deleted_at && !e.checked && !e.plan_key)
  const made: ShoppingEntry[] = []
  const changed: { row: ShoppingEntry; before: Partial<ShoppingEntry> }[] = []
  let order = list.reduce((m, e) => Math.max(m, e.sort_order ?? 0), 0)
  for (const b of buy) {
    const have = list.find((e) => e.food_id && e.food_id === b.food_id)
    if (have) {
      const sameUnit = !!b.count && have.unit === b.count.unit && have.qty != null
      const next: Partial<ShoppingEntry> = {
        grams: Math.round((Number(have.grams ?? 0) + (b.grams ?? 0)) * 10) / 10,
        ...(sameUnit ? { qty: Number(have.qty) + b.count!.qty, unit_qty: Number(have.qty) + b.count!.qty }
          : have.unit ? { qty: null, unit: null, unit_qty: null } : {}),
      }
      const before = { grams: have.grams, qty: have.qty, unit: have.unit, unit_qty: have.unit_qty }
      const row = await edit('shopping_entry', have, next)
      changed.push({ row, before })
      // A second recipe's line for the same food adds to this one.
      list[list.indexOf(have)] = row
    } else {
      const row = await edit('shopping_entry', { id: crypto.randomUUID() } as ShoppingEntry, {
        household_id: household, plan_key: null, food_id: b.food_id, name: b.name,
        qty: b.count?.qty ?? null, unit: b.count?.unit ?? null, unit_qty: b.count?.qty ?? null,
        grams: b.grams, note: note.slice(0, 200), aisle: b.aisle, shop: null, checked: false, checked_at: null,
        sort_order: ++order, added_by: profileId, deleted_at: null,
      })
      made.push(row)
      list.push(row)
    }
  }
  return {
    count: made.length + changed.length,
    undo: async () => {
      for (const m of made) await edit('shopping_entry', (await db.shopping_entry.get(m.id)) ?? m, { deleted_at: new Date().toISOString() })
      for (const c of changed) await edit('shopping_entry', (await db.shopping_entry.get(c.row.id)) ?? c.row, c.before)
    },
  }
}
