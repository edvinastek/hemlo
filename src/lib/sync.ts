import { db, setMeta, getMeta } from './db'
import { supabase } from './supabase'
import { useApp } from './store'
import { keepInCatalogue, staleForeign, type SharingRow } from './sharing-rules'

/** Tables the app keeps a full local copy of. Catalogue tables are shared
 *  reference data: pulled, never pushed, except rows a person owns. */
const SYNCED = ['task', 'target', 'body_log', 'food_log', 'meal_plan_slot', 'module_instance', 'series', 'habit', 'supplement',
  'module_record', 'calendar_event', 'goal', 'sleep_log', 'workout_log'] as const
/** Rows that belong to a profile through their parent (a log to its habit).
 *  Row-level security already limits them to the account, so they are fetched
 *  without a profile filter, still incrementally. */
const CHILDREN = ['habit_log', 'supplement_log', 'series_exception', 'stock', 'module'] as const
const CATALOGUE = ['food', 'recipe', 'recipe_line'] as const

type Row = { id: string; updated_at?: string } & Record<string, unknown>
type Syncable = { id: string }
type Store = {
  get: (id: string) => Promise<Row | undefined>
  put: (r: Row) => Promise<unknown>
  delete: (id: string) => Promise<unknown>
}

/** Tables where one row per key is the rule (one weigh-in a day, one tick per
 *  habit a day). Two devices offline can each make that row under a different
 *  id; when the second one arrives it is folded into the first rather than
 *  refused, so a tick made on the other phone is never lost. */
export const NATURAL_KEYS: Record<string, string[]> = {
  module_instance: ['profile_id', 'module_key'],
  body_log: ['profile_id', 'log_date'],
  target: ['profile_id', 'from_date'],
  habit_log: ['habit_id', 'log_date'],
  supplement_log: ['supplement_id', 'log_date'],
  series_exception: ['series_id', 'exception_date'],
  stock: ['household_id', 'food_id'],
  sleep_log: ['profile_id', 'log_date'],
}

/** Tables whose primary key is not called id. Locally such a row carries an
 *  id equal to its key, so the queue can address it like any other; on the
 *  server the key column is used and the local id is left out. */
const KEY_COLUMN: Record<string, string> = { module: 'key' }
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

/** Record that a row was removed on this device. Only used where a row has
 *  no deleted_at to mark instead: an ingredient taken out of a recipe. */
export async function queueRemoval(table: string, id: string) {
  await db.pending.add({ table, row_id: id, op: 'delete', payload: {}, fields: [], changed_at: new Date().toISOString() })
  if (navigator.onLine) void push()
}

/** Postgres refused it for a reason retrying will not change.
 *  A missing parent (23503) is not one of them: the parent's own insert may
 *  simply not have landed yet, so the child waits in the queue and tries again. */
function isPermanent(code: string | undefined): boolean {
  return code === '42501' || code === '23505' || code === '23514' || code === '22P02'
}

// One push at a time. Every edit starts a push, so a burst of edits used to
// start a burst of pushes that each sent the same new rows; the second insert
// of a row the first had just created was refused as a duplicate and logged
// as a conflict that never happened. Now a push that arrives while one is
// running only asks for one more pass when it ends.
let inflight: Promise<number> | null = null
let again = false

export function push(): Promise<number> {
  if (inflight) { again = true; return inflight }
  inflight = (async () => {
    let sent = 0
    do {
      again = false
      sent += await pushOnce()
    } while (again)
    return sent
  })().finally(() => { inflight = null })
  return inflight
}

/** Send everything waiting. Runs on reconnect and after each edit.
 *
 *  An edit is sent as an update of just the fields that changed. If no row came
 *  back, the row does not exist on the server yet — it was created on this
 *  device while offline — so the whole local row is inserted instead. Before
 *  this, new rows were "sent" as updates that matched nothing, counted as a
 *  success, and silently dropped. */
