/** Pure rules for the sync: which rows are "the same" on their natural key,
 *  how a row folded into its twin takes every reference to it along, and how
 *  a table is fetched page by page with a cursor that never skips a row. No
 *  network and no database, so every rule is checked in plain Node
 *  (src/test/sync.check.mjs). The sending and fetching are in sync.ts. */

type Row = Record<string, unknown>

// ---- one row per key ------------------------------------------------------------

/** Tables where one row per key is the rule (one weigh-in a day, one tick per
 *  habit a day, one food per barcode per person). Two devices offline can
 *  each make that row under a different id; when the second one arrives it is
 *  folded into the first rather than refused, so nothing made on the other
 *  phone is lost. */
export const NATURAL_KEYS: Record<string, string[]> = {
  module_instance: ['profile_id', 'module_key'],
  body_log: ['profile_id', 'log_date'],
  target: ['profile_id', 'from_date'],
  habit_log: ['habit_id', 'log_date'],
  supplement_log: ['supplement_id', 'log_date'],
  series_exception: ['series_id', 'exception_date'],
  stock: ['household_id', 'food_id'],
  sleep_log: ['profile_id', 'log_date'],
  // A scanned product: one live food per barcode per person (021).
  food: ['owner_id', 'barcode'],
  // A tick on an item the meal plan put on the list: one per item (026).
  shopping_entry: ['household_id', 'plan_key'],
  chore_log: ['chore_id', 'done_on'],
  // The latest price of one item at one shop (028).
  shop_price: ['household_id', 'shop', 'item_key'],
}

/** Tables whose rule only counts rows that are not deleted: the database's
 *  index for them leaves deleted rows out, so a deleted food never blocks
 *  scanning the same product again. */
export const LIVE_ONLY = new Set(['food', 'shopping_entry', 'shop_price'])

/** The row's natural key as one string, or null when it has none: the table
 *  has no such rule, a part of the key is empty (a food without a barcode),
 *  or the rule leaves deleted rows out and this one is deleted. */
export function naturalKey(table: string, row: Row): string | null {
  const keys = NATURAL_KEYS[table]
  if (!keys) return null
  if (LIVE_ONLY.has(table) && row.deleted_at) return null
  if (keys.some((k) => row[k] === null || row[k] === undefined || row[k] === '')) return null
  return keys.map((k) => String(row[k])).join('|')
}

// ---- ids worked out rather than drawn ---------------------------------------------

/** A name-based id (UUID version 5, RFC 9562): the same name in the same
 *  namespace always gives the same id, on every device, with no server
 *  asked. SHA-1 of the namespace's 16 bytes and the name, cut to 16 bytes,
 *  with the version and variant bits set. */
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const hex = namespace.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('A namespace is a UUID.')
  const ns = Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)))
  const text = new TextEncoder().encode(name)
  const data = new Uint8Array(ns.length + text.length)
  data.set(ns)
  data.set(text, ns.length)
  const b = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ---- following a row to its twin ---------------------------------------------------

/** Where other rows point at a row of this table. When a food is folded into
 *  its twin, the stock, ingredients and food log that pointed at the copy on
 *  this device point at the twin instead. A module's record and the profile's
 *  books can hold a food's id anywhere inside them, so the whole value is
 *  looked through. */
export const REFERENCES: Record<string, { table: string; fields: string[] }[]> = {
  food: [
    { table: 'stock', fields: ['food_id'] },
    { table: 'recipe_line', fields: ['food_id'] },
    { table: 'food_log', fields: ['food_id'] },
    // A planned item's tick keeps the food's id as its plan_key.
    { table: 'shopping_entry', fields: ['food_id', 'plan_key'] },
    { table: 'meal_plan_slot', fields: ['food_id'] },
    // A price's item_key is the food's id itself, so it follows too.
    { table: 'shop_price', fields: ['food_id', 'item_key'] },
    { table: 'module_record', fields: ['data'] },
    { table: 'profile', fields: ['settings'] },
  ],
}

/** The value with every string that is exactly `from` changed to `to`, at
 *  any depth. Ids are unique, so nothing else can match by accident. The
 *  same value comes back (not a copy) when nothing changed. */
