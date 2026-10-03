/** Day and week templates (PLN-08): "Sunday reset", "Meal prep Monday".
 *  Save a day (or a week) as a template and drop it onto any day later.
 *  Kept in the core module's settings, so they follow the person to every
 *  device. Pure: stored values in, checked templates out; a template and a
 *  day in, the rows to make out. */
import { addDays, weekdayOf } from './schedule-rules.ts'
import { clearTicks } from './template-rules.ts'
import type { MealPlanSlot, Task } from './types'

export interface TemplateTask {
  /** 0 for a day template; 0 (Monday) to 6 (Sunday) in a week template. */
  day: number
  title: string
  time: string | null
  minutes: number | null
  section: string | null
  module_key: string | null
  locked: boolean
  notes: string | null
}

export interface TemplateMeal {
  day: number
  slot: string
  recipe_id: string | null
  food_id: string | null
  portions: number
  time: string | null
  label: string | null
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  grams: number | null
  unit: string | null
  unit_qty: number | null
}

export interface PlanTemplate {
  id: string
  name: string
  kind: 'day' | 'week'
  tasks: TemplateTask[]
  meals: TemplateMeal[]
}

export const MAX_PLAN_TEMPLATES = 50
export const MAX_TEMPLATE_TASKS = 150
export const MAX_TEMPLATE_MEALS = 60
const MAX_NOTE = 2000
const ID = /^[a-z0-9_-]{1,40}$/i
const UUID = /^[0-9a-f-]{36}$/i
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const KEY = /^[a-z0-9_]{1,40}$/

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const num = (v: unknown, lo: number, hi: number) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null
}
const time = (v: unknown) => (typeof v === 'string' && TIME.test(v.slice(0, 5)) ? v.slice(0, 5) : null)

function readTask(x: unknown, maxDay: number): TemplateTask | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  const title = text(r.title, 200)
  const day = Math.floor(Number(r.day))
  if (!title || !Number.isFinite(day) || day < 0 || day > maxDay) return null
  const minutes = num(r.minutes, 0, 1440)
  return {
    day, title, time: time(r.time), minutes: minutes === null ? null : Math.round(minutes),
    section: text(r.section, 40), module_key: typeof r.module_key === 'string' && KEY.test(r.module_key) ? r.module_key : null,
    locked: r.locked === true, notes: typeof r.notes === 'string' && r.notes ? r.notes.slice(0, MAX_NOTE) : null,
  }
}

function readMeal(x: unknown, maxDay: number): TemplateMeal | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  const day = Math.floor(Number(r.day))
  const slot = typeof r.slot === 'string' && KEY.test(r.slot) ? r.slot : null
  if (!slot || !Number.isFinite(day) || day < 0 || day > maxDay) return null
  const recipe = typeof r.recipe_id === 'string' && UUID.test(r.recipe_id) ? r.recipe_id : null
  const food = typeof r.food_id === 'string' && UUID.test(r.food_id) ? r.food_id : null
  const label = text(r.label, 120)
  const kcal = num(r.kcal, 0, 20000)
  if (!recipe && !food && !label && kcal === null) return null
  return {
    day, slot, recipe_id: recipe, food_id: food, portions: num(r.portions, 0.05, 100) ?? 1, time: time(r.time),
    label, kcal, protein_g: num(r.protein_g, 0, 2000), carbs_g: num(r.carbs_g, 0, 2000), fat_g: num(r.fat_g, 0, 2000),
    fiber_g: num(r.fiber_g, 0, 2000), grams: num(r.grams, 0, 100000), unit: text(r.unit, 40), unit_qty: num(r.unit_qty, 0, 10000),
  }
}

/** Stored templates, checked: at most 50, each with a name, an id used
 *  once, its tasks and meals cleaned (a broken row is dropped, the rest kept). */
export function readPlanTemplates(v: unknown): PlanTemplate[] {
  if (!Array.isArray(v)) return []
  const out: PlanTemplate[] = []
  const seen = new Set<string>()
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : null
    const name = text(r.name, 60)
    const kind = r.kind === 'week' ? 'week' : 'day'
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    const maxDay = kind === 'week' ? 6 : 0
    const tasks = (Array.isArray(r.tasks) ? r.tasks : []).map((t) => readTask(t, maxDay)).filter((t): t is TemplateTask => !!t).slice(0, MAX_TEMPLATE_TASKS)
    const meals = (Array.isArray(r.meals) ? r.meals : []).map((m) => readMeal(m, maxDay)).filter((m): m is TemplateMeal => !!m).slice(0, MAX_TEMPLATE_MEALS)
    out.push({ id, name, kind, tasks, meals })
    if (out.length >= MAX_PLAN_TEMPLATES) break
  }
  return out
}

