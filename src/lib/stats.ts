import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db, getMeta, setMeta } from './db'
import { supabase } from './supabase'
import { recipeMacros } from './calc'
import { quickMacros } from './quick-food'
import { readSettings, type ProfileSettings } from './settings'
import { doneDays, pickLog } from './tracking-rules'
import { moduleLabel, taskModule } from './colours-rules'
import { moduleView } from './module-view-rules'
import { moduleDefs, instanceFor } from '../modules/defs'
import { computeFormulas, recordDate } from '../modules/def-rules'
import { edit } from './write'
import type { EntityDef } from '../modules/types'
import type { Food, ModuleRecord, RecipeLine } from './types'
import { choreFacts, clockHours, habitFacts, sleepHours, type Range } from './stats-rules'
import { measureCatalogue, NUTRIENT_NAMES, viewModules, viewSpec, type Measure, type ModuleInput } from './stats-builder-rules'
import { addDays } from './schedule-rules'
import { loadDayItems } from './day-items'
import { daysWith, pivot, spanDays, type Fact, type PivotResult } from './pivot-rules'
import type { StatsView } from './stats-view-rules'

/** Turns everything the person keeps, in every module, into facts for the
 *  stats builder (GEN-41): one number on one day, with what it is about.
 *  Every read is this profile's rows (and the household's shared ones), and
 *  a deleted row never counts. The arithmetic is in pivot-rules.ts. */

/* ---------- which modules count -------------------------------------------- */

export interface StatsModule extends ModuleInput { on: boolean }

/** The modules Stats reads: every module that is on and has "Count in
 *  Stats" on (GEN-03), plus the switched-off ones when the person asks to
 *  see them. Tasks are the planner's own and always count. */
export async function statsModules(profileId: string, settings: ProfileSettings, showDisabled: boolean, everyOn = false): Promise<{ shown: StatsModule[]; hiddenOff: number }> {
  const entries = (await moduleDefs(profileId)).filter((e) => !['stats', 'custom', 'core'].includes(e.def.key))
  // Today's cards are the person's own pick, so they read every module that is on.
  const counted = entries.filter((e) => everyOn || moduleView(settings.module_views, e.def.key).stats)
  const shown = counted.filter((e) => e.enabled || showDisabled)
  return {
    shown: shown.map((e) => ({
      key: e.def.key, name: e.def.built ? e.def.name : moduleLabel(e.def.key), on: e.enabled,
      entities: e.def.entities.filter((x) => !x.table),
    })),
    hiddenOff: counted.length - shown.length,
  }
}

/** Every measure the counted modules keep, with the person's own nutrient
 *  targets attached to the nutrients (for "% of days on target"). */
export async function loadCatalogue(profileId: string, settings: ProfileSettings, showDisabled: boolean, span?: Range, everyOn = false): Promise<{ catalogue: Measure[]; modules: StatsModule[]; hiddenOff: number }> {
  const { shown, hiddenOff } = await statsModules(profileId, settings, showDisabled, everyOn)
  const catalogue = measureCatalogue(shown, settings.nutrients)
  const first = await firstDays(profileId, shown)
  for (const m of catalogue) if (first[m.module]) m.since = first[m.module]
  if (span && shown.some((m) => m.key === 'nutrition')) {
    const targets = await nutrientTargets(profileId, span)
    for (const m of catalogue) {
      const n = m.key.replace(/^nutrition:(planned_)?/, '')
      if (m.module === 'nutrition' && targets[n]) m.targets = targets[n]
    }
  }
  return { catalogue, modules: shown, hiddenOff }
}

/** The first day each module has anything, so the days before the person
 *  used it count as unknown rather than as days of nothing (P8). */
