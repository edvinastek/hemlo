import { db } from './db'

/** One file that holds everything: profile, plan, logs, recipes and settings.
 *  It is the backup, and it is how a device hands its state to another one. */
const TABLES = ['profile', 'task', 'target', 'body_log', 'food_log', 'meal_plan_slot', 'module_instance'] as const

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
  // Recipes a person wrote travel with them; the shared catalogue does not,
  // because every account already has it.
  const recipes = (await db.recipe.toArray()).filter((r) => r.owner_id)
  records.recipe = recipes
  records.recipe_line = (await db.recipe_line.toArray())
    .filter((l) => recipes.some((r) => r.id === l.recipe_id))

  const bundle: Bundle = {
    format: 'getit.bundle',
    version: 1,
    exported_at: new Date().toISOString(),
    profile_id: profileId,
    records,
  }
  return new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' })
}

export async function importBundle(file: File): Promise<{ imported: number; name: string }> {
  const text = await file.text()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch {
    throw new Error('That file is not a GetIt export.')
  }
  const bundle = parsed as Bundle
  if (bundle?.format !== 'getit.bundle') throw new Error('That file is not a GetIt export.')

  let imported = 0
  for (const [table, rows] of Object.entries(bundle.records)) {
    const store = (db as never as Record<string, { bulkPut: (r: unknown[]) => Promise<unknown> } | undefined>)[table]
    if (!store || !Array.isArray(rows)) continue
    await store.bulkPut(rows)
    imported += rows.length
  }
  return { imported, name: file.name }
}
