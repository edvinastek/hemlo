import { db } from './db'
import { edit } from './write'
import { readHealthSleep } from './native'
import { planSleepImport, queryWindow, type ImportPlan } from './sleep-import-rules'
import type { SleepLog } from './types'

/** Nights from Health Connect into Sleep (SLP-05). The rules are in
 *  sleep-import-rules.ts; this reads the phone and writes the nights the same
 *  way a night typed in is written (local first, then synced). */

export interface ImportResult extends Pick<ImportPlan, 'kept' | 'before' | 'naps'> {
  added: number
  /** The rows written, for Undo. */
  rows: SleepLog[]
}

export async function importSleep(profileId: string, range: { from: string; to: string }): Promise<ImportResult> {
  const w = queryWindow(range)
  const sessions = await readHealthSleep(w.start, w.end)
  const known = await db.sleep_log.where('profile_id').equals(profileId).toArray()
  const plan = planSleepImport(sessions, known, range)
  const out: ImportResult = { added: 0, kept: plan.kept, before: plan.before, naps: plan.naps, rows: [] }
  for (const n of plan.add) {
    // Looked at again just before writing: a sync may have brought a night
    // for that day while Health Connect was being read.
    const rows = await db.sleep_log.where('[profile_id+log_date]').equals([profileId, n.log_date]).toArray()
    if (rows.some((r) => !r.deleted_at)) { out.kept++; continue }
    // One row per day on the server: a deleted night that day gives its row.
    const base = rows.find((r) => r.id === n.reuse) ?? rows.find((r) => r.deleted_at) ?? ({ id: crypto.randomUUID() } as SleepLog)
    out.rows.push(await edit('sleep_log', base, {
      profile_id: profileId, log_date: n.log_date, went_to_bed: n.went_to_bed, woke_at: n.woke_at,
      hours: n.hours, quality: null, import_id: n.import_id, deleted_at: null,
    }))
    out.added++
  }
  return out
}

/** Undo an import: the nights go, and forget where they came from, so
 *  importing those days again brings them back. */
export async function undoImport(rows: SleepLog[]): Promise<void> {
  const at = new Date().toISOString()
  for (const r of rows) {
    const current = (await db.sleep_log.get(r.id)) ?? r
    if (current.import_id !== r.import_id || current.deleted_at) continue
    await edit('sleep_log', current, { deleted_at: at, import_id: null })
  }
}
