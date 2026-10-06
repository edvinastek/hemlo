import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { edit } from '../lib/write'
import { queueChange } from '../lib/sync'
import { useApp } from '../lib/store'
import { deleteTask } from '../lib/tasks'
import type { ModuleInstance, ModuleRow } from '../lib/types'
import { MODULES, moduleByKey } from './registry'
import { modulesOn } from '../lib/module-view-rules'
import type { FieldDef, ModuleDef } from './types'
import {
  BUILT_KEY, LIMITS, OVERLAY_KEY, applyOverlay, bytes, definitionFor, definitionProblem, moduleKeywords, newModuleKey,
  overlayFrom, readBuiltDefinition, readOverlay, type ModuleWords,
} from './def-rules'

export { moduleKeywords, suggestModules } from './def-rules'

/** Module definitions as the app runs them: a built-in one from the
 *  registry with the person's changes laid over it, or one they built, read
 *  from its row. Both are checked on the way in (see def-rules.ts). */

export const isBuiltKey = (key: string) => BUILT_KEY.test(key)

export async function instanceFor(profileId: string, key: string): Promise<ModuleInstance | undefined> {
  return db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === key).first()
}

/** A module's definition for this profile, or null when there is no such
 *  module (or it was deleted). */
export async function moduleDef(key: string, profileId?: string | null): Promise<ModuleDef | null> {
  if (isBuiltKey(key)) {
    const row = await db.module.get(key)
    if (!row || row.deleted_at || row.builtin) return null
    return readBuiltDefinition(row)
  }
  const base = moduleByKey.get(key)
  if (!base) return null
  if (!profileId) return base
  const inst = await instanceFor(profileId, key)
  return applyOverlay(base, readOverlay(inst?.settings?.[OVERLAY_KEY], base))
}

/** undefined while loading, null when there is no such module. */
export function useModuleDef(key: string): ModuleDef | null | undefined {
  const profileId = useApp((s) => s.profile?.id ?? null)
  return useLiveQuery(() => moduleDef(key, profileId), [key, profileId])
}

export interface ModuleEntry { def: ModuleDef; instance?: ModuleInstance; enabled: boolean }

/** Every module this profile can see, built-in ones first in the registry's
 *  order, then built ones by name. */
export async function moduleDefs(profileId: string): Promise<ModuleEntry[]> {
  const instances = await db.module_instance.where('profile_id').equals(profileId).toArray()
  const byKey = new Map(instances.map((i) => [i.module_key, i]))
  const rows = await db.module.toArray()
  // The one rule for "on" (module-view-rules.ts), as every screen uses it.
  const on = modulesOn(instances, rows)
  const out: ModuleEntry[] = MODULES.map((base) => {
    const instance = byKey.get(base.key)
    return { def: applyOverlay(base, readOverlay(instance?.settings?.[OVERLAY_KEY], base)), instance, enabled: on.has(base.key) }
  })
  const built = rows.filter((m) => !m.builtin && !m.deleted_at && isBuiltKey(m.key))
    .map((row) => readBuiltDefinition(row))
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const def of built) {
    const instance = byKey.get(def.key)
    out.push({ def, instance, enabled: on.has(def.key) })
  }
  return out
}

export function useModuleDefs(): ModuleEntry[] | undefined {
  const profileId = useApp((s) => s.profile?.id ?? null)
  return useLiveQuery(async () => (profileId ? moduleDefs(profileId) : []), [profileId])
}

/** Keywords of every module this profile has, built ones included, with
 *  the person's own keywords for built-in ones. For the setup suggestion. */
export async function profileModuleKeywords(profileId: string): Promise<ModuleWords[]> {
  const entries = await moduleDefs(profileId)
  const built = entries.filter((e) => e.def.built).map((e) => e.def)
  const own = new Map(entries.map((e) => [e.def.key, e.def.keywords ?? []]))
  return moduleKeywords(built).map((m) => ({ ...m, keywords: own.get(m.key) ?? m.keywords }))
}