async function pushOnce(): Promise<number> {
  const pending = await db.pending.toArray()
  if (pending.length === 0) return 0

  const byRow = new Map<string, Entry>()
  for (const p of pending) {
    const key = `${p.table}:${p.row_id}`
    const entry = byRow.get(key) ?? { table: p.table, id: p.row_id, patch: {}, ids: [], remove: false }
    Object.assign(entry.patch, p.payload)
    // The last word wins: a removal after edits removes the row.
    entry.remove = p.op === 'delete'
    entry.ids.push(p.id!)
    byRow.set(key, entry)
  }

  // Tables go in the order their first edit was made, so a parent (a series,
  // a habit) reaches the server before the rows that point at it. Rows of one
  // table go several at a time: a new repeating task lays out a dozen days,
  // and sending them one by one kept every later edit waiting behind them.
  const byTable = new Map<string, Entry[]>()
  for (const entry of byRow.values()) {
    const list = byTable.get(entry.table) ?? []
    list.push(entry)
    byTable.set(entry.table, list)
  }
  let sent = 0
  let orphans = 0
  for (const entries of byTable.values()) {
    for (let i = 0; i < entries.length; i += PARALLEL) {
      const results = await Promise.all(entries.slice(i, i + PARALLEL).map(sendOne))
      sent += results.filter((r) => r === 'sent').length
      orphans += results.filter((r) => r === 'orphan').length
    }
  }
  // A child whose parent was still on its way is sent again once the parent is there.
  if (orphans > 0 && sent > 0) again = true
  return sent
}

type Entry = { table: string; id: string; patch: Record<string, unknown>; ids: number[]; remove: boolean }
const PARALLEL = 6

async function sendOne(entry: Entry): Promise<'sent' | 'refused' | 'orphan' | 'waiting'> {
  const keyCol = KEY_COLUMN[entry.table] ?? 'id'
  if (entry.remove) {
    // Gone already (never sent, or removed from another device) is success too.
    const { error } = await supabase.from(entry.table).delete().eq(keyCol, entry.id)
    if (!error) { await db.pending.bulkDelete(entry.ids); return 'sent' }
    if (isPermanent(error.code)) {
      await db.conflicts.add({
        table: entry.table, row_id: entry.id, field: 'removed', local_value: null,
        remote_value: error.message, kept: 'rejected', at: new Date().toISOString(),
      })
      await db.pending.bulkDelete(entry.ids)
      return 'refused'
    }
    return 'waiting'
  }
  const { updated_at: _ignored, ...patch } = entry.patch
  if (keyCol !== 'id') delete patch.id
  const updated = await supabase.from(entry.table).update(patch).eq(keyCol, entry.id).select(keyCol)

  let error = updated.error
  if (!error && (updated.data?.length ?? 0) === 0) {
    const local = await store(entry.table)?.get(entry.id)
    if (local) {
      const { updated_at: _u, ...row } = local
      if (keyCol !== 'id') delete (row as Record<string, unknown>).id
      error = (await supabase.from(entry.table).insert(row)).error
      if (error?.code === '23505') {
        // Already there under this id (it landed between the two calls):
        // that is success, so send the patch once more and move on. A
        // duplicate on its natural key (the same day's tick made on another
        // phone) is folded into that row. Anything else is refused.
        const retry = await supabase.from(entry.table).update(patch).eq(keyCol, entry.id).select(keyCol)
        if (!retry.error && (retry.data?.length ?? 0) > 0) error = null
        else if (await foldIntoTwin(entry.table, local, patch)) error = null
      }
    }
  }

  if (!error) {
    await db.pending.bulkDelete(entry.ids)
    return 'sent'
  }
  if (isPermanent(error.code)) {
    // Kept where the person can read it, rather than retried forever or lost.
    await db.conflicts.add({
      table: entry.table, row_id: entry.id, field: Object.keys(patch).join(', '),
      local_value: patch, remote_value: error.message, kept: 'rejected', at: new Date().toISOString(),
    })
    await db.pending.bulkDelete(entry.ids)
    return 'refused'
  }
  // A missing parent, no connection, a timeout: stays queued for the next attempt.
  return error.code === '23503' ? 'orphan' : 'waiting'
}

