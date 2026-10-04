import { db } from './db'
import { queueChange } from './sync'
import { edit } from './write'
import type { Habit, HabitLog, Supplement, SupplementLog } from './types'
import { cleanName, nextSortOrder, pickLog, readSlots, type HabitSchedule, type SupplementSlot, type SupplementSlotDef } from './tracking-rules'
import { ensureInstance } from '../modules/defs'
import { OVERLAY_KEY } from '../modules/def-rules'
import { readSettings } from './settings'
import { saveSettings } from './write'
import type { Profile } from './types'
import { isModuleOn } from './day'

/** Writes for habits and supplements. Every write goes to the local copy
 *  first and is queued for the server, like the rest of the app. */

/** Whether a module is switched on for a profile: the one rule every page
 *  uses (isModuleOn in day.ts, GEN-01). A profile with no row for a
 *  built-in module has never had it turned on, so it counts as off. */
export const moduleEnabled = (profileId: string, key: string): Promise<boolean> => isModuleOn(profileId, key)

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

/** Records how much of a count habit was done on a day ("5 of 8 glasses").
 *  Reaching the target marks the day done; going back under it unmarks it. */
export function setHabitAmount(habitId: string, day: string, amount: number | null, target: number | null): Promise<HabitLog> {
  const clean = amount == null || !Number.isFinite(amount) ? null : Math.max(0, Math.round(amount * 100) / 100)
  const done = clean != null && (target != null && target > 0 ? clean >= target : clean > 0)
  return serial(`habit:${habitId}:${day}`, async () => {
    const existing = pickLog(await db.habit_log.where('[habit_id+log_date]').equals([habitId, day]).toArray())
    if (existing) return edit('habit_log', existing, { amount: clean, done })
    const row: HabitLog = { id: crypto.randomUUID(), habit_id: habitId, log_date: day, done, amount: clean, updated_at: new Date().toISOString() }
    await db.habit_log.put(row)
    await queueChange('habit_log', row, ['habit_id', 'log_date', 'done', 'amount'])
    return row
  })
}

/** Records which lines of a habit's pinned checklist were ticked on a day,
 *  by their index among the checklist items. The day itself is marked done
 *  only when `done` says so: ticking the last line asks first (TOD-13). */
export function setHabitChecks(habitId: string, day: string, checks: number[], done?: boolean): Promise<HabitLog> {
  const clean = [...new Set(checks.filter((n) => Number.isInteger(n) && n >= 0 && n < 200))].sort((a, b) => a - b)
  return serial(`habit:${habitId}:${day}`, async () => {
    const existing = pickLog(await db.habit_log.where('[habit_id+log_date]').equals([habitId, day]).toArray())
    if (existing) return edit('habit_log', existing, done === undefined ? { checks: clean } : { checks: clean, done })
    const row: HabitLog = { id: crypto.randomUUID(), habit_id: habitId, log_date: day, done: done ?? false, checks: clean, updated_at: new Date().toISOString() }
    await db.habit_log.put(row)
    await queueChange('habit_log', row, ['habit_id', 'log_date', 'done', 'checks'])
    return row
  })
}

/* ---------- version 16: the habit and supplement sheets ------------------- */

export const HABIT_FIELDS: (keyof Habit & string)[] = [
  'profile_id', 'name', 'schedule', 'rule', 'rule_config', 'start_date', 'end_date', 'time_of_day', 'day_part', 'note',
  'target', 'unit', 'colour', 'mark', 'sort_order', 'active', 'deleted_at',
]

/** A habit as the sheet starts it: every day from today, at any time. */
export function blankHabit(profileId: string, today: string, sortOrder: number): Habit {
  return {
    id: crypto.randomUUID(), profile_id: profileId, name: '', schedule: 'daily', rule: 'daily', rule_config: {},
    start_date: today, end_date: null, time_of_day: null, day_part: null, note: null, target: null, unit: null,
    colour: null, mark: null, sort_order: sortOrder, active: true, updated_at: new Date().toISOString(), deleted_at: null,
  }
}

/** Save a habit from its sheet: a new one whole, an existing one only in
 *  the fields that changed, so another phone's edit to another field stays. */
export async function saveHabit(habit: Habit, before?: Habit | null): Promise<Habit> {
  const name = cleanName(habit.name)
  if (!name) throw new Error('A habit needs a name.')
  // The old word is kept in step for anything still reading it.
  const schedule: Habit['schedule'] = habit.rule === 'weekdays' ? 'weekdays' : habit.rule === 'times_per_week' && (habit.rule_config?.times ?? 1) === 1 ? 'weekly' : 'daily'
  const row: Habit = { ...habit, name, schedule, updated_at: new Date().toISOString() }
  await db.habit.put(row)
  const changed = before
    ? HABIT_FIELDS.filter((f) => JSON.stringify(row[f] ?? null) !== JSON.stringify(before[f] ?? null))
    : HABIT_FIELDS
  if (changed.length) await queueChange('habit', row, changed)
  return row
}

