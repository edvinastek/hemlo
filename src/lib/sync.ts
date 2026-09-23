import { db, setMeta, getMeta } from './db'
import { supabase } from './supabase'
import { useApp } from './store'

/** Tables the app keeps a full local copy of. Catalogue tables are shared
 *  reference data: pulled, never pushed, except rows a person owns. */
const SYNCED = ['task', 'target', 'body_log', 'food_log', 'meal_plan_slot', 'module_instance'] as const
const CATALOGUE = ['food', 'recipe', 'recipe_line'] as const

type Row = { id: string; updated_at?: string } & Record<string, unknown>
type Syncable = { id: string }
type Store = {
  get: (id: string) => Promise<Row | undefined>
  put: (r: Row) => Promise<unknown>
}
const store = (table: string) => (db as unknown as Record<string, Store>)[table]

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

/** Postgres refused it for a reason retrying will not change. */
function isPermanent(code: string | undefined): boolean {
  return code === '42501' || code === '23503' || code === '23505' || code === '23514' || code === '22P02'
}

/** Send everything waiting. Runs on reconnect and after each edit.
 *
 *  An edit is sent as an update of just the fields that changed. If no row came
 *  back, the row does not exist on the server yet — it was created on this
 *  device while offline — so the whole local row is inserted instead. Before
 *  this, new rows were "sent" as updates that matched nothing, counted as a
 *  success, and silently dropped. */
export async function push(): Promise<number> {
  const pending = await db.pending.toArray()
  if (pending.length === 0) return 0

  const byRow = new Map<string, { table: string; id: string; patch: Record<string, unknown>; ids: number[] }>()
  for (const p of pending) {
    const key = `${p.table}:${p.row_id}`
    const entry = byRow.get(key) ?? { table: p.table, id: p.row_id, patch: {}, ids: [] }
    Object.assign(entry.patch, p.payload)
    entry.ids.push(p.id!)
    byRow.set(key, entry)
  }

  let sent = 0
  for (const entry of byRow.values()) {
    const { updated_at: _ignored, ...patch } = entry.patch
    const updated = await supabase.from(entry.table).update(patch).eq('id', entry.id).select('id')

    let error = updated.error
    if (!error && (updated.data?.length ?? 0) === 0) {
      const local = await store(entry.table)?.get(entry.id)
      if (local) {
        const { updated_at: _u, ...row } = local
        error = (await supabase.from(entry.table).insert(row)).error
      }
    }

    if (!error) {
      await db.pending.bulkDelete(entry.ids)
      sent++
      continue
    }
    if (isPermanent(error.code)) {
      // Kept where the person can read it, rather than retried forever or lost.
      await db.conflicts.add({
        table: entry.table, row_id: entry.id, field: Object.keys(patch).join(', '),
        local_value: patch, remote_value: error.message, kept: 'rejected', at: new Date().toISOString(),
      })
      await db.pending.bulkDelete(entry.ids)
    }
    // Anything else (no connection, a timeout) stays queued for the next attempt.
  }
  return sent
}

/** Fetch what changed. The cursor per table is the newest updated_at the
 *  server has sent, never this device's clock: a phone running three minutes
 *  fast would otherwise skip every row written in those three minutes. */
export async function pull(ids: string[]): Promise<number> {
  let profileIds = ids
  const pending = await db.pending.toArray()
  const claimed = new Map<string, Set<string>>()
  for (const p of pending) {
    const key = `${p.table}:${p.row_id}`
    const set = claimed.get(key) ?? new Set<string>()
    p.fields.forEach((f) => set.add(f))
    claimed.set(key, set)
  }

  // Profiles first: on a fresh device there are none locally yet, and every
  // other table is filtered by profile id.
  const { data: remoteProfiles } = await supabase.from('profile').select('*')
  if (remoteProfiles) {
    for (const row of remoteProfiles as Row[]) await db.profile.put(row as never)
    profileIds = (remoteProfiles as Row[]).map((p) => p.id)
  }
  if (profileIds.length === 0) return 0

  let count = remoteProfiles?.length ?? 0
  for (const table of [...SYNCED, ...CATALOGUE]) {
    const incremental = (SYNCED as readonly string[]).includes(table)
    const cursorKey = `cursor:${table}`
    const cursor = incremental ? await getMeta<string | null>(cursorKey, null) : null

    let query = supabase.from(table).select('*')
    if (incremental) query = query.in('profile_id', profileIds)
    if (cursor) query = query.gt('updated_at', cursor)
    const { data, error } = await query
    if (error || !data) continue

    let newest = cursor
    for (const remote of data as Row[]) {
      if (remote.updated_at && (!newest || remote.updated_at > newest)) newest = remote.updated_at
      const mine = claimed.get(`${table}:${remote.id}`)
      if (!mine || mine.size === 0) {
        await store(table).put(remote)
        count++
        continue
      }
      // This device has unsent edits to the row: its fields win, and any field
      // that also changed on the server is written down rather than decided silently.
      const local = await store(table).get(remote.id)
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
      await store(table).put(merged)
      count++
    }
    if (incremental && newest) await setMeta(cursorKey, newest)
  }
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
