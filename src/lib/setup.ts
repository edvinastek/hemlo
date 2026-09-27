import { db } from './db'
import { edit, saveSettings } from './write'
import { MODULES } from '../modules/registry'
import { modulesFor, templateByKey } from './templates'
import type { ModuleInstance, Profile } from './types'

/** Switch modules on and off to match a list. A module the profile has never
 *  had a row for (sign-up makes rows for the core set only) gets one, so a
 *  template can turn on Sleep or Projects too. Switching off never deletes
 *  anything: the module's data is still there when it comes back on. */
export async function applyModules(profileId: string, on: string[]) {
  const rows = await db.module_instance.where('profile_id').equals(profileId).toArray()
  const byKey = new Map(rows.map((r) => [r.module_key, r]))
  for (const [i, m] of MODULES.entries()) {
    // Custom holds what the person built; no template has an opinion on it.
    if (m.key === 'custom') continue
    const want = on.includes(m.key)
    const row = byKey.get(m.key)
    if (row) {
      if (row.enabled !== want) await edit('module_instance', row, { enabled: want })
    } else {
      // No row here yet: either the module never had one, or (on a new
      // account) the server made it and this phone has not pulled it yet.
      // Either way a row is sent with just the switch; the sync inserts it,
      // or folds it into the server's row for the same module by its natural
      // key, so a module switched off here is switched off there too.
      const fresh = { id: crypto.randomUUID(), sort_order: i, settings: {}, updated_at: new Date().toISOString() } as ModuleInstance
      await edit<ModuleInstance>('module_instance', fresh, { profile_id: profileId, module_key: m.key, enabled: want })
    }
  }
}

/** "Start again from a template": its modules, the food figures it tracks,
 *  and the figure Today shows. Work hours, targets and everything entered
 *  stay as they are. */
export async function applyTemplate(profile: Profile, key: string): Promise<Profile> {
  const tpl = templateByKey(key)
  if (!tpl) return profile
  await applyModules(profile.id, modulesFor(key))
  return saveSettings(profile, { template: tpl.key, nutrients: [...tpl.nutrients], today_metric: tpl.today_metric })
}
