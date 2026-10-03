import { db, setMeta, getMeta } from './db'
import { supabase } from './supabase'
import { useApp } from './store'
import { keepInCatalogue, staleForeign, type SharingRow } from './sharing-rules'
import {
  LIVE_ONLY, NATURAL_KEYS, PAGE, REFERENCES, afterFilter, cursorAfter, morePages, naturalKey, readCursor, repointPending, repointRow,
  type Cursor,
} from './sync-rules'

export { NATURAL_KEYS }

/** Tables the app keeps a full local copy of. Catalogue tables are shared
 *  reference data: pulled, never pushed, except rows a person owns. */
const SYNCED = ['task', 'target', 'body_log', 'food_log', 'meal_plan_slot', 'module_instance', 'series', 'habit', 'supplement',
  'module_record', 'calendar_event', 'goal', 'sleep_log', 'workout_log', 'calendar_subscription',
  // 029: training routines and milestones.
  'routine', 'milestone'] as const
/** Rows that belong to a profile through their parent (a log to its habit).
 *  Row-level security already limits them to the account, so they are fetched
 *  without a profile filter, still incrementally. */
const CHILDREN = ['habit_log', 'supplement_log', 'series_exception', 'stock', 'module', 'shopping_entry', 'chore', 'chore_log',
  // 029: a routine's lines; exercises (the shared catalogue and the person's own, by RLS).
  'routine_line', 'exercise'] as const
/** Foods include, besides the shared catalogue and the person's own, foods a
 *  housemate scanned into the shared cupboard (025): readable, never theirs
 *  to change. */
const CATALOGUE = ['food', 'recipe', 'recipe_line'] as const

type Row = { id: string; updated_at?: string } & Record<string, unknown>
type Syncable = { id: string }
type Store = {
  get: (id: string) => Promise<Row | undefined>
  put: (r: Row) => Promise<unknown>
  delete: (id: string) => Promise<unknown>
  toArray: () => Promise<Row[]>
}

/** Tables whose primary key is not called id. Locally such a row carries an
 *  id equal to its key, so the queue can address it like any other; on the
 *  server the key column is used and the local id is left out. */
const KEY_COLUMN: Record<string, string> = { module: 'key' }
const store = (table: string) => (db as unknown as Record<string, Store>)[table]

/** Record an edit made on this device. The fields list is what makes the merge
 *  field-level: two devices editing different fields of the same row both win. */
export async function queueChange<T extends Syncable>(table: string, row: T, fields: (keyof T & string)[]) {
  // An event from a calendar the person follows stays on this device: every
  // device fetches that calendar itself, so the server never holds a copy of
  // someone's Google Calendar (see calendar-links.ts).
  if (table === 'calendar_event' && (row as { subscription_id?: string | null }).subscription_id) return
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
/** Set when a row was folded into its twin and other rows now point at the
 *  twin: the queue read at the start of this pass is out of date, so the
 *  pass stops and the next one starts from the queue as it is now. */
let replan = false

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
  replan = false
  tables: for (const entries of byTable.values()) {
    for (let i = 0; i < entries.length; i += PARALLEL) {
      const results = await Promise.all(entries.slice(i, i + PARALLEL).map(sendOne))
      sent += results.filter((r) => r === 'sent').length
      orphans += results.filter((r) => r === 'orphan').length
      if (replan) break tables
    }
  }
  // A child whose parent was still on its way is sent again once the parent
  // is there; a child whose parent was folded into its twin (or sent again
  // after an older version dropped it) goes in the next pass, now pointing
  // at a parent the server has.
  if ((orphans > 0 && sent > 0) || replan) again = true
  replan = false
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
        else if (await foldIntoTwin(entry.table, local, patch, entry.ids)) error = null
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
  if (error.code === '23503') {
    if (await resendLostParent(entry)) replan = true
    return 'orphan'
  }
  return 'waiting'
}

/** Tables whose rows point at a food by food_id. */
const FOOD_CHILDREN = new Set(['stock', 'recipe_line', 'food_log', 'shopping_entry', 'meal_plan_slot'])

/** A row that waits for its food, when the food's own insert is no longer in
 *  the queue: an older version refused a scanned food as a duplicate of the
 *  same product scanned on another phone and dropped it, leaving its stock
 *  and ingredients waiting for good. The food is queued once more, whole;
 *  this time the duplicate is folded into its twin and the waiting rows
 *  follow it. Done once per food, so a food refused for another reason is
 *  not sent over and over. */
async function resendLostParent(entry: Entry): Promise<boolean> {
  if (!FOOD_CHILDREN.has(entry.table)) return false
  const child = await store(entry.table)?.get(entry.id)
  const foodId = (child?.food_id ?? entry.patch.food_id) as string | undefined
  const me = useApp.getState().session?.user.id
  if (!foodId || !me) return false
  const food = await db.food.get(foodId) as unknown as Row | undefined
  if (!food || food.owner_id !== me) return false
  if (await db.pending.where('row_id').equals(foodId).count()) return false
  const once = `resent:food:${foodId}`
  if (await getMeta<boolean>(once, false)) return false
  await setMeta(once, true)
  const { id: _id, updated_at: _at, ...fields } = food
  await db.pending.add({
    table: 'food', row_id: foodId, op: 'upsert', payload: fields, fields: Object.keys(fields), changed_at: new Date().toISOString(),
  })
  return true
}

