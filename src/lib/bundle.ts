import { db } from './db'
import { queueChange, NATURAL_KEYS } from './sync'

/** One file that holds everything: profile, plan, logs, recipes and settings.
 *  It is the backup, how a device hands its state to another one, and the
 *  copy a person is entitled to under GDPR articles 15 and 20 — so every table
 *  that holds their data must be listed here. */
const TABLES = [
  'profile', 'task', 'target', 'body_log', 'food_log', 'meal_plan_slot', 'module_instance',
  'series', 'habit', 'supplement',
  'module_record', 'calendar_event', 'goal', 'sleep_log', 'workout_log',
] as const

/** Rows that belong to the profile through a parent row rather than directly. */
const CHILDREN = [
  { table: 'series_exception', parent: 'series', key: 'series_id' },
  { table: 'habit_log', parent: 'habit', key: 'habit_id' },
  { table: 'supplement_log', parent: 'supplement', key: 'supplement_id' },
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
  for (const { table, parent, key } of CHILDREN) {
    const parents = new Set((records[parent] as { id: string }[]).map((p) => p.id))
    const rows = await (db as never as Record<string, { toArray: () => Promise<Record<string, unknown>[]> }>)[table].toArray()
    records[table] = rows.filter((r) => parents.has(r[key] as string))
  }
  // Foods and recipes a person added travel with them; the shared catalogue
  // does not, because every account already has it.
  records.food = (await db.food.toArray()).filter((f) => f.owner_id)
  const recipes = (await db.recipe.toArray()).filter((r) => r.owner_id)
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

  const bundle: Bundle = {
    format: 'getit.bundle',
    version: 1,
    exported_at: new Date().toISOString(),
    profile_id: profileId,
    records,
  }
  return new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' })
}

/** Profile fields a restore carries over. Ids, the household and the default
 *  flag belong to the account the file is read into, not the one it came from. */
const PROFILE_FIELDS = ['name', 'sex', 'birth_date', 'height_cm', 'activity_level', 'goal', 'timezone', 'day_start', 'day_end', 'ai_persona_name'] as const

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
      // A module's id is its key, which must keep the u_ form the server asks for.
      for (const r of rows(name)) fresh.set(r.id, name === 'module' ? `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}` : crypto.randomUUID())
    }
  }
  const remap = (v: unknown): unknown => {
    if (typeof v === 'string') return fresh.get(v) ?? v
    if (Array.isArray(v)) return v.map(remap)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]))
    return v
  }

  // The profile: its details, onto the profile that is open.
  const source = rows('profile').find((r) => r.id === bundle.profile_id) ?? rows('profile')[0]
  const current = await db.profile.get(profileId)
  if (source && current) {
    const fields = PROFILE_FIELDS.filter((f) => f in source)
    const next = { ...current, ...Object.fromEntries(fields.map((f) => [f, source[f]])) }
    await db.profile.put(next)
    await queueChange('profile', next, [...fields])
    imported++
  }

  /** Where a row of this table already exists here under its natural key. */
  const twins = async (name: string) => {
    const keys = NATURAL_KEYS[name]
    if (!keys) return null
    const map = new Map<string, string>()
    for (const r of await table(name)!.toArray()) map.set(keys.map((k) => String(r[k])).join('|'), r.id)
    return (r: Row) => map.get(keys.map((k) => String(r[k])).join('|'))
  }

  const put = async (name: string, incoming: Row, adopt: Partial<Row>) => {
    const store = table(name)
    if (!store) return
    const row: Row = { ...(remap(incoming) as Row), ...adopt }
    delete row.updated_at
    const find = await twins(name)
    const twin = find?.(row)
    if (twin && twin !== row.id) row.id = twin
    const existing = await store.get(row.id)
    const merged = { ...(existing ?? {}), ...row } as Row
    await store.put(merged)
    await queueChange(name, merged, Object.keys(row).filter((k) => k !== 'id'))
    imported++
  }

  // Parents before the rows that point at them, so the server sees them first:
  // recipes before the meal plan, series before their tasks, habits before ticks.
  for (const r of rows('food')) await put('food', r, { owner_id: userId })
  for (const r of rows('recipe')) await put('recipe', r, { owner_id: userId })
  for (const r of rows('recipe_line')) await put('recipe_line', r, {})
  // Stock joins this household's cupboard. A food already in it is updated
  // rather than doubled (NATURAL_KEYS.stock), so reading the same file twice
  // leaves the same amounts. Rows removed before the export are left out: on
  // the shared key they would remove what this household has now.
  if (current) {
    for (const r of rows('stock').filter((x) => !x.deleted_at)) await put('stock', r, { household_id: current.household_id })
  }
  // Built modules before their switches and records point at them.
  for (const r of rows('module')) await put('module', r, { created_by: userId, builtin: false })
  const order = ['series', 'habit', 'supplement', 'module_instance', 'goal', 'calendar_event', 'sleep_log', 'workout_log',
    'module_record', 'target', 'body_log', 'task', 'food_log', 'meal_plan_slot']
  for (const name of order) {
    for (const r of rows(name)) await put(name, r, { profile_id: profileId })
  }
  for (const { table: name } of CHILDREN) {
    for (const r of rows(name)) await put(name, r, {})
  }
  return { imported, name: file.name }
}