async function firstDays(profileId: string, modules: StatsModule[]): Promise<Record<string, string>> {
  const profile = await db.profile.get(profileId)
  const out: Record<string, string> = {}
  const keep = (k: string, d: string | null | undefined) => { if (d && (!out[k] || d < out[k])) out[k] = d.slice(0, 10) }
  const firstTask = await db.task.where('[profile_id+planned_date]').between([profileId, '0000'], [profileId, '9999'], true, true).first()
  keep('tasks', firstTask?.planned_date)
  keep('projects', firstTask?.planned_date)
  const keys = new Set(modules.map((m) => m.key))
  if (keys.has('habits')) {
    const ids = new Set((await db.habit.where('profile_id').equals(profileId).toArray()).map((h) => h.id))
    if (ids.size) keep('habits', (await db.habit_log.orderBy('log_date').filter((l) => ids.has(l.habit_id)).first())?.log_date)
  }
  if (keys.has('supplements')) {
    const ids = new Set((await db.supplement.where('profile_id').equals(profileId).toArray()).map((h) => h.id))
    if (ids.size) keep('supplements', (await db.supplement_log.orderBy('log_date').filter((l) => ids.has(l.supplement_id)).first())?.log_date)
  }
  if (keys.has('nutrition')) {
    keep('nutrition', (await db.food_log.orderBy('log_date').filter((l) => l.profile_id === profileId && !l.deleted_at).first())?.log_date)
    keep('nutrition', (await db.meal_plan_slot.orderBy('slot_date').filter((l) => l.profile_id === profileId && !l.deleted_at).first())?.slot_date)
  }
  if (keys.has('health')) keep('health', (await db.body_log.orderBy('log_date').filter((l) => l.profile_id === profileId && !l.deleted_at).first())?.log_date)
  if (keys.has('sleep')) keep('sleep', (await db.sleep_log.where('[profile_id+log_date]').between([profileId, '0000'], [profileId, '9999'], true, true).first())?.log_date)
  if (keys.has('training')) keep('training', (await db.workout_log.orderBy('log_date').filter((l) => l.profile_id === profileId && !l.deleted_at).first())?.log_date)
  if (keys.has('agenda')) keep('agenda', localDay((await db.calendar_event.orderBy('starts_at').filter((e) => e.profile_id === profileId && !e.subscription_id && !e.deleted_at).first())?.starts_at))
  if (keys.has('household') && profile) {
    const ids = new Set((await db.chore.where('household_id').equals(profile.household_id).toArray()).map((c) => c.id))
    if (ids.size) keep('household', (await db.chore_log.orderBy('done_on').filter((l) => ids.has(l.chore_id)).first())?.done_on)
  }
  if (keys.has('shopping') && profile) {
    for (const r of await db.shopping_entry.where('household_id').equals(profile.household_id).toArray()) keep('shopping', localDay(r.created_at ?? r.checked_at))
  }
  for (const m of modules) {
    if (!(m.entities ?? []).length) continue
    for (const r of await db.module_record.where('[profile_id+module_key]').equals([profileId, m.key]).toArray()) keep(m.key, r.record_date ?? localDay(r.created_at))
  }
  return out
}

/** The person's nutrient targets for each day: the latest set on or before it. */
async function nutrientTargets(profileId: string, span: Range): Promise<Record<string, Record<string, number>>> {
  const rows = (await db.target.where('profile_id').equals(profileId).toArray()).filter((t) => !t.deleted_at)
    .sort((a, b) => a.from_date.localeCompare(b.from_date))
  const out: Record<string, Record<string, number>> = {}
  if (!rows.length) return out
  for (const d of spanDays(span)) {
    let t = null as (typeof rows)[number] | null
    for (const r of rows) if (r.from_date <= d) t = r; else break
    if (!t) continue
    for (const k of Object.keys(NUTRIENT_NAMES)) {
      const v = (t as unknown as Record<string, number | null>)[k]
      if (v != null && Number.isFinite(Number(v)) && Number(v) > 0) (out[k] ??= {})[d] = Number(v)
    }
  }
  return out
}

/* ---------- names kept for offline use ------------------------------------------ */

const DAY_MS = 86_400_000
const GROUPS: Record<string, string> = { push: 'Push', pull: 'Pull', legs: 'Legs', core: 'Core', mobility: 'Mobility', cardio: 'Cardio', full_body: 'Full body' }
let refreshing: Promise<void> | null = null

/** Exercises with their muscle group, and household members' names: read
 *  from the server at most once a day when online, and kept for offline
 *  use. Called from the screens, never inside a live query, so the figures
 *  never wait on the network. */
export function refreshStatsNames(householdId: string | null | undefined): Promise<void> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const due = async (key: string) => {
      const at = await getMeta<string | null>(`${key}:at`, null)
      return !at || Date.now() - Date.parse(at) > DAY_MS
    }
    const keep = async (key: string, value: unknown) => { await setMeta(key, value); await setMeta(`${key}:at`, new Date().toISOString()) }
    if (await due('stats:exercises')) {
      const { data, error } = await supabase.from('exercise').select('id,name,type').limit(3000)
      if (!error && data) await keep('stats:exercises', data)
    }
    const mkey = `stats:members:${householdId}`
    if (householdId && await due(mkey)) {
      const { data, error } = await supabase.from('household_member').select('user_id,display_name').eq('household_id', householdId)
      if (!error && data) await keep(mkey, data)
    }
  })().catch(() => undefined).finally(() => { refreshing = null })
  return refreshing
}