/** The row collided with another on its natural key: the same day's weigh-in
 *  or habit tick, or the same product scanned on two phones, made on another
 *  device under another id. Apply this device's fields to that row, adopt
 *  its id locally, point every row here that pointed at the copy at the twin
 *  instead, and note it where the person can see it when a value really
 *  differed. `sent` are the queue entries this send covers. */
async function foldIntoTwin(table: string, local: Row, patch: Record<string, unknown>, sent: number[]): Promise<boolean> {
  const keys = NATURAL_KEYS[table]
  if (!keys || naturalKey(table, local) === null) return false
  let query = supabase.from(table).select('*')
  for (const k of keys) query = query.eq(k, local[k] as string)
  // A deleted food does not hold its barcode (the index leaves it out).
  if (LIVE_ONLY.has(table)) query = query.is('deleted_at', null)
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
  if (REFERENCES[table]) await repoint(table, local.id, twin.id, sent)
  return true
}

/** Everything on this device that pointed at a row's old id now points at
 *  its new one: waiting edits (so a stock row still to be sent goes with the
 *  twin's id) and the rows themselves. A row that is not waiting to be sent
 *  (a module's record already on the server that mentions the food) is
 *  queued with its changed fields, so the server learns the new id too. */
async function repoint(table: string, from: string, to: string, sent: number[]) {
  const pending = await db.pending.toArray()
  const changes = repointPending(pending, table, from, to, new Set(sent))
  if (changes.length) {
    await db.transaction('rw', db.pending, async () => {
      for (const { id, ...change } of changes) await db.pending.update(id, change)
    })
  }
  // What each row still waiting to be sent will carry: a moved field its
  // waiting edit does not carry is queued on its own, or the next pull would
  // bring the old id back.
  const waiting = new Map<string, Set<string>>()
  for (const p of pending) {
    if (sent.includes(p.id!)) continue
    const key = `${p.table}:${p.row_id}`
    const set = waiting.get(key) ?? new Set<string>()
    for (const f of p.fields ?? Object.keys(p.payload ?? {})) set.add(f)
    waiting.set(key, set)
  }
  const at = new Date().toISOString()
  for (const { table: t, fields } of REFERENCES[table] ?? []) {
    const s = store(t)
    if (!s) continue
    for (const row of await s.toArray()) {
      const moved = repointRow(row, fields, from, to)
      if (!moved) continue
      await s.put({ ...row, ...moved })
      const covered = waiting.get(`${t}:${row.id}`) ?? new Set<string>()
      const missing = Object.keys(moved).filter((f) => !covered.has(f))
      if (missing.length) {
        const payload = Object.fromEntries(missing.map((f) => [f, (moved as Record<string, unknown>)[f]]))
        await db.pending.add({ table: t, row_id: row.id, op: 'upsert', payload, fields: missing, changed_at: at })
      }
    }
  }
  replan = true
}

/** Equal as values: settings and rule objects compare by content. */
const same = (a: unknown, b: unknown) =>
  a === b || (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && JSON.stringify(a) === JSON.stringify(b))

/** Fetch what changed. The cursor per table is where the server's own
 *  updated_at order last stopped, never this device's clock: a phone running
 *  three minutes fast would otherwise skip every row written in those three
 *  minutes. */
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
  const remoteProfiles = (await fetchAll('profile', { incremental: false }))?.rows
  if (remoteProfiles) {
    for (const row of remoteProfiles) {
      // A settings change made here and not yet sent must survive the pull,
      // or the screen would flick back to the old choice until the next one.
      const mine = claimed.get(`profile:${row.id}`)
      const local = mine?.size ? await db.profile.get(row.id) : undefined
      const merged: Row = { ...row }
      if (local && mine) for (const field of mine) merged[field] = (local as unknown as Row)[field]
      await db.profile.put(merged as never)
    }
    profileIds = remoteProfiles.map((p) => p.id)
  }
  if (profileIds.length === 0) return 0

  let count = remoteProfiles?.length ?? 0
  const pullTable = async (table: string): Promise<void> => {
    const scoped = (SYNCED as readonly string[]).includes(table)
    const incremental = scoped || (CHILDREN as readonly string[]).includes(table)
    const cursorKey = `cursor:${table}`
    const cursor = incremental ? readCursor(await getMeta<unknown>(cursorKey, null)) : null

    // Every page, or nothing: a table half fetched is not written, so a
    // dropped connection never looks like rows that have gone.
    const got = await fetchAll(table, { incremental, cursor, profileIds: scoped ? profileIds : undefined })
    if (!got) return
    const fetched = got.rows
    const keyCol = KEY_COLUMN[table]
    let data = keyCol ? fetched.map((r) => ({ ...r, id: String(r[keyCol]) })) : fetched
    if (table === 'recipe') {
      data = await keepRecipes(data, userId)
      serverRecipes = new Set(fetched.map((r) => r.id))
    }
    if (table === 'recipe_line') data = await keepLines(data, serverRecipes, queued)
    // A housemate's food is here while it is in the shared cupboard (025);
    // once the server stops showing it (taken out, or they left), it goes.
    if (table === 'food' && userId) {
      const stale = staleForeign((await db.food.toArray()) as never, new Set(fetched.map((r) => r.id)), userId)
      if (stale.length) await db.food.bulkDelete(stale)
    }
    data = data.filter((r) => !removing.has(`${table}:${r.id}`))

    // Rows this device has no unsent edits to are written in one transaction.
    // One write per row made a fresh phone wait seconds for the 807-food
    // catalogue before the meal plan could show a single recipe.
    const plain: Row[] = []
    const contested: Row[] = []
    for (const remote of data) {
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
    if (incremental && got.cursor && got.cursor !== cursor) await setMeta(cursorKey, got.cursor)
  }

  // Tables are asked for a few at a time rather than one after another: one
  // by one, a sync took seconds on every start. Recipe lines come last, as
  // they are kept only for recipes this device already holds.
  const first = [...SYNCED, ...CHILDREN, ...CATALOGUE].filter((t) => t !== 'recipe_line')
  await inBatches(first, PULL_PARALLEL, pullTable)
  await pullTable('recipe_line')
  return count
}

