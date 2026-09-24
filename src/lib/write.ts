import { db } from './db'
import { queueChange } from './sync'

/** One path for every change: write locally so the screen updates at once,
 *  then queue it for the server. Nothing in the app writes to Supabase
 *  directly, which is what makes offline the normal case rather than a mode. */
export async function edit<T extends { id: string; updated_at?: string }>(
  table: 'task' | 'target' | 'body_log' | 'food_log' | 'profile' | 'module_instance' | 'food' | 'recipe'
    | 'series' | 'series_exception' | 'habit' | 'habit_log' | 'supplement' | 'supplement_log' | 'recipe_line',
  row: T,
  changes: Partial<T>,
): Promise<T> {
  const next = { ...row, ...changes, updated_at: new Date().toISOString() } as T
  await (db as never as Record<string, { put: (r: T) => Promise<unknown> }>)[table].put(next)
  await queueChange(table, next, Object.keys(changes) as (keyof T & string)[])
  return next
}
