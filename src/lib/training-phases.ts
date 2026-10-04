import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { queueChange } from './sync'
import type { Phase } from './training-types'
import { orderPhases, phaseFields, type PhaseDraft } from './training-phase-rules'
import { instanceFor } from '../modules/defs'

/** Training phases on the device (TRN-07): kept in the phase table (037),
 *  synced like routines, deleted softly so other devices hear of it. */

const now = () => new Date().toISOString()
const FIELDS: (keyof Phase & string)[] = ['profile_id', 'name', 'start_date', 'end_date', 'colour', 'template', 'deleted_at']
const write = (row: Phase, changes: Partial<Phase>) => edit('phase' as never, row as never, changes as never) as unknown as Promise<Phase>

/** The profile's phases in order, while Training is on (else none: a module
 *  that is off shows nowhere). Undefined while loading. */
export function usePhases(profileId: string | null | undefined): Phase[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId || !(await instanceFor(profileId, 'training'))?.enabled) return []
    return orderPhases(await db.phase.where('profile_id').equals(profileId).toArray())
  }, [profileId])
}

export async function savePhase(profileId: string, draft: PhaseDraft, existing?: Phase): Promise<Phase> {
  const fields = phaseFields(draft)
  if (existing) return write((await db.phase.get(existing.id)) ?? existing, { ...fields, deleted_at: null })
  const row: Phase = { id: crypto.randomUUID(), profile_id: profileId, ...fields, template: {}, created_at: now(), updated_at: now(), deleted_at: null }
  await db.phase.put(row)
  await queueChange('phase', row, FIELDS)
  return row
}

export async function deletePhase(p: Phase): Promise<void> {
  await write((await db.phase.get(p.id)) ?? p, { deleted_at: now() })
}
export async function restorePhase(p: Phase): Promise<void> {
  await write((await db.phase.get(p.id)) ?? p, { deleted_at: null })
}
