import { db } from './db'
import { queueChange } from './sync'
import { edit } from './write'
import type { Chore, ChoreLog } from './types'

/** Writes for household chores (026). Chores belong to the household, so
 *  everyone in it sees and ticks the same ones. Local first, then queued. */

export const CHORE_FIELDS: (keyof Chore & string)[] = [
  'household_id', 'name', 'room', 'mode', 'rule', 'rule_config', 'every_days', 'start_date', 'end_date',
  'time_of_day', 'minutes', 'assignees', 'rotation', 'note', 'paused', 'sort_order', 'deleted_at',
]

export function blankChore(householdId: string, partial: Partial<Chore> = {}): Chore {
  return {
    id: crypto.randomUUID(), household_id: householdId, name: '', room: null, mode: 'fixed',
    rule: 'weekly', rule_config: {}, every_days: null, start_date: null, end_date: null,
    time_of_day: null, minutes: null, assignees: [], rotation: 'none', note: null, paused: false,
    sort_order: 0, updated_at: new Date().toISOString(), deleted_at: null, ...partial,
  }
}

/** Save a chore: a new one whole, an existing one only in the fields that changed. */
export async function saveChore(chore: Chore, changed?: (keyof Chore & string)[]): Promise<Chore> {
  const existing = await db.chore.get(chore.id)
  const row = { ...chore, updated_at: new Date().toISOString() }
  await db.chore.put(row)
  await queueChange('chore', row, existing && changed ? changed : CHORE_FIELDS)
  return row
}

export async function deleteChore(chore: Chore): Promise<Chore> {
  return edit('chore', chore, { deleted_at: new Date().toISOString() })
}

export async function choresFor(householdId: string): Promise<Chore[]> {
  return (await db.chore.where('household_id').equals(householdId).toArray()).filter((c) => !c.deleted_at)
}

export async function choreLogs(choreIds: string[]): Promise<ChoreLog[]> {
  if (!choreIds.length) return []
  return (await db.chore_log.where('chore_id').anyOf(choreIds).toArray()).filter((l) => !l.deleted_at)
}

const inFlight = new Map<string, Promise<unknown>>()
function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = inFlight.get(key) ?? Promise.resolve()
  const next = before.catch(() => undefined).then(work)
  inFlight.set(key, next)
  void next.finally(() => { if (inFlight.get(key) === next) inFlight.delete(key) })
  return next
}

/** Mark a chore done on a day, or undo it. One log per chore per day; an
 *  undone day keeps its row, marked deleted, so every device hears of it. */
export function toggleChore(choreId: string, day: string, userId: string | null): Promise<ChoreLog> {
  return serial(`chore:${choreId}:${day}`, async () => {
    const rows = await db.chore_log.where('[chore_id+done_on]').equals([choreId, day]).toArray()
    const existing = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
    if (existing) return edit('chore_log', existing, { deleted_at: existing.deleted_at ? null : new Date().toISOString(), done_by: userId })
    const row: ChoreLog = { id: crypto.randomUUID(), chore_id: choreId, done_on: day, done_by: userId, updated_at: new Date().toISOString(), deleted_at: null }
    await db.chore_log.put(row)
    await queueChange('chore_log', row, ['chore_id', 'done_on', 'done_by', 'deleted_at'])
    return row
  })
}