export function swapId(v: unknown, from: string, to: string): unknown {
  if (v === from) return to
  if (Array.isArray(v)) {
    const out = v.map((x) => swapId(x, from, to))
    return out.some((x, i) => x !== v[i]) ? out : v
  }
  if (v && typeof v === 'object') {
    let changed = false
    const out: Row = {}
    for (const [k, x] of Object.entries(v as Row)) {
      const y = swapId(x, from, to)
      if (y !== x) changed = true
      out[k] = y
    }
    return changed ? out : v
  }
  return v
}

/** The fields of a row that pointed at `from`, now pointing at `to`; null
 *  when the row did not point at it. */
export function repointRow(row: Row, fields: string[], from: string, to: string): Row | null {
  const changes: Row = {}
  for (const f of fields) {
    const next = swapId(row[f], from, to)
    if (next !== row[f]) changes[f] = next
  }
  return Object.keys(changes).length ? changes : null
}

export interface PendingLike { id?: number; table: string; row_id: string; payload: Row }

/** What to change in the queue when a row of `table` moves from one id to
 *  another: its own waiting edits now go to the new id, and every waiting
 *  edit of a row that points at it carries the new id. Entries in `skip`
 *  (the ones just sent) are left alone. */
export function repointPending(entries: PendingLike[], table: string, from: string, to: string, skip: Set<number> = new Set()):
  { id: number; row_id?: string; payload?: Row }[] {
  const refs = new Map((REFERENCES[table] ?? []).map((r) => [r.table, r.fields]))
  const out: { id: number; row_id?: string; payload?: Row }[] = []
  for (const e of entries) {
    if (e.id === undefined || skip.has(e.id)) continue
    const change: { id: number; row_id?: string; payload?: Row } = { id: e.id }
    if (e.table === table && e.row_id === from) change.row_id = to
    const fields = refs.get(e.table)
    const moved = fields ? repointRow(e.payload, fields, from, to) : null
    if (moved) change.payload = { ...e.payload, ...moved }
    if (change.row_id !== undefined || change.payload) out.push(change)
  }
  return out
}

// ---- fetching page by page ------------------------------------------------------------

/** The server sends at most this many rows per request (PostgREST's limit on
 *  Supabase), so every table is fetched in pages of this size until a page
 *  comes back shorter. */
export const PAGE = 1000

/** Where the last fetch of a table stopped: the newest change it saw, and
 *  that row's key. Many rows can share one updated_at (one statement that
 *  touched a thousand rows gives them all the same time), so the time alone
 *  would skip or repeat rows at a page's edge; with the key as well, the
 *  next page starts exactly after the last row. */
export interface Cursor { at: string; key: string | null }

/** A cursor as stored. Older versions stored the time alone, which still
 *  works: it means "everything after this time". */
export function readCursor(v: unknown): Cursor | null {
  if (typeof v === 'string' && v) return { at: v, key: null }
  if (v && typeof v === 'object') {
    const c = v as Row
    if (typeof c.at === 'string' && c.at) return { at: c.at, key: typeof c.key === 'string' && c.key ? c.key : null }
  }
  return null
}

/** The cursor after a page, from its last row (pages come oldest first, then
 *  by key). No rows, or a last row without a time, leave it where it was. */
export function cursorAfter(rows: Row[], keyCol: string, before: Cursor | null): Cursor | null {
  const last = rows[rows.length - 1]
  if (!last || typeof last.updated_at !== 'string' || !last.updated_at) return before
  return { at: last.updated_at, key: last[keyCol] == null ? null : String(last[keyCol]) }
}

/** A PostgREST value in double quotes, as its filters need for a time
 *  ("2026-09-28T10:11:12.5+00:00" holds dots and colons). */
const quoted = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** The filter for "after this cursor", as PostgREST's or=(...) takes it:
 *  a later time, or the same time and a later key. Null when the cursor has
 *  no key (an old one): then only "a later time" applies. */
export function afterFilter(c: Cursor, keyCol: string): string | null {
  if (c.key === null) return null
  return `updated_at.gt.${quoted(c.at)},and(updated_at.eq.${quoted(c.at)},${keyCol}.gt.${quoted(c.key)})`
}

/** Whether a row comes after the cursor, the way the server orders them:
 *  for checking a page by hand. Times compare as the server writes them. */
export function isAfter(row: Row, c: Cursor | null, keyCol: string): boolean {
  if (!c) return true
  const at = String(row.updated_at ?? '')
  if (at !== c.at) return at > c.at
  return c.key !== null && String(row[keyCol]) > c.key
}

/** One more page is needed only when this one was full. */
export const morePages = (got: number, page = PAGE) => got >= page