async function exerciseKinds(): Promise<Map<string, { name: string; group: string | null }>> {
  const rows = await getMeta<{ id: string; name: string; type: string | null }[]>('stats:exercises', [])
  const names = await getMeta<{ id: string; name: string }[]>('catalogue:exercise', [])
  const out = new Map<string, { name: string; group: string | null }>()
  for (const n of names) out.set(n.id, { name: n.name, group: null })
  for (const r of rows) out.set(r.id, { name: r.name, group: r.type ? GROUPS[r.type] ?? r.type : null })
  return out
}

async function memberNames(householdId: string): Promise<Map<string, string>> {
  const rows = await getMeta<{ user_id: string; display_name: string | null }[]>(`stats:members:${householdId}`, [])
  return new Map(rows.filter((r) => r.display_name?.trim()).map((r) => [r.user_id, r.display_name!.trim()]))
}

/* ---------- facts per module -------------------------------------------------- */

interface Ctx { profileId: string; householdId: string; userId: string | null; span: Range; today: string; settings: ProfileSettings }

const live = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)
const inSpan = (d: string | null | undefined, r: Range): d is string => !!d && d >= r.start && d <= r.end
const localDay = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? null : format(t, 'yyyy-MM-dd')
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}

async function taskFacts(c: Ctx, wantProjects: boolean): Promise<Fact[]> {
  const rows = live(await db.task.where('[profile_id+planned_date]').between([c.profileId, c.span.start], [c.profileId, c.span.end], true, true).toArray())
    // The same tasks a day counts everywhere else: day tasks not dropped.
    .filter((t) => t.status !== 'dropped' && (t.horizon ?? 'day') === 'day')
  const projects = new Map<string, string>()
  if (wantProjects) {
    for (const r of live(await db.module_record.where('[profile_id+module_key]').equals([c.profileId, 'projects']).toArray())) {
      projects.set(r.id, String(r.data?.name ?? 'Project'))
    }
  }
  const out: Fact[] = []
  for (const t of rows) {
    const day = t.planned_date!
    const mod = taskModule(t)
    const base = { day, module: 'tasks', item: t.title, section: t.category, category: mod ? moduleLabel(mod) : null, ref: { table: 'task', id: t.id, label: t.title } }
    const done = t.status === 'done'
    out.push({ ...base, measure: 'tasks:planned', value: 1 })
    if (done) out.push({ ...base, measure: 'tasks:done', value: 1 })
    if (t.duration_min != null) {
      out.push({ ...base, measure: 'tasks:minutes_planned', value: Number(t.duration_min) })
      if (done) out.push({ ...base, measure: 'tasks:minutes_done', value: Number(t.duration_min) })
    }
    if (t.push_count > 0) out.push({ ...base, measure: 'tasks:pushed', value: t.push_count })
    if (wantProjects && t.project_id) {
      const p = { ...base, module: 'projects', item: projects.get(t.project_id) ?? 'Project' }
      out.push({ ...p, measure: done ? 'projects:tasks_done' : 'projects:tasks_open', value: 1 })
    }
  }
  return out
}

async function habitsFacts(c: Ctx): Promise<Fact[]> {
  const habits = (await db.habit.where('profile_id').equals(c.profileId).toArray()).filter((h) => !h.deleted_at)
  if (!habits.length) return []
  // A week either side, so a times-a-week habit's whole weeks are known.
  const from = addDays(c.span.start, -7)
  const logs = await db.habit_log.where('habit_id').anyOf(habits.map((h) => h.id))
    .filter((l) => l.log_date >= from && l.log_date <= c.span.end).toArray()
  const by: Record<string, typeof logs> = {}
  for (const l of logs) (by[l.habit_id] ??= []).push(l)
  const done: Record<string, string[]> = {}
  const amounts: Record<string, Record<string, number>> = {}
  for (const [id, rows] of Object.entries(by)) {
    done[id] = doneDays(rows)
    const perDay = new Map<string, typeof rows>()
    for (const r of rows) perDay.set(r.log_date, [...(perDay.get(r.log_date) ?? []), r])
    for (const [d, list] of perDay) {
      const a = pickLog(list)?.amount
      if (a != null && Number.isFinite(Number(a))) (amounts[id] ??= {})[d] = Number(a)
    }
  }
  return habitFacts(habits, done, amounts, c.span, c.today)
}

const SLOT_NAME: Record<string, string> = { morning: 'Morning', midday: 'Midday', evening: 'Evening' }

