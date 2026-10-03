import { db } from './db'
import { edit } from './write'
import { ensureInstance, instanceFor } from '../modules/defs'
import { readZoneChoice, zoneToStore, type ZoneChoice } from './timezone-rules'

/** The phone's own time zone, or null where it cannot be read. */
export const phoneZone = (): string | null => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/** The person's choice, kept with the planner's own switch row ('core'), so
 *  it syncs with the profile and adds no new setting. */
export async function zoneChoice(profileId: string): Promise<ZoneChoice> {
  const core = await instanceFor(profileId, 'core')
  return readZoneChoice(core?.settings?.timezone)
}

export async function saveZoneChoice(profileId: string, choice: ZoneChoice): Promise<void> {
  const core = await ensureInstance(profileId, 'core', true)
  const current = (await db.module_instance.get(core.id)) ?? core
  await edit('module_instance', current, { settings: { ...(current.settings ?? {}), timezone: choice } })
  await keepZone(profileId)
}

/** Bring the profile's zone in line: the phone's, unless one was chosen.
 *  Run when the app opens a profile, so a new account stops being planned
 *  in Europe/Amsterdam the first time it is opened anywhere else. */
export async function keepZone(profileId: string): Promise<void> {
  const profile = await db.profile.get(profileId)
  if (!profile) return
  const { zone, change } = zoneToStore(await zoneChoice(profileId), phoneZone(), profile.timezone ?? null)
  if (change) await edit('profile', profile, { timezone: zone })
}
