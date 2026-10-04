import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { queueChange } from './sync'
import type { ModuleRecord } from './types'
import { MEASURE_DATE, MEASURE_ENTITY, recordOfDay } from './body-measure-rules'

/** Health's body measures on the device (HLT-04): one Measure record a day
 *  (module_record), so Edit module's fields and Stats both reach them. The
 *  record keeps no record_date: its day is its own Date field, so a day of
 *  measuring never shows on Today or Plan as something to do. */

const MODULE = 'health'
const now = () => new Date().toISOString()

export function useMeasureRecords(profileId: string): ModuleRecord[] | undefined {
  return useLiveQuery(async () => (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray())
    .filter((r) => !r.deleted_at && r.entity === MEASURE_ENTITY), [profileId])
}

/** Keep a day's measures: changes that day's record, or makes one. Empty
 *  values are kept as empty, so a measure can be taken back. */
export async function saveMeasures(profileId: string, day: string, values: Record<string, number | null>): Promise<ModuleRecord> {
  const all = (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()).filter((r) => r.entity === MEASURE_ENTITY)
  const existing = recordOfDay(all, day)
  if (existing) return edit<ModuleRecord>('module_record', existing, { data: { ...existing.data, ...values, [MEASURE_DATE]: day } })
  const row: ModuleRecord = { id: crypto.randomUUID(), profile_id: profileId, module_key: MODULE, entity: MEASURE_ENTITY,
    data: { [MEASURE_DATE]: day, ...values }, record_date: null, created_at: now(), updated_at: now(), deleted_at: null }
  await db.module_record.put(row)
  await queueChange('module_record', row, ['profile_id', 'module_key', 'entity', 'data', 'record_date', 'deleted_at'])
  return row
}

export async function deleteMeasures(rec: ModuleRecord): Promise<void> {
  await edit('module_record', (await db.module_record.get(rec.id)) ?? rec, { deleted_at: now() })
}
export async function restoreMeasures(rec: ModuleRecord): Promise<void> {
  await edit('module_record', (await db.module_record.get(rec.id)) ?? rec, { deleted_at: null })
}