async function supplementFacts(c: Ctx): Promise<Fact[]> {
  const all = (await db.supplement.where('profile_id').equals(c.profileId).toArray()).filter((x) => !x.deleted_at)
  if (!all.length) return []
  const logs = await db.supplement_log.where('supplement_id').anyOf(all.map((x) => x.id))
    .filter((l) => inSpan(l.log_date, c.span)).toArray()
  const out: Fact[] = []
  for (const s of all) {
    const base = { module: 'supplements', item: s.name, section: s.time_slot ? SLOT_NAME[s.time_slot] : null, ref: { table: 'supplement', id: s.id, label: s.name } }
    for (const d of doneDays(logs.filter((l) => l.supplement_id === s.id))) out.push({ ...base, day: d, measure: 'supplements:taken', value: 1 })
    if (!s.active) continue
    for (let d = c.span.start; d <= c.span.end && d <= c.today; d = addDays(d, 1)) out.push({ ...base, day: d, measure: 'supplements:due', value: 1 })
  }
  return out
}

type Macros = Record<string, number>

async function nutritionFacts(c: Ctx): Promise<Fact[]> {
  const logs = live(await db.food_log.where('profile_id').equals(c.profileId).toArray()).filter((l) => inSpan(l.log_date, c.span))
  const slots = live(await db.meal_plan_slot.where('profile_id').equals(c.profileId).toArray())
    .filter((s) => inSpan(s.slot_date, c.span) && s.status !== 'skipped')
  if (!logs.length && !slots.length) return []
  const foodIds = new Set([...logs.map((l) => l.food_id), ...slots.map((s) => s.food_id)].filter((x): x is string => !!x))
  const recipeIds = [...new Set([...logs.map((l) => l.recipe_id), ...slots.map((s) => s.recipe_id)].filter((x): x is string => !!x))]
  const lines = recipeIds.length ? await db.recipe_line.where('recipe_id').anyOf(recipeIds).toArray() : []
  for (const l of lines) if (l.food_id) foodIds.add(l.food_id)
  const foods = new Map<string, Food>((await db.food.bulkGet([...foodIds])).filter((f): f is Food => !!f).map((f) => [f.id, f]))
  const recipes = new Map((await db.recipe.bulkGet(recipeIds)).filter((r) => !!r).map((r) => [r!.id, r!.name]))
  const linesBy = new Map<string, RecipeLine[]>()
  for (const l of lines) linesBy.set(l.recipe_id, [...(linesBy.get(l.recipe_id) ?? []), l])
  const perRecipe = new Map<string, Macros>()
  const recipeM = (id: string) => {
    if (!perRecipe.has(id)) perRecipe.set(id, recipeMacros(linesBy.get(id) ?? [], foods) as unknown as Macros)
    return perRecipe.get(id)!
  }
  const foodM = (f: Food | undefined, grams: number | null | undefined): Macros | null => {
    if (!f || grams == null) return null
    const k = Number(grams) / 100
    return Object.fromEntries(Object.keys(NUTRIENT_NAMES).map((n) => [n, Number((f as unknown as Record<string, number | null>)[n] ?? 0) * k]))
  }
  const mealName = (key: string | null | undefined) => (key ? c.settings.meals.names.find((m) => m.key === key)?.name ?? key[0].toUpperCase() + key.slice(1) : null)
  const out: Fact[] = []
  const days = new Set<string>()
  for (const log of logs) {
    let m: Macros | null = null
    let item: string | null = null
    if (log.kcal != null) { m = quickMacros(log); item = log.label ?? 'Quick entry' }
    else if (log.food_id) { m = foodM(foods.get(log.food_id), log.grams); item = foods.get(log.food_id)?.name ?? null }
    else if (log.recipe_id) {
      const per = recipeM(log.recipe_id); const n = Number(log.portions ?? 1)
      m = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * n])); item = recipes.get(log.recipe_id) ?? 'Recipe'
    }
    if (!m) continue
    days.add(log.log_date)
    // The meal an entry belongs to, where the food logging keeps one.
    const meal = (log as unknown as { meal?: string | null; slot?: string | null }).meal ?? (log as unknown as { slot?: string | null }).slot ?? null
    const base = { day: log.log_date, module: 'nutrition', item, section: mealName(meal), ref: { table: 'food_log', id: log.id, label: item ?? 'Food' } }
    out.push({ ...base, measure: 'nutrition:entries', value: 1 })
    for (const n of Object.keys(NUTRIENT_NAMES)) if (Number.isFinite(m[n])) out.push({ ...base, measure: `nutrition:${n}`, value: m[n] })
  }
  for (const d of days) out.push({ day: d, module: 'nutrition', measure: 'nutrition:days', value: 1 })
  for (const s of slots) {
    let m: Macros | null = null
    let item: string | null = null
    if (s.kcal != null) { m = quickMacros(s); item = s.label ?? 'Quick meal' }
    else if (s.recipe_id) {
      const per = recipeM(s.recipe_id)
      m = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * Number(s.portion_multiplier ?? 1)])); item = recipes.get(s.recipe_id) ?? 'Recipe'
    } else if (s.food_id) { m = foodM(foods.get(s.food_id), s.grams); item = foods.get(s.food_id)?.name ?? null }
    if (!m) continue
    const base = { day: s.slot_date, module: 'nutrition', item, section: mealName(s.slot), ref: { table: 'meal_plan_slot', id: s.id, label: item ?? 'Meal' } }
    for (const n of Object.keys(NUTRIENT_NAMES)) if (Number.isFinite(m[n])) out.push({ ...base, measure: `nutrition:planned_${n}`, value: m[n] })
  }
  return out
}

