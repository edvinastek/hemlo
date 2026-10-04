/** Copy to… (GEN-55, TSK-20 to TSK-25, PLN-06): one task, a whole day or a
 *  whole week onto one or many other days, with the same choices every time
 *  (P4: one copy dialog). Pure: rows and choices in, new rows' fields out.
 *  The writing is in copy.ts, the dialog in ui/CopySheet.tsx.
 *
 *  A copy is always a new, independent task (TSK-25): it has its own id, no
 *  series, no history (not done, never pushed), and editing it never changes
 *  the original. A repeating task's day copies as a one-off. */
import { addDays, isDay, weekdayOf } from './schedule-rules.ts'
import { clearTicks, fillTemplate, type NoteTemplate } from './template-rules.ts'
import { afterDoneMarker } from './after-done-rules.ts'
import { groupKey } from './meal-rules.ts'
import type { MealPlanSlot, Task } from './types'

/** 'meals': one day's meals (all, or some of them) through Food's copy. */
export type CopyKind = 'task' | 'tasks' | 'day' | 'week' | 'meals'
export type TimeChoice = 'keep' | 'new' | 'none'
export type NotesChoice = 'same' | 'cleared' | 'none' | 'template'

export interface CopyChoices {
  /** Keep each task's time, give them all a new one, or none. */
  time: TimeChoice
  /** 'HH:MM', used when time is 'new'. */
  newTime: string | null
  /** What the notes become (TSK-22). */
  notes: NotesChoice
  /** The note template, when notes is 'template'. */
  templateId: string | null
  /** TSK-23: on by default. */
  keepSection: boolean
  keepMinutes: boolean
  keepLocked: boolean
  /** For a day or a week: what comes along (PLN-06). */
  tasks: boolean
  /** Tasks of a repeating series, copied as one-offs. Off by default: the
   *  series already lands on its own days, and a copy would double them. */
  repeats: boolean
  /** The day's planned meals (meal_plan_slot rows), with their food or
   *  recipe and portions. */
  meals: boolean
}

export const DEFAULT_CHOICES: CopyChoices = {
  time: 'keep', newTime: null, notes: 'same', templateId: null,
  keepSection: true, keepMinutes: true, keepLocked: true,
  tasks: true, repeats: false, meals: true,
}

/** The most days one copy may land on: a year of days, or a year of weeks. */
export const MAX_COPY_DAYS = 366
export const MAX_COPY_WEEKS = 52

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Remembered choices, checked (the last notes choice is kept, TSK-22). A
 *  value that is not one of the choices takes the default. */
export function readCopyChoices(v: unknown): CopyChoices {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const pick = <T extends string>(x: unknown, ok: readonly T[], d: T): T => (ok.includes(x as T) ? (x as T) : d)
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d)
  const time = typeof r.newTime === 'string' && TIME.test(r.newTime.slice(0, 5)) ? r.newTime.slice(0, 5) : null
  return {
    time: pick(r.time, ['keep', 'new', 'none'] as const, DEFAULT_CHOICES.time),
    newTime: time,
    notes: pick(r.notes, ['same', 'cleared', 'none', 'template'] as const, DEFAULT_CHOICES.notes),
    templateId: typeof r.templateId === 'string' && /^[a-z0-9_-]{1,40}$/i.test(r.templateId) ? r.templateId : null,
    keepSection: bool(r.keepSection, true),
    keepMinutes: bool(r.keepMinutes, true),
    keepLocked: bool(r.keepLocked, true),
    tasks: bool(r.tasks, true),
    repeats: bool(r.repeats, false),
    meals: bool(r.meals, true),
  }
}

/* ---------- which days ----------------------------------------------------- */

export type Shortcut = 'next_day' | 'weekdays' | 'next_week_day' | 'next_week' | 'next_4_weeks'

/** The shortcuts the dialog offers for what is being copied. */
export function shortcutsFor(kind: CopyKind): Shortcut[] {
  return kind === 'week' ? ['next_week', 'next_4_weeks'] : ['next_day', 'weekdays', 'next_week_day']
}