/** Brings an archived habit back, with all its past ticks. */
export function restoreHabit(habit: Habit): Promise<Habit> {
  return edit('habit', habit, { active: true, deleted_at: null })
}

/** Swaps a row's place with its neighbour in the list given (in order). */
export async function moveInList<T extends { id: string; sort_order: number }>(
  table: 'habit' | 'supplement' | 'chore', rows: T[], id: string, dir: -1 | 1,
): Promise<boolean> {
  const i = rows.findIndex((r) => r.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= rows.length) return false
  // Orders are made distinct first, so two rows with the same number swap too.
  const orders = rows.map((r, k) => Math.max(r.sort_order, k))
  const a = rows[i]
  const b = rows[j]
  await edit(table as 'habit', a as never, { sort_order: orders[j] } as never)
  await edit(table as 'habit', b as never, { sort_order: orders[i] } as never)
  return true
}

export const SUPPLEMENT_FIELDS: (keyof Supplement & string)[] = [
  'profile_id', 'name', 'dose_text', 'time_slot', 'rule', 'rule_config', 'start_date', 'end_date', 'active', 'sort_order', 'deleted_at',
  // 033 (SUP-05): the stock count, its day and the refill warning.
  'stock_count', 'stock_from', 'refill_days',
]

export async function saveSupplement(s: Supplement, before?: Supplement | null): Promise<Supplement> {
  const name = cleanName(s.name)
  if (!name) throw new Error('A supplement needs a name.')
  const row: Supplement = { ...s, name: name.slice(0, 120), dose_text: s.dose_text ? cleanName(s.dose_text)?.slice(0, 60) ?? null : null, updated_at: new Date().toISOString() }
  await db.supplement.put(row)
  const changed = before
    ? SUPPLEMENT_FIELDS.filter((f) => JSON.stringify(row[f] ?? null) !== JSON.stringify(before[f] ?? null))
    : SUPPLEMENT_FIELDS
  if (changed.length) await queueChange('supplement', row, changed)
  return row
}

export function restoreSupplement(s: Supplement): Promise<Supplement> {
  return edit('supplement', s, { active: true, deleted_at: null })
}

/** "Take all" for a slot (SUP-04): every one of them ticked, or unticked. */
export async function setSupplementsTaken(ids: string[], day: string, done: boolean): Promise<void> {
  for (const id of ids) {
    await serial(`supplement:${id}:${day}`, async () => {
      const existing = pickLog(await db.supplement_log.where('[supplement_id+log_date]').equals([id, day]).toArray())
      if (existing) { if (existing.done !== done) await edit('supplement_log', existing, { done }) ; return }
      if (!done) return
      const row: SupplementLog = { id: crypto.randomUUID(), supplement_id: id, log_date: day, done: true, updated_at: new Date().toISOString() }
      await db.supplement_log.put(row)
      await queueChange('supplement_log', row, ['supplement_id', 'log_date', 'done'])
    })
  }
}

/** Sets a habit's day to done or not, keeping any amount and checklist. */
export function setHabitDone(habitId: string, day: string, done: boolean): Promise<HabitLog | null> {
  return serial(`habit:${habitId}:${day}`, async () => {
    const existing = pickLog(await db.habit_log.where('[habit_id+log_date]').equals([habitId, day]).toArray())
    if (existing) return existing.done === done ? existing : edit('habit_log', existing, { done })
    if (!done) return null
    const row: HabitLog = { id: crypto.randomUUID(), habit_id: habitId, log_date: day, done: true, updated_at: new Date().toISOString() }
    await db.habit_log.put(row)
    await queueChange('habit_log', row, ['habit_id', 'log_date', 'done'])
    return row
  })
}

/* ---------- the supplements module's own settings: slots ------------------ */

/** The person's supplement slots (SUP-02), from the module's settings. */
export async function supplementSlots(profileId: string): Promise<SupplementSlotDef[]> {
  const inst = await db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'supplements').first()
  return readSlots(inst?.settings?.slots)
}

export async function saveSupplementSlots(profileId: string, slots: SupplementSlotDef[]): Promise<void> {
  const inst = await ensureInstance(profileId, 'supplements', true)
  const current = (await db.module_instance.get(inst.id)) ?? inst
  await edit('module_instance', current, { settings: { ...(current.settings ?? {}), slots } })
}

/** HAB-23: the old switch "A daily habit appears on every day" gave way to
 *  the module's Show on Today / Plan / widget switches (GEN-03). Someone who
 *  had switched it off keeps what they chose: habits stay off Today and the
 *  widget, now through the new switches. Done once; harmless to repeat. */
export async function retireHabitsDailyRule(profile: Profile): Promise<void> {
  const inst = await db.module_instance.where('profile_id').equals(profile.id).filter((m) => m.module_key === 'habits').first()
  const overlay = inst?.settings?.[OVERLAY_KEY] as { rulesOff?: unknown } | undefined
  const wasOff = Array.isArray(overlay?.rulesOff) && overlay!.rulesOff.includes('daily')
  if (!wasOff || readSettings(profile).module_views.habits) return
  await saveSettings(profile, { module_views: { habits: { today: false, widget: false } } })
}
