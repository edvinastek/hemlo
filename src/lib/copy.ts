import { db } from './db'
import { blankTask } from './tasks'
import { writeBatch, unmakeBatch, type BatchRow } from './batch'
import { builtinRuleOn } from '../modules/rule-switch'
import { addDays } from './schedule-rules'
import {
  copySummary, copyTaskFields, dayPairs, DEFAULT_CHOICES, mealCopySummary, mealCount, planCopy, weekPairs, type CopyChoices, type CopyKind,
} from './copy-rules'
import { copyMeals, removeItems } from './meals'
import { dropTemplate, templateFrom, withTemplate, type PlanTemplate, type TemplateChoices } from './plan-templates-rules'
import { loadPlanPrefs, savePlanPrefs } from './plan-prefs'
import type { NoteTemplate } from './template-rules'
import type { MealPlanSlot, Task } from './types'

/** What is being copied (ui/CopySheet.tsx): one task, several tasks, a whole
 *  day, or a whole week (by its Monday). */
export type CopyWhat =
  | { kind: 'task'; task: Task }
  | { kind: 'tasks'; tasks: Task[] }
  | { kind: 'day'; day: string }
  | { kind: 'week'; monday: string }
  /** One day's meals (GEN-55): `groups` is 'all' or Food's meal keys
   *  ('m:lunch', 't:15:00', 'any'); `label` names them ("Lunch"). */
  | { kind: 'meals'; day: string; groups: 'all' | string[]; label?: string }

export interface CopyResult {
  /** "Copied 3 tasks to 4 days", for the screen and the Undo bar. */
  summary: string
  tasks: number
  meals: number
  /** Repeats left out because their series already fills the day. */
  skippedRepeats: number
  undo: () => Promise<void>
}

export const kindOf = (w: CopyWhat): CopyKind => w.kind

async function tasksOn(profileId: string, from: string, to: string): Promise<Task[]> {
  return db.task.where('[profile_id+planned_date]').between([profileId, from], [profileId, to], true, true).toArray()
}

async function mealsOn(profileId: string, from: string, to: string): Promise<MealPlanSlot[]> {
  return (await db.meal_plan_slot.where('profile_id').equals(profileId).toArray())
    .filter((s) => s.slot_date >= from && s.slot_date <= to && !s.deleted_at)
}

/** Copy to the days picked, as the person chose (TSK-20 to TSK-25, PLN-06).
 *  Every copy is a new task, written in one go. Meals copy through Food's
 *  own copyMeals (meals.ts), so a day's meals copy exactly as Food's "Copy
 *  day to…" does: the same meals at the same times, planned, with their
 *  meal tasks made the way the meal plan makes them. Undo takes back both. */
export async function runCopy(
  profileId: string, what: CopyWhat, targets: string[], c: CopyChoices, noteTemplates: NoteTemplate[],
): Promise<CopyResult> {
  if (what.kind === 'meals') {
    // Only Food's own copy: the same meals at the same times, planned.
    const made = await copyMeals(what.day, targets, what.groups, profileId)
    const meals = mealCount(made)
    return {
      summary: mealCopySummary(meals, targets, what.label), tasks: 0, meals, skippedRepeats: 0,
      undo: () => removeItems(made),
    }
  }
  const rows: BatchRow[] = []
  let skippedRepeats = 0
  let tasks = 0
  let meals = 0
  let pairs: { from: string; to: string[] }[] = []
  const daysTouched = [...targets]
  const lo = targets[0]
  const hi = what.kind === 'week' ? addDays(targets[targets.length - 1], 6) : targets[targets.length - 1]
  const existing = lo ? await tasksOn(profileId, lo, hi) : []
  const onDay = (day: string) => existing.filter((t) => t.planned_date === day)

  if (what.kind === 'task' || what.kind === 'tasks') {
    const list = what.kind === 'task' ? [what.task] : what.tasks
    for (const day of targets) {
      let next = onDay(day).filter((t) => !t.deleted_at).reduce((m, t) => Math.max(m, t.sort_order), -1) + 1
      for (const src of list) {
        const fields = { ...copyTaskFields(src, day, c, noteTemplates), sort_order: next++ }
        rows.push({ table: 'task', row: blankTask(profileId, day, fields), fields: [] })
        tasks++
      }
    }
  } else {
    const first = what.kind === 'day' ? what.day : what.monday
    const last = what.kind === 'day' ? what.day : addDays(what.monday, 6)
    const srcTasks = await tasksOn(profileId, first, last)
    pairs = what.kind === 'day' ? dayPairs(first, targets) : weekPairs(first, targets)
    // Meals are not planned here: Food's copy does them below. A meal's own
    // task is never copied as a task either (planCopy leaves them out);
    // copyMeals makes it afresh for the copied meal.
    const plan = planCopy(pairs, { tasks: srcTasks, meals: [] }, { ...c, meals: false }, noteTemplates, onDay)
    skippedRepeats = plan.skippedRepeats
    for (const t of plan.tasks) rows.push({ table: 'task', row: blankTask(profileId, t.day, t.fields), fields: [] })
    tasks = plan.tasks.length
  }
  // New rows are sent whole: the server has nothing with these ids yet.
  for (const r of rows) r.fields = Object.keys(r.row).filter((k) => k !== 'id' && k !== 'updated_at') as never
  await writeBatch(rows)
  const madeMeals: MealPlanSlot[] = []
  if (c.meals) for (const p of pairs) madeMeals.push(...await copyMeals(p.from, p.to, 'all', profileId))
  meals = mealCount(madeMeals)
  return {
    summary: copySummary({ tasks, meals }, daysTouched, what.kind),
    tasks, meals, skippedRepeats,
    undo: async () => {
      await removeItems(madeMeals)
      await unmakeBatch(rows)
    },
  }
}