/** The row collided with another on its natural key: the same day's weigh-in
 *  or habit tick, made on another device under another id. Apply this
 *  device's fields to that row, adopt its id locally, and note it where the
 *  person can see it when a value really differed. */
async function foldIntoTwin(table: string, local: Row, patch: Record<string, unknown>): Promise<boolean> {
  const keys = NATURAL_KEYS[table]
  if (!keys || keys.some((k) => local[k] == null)) return false
  let query = supabase.from(table).select('*')
  for (const k of keys) query = query.eq(k, local[k] as string)
  const { data: twin, error } = await query.maybeSingle()
  if (error || !twin || twin.id === local.id) return false

  const { id: _id, ...fields } = patch
  const merged = await supabase.from(table).update(fields).eq('id', twin.id).select('*')
  const row = merged.data?.[0] as Row | undefined
  if (merged.error || !row) return false

  const differed = Object.keys(fields).filter((f) => f !== 'updated_at' && !keys.includes(f) && String(twin[f]) !== String(fields[f]))
  // A module switch made on a new phone before its first pull finished meets
  // the server's own row for that module: that is the expected path, not a
  // clash worth showing the person.
  if (differed.length && table !== 'module_instance') {
    await db.conflicts.add({
      table, row_id: twin.id, field: differed.join(', '),
      local_value: Object.fromEntries(differed.map((f) => [f, fields[f]])),
      remote_value: Object.fromEntries(differed.map((f) => [f, twin[f]])),
      kept: 'local', at: new Date().toISOString(),
    })
  }
  await store(table).delete(local.id)
  await store(table).put(row)
  return true
}

/** Equal as values: settings and rule objects compare by content. */
const same = (a: unknown, b: unknown) =>
  a === b || (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && JSON.stringify(a) === JSON.stringify(b))

/** Fetch what changed. The cursor per table is the newest updated_at the
 *  server has sent, never this device's clock: a phone running three minutes
 *  fast would otherwise skip every row written in those three minutes. */