/** The profile's switch row for a module, made (with the switch as given)
 *  when there is none yet, the same way applyModules makes one. */
export async function ensureInstance(profileId: string, key: string, enabled: boolean): Promise<ModuleInstance> {
  const found = await instanceFor(profileId, key)
  if (found) return found
  const count = await db.module_instance.where('profile_id').equals(profileId).count()
  const fresh = { id: crypto.randomUUID(), sort_order: count, settings: {}, updated_at: new Date().toISOString() } as unknown as ModuleInstance
  return edit<ModuleInstance>('module_instance', fresh, { profile_id: profileId, module_key: key, enabled })
}

/** Save an edited definition: a built module's own row, or, for a built-in
 *  one, only what differs from the app's version, in the profile's switch row. */
export async function saveModuleDef(profileId: string, draft: ModuleDef): Promise<void> {
  const problem = definitionProblem(draft)
  if (problem) throw new Error(problem)
  if (draft.built) {
    const row = await db.module.get(draft.key)
    if (!row) throw new Error('This module is no longer here.')
    await edit<ModuleRow>('module', row, { name: draft.name.trim(), definition: definitionFor(draft) })
    return
  }
  const base = moduleByKey.get(draft.key)
  if (!base) throw new Error('No such module.')
  const overlay = overlayFrom(base, draft)
  if (bytes(overlay) > LIMITS.definition) throw new Error('These changes are too large to keep.')
  const inst = await ensureInstance(profileId, draft.key, false)
  const current = (await db.module_instance.get(inst.id)) ?? inst
  await edit('module_instance', current, { settings: { ...(current.settings ?? {}), [OVERLAY_KEY]: overlay } })
}

/** Make a module from a finished draft: its row, and its switch, on. */
export async function createBuiltModule(userId: string, profileId: string, draft: ModuleDef): Promise<string> {
  let key = newModuleKey()
  while (await db.module.get(key)) key = newModuleKey()
  // A link to another kind of record of this same module (MOD-15) follows
  // the module to its new key (a draft or an imported design had another).
  const own = (f: FieldDef): FieldDef => (f.type === 'lookup' && f.lookup === 'record' && f.module === draft.key ? { ...f, module: key } : f)
  const def: ModuleDef = { ...draft, key, built: true, entities: draft.entities.map((e) => ({ ...e, fields: e.fields.map(own) })) }
  const problem = definitionProblem(def)
  if (problem) throw new Error(problem)
  const row: ModuleRow = {
    id: key, key, name: def.name.trim(), builtin: false, created_by: userId,
    definition: definitionFor(def), updated_at: new Date().toISOString(), deleted_at: null,
  }
  await db.module.put(row)
  await queueChange('module', row, ['key', 'name', 'builtin', 'created_by', 'definition', 'deleted_at'])
  const inst = await instanceFor(profileId, key)
  if (inst) await edit('module_instance', inst, { enabled: true })
  else await ensureInstance(profileId, key, true)
  return key
}

/** Delete a built module: it leaves the pages and is switched off. Its
 *  records stay until the account is deleted; the tasks its rule made that
 *  are not done yet go. */
export async function deleteBuiltModule(profileId: string, key: string): Promise<void> {
  const row = await db.module.get(key)
  if (!row || row.builtin) return
  await edit<ModuleRow>('module', row, { deleted_at: new Date().toISOString() })
  const inst = await instanceFor(profileId, key)
  if (inst?.enabled) await edit('module_instance', inst, { enabled: false })
  const tasks = await db.task.where('profile_id').equals(profileId)
    .filter((t) => t.module_key === key && t.source === 'module' && !t.deleted_at && t.status !== 'done').toArray()
  for (const t of tasks) await deleteTask(t)
}

/** Switch a module on or off for this profile. */
export async function setModuleEnabled(profileId: string, key: string, enabled: boolean) {
  const inst = await instanceFor(profileId, key)
  if (inst) { if (inst.enabled !== enabled) await edit('module_instance', inst, { enabled }) }
  else await ensureInstance(profileId, key, enabled)
}