async function healthFacts(c: Ctx): Promise<Fact[]> {
  const rows = live(await db.body_log.where('profile_id').equals(c.profileId).toArray()).filter((r) => inSpan(r.log_date, c.span))
  // One reading a day: the latest edit wins, as on the Health page.
  const byDay = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const seen = byDay.get(r.log_date)
    if (!seen || (r.updated_at ?? '') > (seen.updated_at ?? '')) byDay.set(r.log_date, r)
  }
  const out: Fact[] = []
  for (const [d, r] of byDay) {
    const ref = { table: 'body_log', id: r.id, label: 'Weigh-in' }
    if (r.weight_kg != null) {
      out.push({ day: d, module: 'health', measure: 'health:weight', value: Number(r.weight_kg), ref })
      out.push({ day: d, module: 'health', measure: 'health:weigh_ins', value: 1, ref })
    }
    if (r.waist_cm != null) out.push({ day: d, module: 'health', measure: 'health:waist', value: Number(r.waist_cm), ref })
  }
  return out
}

async function sleepFacts(c: Ctx): Promise<Fact[]> {
  const rows = live(await db.sleep_log.where('[profile_id+log_date]').between([c.profileId, c.span.start], [c.profileId, c.span.end], true, true).toArray())
  const out: Fact[] = []
  for (const r of rows) {
    const base = { day: r.log_date, module: 'sleep', ref: { table: 'sleep_log', id: r.id, label: 'Night' } }
    const h = r.hours != null ? Number(r.hours) : sleepHours(r.went_to_bed, r.woke_at)
    if (h != null) out.push({ ...base, measure: 'sleep:hours', value: h }, { ...base, measure: 'sleep:nights', value: 1 })
    if (r.quality != null) out.push({ ...base, measure: 'sleep:quality', value: Number(r.quality) })
    const bed = clockHours(r.went_to_bed, true); const wake = clockHours(r.woke_at)
    if (bed != null) out.push({ ...base, measure: 'sleep:bed', value: bed })
    if (wake != null) out.push({ ...base, measure: 'sleep:wake', value: wake })
  }
  return out
}

async function trainingFacts(c: Ctx): Promise<Fact[]> {
  const rows = live(await db.workout_log.where('log_date').between(c.span.start, c.span.end, true, true).filter((r) => r.profile_id === c.profileId).toArray())
  if (!rows.length) return []
  const kinds = await exerciseKinds()
  const out: Fact[] = []
  const days = new Set<string>()
  for (const r of rows) {
    const ex = r.exercise_id ? kinds.get(r.exercise_id) : undefined
    const label = ex?.name ?? 'Set'
    const base = { day: r.log_date, module: 'training', item: ex?.name ?? null, category: ex?.group ?? null, ref: { table: 'workout_log', id: r.id, label } }
    days.add(r.log_date)
    out.push({ ...base, measure: 'training:sets', value: 1 })
    if (r.reps_achieved != null) out.push({ ...base, measure: 'training:reps', value: Number(r.reps_achieved) })
    if (r.reps_achieved != null && r.load_kg != null) out.push({ ...base, measure: 'training:volume', value: Number(r.reps_achieved) * Number(r.load_kg) })
    if (r.load_kg != null) out.push({ ...base, measure: 'training:top_load', value: Number(r.load_kg) })
  }
  for (const d of days) out.push({ day: d, module: 'training', measure: 'training:sessions', value: 1 })
  return out
}

