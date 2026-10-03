import { db } from './db'
import { push } from './sync'
import type { MealPlanSlot, PendingChange, Task } from './types'

/** One row to write: the row as it should be on this device, and the
 *  fields the server is sent (all of them for a new row). */
export type BatchRow =
  | { table: 'task'; row: Task; fields: (keyof Task & string)[] }
  | { table: 'meal_plan_slot'; row: MealPlanSlot; fields: (keyof MealPlanSlot & string)[] }

/** Many new or changed rows at once (a copy to twenty days, a template
 *  dropped on a week), written on the device in one go and queued for the
 *  server, then sent in one push. Offline it simply
 *  waits in the queue like every other change. */
export async function writeBatch(rows: BatchRow[]) {
  if (rows.length === 0) return
  const now = new Date().toISOString()
  // Meals go up before tasks, so a meal's task never reaches the server
  // ahead of the meal it belongs to.
  const ordered = [...rows.filter((r) => r.table === 'meal_plan_slot'), ...rows.filter((r) => r.table === 'task')]
  const stamped = ordered.map((r) => ({ ...r, row: { ...r.row, updated_at: now } })) as BatchRow[]
  const pending: PendingChange[] = stamped.map((r) => ({
    table: r.table,
    row_id: r.row.id,
    op: 'upsert',
    payload: Object.fromEntries(r.fields.map((f) => [f, (r.row as unknown as Record<string, unknown>)[f]])),
    fields: r.fields,
    changed_at: now,
  }))
  const tasks = stamped.filter((r) => r.table === 'task').map((r) => r.row as Task)
  const slots = stamped.filter((r) => r.table === 'meal_plan_slot').map((r) => r.row as MealPlanSlot)
  await db.transaction('rw', db.task, db.meal_plan_slot, db.pending, async () => {
    if (slots.length) await db.meal_plan_slot.bulkPut(slots)
    if (tasks.length) await db.task.bulkPut(tasks)
    await db.pending.bulkAdd(pending)
  })
  if (navigator.onLine) void push()
}

/** Take back rows a batch made: each is marked deleted, which syncs. */
export async function unmakeBatch(rows: BatchRow[]) {
  const now = new Date().toISOString()
  await writeBatch(rows.map((r) => (r.table === 'task'
    ? { table: 'task' as const, row: { ...r.row, deleted_at: now }, fields: ['deleted_at'] as (keyof Task & string)[] }
    : { table: 'meal_plan_slot' as const, row: { ...r.row, deleted_at: now }, fields: ['deleted_at'] as (keyof MealPlanSlot & string)[] })))
}
