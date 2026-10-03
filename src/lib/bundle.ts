import { db } from './db'
import { queueChange } from './sync'
import { NATURAL_KEYS, naturalKey } from './sync-rules'
import { withoutReview } from './sharing-rules'
import { readUnits } from './units-rules'
import { productFoodId } from './products-rules'
import { productSalt } from './products'
import { useApp } from './store'
import { restoredProfile } from './restore-rules'

/** One file that holds everything: profile, plan, logs, recipes and settings.
 *  It is the backup, how a device hands its state to another one, and the
 *  copy a person is entitled to under GDPR articles 15 and 20 — so every table
 *  that holds their data must be listed here. */
const TABLES = [
  'profile', 'task', 'target', 'body_log', 'food_log', 'meal_plan_slot', 'module_instance',
  'series', 'habit', 'supplement',
  'module_record', 'calendar_event', 'goal', 'sleep_log', 'workout_log', 'calendar_subscription',
  // 029: training routines, milestones.
  'routine', 'milestone',
] as const

/** Rows that belong to the profile through a parent row rather than directly. */
const CHILDREN = [
  { table: 'series_exception', parent: 'series', key: 'series_id' },
  { table: 'habit_log', parent: 'habit', key: 'habit_id' },
  { table: 'supplement_log', parent: 'supplement', key: 'supplement_id' },
  { table: 'routine_line', parent: 'routine', key: 'routine_id' },
] as const

export interface Bundle {
  format: 'getit.bundle'
  version: 1
  exported_at: string
  profile_id: string
  records: Record<string, unknown[]>
}

export async function exportBundle(profileId: string): Promise<Blob> {
  const records: Record<string, unknown[]> = {}
  for (const table of TABLES) {
    const rows = await (db as never as Record<string, { toArray: () => Promise<Record<string, unknown>[]> }>)[table].toArray()
    records[table] = table === 'profile' ? rows : rows.filter((r) => r.profile_id === profileId)
  }
  // Events from a calendar the person follows are that calendar's, not
  // GetIt's: the calendar (its address) is in the file, and its events are
  // fetched again wherever the file is read back in.
  records.calendar_event = records.calendar_event.filter((r) => !(r as { subscription_id?: string | null }).subscription_id)
  for (const { table, parent, key } of CHILDREN) {
    const parents = new Set((records[parent] as { id: string }[]).map((p) => p.id))
    const rows = await (db as never as Record<string, { toArray: () => Promise<Record<string, unknown>[]> }>)[table].toArray()
    records[table] = rows.filter((r) => parents.has(r[key] as string))
  }
  // Foods and recipes a person added travel with them; the shared catalogue
  // does not, because every account already has it. Nor do other people's:
  // a recipe someone shared with everyone, or a food a housemate scanned into
  // the shared cupboard, is theirs, and reading the file back in would
  // otherwise make it the reader's.
  const me = useApp.getState().session?.user.id ?? (await db.profile.get(profileId))?.user_id ?? null
  const own = (r: { owner_id: string | null }) => !!r.owner_id && (!me || r.owner_id === me)
  records.food = (await db.food.toArray()).filter(own)
  // Exercises a person added travel like their foods (029).
  records.exercise = (await db.exercise.toArray()).filter(own)
  const recipes = (await db.recipe.toArray()).filter(own)
  records.recipe = recipes
  records.recipe_line = (await db.recipe_line.toArray())
    .filter((l) => recipes.some((r) => r.id === l.recipe_id))
  // The cupboard belongs to the household, not the profile: it goes with
  // whoever exports, as what their household had when they did.
  // Modules the person built travel with their records, so an import can
  // rebuild them; built-in modules are part of the app.
  records.module = (await db.module.toArray()).filter((m) => !m.builtin && !m.deleted_at)
  const household = (await db.profile.get(profileId))?.household_id
  records.stock = household ? await db.stock.where('household_id').equals(household).toArray() : []
  // The shopping list and the prices noted are the household's too: the
  // items on it, what was bought (the recently bought tiles) and the prices.
  records.shopping_entry = household ? await db.shopping_entry.where('household_id').equals(household).toArray() : []
  records.shop_price = household ? (await db.shop_price.where('household_id').equals(household).toArray()).filter((r) => !r.deleted_at) : []

  const bundle: Bundle = {
    format: 'getit.bundle',
    version: 1,
    exported_at: new Date().toISOString(),
    profile_id: profileId,
    records,
  }
  return new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' })
}

/** The new id a row gets when a file is read into another profile. A
 *  scanned product gets the id this person's food for it always has, so it
 *  meets the same product scanned on this account (on any device) as one
 *  row. A module's id is its key, which keeps the u_ form the server asks for. */