/** How many tables a pull asks for at once. */
const PULL_PARALLEL = 6

/** Runs `fn` over `items`, at most `size` at a time. */
async function inBatches<T>(items: readonly T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => { while (next < items.length) await fn(items[next++]) }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
}

/** A whole table, or everything in it that changed since the cursor, page
 *  after page. The server answers at most a thousand rows a request (the
 *  807-food catalogue plus a few hundred of one's own foods is more), and a
 *  bare select silently left the rest on the server. Pages come in a fixed
 *  order and each starts exactly after the last row of the one before: by
 *  updated_at and then key for a table fetched by what changed, so rows
 *  sharing one time are neither skipped nor fetched twice; by key alone for
 *  the rest. Null when any page failed. */
async function fetchAll(table: string, opts: { incremental: boolean; cursor?: Cursor | null; profileIds?: string[] }):
  Promise<{ rows: Row[]; cursor: Cursor | null } | null> {
  const keyCol = KEY_COLUMN[table] ?? 'id'
  const rows: Row[] = []
  let cursor = opts.cursor ?? null
  let lastKey: string | null = null
  for (;;) {
    let query = supabase.from(table).select('*')
    if (opts.profileIds) query = query.in('profile_id', opts.profileIds)
    // Built-in modules are defined in the app; only the ones people built sync.
    if (table === 'module') query = query.eq('builtin', false)
    if (opts.incremental && cursor) {
      const after = afterFilter(cursor, keyCol)
      query = after ? query.or(after) : query.gt('updated_at', cursor.at)
    }
    if (!opts.incremental && lastKey !== null) query = query.gt(keyCol, lastKey)
    const ordered = opts.incremental
      ? query.order('updated_at', { ascending: true }).order(keyCol, { ascending: true })
      : query.order(keyCol, { ascending: true })
    const { data, error } = await ordered.limit(PAGE)
    if (error || !data) return null
    const page = data as Row[]
    rows.push(...page)
    if (opts.incremental) cursor = cursorAfter(page, keyCol, cursor)
    else if (page.length) lastKey = String(page[page.length - 1][keyCol])
    if (!morePages(page.length)) return { rows, cursor }
  }
}

/** Recipes this device keeps: the shared list, approved ones and the
 *  person's own. A reviewer is sent proposals too; those stay in the review
 *  queue. Someone else's recipe that the server no longer shows (taken back,
 *  or changed and waiting for review again) is dropped with its lines. The
 *  rows are the whole table (every page), so what is missing is really gone. */
async function keepRecipes(rows: Row[], userId: string | null): Promise<Row[]> {
  // Not knowing who is signed in, nothing is dropped: better a stray row than
  // the person's own recipes gone.
  if (!userId) return rows
  const kept = rows.filter((r) => keepInCatalogue(r as unknown as SharingRow, userId))
  const stale = staleForeign(await db.recipe.toArray(), new Set(kept.map((r) => r.id)), userId)
  if (stale.length) {
    await db.recipe.bulkDelete(stale)
    await db.recipe_line.where('recipe_id').anyOf(stale).delete()
  }
  return kept
}

/** Lines follow their recipe: only lines of recipes this device keeps. A
 *  line the server no longer has, of a recipe it does have, was taken out on
 *  another device and goes here too, unless this device is still sending it. */
async function keepLines(rows: Row[], serverRecipes: Set<string> | null, queued: Set<string>): Promise<Row[]> {
  const known = new Set(await db.recipe.toCollection().primaryKeys())
  const kept = rows.filter((l) => known.has(l.recipe_id as string))
  if (serverRecipes) {
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
