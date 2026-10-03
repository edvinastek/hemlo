import { db, getMeta, setMeta } from './db'
import { REFERENCES } from './sync-rules'
import { mapKey, movedFields, replacementMap, swapMany } from './food-replaced-rules'

type Row = { id: string } & Record<string, unknown>
type Store = { toArray: () => Promise<Row[]>; bulkPut: (rows: Row[]) => Promise<unknown> }

/** After a pull: anything on this device that still points at a food the
 *  catalogue replaced (an ingredient, a meal, a log, stock, a list item, a
 *  book, a module record) points at its replacement, and so do the edits
 *  waiting to be sent. The server has done the same to its rows (027) and
 *  points late arrivals at the replacement too, so nothing new is queued.
 *  Runs again only when the replacements change. */
export async function followReplacedFoods(): Promise<number> {
  const map = replacementMap(await db.food.toArray())
  if (map.size === 0) return 0
  const key = mapKey(map)
  if ((await getMeta<string | null>('food_replaced_seen', null)) === key) return 0

  let moved = 0
  for (const { table, fields } of REFERENCES.food ?? []) {
    const store = (db as unknown as Record<string, Store | undefined>)[table]
    if (!store) continue
    const changed: Row[] = []
    for (const row of await store.toArray()) {
      const m = movedFields(row, fields, map)
      if (m) changed.push({ ...row, ...m })
    }
    if (changed.length) { await store.bulkPut(changed); moved += changed.length }
  }
  // Waiting edits carry the new id when they are sent.
  const waiting = await db.pending.toArray()
  await db.transaction('rw', db.pending, async () => {
    for (const p of waiting) {
      const payload = swapMany(p.payload, map) as Record<string, unknown>
      if (payload !== p.payload) await db.pending.update(p.id!, { payload })
    }
  })
  await setMeta('food_replaced_seen', key)
  return moved
}
