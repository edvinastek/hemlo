import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { queueChange } from './sync'
import { edit } from './write'
import { targetsFor } from './calc'
import { isCardio, trainingKcal, type TrainingMode } from './activity'
import { latestOnOrBefore, missingForTargets, readBodySettings, recalcReason, type BodySettings, type RecalcWhy } from './body-rules'
import { ensureInstance, instanceFor } from '../modules/defs'
import { builtinRuleOn } from '../modules/rule-switch'
import type { BodyLog, Profile, Target } from './types'

/** The body choices kept with the Health module (per profile, synced): the
 *  numbers behind the targets (BODY-03) and the activity answers, with
 *  whether training is inside the factor (BODY-10, BODY-16). */
const BODY_KEY = 'body'

export async function bodySettings(profileId: string): Promise<BodySettings> {
  return readBodySettings((await instanceFor(profileId, 'health'))?.settings?.[BODY_KEY])
}

export function useBodySettings(profileId: string | null | undefined): BodySettings {
  return useLiveQuery(async () => (profileId ? bodySettings(profileId) : readBodySettings(null)), [profileId], readBodySettings(null))
}

/** Save body choices, keeping the Health module's other settings. The row is
 *  made switched off when there is none: a choice never switches a module on. */
export async function saveBodySettings(profileId: string, change: Partial<BodySettings>): Promise<BodySettings> {
  const inst = await ensureInstance(profileId, 'health', false)
  const current = (await db.module_instance.get(inst.id)) ?? inst
  const next = readBodySettings({ ...readBodySettings(current.settings?.[BODY_KEY]), ...change })
  await edit('module_instance', current, { settings: { ...(current.settings ?? {}), [BODY_KEY]: next } })
  return next
}

/** The row for a profile's day, deleted or not. The server keeps one body_log
 *  per (profile_id, log_date) and one target per (profile_id, from_date), and a
 *  soft-deleted row still holds that slot, so it is brought back rather than
 *  a second row created that the server would refuse. If another device wrote
 *  the day and this one has not pulled it yet, the insert is refused and shows
 *  up under conflicts; nothing local can see that row sooner. */
async function bodyLogFor(profileId: string, day: string): Promise<BodyLog | undefined> {
  const rows = await db.body_log.where('log_date').equals(day).filter((r) => r.profile_id === profileId).toArray()
  return rows.find((r) => !r.deleted_at) ?? rows[0]
}

async function targetFor(profileId: string, day: string): Promise<Target | undefined> {
  const rows = await db.target.where('from_date').equals(day).filter((r) => r.profile_id === profileId).toArray()
  return rows.find((r) => !r.deleted_at) ?? rows[0]
}

/** Write the day's weight and waist: update the day's row when it exists,
 *  otherwise create it. */