/** The days a shortcut picks, from the day being copied (`from`, a Monday
 *  for a week) and today. Never a day before today: a copy plans ahead.
 *  - next_day: the day after, or tomorrow when the day is already past;
 *  - weekdays: Monday to Friday of that week still to come, except the day itself;
 *  - next_week_day: the same weekday a week later;
 *  - next_week, next_4_weeks: the Mondays of the weeks after. */
export function shortcutDays(s: Shortcut, from: string, today: string): string[] {
  const base = from > today ? from : today
  switch (s) {
    case 'next_day': return [addDays(base, 1)]
    case 'weekdays': {
      const monday = addDays(base, -((weekdayOf(base) + 6) % 7))
      return [0, 1, 2, 3, 4].map((i) => addDays(monday, i)).filter((d) => d !== from && d >= today)
    }
    case 'next_week_day': return [addDays(from, 7) < today ? addDays(today, 7) : addDays(from, 7)]
    case 'next_week': return [addDays(mondayOf(base), 7)]
    case 'next_4_weeks': return [7, 14, 21, 28].map((n) => addDays(mondayOf(base), n))
  }
}

/** What a shortcut is called; "Tomorrow" only when it is tomorrow. */
export function shortcutLabel(s: Shortcut, from: string, today: string): string {
  switch (s) {
    case 'next_day': return shortcutDays(s, from, today)[0] === addDays(today, 1) ? 'Tomorrow' : 'The day after'
    case 'weekdays': return 'Every weekday this week'
    case 'next_week_day': return 'Same day next week'
    case 'next_week': return 'Next week'
    case 'next_4_weeks': return 'The next 4 weeks'
  }
}

/** The Monday of a day's week. */
export const mondayOf = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7))

/** The days picked, cleaned: real days, each once, in order, inside the
 *  range the app reaches, at most a year of them. A whole day or week is
 *  never copied onto itself; weeks are kept as their Mondays. */
export function cleanTargets(days: string[], kind: CopyKind, from: string, range: { first: string; last: string }): string[] {
  const week = kind === 'week'
  const out = [...new Set(days.filter(isDay).map((d) => (week ? mondayOf(d) : d)))]
    .filter((d) => d >= range.first && d <= range.last)
    .filter((d) => !(((kind === 'day' || kind === 'meals') && d === from) || (week && d === mondayOf(from))))
    .sort()
  return out.slice(0, week ? MAX_COPY_WEEKS : MAX_COPY_DAYS)
}

/** Tapping a day in the dialog's calendar: on or off. For a week, the tap
 *  takes or gives back the whole week. */
export function toggleTarget(days: string[], day: string, kind: CopyKind): string[] {
  const d = kind === 'week' ? mondayOf(day) : day
  return days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
}

/** A shortcut is on when every day it picks is picked. Tapping it adds its
 *  days, or, when it is on, takes them away again. */
export function toggleShortcut(days: string[], s: Shortcut, from: string, today: string): string[] {
  const its = shortcutDays(s, from, today)
  if (its.length === 0) return days
  const on = its.every((d) => days.includes(d))
  return on ? days.filter((d) => !its.includes(d)) : [...new Set([...days, ...its])].sort()
}

/** For the calendar: every day a picked week covers, so the week shows as picked. */
export function shownDays(days: string[], kind: CopyKind): string[] {
  if (kind !== 'week') return days
  return days.flatMap((m) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(m, i)))
}

/* ---------- one task -------------------------------------------------------- */

export type CopyableTask = Pick<Task, 'title' | 'category' | 'module_key' | 'duration_min' | 'locked' | 'fixed'
  | 'planned_time' | 'notes' | 'goal_id' | 'sort_order'> & Partial<Pick<Task, 'project_id'>>

/** The note a copy gets. A note template is filled for the copy's day and
 *  title; an "ask after done" template leaves only its marker, so it asks
 *  when the copy is ticked (NOT-14). */