export async function pull(ids: string[]): Promise<number> {
  let profileIds = ids
  const pending = await db.pending.toArray()
  const claimed = new Map<string, Set<string>>()
  // Rows this device is still sending in any form, and rows it is removing:
  // a removal not yet sent must not be undone by the pull.
  const queued = new Set(pending.map((p) => `${p.table}:${p.row_id}`))
  const removing = new Set(pending.filter((p) => p.op === 'delete').map((p) => `${p.table}:${p.row_id}`))
  const userId = useApp.getState().session?.user.id ?? null
  let serverRecipes: Set<string> | null = null
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
    for (const row of remoteProfiles as Row[]) {
      // A settings change made here and not yet sent must survive the pull,
      // or the screen would flick back to the old choice until the next one.
      const mine = claimed.get(`profile:${row.id}`)
      const local = mine?.size ? await db.profile.get(row.id) : undefined
      const merged: Row = { ...row }
      if (local && mine) for (const field of mine) merged[field] = (local as unknown as Row)[field]
      await db.profile.put(merged as never)
    }
    profileIds = (remoteProfiles as Row[]).map((p) => p.id)
  }
  if (profileIds.length === 0) return 0

  let count = remoteProfiles?.length ?? 0
  for (const table of [...SYNCED, ...CHILDREN, ...CATALOGUE]) {
    const scoped = (SYNCED as readonly string[]).includes(table)
    const incremental = scoped || (CHILDREN as readonly string[]).includes(table)
    const cursorKey = `cursor:${table}`
    const cursor = incremental ? await getMeta<string | null>(cursorKey, null) : null

    let query = supabase.from(table).select('*')
    if (scoped) query = query.in('profile_id', profileIds)
    // Built-in modules are defined in the app; only the ones people built sync.
    if (table === 'module') query = query.eq('builtin', false)
    if (cursor) query = query.gt('updated_at', cursor)
    const { data: fetched, error } = await query
    if (error || !fetched) continue
    const keyCol = KEY_COLUMN[table]
    let data = (keyCol ? (fetched as Row[]).map((r) => ({ ...r, id: String(r[keyCol]) })) : fetched) as Row[]
    if (table === 'recipe') {
      data = await keepRecipes(data, userId)
      if (fetched.length < WHOLE_BELOW) serverRecipes = new Set((fetched as Row[]).map((r) => r.id))
    }
    if (table === 'recipe_line') data = await keepLines(data, serverRecipes, queued)
    data = data.filter((r) => !removing.has(`${table}:${r.id}`))

    let newest = cursor
    // Rows this device has no unsent edits to are written in one transaction.
    // One write per row made a fresh phone wait seconds for the 807-food
    // catalogue before the meal plan could show a single recipe.
    const plain: Row[] = []
    const contested: Row[] = []
    for (const remote of data as Row[]) {
      if (remote.updated_at && (!newest || remote.updated_at > newest)) newest = remote.updated_at
      const mine = claimed.get(`${table}:${remote.id}`)
      ;(mine && mine.size > 0 ? contested : plain).push(remote)
    }
    if (plain.length) {
      await (db as unknown as Record<string, { bulkPut: (r: Row[]) => Promise<unknown> }>)[table].bulkPut(plain)
      count += plain.length
    }
    for (const remote of contested) {
      const mine = claimed.get(`${table}:${remote.id}`)!
      // This device has unsent edits to the row: its fields win, and any field
      // that also changed on the server is written down rather than decided silently.
      const local = await store(table).get(remote.id)
      const merged: Row = { ...remote }
      for (const field of mine) {
        if (local && !same(local[field], remote[field])) {
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

/** The server sends at most this many rows per request; a shorter answer is
 *  the whole table, so it is safe to drop what it no longer holds. */
const WHOLE_BELOW = 1000

/** Recipes this device keeps: the shared list, approved ones and the
 *  person's own. A reviewer is sent proposals too; those stay in the review
 *  queue. Someone else's recipe that the server no longer shows (taken back,
 *  or changed and waiting for review again) is dropped with its lines. */
async function keepRecipes(rows: Row[], userId: string | null): Promise<Row[]> {
  // Not knowing who is signed in, nothing is dropped: better a stray row than
  // the person's own recipes gone.
  if (!userId) return rows
  const kept = rows.filter((r) => keepInCatalogue(r as unknown as SharingRow, userId))
  if (rows.length < WHOLE_BELOW) {
    const stale = staleForeign(await db.recipe.toArray(), new Set(kept.map((r) => r.id)), userId)
    if (stale.length) {
      await db.recipe.bulkDelete(stale)
      await db.recipe_line.where('recipe_id').anyOf(stale).delete()
    }
  }
  return kept
}

/** Lines follow their recipe: only lines of recipes this device keeps. A
 *  line the server no longer has, of a recipe it does have, was taken out on
 *  another device and goes here too, unless this device is still sending it. */
async function keepLines(rows: Row[], serverRecipes: Set<string> | null, queued: Set<string>): Promise<Row[]> {
  const known = new Set(await db.recipe.toCollection().primaryKeys())
  const kept = rows.filter((l) => known.has(l.recipe_id as string))
  if (serverRecipes && rows.length < WHOLE_BELOW) {
    const onServer = new Set(rows.map((l) => l.id))
    const gone = (await db.recipe_line.toArray())
      .filter((l) => !onServer.has(l.id) && serverRecipes.has(l.recipe_id) && !queued.has(`recipe_line:${l.id}`))
      .map((l) => l.id)
    if (gone.length) await db.recipe_line.bulkDelete(gone)
  }
  return kept
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