export async function saveWeighIn(profileId: string, day: string, weightKg: number, waistCm: number | null): Promise<BodyLog> {
  const existing = await bodyLogFor(profileId, day)
  if (existing) {
    const changes: Partial<BodyLog> = { weight_kg: weightKg, waist_cm: waistCm }
    if (existing.deleted_at) changes.deleted_at = null
    return edit('body_log', existing, changes)
  }
  const row: BodyLog = {
    id: crypto.randomUUID(),
    profile_id: profileId,
    log_date: day,
    weight_kg: weightKg,
    waist_cm: waistCm,
    note: null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
  await db.body_log.put(row)
  await queueChange('body_log', row, ['profile_id', 'log_date', 'weight_kg', 'waist_cm'])
  return row
}

/** Recalculate the targets from a new weight, starting on that day. Returns
 *  what is missing from the profile instead when the calculation would have
 *  to guess, and writes nothing in that case. */
export async function retarget(profile: Profile, day: string, weightKg: number, why?: RecalcWhy): Promise<{ missing: string } | { target: Target }> {
  const missing = missingForTargets(profile)
  if (missing) return { missing }

  // Age is taken on the weigh-in's own day, read as a local date.
  const [y, m, d] = day.split('-').map(Number)
  const settings = await bodySettings(profile.id)
  const t = targetsFor(profile, weightKg, new Date(y, m - 1, d), {
    plan: settings.plan, why: why ? recalcReason(why) || undefined : undefined, trainingAdded: settings.activity.mode === 'added',
  })
  if (!t) return { missing: missingForTargets(profile) ?? 'Targets need your height, date of birth and sex.' }
  const values = {
    kcal: t.kcal, protein_g: t.protein_g, fat_g: t.fat_g,
    carbs_g: t.carbs_g, fiber_g: t.fiber_g, reason: t.explain,
  }

  const existing = await targetFor(profile.id, day)
  if (existing) {
    const changes: Partial<Target> = { ...values }
    if (existing.deleted_at) changes.deleted_at = null
    return { target: await edit('target', existing, changes) }
  }
  const row: Target = {
    id: crypto.randomUUID(),
    profile_id: profile.id,
    from_date: day,
    ...values,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
  await db.target.put(row)
  await queueChange('target', row, ['profile_id', 'from_date', 'kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'reason'])
  return { target: row }
}

/** The targets in force on a day: the newest ones starting on or before it. */
export async function targetsOn(profileId: string, day: string): Promise<Target | null> {
  const rows = await db.target.where('profile_id').equals(profileId).toArray()
  const live = rows.filter((r) => !r.deleted_at && r.from_date <= day)
  live.sort((a, b) => b.from_date.localeCompare(a.from_date))
  return live[0] ?? null
}

/** Every weigh-in with a weight, deleted ones left out. Numbers are coerced
 *  because a numeric column can arrive from the server as a string. */
export async function weighIns(profileId: string): Promise<(BodyLog & { weight_kg: number })[]> {
  const rows = await db.body_log.where('profile_id').equals(profileId).toArray()
  return rows
    .filter((r) => !r.deleted_at && r.weight_kg !== null && r.weight_kg !== undefined)
    .map((r) => ({ ...r, weight_kg: Number(r.weight_kg), waist_cm: r.waist_cm == null ? null : Number(r.waist_cm) }))
}

/** Fill in the sex, height or date of birth the targets were waiting for, then
 *  work the targets out from the weigh-in on or before the day, starting on
 *  that weigh-in's own day. Only the fields given are written, so a value
 *  another device set for the other field is not overwritten. */
export async function completeProfile(
  profile: Profile,
  fields: Partial<Pick<Profile, 'height_cm' | 'birth_date' | 'sex'>>,
  day: string,
): Promise<{ retargeted: boolean }> {
  const next = await edit<Profile>('profile', profile, fields)
  const latest = latestOnOrBefore(await weighIns(profile.id), day)
  if (!latest) return { retargeted: false }
  const result = await retarget(next, latest.log_date, latest.weight_kg)
  return { retargeted: 'target' in result }
}

/** Targets worked out again after something they rest on changed (goal,
 *  activity, height, date of birth, sex, the plan's numbers), not only on a
 *  weigh-in (BODY-04): from the latest weigh-in, starting today, so earlier
 *  days keep the targets they had. Says what happened, for the note. */
export async function recalcTargets(profile: Profile, today: string, why: RecalcWhy): Promise<string> {
  if (!await builtinRuleOn(profile.id, 'health', 'retarget')) return 'Saved. Targets are left as they are: recalculating is switched off in Edit module.'
  const missing = missingForTargets(profile)
  if (missing) return `Saved. ${missing}`
  const latest = latestOnOrBefore(await weighIns(profile.id), today)
  if (!latest) return 'Saved. Save a weigh-in and the targets are worked out from it.'
  const result = await retarget(profile, today, latest.weight_kg, why)
  return 'target' in result ? `Saved, and targets recalculated from ${latest.weight_kg} kg.` : `Saved. ${result.missing}`
}

/** What the day's logged training adds to its budget (BODY-16): only when
 *  training is logged separately and added, from that day's sets and the
 *  weight on or before it. `kcal` is null when there are sets but no weight
 *  to work them out with. */
export async function trainingOn(profileId: string, day: string): Promise<{ mode: TrainingMode; sets: number; kcal: number | null }> {
  const { activity } = await bodySettings(profileId)
  if (activity.mode !== 'added') return { mode: activity.mode, sets: 0, kcal: 0 }
  const logs = (await db.workout_log.where('log_date').equals(day).toArray())
    .filter((l) => l.profile_id === profileId && !l.deleted_at)
  if (!logs.length) return { mode: 'added', sets: 0, kcal: 0 }
  const ids = [...new Set(logs.map((l) => l.exercise_id).filter((x): x is string => !!x))]
  const exercises = new Map((await db.exercise.bulkGet(ids)).filter((e) => !!e).map((e) => [e!.id, e!]))
  const weight = latestOnOrBefore(await weighIns(profileId), day)?.weight_kg ?? null
  const sets = logs.map((l) => ({ seconds: l.seconds, cardio: isCardio(l.exercise_id ? exercises.get(l.exercise_id) : null) }))
  return { mode: 'added', sets: logs.length, kcal: trainingKcal(sets, weight) }
}