export function copyNote(src: Pick<Task, 'notes' | 'title'>, day: string, time: string | null, c: CopyChoices, templates: NoteTemplate[]): string | null {
  switch (c.notes) {
    case 'same': return src.notes ?? null
    case 'cleared': return src.notes ? clearTicks(src.notes) : null
    case 'none': return null
    case 'template': {
      const t = templates.find((x) => x.id === c.templateId)
      if (!t) return src.notes ?? null
      if (t.after_done) return afterDoneMarker(t.id)
      return fillTemplate(t.body, { day, title: src.title, time }) || null
    }
  }
}

/** The time a copy gets. */
export function copyTime(src: Pick<Task, 'planned_time'>, c: CopyChoices): string | null {
  if (c.time === 'none') return null
  if (c.time === 'new') return c.newTime && TIME.test(c.newTime) ? c.newTime : null
  return src.planned_time ? src.planned_time.slice(0, 5) : null
}

/** A copy of a task for a day: every field a new task needs except its id
 *  and owner. The section goes with its module (a section implies one). */
export function copyTaskFields(src: CopyableTask, day: string, c: CopyChoices, templates: NoteTemplate[] = []): Partial<Task> {
  const time = copyTime(src, c)
  return {
    title: src.title,
    category: c.keepSection ? src.category : null,
    module_key: c.keepSection ? src.module_key : null,
    duration_min: c.keepMinutes ? src.duration_min : null,
    locked: c.keepLocked ? src.locked : false,
    fixed: c.keepLocked ? src.fixed : false,
    planned_date: day,
    planned_time: time,
    notes: copyNote(src, day, time, c, templates),
    goal_id: src.goal_id ?? null,
    project_id: src.project_id ?? null,
    sort_order: src.sort_order,
    horizon: 'day', series_id: null, status: 'todo', push_count: 0, extension_count: 0, needs_review: false,
    source: 'manual', source_ref: null, completed_at: null, deleted_at: null, start_date: null, due_date: null,
    total_effort_min: null, daily_quota_min: null,
  }
}

/* ---------- a day or a week ------------------------------------------------- */

/** Tasks made by another part of the app from its own data: they are
 *  copied with that data (meals) or remade by it (the shopping trip). */
const MADE_ELSEWHERE = new Set(['meal', 'shopping'])

/** Would this task of the source day come along? */
export function copiesWithDay(t: Task, c: CopyChoices): boolean {
  if (t.deleted_at || t.status === 'dropped' || !c.tasks) return false
  if (MADE_ELSEWHERE.has(t.source)) return false
  if (t.series_id && !c.repeats) return false
  return true
}

/** A meal slot that holds something to eat (not only a time for the day). */
export const mealHasFood = (s: MealPlanSlot) =>
  !s.deleted_at && (!!s.recipe_id || !!s.food_id || s.kcal != null || !!(s.label && s.label.trim()))

/** How many meals some items make: the items of one meal on one day (the
 *  same meal, or the same time) count once, so "2 meals" means two meals,
 *  not two foods. Only items with food count. */
export function mealCount(slots: MealPlanSlot[]): number {
  return new Set(slots.filter(mealHasFood).map((s) => `${s.slot_date}|${groupKey(s)}`)).size
}

/** A planned meal for another day: what it is, how much, and its own time;
 *  planned again, not eaten. */
export function copyMealFields(s: MealPlanSlot, day: string): Partial<MealPlanSlot> {
  return {
    slot_date: day, slot: s.slot, recipe_id: s.recipe_id, food_id: s.food_id ?? null,
    portion_multiplier: s.portion_multiplier, status: 'planned', slot_time: s.slot_time ?? null,
    sort_order: s.sort_order ?? 0, label: s.label ?? null, kcal: s.kcal ?? null, protein_g: s.protein_g ?? null,
    carbs_g: s.carbs_g ?? null, fat_g: s.fat_g ?? null, fiber_g: s.fiber_g ?? null, grams: s.grams ?? null,
    ...(s.unit !== undefined || s.unit_qty !== undefined ? { unit: s.unit ?? null, unit_qty: s.unit_qty ?? null } : {}),
    deleted_at: null,
  }
}

