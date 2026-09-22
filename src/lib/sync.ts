import { db, setMeta, getMeta } from './db'
import { supabase } from './supabase'
import { useApp } from './store'

/** Tables the app keeps a full local copy of. Catalogue tables (food, recipe,
 *  recipe_line) are shared read-only reference data: pulled, never pushed. */
const SYNCED = ['profile', 'task', 'target', 'body_log', 'food_log', 'meal_plan_slot', 'module_instance'] as const
const CATALOGUE = ['food', 'recipe', 'recipe_line'] as const

type Row = { id: string; updated_at?: string } & Record<string, unknown>
type Syncable = { id: string }

/** Record an edit made on this device. The fields list is what makes the merge
 *  field-level: two devices editing different fields of the same row both win. */
export async function queueChange<T extends Syncable>(table: string, row: T, fields: (keyof T & string)[]) {
  await db.pending.add({
    table,
    row_id: row.id,
    op: 'upsert',
    payload: Object.fromEntries(fields.map((f) => [f, row[f]])) as Record<string, unknown>,
    fields,
    changed_at: new Date().toISOString(),
  })
  if (navigator.onLine) void push()
}

/** Send everything waiting. Runs on reconnect and after each edit. */
export async function push(): Promise<number> {
  const pending = await db.pending.toArray()
  if (pending.length === 0) return 0

  // Collapse several edits to the same row into one write.
  const byRow = new Map<string, { table: string; id: string; patch: Record<string, unknown>; fields: Set<string>; ids: number[] }>()
  for (const p of pending) {
    const key = `${p.table}:${p.row_id}`
    const entry = byRow.get(key) ?? { table: p.table, id: p.row_id, patch: {}, fields: new Set<string>(), ids: [] }
    Object.assign(entry.patch, p.payload)
    p.fields.forEach((f) => entry.fields.add(f))
    entry.ids.push(p.id!)
    byRow.set(key, entry)
  }

  let sent = 0
  for (const entry of byRow.values()) {
    const { error } = await supabase
      .from(entry.table)
      .update({ ...entry.patch, updated_at: new Date().toISOString() })
      .eq('id', entry.id)
    if (error) continue            // stays queued; retried on the next attempt
    await db.pending.bulkDelete(entry.ids)
    sent++
  }
  return sent
}

/** Fetch the account's rows. Anything this device has queued wins for the
 *  fields it touched; a field changed on both sides is resolved in favour of
 *  the local edit and written to the conflict log, which the user can read. */
export async function pull(ids: string[]): Promise<number> {
  let profileIds = ids
  const since = await getMeta<string>('last_pull', '1970-01-01T00:00:00Z')
  const pending = await db.pending.toArray()
  const claimed = new Map<string, Set<string>>()
  for (const p of pending) {
    const key = `${p.table}:${p.row_id}`
    const set = claimed.get(key) ?? new Set<string>()
    p.fields.forEach((f) => set.add(f))
    claimed.set(key, set)
  }

  // Profiles come first: on a fresh device there are none locally yet, and
  // every other table is filtered by profile id. Pulling them in the same
  // loop would ask for "rows belonging to no profile" and get nothing back.
  const { data: remoteProfiles } = await supabase.from('profile').select('*')
  if (remoteProfiles) {
    for (const row of remoteProfiles as Row[]) await db.profile.put(row as never)
    profileIds = (remoteProfiles as Row[]).map((p) => p.id)
  }

  let count = remoteProfiles?.length ?? 0
  for (const table of [...SYNCED, ...CATALOGUE]) {
    if (table === 'profile') continue
    let query = supabase.from(table).select('*')
    if ((SYNCED as readonly string[]).includes(table)) {
      query = query.in('profile_id', profileIds)
    }
    if ((SYNCED as readonly string[]).includes(table)) {
      query = query.gt('updated_at', since)
    }
    const { data, error } = await query
    if (error || !data) continue

    const store = (db as unknown as Record<string, { get: (id: string) => Promise<Row | undefined>; put: (r: Row) => Promise<unknown> }>)[table]
    for (const remote of data as Row[]) {
      const key = `${table}:${remote.id}`
      const mine = claimed.get(key)
      if (!mine || mine.size === 0) {
        await store.put(remote)
        count++
        continue
      }
      const local = await store.get(remote.id)
      const merged: Row = { ...remote }
      for (const field of mine) {
        if (local && local[field] !== remote[field]) {
          await db.conflicts.add({
            table, row_id: remote.id, field,
            local_value: local[field], remote_value: remote[field],
            kept: 'local', at: new Date().toISOString(),
          })
        }
        if (local) merged[field] = local[field]
      }
      await store.put(merged)
      count++
    }
  }
  await setMeta('last_pull', new Date().toISOString())
  return count
}

/** One round trip: send what is waiting, then take what is new. */
export async function sync(profileIds: string[]) {
  if (!navigator.onLine) return
  const { setSync } = useApp.getState()
  setSync(true)
  try {
    await push()
    await pull(profileIds)
    setSync(false, new Date().toISOString())
  } catch {
    setSync(false)
  }
}

export function watchConnection(profileIds: () => string[]) {
  const go = () => {
    useApp.getState().setOnline(navigator.onLine)
    if (navigator.onLine) void sync(profileIds())
  }
  window.addEventListener('online', go)
  window.addEventListener('offline', go)
  return () => {
    window.removeEventListener('online', go)
    window.removeEventListener('offline', go)
  }
}