async function agendaFacts(c: Ctx): Promise<Fact[]> {
  // The person's own events; a followed calendar's are that calendar's.
  const rows = live(await db.calendar_event.where('profile_id').equals(c.profileId).toArray()).filter((r) => !r.subscription_id)
  const out: Fact[] = []
  for (const r of rows) {
    const d = localDay(r.starts_at)
    if (!inSpan(d, c.span)) continue
    const base = { day: d, module: 'agenda', item: r.title, ref: { table: 'calendar_event', id: r.id, label: r.title } }
    out.push({ ...base, measure: 'agenda:events', value: 1 })
    if (!r.all_day && r.ends_at) {
      const h = (Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 3_600_000
      if (Number.isFinite(h) && h > 0 && h < 24 * 14) out.push({ ...base, measure: 'agenda:hours', value: h })
    }
  }
  return out
}

async function householdFacts(c: Ctx): Promise<Fact[]> {
  const chores = await db.chore.where('household_id').equals(c.householdId).toArray()
  if (!chores.length) return []
  const logs = await db.chore_log.where('chore_id').anyOf(chores.map((x) => x.id)).toArray()
  const names = await memberNames(c.householdId)
  const others = new Map<string, string>()
  const person = (id: string | null) => {
    if (!id) return 'Nobody'
    if (names.has(id)) return id === c.userId ? `${names.get(id)} (you)` : names.get(id)!
    if (id === c.userId) return 'You'
    if (!others.has(id)) others.set(id, others.size ? `Member ${others.size + 1}` : 'Another member')
    return others.get(id)!
  }
  return choreFacts(chores, logs, c.span, c.today, person)
}

async function shoppingFacts(c: Ctx): Promise<Fact[]> {
  const rows = live(await db.shopping_entry.where('household_id').equals(c.householdId).toArray())
  const foodIds = [...new Set(rows.map((r) => r.food_id).filter((x): x is string => !!x))]
  const foods = new Map((await db.food.bulkGet(foodIds)).filter((f) => !!f).map((f) => [f!.id, f!.name]))
  const out: Fact[] = []
  const trips = new Set<string>()
  for (const r of rows) {
    const name = r.name ?? (r.food_id ? foods.get(r.food_id) : null) ?? 'Item'
    const base = { module: 'shopping', item: name, section: r.aisle, category: r.shop, ref: { table: 'shopping_entry', id: r.id, label: name } }
    const added = localDay(r.created_at)
    if (!r.plan_key && inSpan(added, c.span)) out.push({ ...base, day: added, measure: 'shopping:added', value: 1 })
    const bought = r.checked ? localDay(r.checked_at) : null
    if (inSpan(bought, c.span)) { out.push({ ...base, day: bought, measure: 'shopping:bought', value: 1 }); trips.add(bought) }
  }
  for (const d of trips) out.push({ day: d, module: 'shopping', measure: 'shopping:trips', value: 1 })
  return out
}

const NUMERIC = new Set(['number', 'integer', 'duration', 'formula', 'rating', 'money', 'currency', 'decimal'])
const CHOICE = new Set(['select', 'text', 'multiselect', 'multi', 'tags', 'multi_select', 'choice'])

/** A record's name: its first text value. */
function recordName(e: EntityDef, data: Record<string, unknown>): string | null {
  for (const f of e.fields) {
    const v = data[f.name]
    if ((f.type === 'text' || f.type === 'select') && typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Any module kept in the record store (Learning, Finance, Projects, the
 *  old Household chores, every built module): records per day, each number
 *  and yes/no field, its choice and text fields as groupings. */
async function recordFacts(c: Ctx, m: StatsModule): Promise<Fact[]> {
  const entities = m.entities ?? []
  if (!entities.length) return []
  const rows: ModuleRecord[] = live(await db.module_record.where('[profile_id+module_key]').equals([c.profileId, m.key]).toArray())
  const out: Fact[] = []
  for (const e of entities) {
    const dated = e.fields.some((f) => f.type === 'date' || f.type === 'datetime')
    for (const r of rows) {
      if (r.entity !== e.name) continue
      const data = { ...(r.data ?? {}), ...computeFormulas(e.fields, r.data ?? {}) }
      const day = dated ? (r.record_date ?? recordDate(e.fields, data)) : localDay(r.created_at)
      if (!inSpan(day, c.span)) continue
      const fields: Record<string, string | string[] | null> = {}
      for (const f of e.fields) {
        if (!CHOICE.has(f.type)) continue
        const v = data[f.name]
        fields[f.name] = Array.isArray(v) ? v.map(String) : v == null || v === '' ? null : String(v)
      }
      const name = recordName(e, data)
      const base = { day, module: m.key, item: name, fields, ref: { table: 'module_record', id: r.id, label: name ?? e.label } }
      if (!dated) { out.push({ ...base, measure: `${m.key}:${e.name}:added`, value: 1 }); continue }
      out.push({ ...base, measure: `${m.key}:${e.name}:count`, value: 1 })
      for (const f of e.fields) {
        if (f.hidden) continue
        if (NUMERIC.has(f.type)) {
          const v = num(data[f.name])
          if (v != null) out.push({ ...base, measure: `${m.key}:${e.name}:${f.name}`, value: v })
        } else if (f.type === 'boolean' && data[f.name] === true) {
          out.push({ ...base, measure: `${m.key}:${e.name}:${f.name}`, value: 1 })
        }
      }
    }
  }
  return out
}

/** Every fact of the given modules (all counted ones when none are named)
 *  for a span of days. */
export async function loadFacts(profileId: string, span: Range, today: string, modules: StatsModule[], only?: string[] | null): Promise<Fact[]> {
  const profile = await db.profile.get(profileId)
  if (!profile) return []
  const owner = await getMeta<string | null>('owner', null)
  const c: Ctx = { profileId, householdId: profile.household_id, userId: owner, span, today, settings: readSettings(profile) }
  const want = (k: string) => !only || only.includes(k)
  const on = new Set(modules.map((m) => m.key))
  const jobs: Promise<Fact[]>[] = []
  if (want('tasks') || (want('projects') && on.has('projects'))) {
    jobs.push(taskFacts(c, on.has('projects') && want('projects')).then((fs) => (want('tasks') ? fs : fs.filter((f) => f.module !== 'tasks'))))
  }
  for (const m of modules) {
    if (!want(m.key)) continue
    switch (m.key) {
      case 'habits': jobs.push(habitsFacts(c)); break
      case 'supplements': jobs.push(supplementFacts(c)); break
      case 'nutrition': jobs.push(nutritionFacts(c)); break
      case 'health': jobs.push(healthFacts(c)); break
      case 'sleep': jobs.push(sleepFacts(c)); break
      case 'training': jobs.push(trainingFacts(c)); break
      case 'agenda': jobs.push(agendaFacts(c)); break
      case 'shopping': jobs.push(shoppingFacts(c)); break
      case 'household': jobs.push(householdFacts(c)); break
    }
    jobs.push(recordFacts(c, m))
  }
  return (await Promise.all(jobs)).flat()
}

/* ---------- a saved view, worked out ------------------------------------------ */

export interface ViewOutcome {
  result: PivotResult
  catalogue: Measure[]
  span: Range
  /** Days the comparison happened on, when it is shaded. */
  shade: Set<string> | null
  /** Modules the view reads from that are off (or not counted in Stats):
   *  their measures show as missing until switched back on. */
  modulesOff: string[]
  facts: Fact[]
  today: string
}

/** A saved view worked out for its range (moved back by offset ranges). */
export async function computeView(profileId: string, view: StatsView, today: string, offset = 0): Promise<ViewOutcome> {
  const profile = await db.profile.get(profileId)
  const settings = readSettings(profile)
  const spec = viewSpec(view, today, offset)
  const { catalogue, modules } = await loadCatalogue(profileId, settings, settings.stats.show_disabled, spec.range)
  const needed = viewModules(view)
  const facts = await loadFacts(profileId, spec.range, today, modules, needed)
  const result = pivot(spec, facts, catalogue, today, { moduleName: (k) => (k === 'tasks' ? 'Tasks' : modules.find((m) => m.key === k)?.name ?? moduleLabel(k)) })
  let shade: Set<string> | null = null
  if (view.compare?.shade) {
    const info = catalogue.find((m) => m.key === view.compare!.source)
    if (info) shade = daysWith(facts, info, spec.range, today)
  }
  const present = new Set(modules.map((m) => m.key))
  return { result, catalogue, span: spec.range, shade, facts, today, modulesOff: needed.filter((k) => k !== 'tasks' && !present.has(k)) }
}

/** A view kept live: a tick elsewhere redraws it. Undefined while loading. */
export function useView(profileId: string | undefined, view: StatsView | null, today: string, offset = 0): ViewOutcome | undefined {
  return useLiveQuery(async () => (profileId && view ? computeView(profileId, view, today, offset) : undefined),
    [profileId, view ? JSON.stringify(view) : '', today, offset])
}

/** The catalogue for the builder, live. */
export function useCatalogue(profileId: string | undefined, showDisabled: boolean): { catalogue: Measure[]; modules: StatsModule[]; hiddenOff: number } | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return undefined
    const profile = await db.profile.get(profileId)
    return loadCatalogue(profileId, readSettings(profile), showDisabled)
  }, [profileId, showDisabled])
}

/* ---------- module cards: what each one shows (STA-02) ------------------------ */

/** The measures picked for each module's card, kept per profile in the
 *  Stats module's own settings (synced like any module setting). */
export async function cardPicks(profileId: string): Promise<Record<string, string[]>> {
  const inst = await instanceFor(profileId, 'stats')
  const raw = (inst?.settings as Record<string, unknown> | undefined)?.card_measures
  const out: Record<string, string[]> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (/^[a-z0-9_]{1,40}$/.test(k) && Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string').slice(0, 12)
    }
  }
  return out
}