async function freshId(table: string, r: Row, userId: string): Promise<string> {
  if (table === 'module') return `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
  if (table === 'food' && !r.deleted_at) {
    const salt = await productSalt().catch(() => null)
    const id = salt ? await productFoodId(userId, r.barcode as string | null, salt).catch(() => null) : null
    if (id) return id
  }
  return crypto.randomUUID()
}


type Row = { id: string } & Record<string, unknown>
type Table = { get: (id: string) => Promise<Row | undefined>; put: (r: Row) => Promise<unknown>; toArray: () => Promise<Row[]> }
const table = (name: string) => (db as never as Record<string, Table | undefined>)[name]

/** Reads an export back into the profile that is open now, and sends it to the
 *  server like any other edit, so it reaches every device and survives a
 *  sign-out. A file from another account or another profile is adopted by this
 *  one: rows keep their ids, but hang off this profile and this account. A row
 *  that is one-per-day (a weigh-in, a habit tick) and already exists here is
 *  updated rather than duplicated. */
export async function importBundle(file: File, profileId: string, userId: string): Promise<{ imported: number; name: string }> {
  const text = await file.text()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch {
    throw new Error('That file is not a GetIt export.')
  }
  const bundle = parsed as Bundle
  if (bundle?.format !== 'getit.bundle' || typeof bundle.records !== 'object' || !bundle.records) {
    throw new Error('That file is not a GetIt export.')
  }
  if (bundle.version !== 1) throw new Error('That export comes from a newer GetIt. Update the app, then import it again.')

  const rows = (name: string) => {
    const r = bundle.records[name]
    return Array.isArray(r) ? (r.filter((x) => x && typeof x === 'object' && typeof (x as Row).id === 'string') as Row[]) : []
  }
  let imported = 0

  // Read back into the profile it came from, rows keep their ids, so a restore
  // updates what is still there instead of doubling it. Read into any other
  // profile, every row gets a new id (and every reference to it follows), so
  // the copy can never collide with the original in someone else's account.
  const adopting = bundle.profile_id !== profileId
  const fresh = new Map<string, string>()
  if (adopting) {
    for (const [name, list] of Object.entries(bundle.records)) {
      if (name === 'profile' || !Array.isArray(list)) continue
      for (const r of rows(name)) fresh.set(r.id, await freshId(name, r, userId))
    }
  }
  const remap = (v: unknown): unknown => {
    if (typeof v === 'string') return fresh.get(v) ?? v
    if (Array.isArray(v)) return v.map(remap)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]))
    return v
  }

  // The profile: its details, settings, country and city, onto the profile
  // that is open (SET-06, DATA-06; restore-rules.ts).
  const source = rows('profile').find((r) => r.id === bundle.profile_id) ?? rows('profile')[0]
  const current = await db.profile.get(profileId)
  if (source && current) {
    const changes = restoredProfile(source, current, remap)
    const next = { ...current, ...changes }
    await db.profile.put(next as never)
    await queueChange('profile', next, Object.keys(changes) as (keyof typeof next & string)[])
    imported++
  }

  /** Where a row of this table already exists here under its natural key.
   *  Rows without one (a food with no barcode, a deleted food) have no twin. */
  const twins = async (name: string) => {
    if (!NATURAL_KEYS[name]) return null
    const map = new Map<string, string>()
    for (const r of await table(name)!.toArray()) {
      const key = naturalKey(name, r)
      if (key !== null) map.set(key, r.id)
    }
    return (r: Row) => {
      const key = naturalKey(name, r)
      return key === null ? undefined : map.get(key)
    }
  }

  const put = async (name: string, incoming: Row, adopt: Partial<Row>) => {
    const store = table(name)
    if (!store) return
    const row: Row = { ...(remap(incoming) as Row), ...adopt }
    delete row.updated_at
    const find = await twins(name)
    const twin = find?.(row)
    if (twin && twin !== row.id) {
      row.id = twin
      // Rows further down the file that point at this one (stock at a food,
      // an ingredient at it) follow it to the row that is already here.
      fresh.set(incoming.id, twin)
    }
    const existing = await store.get(row.id)
    const merged = { ...(existing ?? {}), ...row } as Row
    await store.put(merged)
    await queueChange(name, merged, Object.keys(row).filter((k) => k !== 'id'))
    imported++
  }

  // Parents before the rows that point at them, so the server sees them first:
  // recipes before the meal plan, series before their tasks, habits before ticks.
  // A food's units are read strictly, so a hand-edited file cannot carry
  // ones the database would refuse.
  for (const r of rows('food')) await put('food', r, { owner_id: userId, ...('units' in r ? { units: readUnits(r.units) } : {}) })
  // A recipe's review is the server's to say: a backup never carries one, so
  // a recipe read back in keeps its place, or starts private if it is new.
  for (const r of rows('recipe')) await put('recipe', withoutReview(r), { owner_id: userId })
  for (const r of rows('recipe_line')) await put('recipe_line', r, {})
  for (const r of rows('exercise')) await put('exercise', r, { owner_id: userId })
  // Stock joins this household's cupboard. A food already in it is updated
  // rather than doubled (NATURAL_KEYS.stock), so reading the same file twice
  // leaves the same amounts. Rows removed before the export are left out: on
  // the shared key they would remove what this household has now.
  if (current) {
    for (const r of rows('stock').filter((x) => !x.deleted_at)) await put('stock', r, { household_id: current.household_id })
    // The list joins this household's list the same way: a planned item's
    // tick is one per food (NATURAL_KEYS.shopping_entry), a price one per
    // item per shop. Removed items come along only as things bought, for
    // the recently bought tiles; anything else removed is left out.
    for (const r of rows('shopping_entry').filter((x) => !x.deleted_at || x.bought_at)) {
      await put('shopping_entry', r, { household_id: current.household_id, added_by: profileId })
    }
    for (const r of rows('shop_price').filter((x) => !x.deleted_at)) {
      await put('shop_price', r, { household_id: current.household_id, added_by: profileId })
    }
  }
  // Built modules before their switches and records point at them.
  for (const r of rows('module')) await put('module', r, { created_by: userId, builtin: false })
  const order = ['series', 'habit', 'supplement', 'module_instance', 'goal', 'routine', 'calendar_subscription', 'calendar_event', 'sleep_log', 'workout_log',
    'module_record', 'milestone', 'target', 'body_log', 'task', 'food_log', 'meal_plan_slot']
  for (const name of order) {
    for (const r of rows(name)) await put(name, r, { profile_id: profileId })
  }
  for (const { table: name } of CHILDREN) {
    for (const r of rows(name)) await put(name, r, {})
  }
  return { imported, name: file.name }
}