/** A fresh id for a template name, not among those taken. */
export function planTemplateId(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'template'
  let id = base
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`
  return id
}

export interface TemplateChoices {
  /** Tasks of a repeating series too (as one-offs). */
  repeats: boolean
  meals: boolean
}

/** Tasks a template keeps: not deleted or dropped, not made by another part
 *  of the app (a meal's task comes with its meal; a shopping trip is remade). */
const keeps = (t: Task, c: TemplateChoices) =>
  !t.deleted_at && t.status !== 'dropped' && t.source !== 'meal' && t.source !== 'shopping' && (!t.series_id || c.repeats)

const mealHasFood = (s: MealPlanSlot) =>
  !s.deleted_at && (!!s.recipe_id || !!s.food_id || s.kcal != null || !!(s.label && s.label.trim()))

/** A template from the days given (one for a day template, Monday to Sunday
 *  for a week). Ticks in notes are cleared: a template is a fresh start. */
export function templateFrom(
  name: string, kind: 'day' | 'week', first: string, tasks: Task[], meals: MealPlanSlot[], c: TemplateChoices, taken: string[],
): PlanTemplate {
  const days = kind === 'week' ? 7 : 1
  const offset = (d: string | null) => {
    if (!d) return -1
    for (let i = 0; i < days; i++) if (addDays(first, i) === d) return i
    return -1
  }
  const ts: TemplateTask[] = tasks.filter((t) => keeps(t, c) && offset(t.planned_date) >= 0)
    .sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? '') || (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99') || a.sort_order - b.sort_order)
    .map((t) => ({
      day: offset(t.planned_date), title: t.title.trim().slice(0, 200), time: t.planned_time ? t.planned_time.slice(0, 5) : null,
      minutes: t.duration_min, section: t.category, module_key: t.module_key, locked: t.locked,
      notes: t.notes ? clearTicks(t.notes).slice(0, MAX_NOTE) : null,
    }))
    .filter((t) => t.title)
    .slice(0, MAX_TEMPLATE_TASKS)
  const ms: TemplateMeal[] = !c.meals ? [] : meals.filter((m) => mealHasFood(m) && offset(m.slot_date) >= 0)
    .sort((a, b) => a.slot_date.localeCompare(b.slot_date) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m) => ({
      day: offset(m.slot_date), slot: m.slot, recipe_id: m.recipe_id, food_id: m.food_id ?? null, portions: m.portion_multiplier,
      time: m.slot_time ? m.slot_time.slice(0, 5) : null, label: m.label ?? null, kcal: m.kcal ?? null, protein_g: m.protein_g ?? null,
      carbs_g: m.carbs_g ?? null, fat_g: m.fat_g ?? null, fiber_g: m.fiber_g ?? null, grams: m.grams ?? null,
      unit: m.unit ?? null, unit_qty: m.unit_qty ?? null,
    }))
    .slice(0, MAX_TEMPLATE_MEALS)
  const clean = name.trim().slice(0, 60) || (kind === 'week' ? 'Week' : 'Day')
  return { id: planTemplateId(clean, taken), name: clean, kind, tasks: ts, meals: ms }
}

/** The first day a template lands on when dropped on a day: that day for a
 *  day template; the Monday of that day's week for a week template. */
export const dropStart = (t: Pick<PlanTemplate, 'kind'>, day: string) =>
  t.kind === 'week' ? addDays(day, -((weekdayOf(day) + 6) % 7)) : day

/** The rows a template makes when dropped: tasks and meals with their days.
 *  The caller gives them ids and an owner. */
export function dropTemplate(t: PlanTemplate, day: string): { tasks: Partial<Task>[]; meals: Partial<MealPlanSlot>[] } {
  const start = dropStart(t, day)
  return {
    tasks: t.tasks.map((x, i) => ({
      title: x.title, planned_date: addDays(start, x.day), planned_time: x.time, duration_min: x.minutes,
      category: x.section, module_key: x.module_key, locked: x.locked, notes: x.notes, sort_order: i,
    })),
    meals: t.meals.map((m) => ({
      slot_date: addDays(start, m.day), slot: m.slot, recipe_id: m.recipe_id, food_id: m.food_id, portion_multiplier: m.portions,
      status: 'planned' as const, slot_time: m.time, label: m.label, kcal: m.kcal, protein_g: m.protein_g, carbs_g: m.carbs_g,
      fat_g: m.fat_g, fiber_g: m.fiber_g, grams: m.grams,
      ...(m.unit ? { unit: m.unit, unit_qty: m.unit_qty } : {}),
      sort_order: 0, deleted_at: null,
    })),
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** "4 tasks, 2 meals" or, for a week, "12 tasks over 5 days". */
export function templateSummary(t: PlanTemplate): string {
  const parts = [t.tasks.length ? plural(t.tasks.length, 'task') : '', t.meals.length ? plural(t.meals.length, 'meal') : ''].filter(Boolean)
  const what = parts.join(', ') || 'Nothing in it'
  if (t.kind !== 'week') return what
  const days = new Set([...t.tasks.map((x) => x.day), ...t.meals.map((m) => m.day)]).size
  return days ? `${what} over ${plural(days, 'day')}` : what
}

/** Put a template in the list, replacing one with the same id. */
export function withTemplate(list: PlanTemplate[], t: PlanTemplate): PlanTemplate[] {
  const i = list.findIndex((x) => x.id === t.id)
  if (i >= 0) return list.map((x) => (x.id === t.id ? t : x))
  return [...list, t].slice(-MAX_PLAN_TEMPLATES)
}

export const withoutTemplate = (list: PlanTemplate[], id: string) => list.filter((x) => x.id !== id)