export interface PlannedCopy {
  tasks: { from: Task; day: string; fields: Partial<Task> }[]
  meals: { from: MealPlanSlot; day: string; fields: Partial<MealPlanSlot> }[]
  /** Repeats left out because their series already has that day. */
  skippedRepeats: number
}

/** Everything a day or week copy makes. `days` maps each source day to the
 *  days it goes to; `onDay` gives what a target day already holds, so a
 *  repeat is not copied onto a day its series already fills, and copies go
 *  after what is there. */
export function planCopy(
  days: { from: string; to: string[] }[],
  source: { tasks: Task[]; meals: MealPlanSlot[] },
  c: CopyChoices,
  templates: NoteTemplate[],
  onDay: (day: string) => Task[] = () => [],
): PlannedCopy {
  const out: PlannedCopy = { tasks: [], meals: [], skippedRepeats: 0 }
  for (const { from, to } of days) {
    const tasks = source.tasks.filter((t) => t.planned_date === from && copiesWithDay(t, c))
      .sort((a, b) => (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99') || a.sort_order - b.sort_order)
    const meals = c.meals ? source.meals.filter((m) => m.slot_date === from && mealHasFood(m)) : []
    for (const day of to) {
      const there = onDay(day).filter((t) => !t.deleted_at)
      let next = there.reduce((m, t) => Math.max(m, t.sort_order), -1) + 1
      for (const t of tasks) {
        if (t.series_id && there.some((x) => x.series_id === t.series_id)) { out.skippedRepeats++; continue }
        out.tasks.push({ from: t, day, fields: { ...copyTaskFields(t, day, c, templates), sort_order: next++ } })
      }
      for (const m of meals) out.meals.push({ from: m, day, fields: copyMealFields(m, day) })
    }
  }
  return out
}

/** Day-to-days for a day copy. */
export const dayPairs = (from: string, targets: string[]) => [{ from, to: targets }]

/** Day-to-days for a week copy: each day of the week goes to the same
 *  weekday of every week picked (given by their Mondays). */
export function weekPairs(monday: string, targetMondays: string[]): { from: string; to: string[] }[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => ({ from: addDays(monday, i), to: targetMondays.map((m) => addDays(m, i)) }))
}

/* ---------- saying what happened -------------------------------------------- */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** "Tue 6 Oct" */
export const dayLabel = (day: string) => `${DAYS[weekdayOf(day)]} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`

/** Where the copy goes, in words: "Tue 6 Oct", "4 days", "the week of 12 Oct", "3 weeks". */
export function targetWords(targets: string[], kind: CopyKind): string {
  if (targets.length === 0) return kind === 'week' ? 'no week yet' : 'no day yet'
  if (kind === 'week') {
    return targets.length === 1 ? `the week of ${dayLabel(targets[0]).slice(4)}` : plural(targets.length, 'week')
  }
  return targets.length === 1 ? dayLabel(targets[0]) : plural(targets.length, 'day')
}

/** The line after copying meals, also the Undo bar's label: "Lunch copied
 *  to Tue 6 Oct" for one meal, "Copied 3 meals to 2 days" for a day's food.
 *  `meals` counts meals (mealCount), not foods. */
export function mealCopySummary(meals: number, targets: string[], label?: string | null): string {
  if (meals === 0) return 'Nothing to copy'
  const to = targetWords(targets, 'meals')
  return label ? `${label} copied to ${to}` : `Copied ${plural(meals, 'meal')} to ${to}`
}

/** The line after a copy, also the Undo bar's label: "Copied 3 tasks and
 *  2 meals to 4 days". Nothing to copy says so. */
export function copySummary(made: { tasks: number; meals: number }, targets: string[], kind: CopyKind): string {
  const what = [made.tasks ? plural(made.tasks, 'task') : '', made.meals ? plural(made.meals, 'meal') : ''].filter(Boolean).join(' and ')
  if (!what) return 'Nothing to copy'
  return `Copied ${what} to ${targetWords(targets, kind)}`
}
