import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import type { SleepLog } from './types'
import { bedtimeSeries, hoursSlept, readSleepSettings, type SleepSettings } from './sleep-rules'
import { keepSeries } from './training-series'
import { builtinRuleOn } from '../modules/rule-switch'
import { ensureInstance, instanceFor } from '../modules/defs'

/** Sleep on the device: the target kept in the module's own settings (so it
 *  follows the profile to every device), nights added or changed for any
 *  day, and the bedtime block the planner holds when it is wanted. */

export function useSleepSettings(profileId: string | null | undefined): SleepSettings | undefined {
  return useLiveQuery(async () => (profileId ? readSleepSettings((await instanceFor(profileId, 'sleep'))?.settings) : undefined), [profileId])
}

type Editable = Pick<SleepSettings, 'target_hours' | 'bedtime' | 'wind_down' | 'block' | 'locked'>

/** Save the target and the block, then make the planner match. */
export async function saveSleepSettings(profileId: string, next: Editable, today: string): Promise<SleepSettings> {
  const inst = await ensureInstance(profileId, 'sleep', true)
  const current = (await db.module_instance.get(inst.id)) ?? inst
  const saved = await edit('module_instance', current, { settings: { ...(current.settings ?? {}), ...next } })
  return keepBedtime(profileId, readSleepSettings(saved.settings), today, true)
}

/** The bedtime block on the planner, in line with the settings and the rule
 *  "bedtime is locked and nothing is scheduled across it". */
export async function keepBedtime(profileId: string, s: SleepSettings, today: string, full: boolean): Promise<SleepSettings> {
  const ruleOn = await builtinRuleOn(profileId, 'sleep', 'bedtime')
  const want = bedtimeSeries(s, ruleOn, today)
  const res = await keepSeries(profileId, s.block_series, want ? { ...want, module_key: 'sleep' } : null, today, full)
  if (res.seriesId === s.block_series) return s
  const inst = await instanceFor(profileId, 'sleep')
  if (inst) await edit('module_instance', inst, { settings: { ...(inst.settings ?? {}), block_series: res.seriesId } })
  return { ...s, block_series: res.seriesId }
}

/** Carry out the bedtime rule after it is switched, or when the page opens. */
export async function carryOutBedtimeRule(profileId: string, today: string): Promise<void> {
  const s = readSleepSettings((await instanceFor(profileId, 'sleep'))?.settings)
  await keepBedtime(profileId, s, today, false)
}

export function useNights(profileId: string | null | undefined): SleepLog[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.sleep_log.where('profile_id').equals(profileId).toArray()).filter((n) => !n.deleted_at)
      .sort((a, b) => b.log_date.localeCompare(a.log_date))
    : [], [profileId])
}

export interface NightDraft { log_date: string; went_to_bed: string; woke_at: string; quality: number | null }

/** Add a night, or change one. One night per day: a day that already has
 *  one is refused with a message; a day whose night was deleted gets that
 *  row back (the server keeps one row per day, deleted or not). */
export async function saveNight(profileId: string, existing: SleepLog | null, d: NightDraft): Promise<{ ok: true; row: SleepLog } | { ok: false; message: string }> {
  const rows = await db.sleep_log.where('[profile_id+log_date]').equals([profileId, d.log_date]).toArray()
  const taken = rows.find((r) => !r.deleted_at && r.id !== existing?.id)
  if (taken) return { ok: false, message: 'That day already has a night. Change that one instead.' }
  const changes: Partial<SleepLog> = {
    profile_id: profileId, log_date: d.log_date, went_to_bed: d.went_to_bed, woke_at: d.woke_at,
    hours: hoursSlept(d.went_to_bed, d.woke_at), quality: d.quality, deleted_at: null,
  }
  // Moving a night to a day that held a deleted one: that row takes the night
  // and this one is deleted, so the day keeps its single row.
  const held = rows.find((r) => r.deleted_at && r.id !== existing?.id)
  if (held) {
    if (existing) await edit('sleep_log', existing, { deleted_at: new Date().toISOString() })
    return { ok: true, row: await edit('sleep_log', held, changes) }
  }
  const base = existing ?? ({ id: crypto.randomUUID() } as SleepLog)
  return { ok: true, row: await edit('sleep_log', base, changes) }
}

export async function deleteNight(row: SleepLog): Promise<void> {
  await edit('sleep_log', (await db.sleep_log.get(row.id)) ?? row, { deleted_at: new Date().toISOString() })
}
export async function restoreNight(row: SleepLog): Promise<void> {
  const current = (await db.sleep_log.get(row.id)) ?? row
  const twin = (await db.sleep_log.where('[profile_id+log_date]').equals([row.profile_id, row.log_date]).toArray())
    .find((r) => !r.deleted_at && r.id !== row.id)
  if (!twin) await edit('sleep_log', current, { deleted_at: null })
}