export async function saveCardPicks(profileId: string, moduleKey: string, keys: string[] | null): Promise<void> {
  const inst = await instanceFor(profileId, 'stats')
  if (!inst) return
  const settings = { ...(inst.settings ?? {}) } as Record<string, unknown>
  const picks = { ...((settings.card_measures as Record<string, string[]> | undefined) ?? {}) }
  if (keys && keys.length) picks[moduleKey] = keys.slice(0, 12); else delete picks[moduleKey]
  settings.card_measures = picks
  await edit('module_instance', inst, { settings })
}

export function useCardPicks(profileId: string | undefined): Record<string, string[]> {
  return useLiveQuery(async () => (profileId ? cardPicks(profileId) : {}), [profileId], {} as Record<string, string[]>)
}

/** Facts for the Stats page's period and the one before it, every counted
 *  module at once, live. */
export function usePeriodFacts(profileId: string | undefined, span: Range | null, today: string, showDisabled: boolean):
  { facts: Fact[]; catalogue: Measure[]; modules: StatsModule[]; hiddenOff: number } | undefined {
  return useLiveQuery(async () => {
    if (!profileId || !span) return undefined
    const profile = await db.profile.get(profileId)
    const settings = readSettings(profile)
    const { catalogue, modules, hiddenOff } = await loadCatalogue(profileId, settings, showDisabled, span)
    const facts = await loadFacts(profileId, span, today, modules)
    return { facts, catalogue, modules, hiddenOff }
  }, [profileId, span?.start, span?.end, today, showDisabled])
}