/* ---------- day and week templates (PLN-08) ------------------------------- */

/** Save a day (or the week from `first`, a Monday) as a template. */
export async function saveDayTemplate(
  profileId: string, name: string, kind: 'day' | 'week', first: string, c: TemplateChoices,
): Promise<PlanTemplate> {
  const last = kind === 'week' ? addDays(first, 6) : first
  const [tasks, meals, prefs] = await Promise.all([tasksOn(profileId, first, last), mealsOn(profileId, first, last), loadPlanPrefs(profileId)])
  const t = templateFrom(name, kind, first, tasks, meals, c, prefs.plan_templates.map((x) => x.id))
  await savePlanPrefs(profileId, { plan_templates: withTemplate(prefs.plan_templates, t) })
  return t
}

/** Drop a template onto a day (a week template onto that day's week). The
 *  tasks go after what the days already hold. Returns what it made and an
 *  undo. */
export async function dropDayTemplate(profileId: string, t: PlanTemplate, day: string): Promise<CopyResult> {
  const made = dropTemplate(t, day)
  const days = [...new Set([...made.tasks.map((x) => x.planned_date!), ...made.meals.map((m) => m.slot_date!)])].sort()
  const existing = days.length ? await tasksOn(profileId, days[0], days[days.length - 1]) : []
  const next = new Map<string, number>()
  for (const d of days) next.set(d, existing.filter((x) => x.planned_date === d && !x.deleted_at).reduce((m, x) => Math.max(m, x.sort_order), -1) + 1)
  const rows: BatchRow[] = []
  for (const fields of made.tasks) {
    const d = fields.planned_date!
    const order = next.get(d) ?? 0
    next.set(d, order + 1)
    rows.push({ table: 'task', row: blankTask(profileId, d, { ...fields, sort_order: order }), fields: [] })
  }
  const mealTasksOn = await builtinRuleOn(profileId, 'nutrition', 'meal_tasks')
  for (const { task_title, ...fields } of made.meals) {
    const slot = { ...(fields as MealPlanSlot), id: crypto.randomUUID(), profile_id: profileId, updated_at: new Date().toISOString() }
    rows.push({ table: 'meal_plan_slot', row: slot, fields: [] })
    if (task_title && mealTasksOn) {
      rows.push({
        table: 'task', fields: [],
        row: blankTask(profileId, slot.slot_date, {
          title: task_title, category: 'Meal', module_key: 'nutrition', planned_time: slot.slot_time ?? null,
          duration_min: 20, source: 'meal', source_ref: slot.id,
        }),
      })
    }
  }
  for (const r of rows) r.fields = Object.keys(r.row).filter((k) => k !== 'id' && k !== 'updated_at') as never
  await writeBatch(rows)
  const tasks = made.tasks.length
  const meals = made.meals.length
  const what = [tasks ? `${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : '', meals ? `${meals} ${meals === 1 ? 'meal' : 'meals'}` : ''].filter(Boolean).join(' and ')
  return {
    summary: what ? `“${t.name}” added: ${what}` : `“${t.name}” has nothing in it`,
    tasks, meals, skippedRepeats: 0,
    undo: () => unmakeBatch(rows),
  }
}

/** Duplicate tasks where they are (GEN-53): each a new task on its own day
 *  (or in the Inbox), with everything kept, after the day's other tasks. */
export async function duplicateTasks(profileId: string, list: Task[]): Promise<CopyResult> {
  const keepAll: CopyChoices = { ...DEFAULT_CHOICES, time: 'keep', notes: 'same', keepSection: true, keepMinutes: true, keepLocked: true }
  const rows: BatchRow[] = []
  const orders = new Map<string, number>()
  for (const t of list) {
    const k = t.planned_date ?? ''
    const next = orders.get(k) ?? t.sort_order + 1
    orders.set(k, next + 1)
    const fields = { ...copyTaskFields(t, t.planned_date ?? '', keepAll), planned_date: t.planned_date, sort_order: next }
    const row = blankTask(profileId, t.planned_date ?? '', fields)
    rows.push({ table: 'task', row, fields: Object.keys(row).filter((x) => x !== 'id' && x !== 'updated_at') as never })
  }
  await writeBatch(rows)
  const n = rows.length
  return { summary: `${n} ${n === 1 ? 'task' : 'tasks'} duplicated`, tasks: n, meals: 0, skippedRepeats: 0, undo: () => unmakeBatch(rows) }
}
