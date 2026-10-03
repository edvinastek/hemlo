import { db } from './db'
import { blankTask } from './tasks'
import { writeBatch, unmakeBatch, type BatchRow } from './batch'
import { builtinRuleOn } from '../modules/rule-switch'
import { addDays } from './schedule-rules'
import {
  copySummary, copyTaskFields, dayPairs, planCopy, weekPairs, type CopyChoices, type CopyKind,
} from './copy-rules'
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
 *  Every copy is a new task; meals come with their own task when the
 *  original meal had one. All of it is written in one go and can be undone
 *  in one go. */
export async function runCopy(
  profileId: string, what: CopyWhat, targets: string[], c: CopyChoices, noteTemplates: NoteTemplate[],
): Promise<CopyResult> {
  const rows: BatchRow[] = []
  let skippedRepeats = 0
  let tasks = 0
  let meals = 0
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
    const [srcTasks, srcMeals] = await Promise.all([tasksOn(profileId, first, last), mealsOn(profileId, first, last)])
    const pairs = what.kind === 'day' ? dayPairs(first, targets) : weekPairs(first, targets)
    const plan = planCopy(pairs, { tasks: srcTasks, meals: srcMeals }, c, noteTemplates, onDay)
    skippedRepeats = plan.skippedRepeats
    for (const t of plan.tasks) rows.push({ table: 'task', row: blankTask(profileId, t.day, t.fields), fields: [] })
    tasks = plan.tasks.length
    const mealTasksOn = await builtinRuleOn(profileId, 'nutrition', 'meal_tasks')
    for (const m of plan.meals) {
      const slot: MealPlanSlot = {
        ...(m.fields as MealPlanSlot), id: crypto.randomUUID(), profile_id: profileId, updated_at: new Date().toISOString(),
      }
      rows.push({ table: 'meal_plan_slot', row: slot, fields: [] })
      meals++
      // The meal's own task, as the meal plan would have made it: same
      // title, the meal's time on that day, not ticked.
      const own = srcTasks.find((t) => t.source === 'meal' && t.source_ref === m.from.id && !t.deleted_at)
      if (own && mealTasksOn) {
        rows.push({
          table: 'task', fields: [],
          row: blankTask(profileId, m.day, {
            title: own.title, category: own.category, module_key: own.module_key, planned_time: own.planned_time,
            duration_min: own.duration_min, source: 'meal', source_ref: slot.id, sort_order: own.sort_order,
          }),
        })
      }
    }
  }
  // New rows are sent whole: the server has nothing with these ids yet.
  for (const r of rows) r.fields = Object.keys(r.row).filter((k) => k !== 'id' && k !== 'updated_at') as never
  await writeBatch(rows)
  return {
    summary: copySummary({ tasks, meals }, daysTouched, what.kind),
    tasks, meals, skippedRepeats,
    undo: () => unmakeBatch(rows),
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