/* ---------- Today's pinned cards (TOD-20, TOD-21) ------------------------------ */

export interface TodayCardData {
  /** Modules switched on (cards of others never show). */
  enabled: Set<string>
  names: Map<string, string>
  facts: Fact[]
  catalogue: Measure[]
  items: { kind: string; module_key: string | null; done: boolean; title: string; time: string | null; parts?: { done: boolean }[] }[]
  listCount: number
  weight: { day: string; value: number } | null
  nutrient: string
}

/** Everything the module cards on Today need for one day, live. */
export function useTodayCardData(profileId: string | undefined, day: string, today: string, wanted: string[]): TodayCardData | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return undefined
    const profile = await db.profile.get(profileId)
    if (!profile) return undefined
    const settings = readSettings(profile)
    const span = { start: addDays(day, -6), end: day }
    const { catalogue, modules } = await loadCatalogue(profileId, settings, false, span, true)
    const on = modules.filter((m) => m.on)
    const need = on.filter((m) => wanted.includes(m.key))
    const facts = wanted.length ? await loadFacts(profileId, span, today, need, ['tasks', ...need.map((m) => m.key)]) : []
    const items = wanted.some((k) => ['habits', 'household', 'supplements', 'agenda'].includes(k))
      ? (await loadDayItems(profileId, profile.household_id, day, day, 'today', today)).map((i) => ({ kind: i.kind, module_key: i.module_key, done: i.done, title: i.title, time: i.time, parts: i.parts }))
      : []
    const listCount = wanted.includes('shopping')
      ? (await db.shopping_entry.where('household_id').equals(profile.household_id).toArray()).filter((r) => !r.deleted_at && !r.checked).length
      : 0
    let weight: TodayCardData['weight'] = null
    if (wanted.includes('health')) {
      for (const r of live(await db.body_log.where('profile_id').equals(profileId).toArray())) {
        if (r.weight_kg == null || r.log_date > day) continue
        if (!weight || r.log_date > weight.day) weight = { day: r.log_date, value: Number(r.weight_kg) }
      }
    }
    return {
      enabled: new Set(on.map((m) => m.key)),
      names: new Map(on.map((m) => [m.key, m.name])),
      facts, catalogue, items, listCount, weight,
      nutrient: settings.nutrients.includes('protein_g') ? 'protein_g' : settings.nutrients[0] ?? 'kcal',
    }
  }, [profileId, day, today, wanted.join(',')])
}
