import { db } from './db'
import { queueChange } from './sync'
import { edit } from './write'
import type { Habit, HabitLog, Supplement, SupplementLog } from './types'
import { cleanName, nextSortOrder, pickLog, type HabitSchedule, type SupplementSlot } from './tracking-rules'

/** Writes for habits and supplements. Every write goes to the local copy
 *  first and is queued for the server, like the rest of the app. */

/** Whether a module is switched on for a profile. A profile with no row for
 *  the module has never had it turned on, so it counts as off. */
export async function moduleEnabled(profileId: string, key: 'habits' | 'supplements'): Promise<boolean> {
  const row = await db.module_instance
    .where('profile_id').equals(profileId)
    .filter((m) => m.module_key === key)
    .first()
  return !!row?.enabled
}

/* ---------- habits -------------------------------------------------------- */

export async function addHabit(profileId: string, rawName: string, schedule: HabitSchedule): Promise<Habit | null> {
  const name = cleanName(rawName)
  if (!name) return null
  const existing = await db.habit.where('profile_id').equals(profileId).toArray()
  const row: Habit = {
    id: crypto.randomUUID(), profile_id: profileId, name, schedule,
    sort_order: nextSortOrder(existing), active: true,
    updated_at: new Date().toISOString(), deleted_at: null,
  }
  await db.habit.put(row)
  // The whole row is listed so the sync layer can insert it: the server has
  // no row with this id yet.
  await queueChange('habit', row, ['profile_id', 'name', 'schedule', 'sort_order', 'active', 'deleted_at'])
  return row
}

export async function renameHabit(habit: Habit, rawName: string): Promise<Habit | null> {
  const name = cleanName(rawName)
  if (!name || name === habit.name) return null
  return edit('habit', habit, { name })
}

/** Archiving keeps the row and its history. It is marked inactive and
 *  deleted so every device drops it from the list, and its logs stay on the
 *  server for export. */
export async function archiveHabit(habit: Habit): Promise<Habit> {
  return edit('habit', habit, { active: false, deleted_at: new Date().toISOString() })
}

/* ---------- supplements --------------------------------------------------- */

export async function addSupplement(
  profileId: string, rawName: string, rawDose: string, slot: SupplementSlot,
): Promise<Supplement | null> {
  const name = cleanName(rawName)
  if (!name) return null
  const existing = await db.supplement.where('profile_id').equals(profileId).toArray()
  const row: Supplement = {
    id: crypto.randomUUID(), profile_id: profileId, name, dose_text: cleanName(rawDose),
    time_slot: slot, active: true,
    sort_order: nextSortOrder(existing.filter((s) => s.time_slot === slot)),
    updated_at: new Date().toISOString(), deleted_at: null,
  }
  await db.supplement.put(row)
  await queueChange('supplement', row, ['profile_id', 'name', 'dose_text', 'time_slot', 'active', 'sort_order', 'deleted_at'])
  return row
}

export async function archiveSupplement(supplement: Supplement): Promise<Supplement> {
  return edit('supplement', supplement, { active: false, deleted_at: new Date().toISOString() })
}

/* ---------- ticks --------------------------------------------------------- */

/** Toggles are run one after another per row key. Without this, a double
 *  tap could read "no log yet" twice and create two rows for the same day,
 *  and the server refuses the second because a log is unique per day. */
const inFlight = new Map<string, Promise<unknown>>()
function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = inFlight.get(key) ?? Promise.resolve()
  const next = before.catch(() => undefined).then(work)
  inFlight.set(key, next)
  void next.finally(() => { if (inFlight.get(key) === next) inFlight.delete(key) })
  return next
}

/** Tick or untick a habit for a day. A day has at most one log per habit on
 *  the server, so an existing log is flipped rather than a second one added. */
export function toggleHabit(habitId: string, day: string): Promise<HabitLog> {
  return serial(`habit:${habitId}:${day}`, async () => {
    const existing = pickLog(await db.habit_log.where('[habit_id+log_date]').equals([habitId, day]).toArray())
    if (existing) return edit('habit_log', existing, { done: !existing.done })
    const row: HabitLog = { id: crypto.randomUUID(), habit_id: habitId, log_date: day, done: true, updated_at: new Date().toISOString() }
    await db.habit_log.put(row)
    await queueChange('habit_log', row, ['habit_id', 'log_date', 'done'])
    return row
  })
}

/** Same rule as habits: one log per supplement per day, flipped in place. */
export function toggleSupplement(supplementId: string, day: string): Promise<SupplementLog> {
  return serial(`supplement:${supplementId}:${day}`, async () => {
    const existing = pickLog(await db.supplement_log.where('[supplement_id+log_date]').equals([supplementId, day]).toArray())
    if (existing) return edit('supplement_log', existing, { done: !existing.done })
    const row: SupplementLog = { id: crypto.randomUUID(), supplement_id: supplementId, log_date: day, done: true, updated_at: new Date().toISOString() }
    await db.supplement_log.put(row)
    await queueChange('supplement_log', row, ['supplement_id', 'log_date', 'done'])
    return row
  })
}
