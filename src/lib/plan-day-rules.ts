/** Plan my day (TOD-22): a short look at the day on its first open, if the
 *  person switched it on. What was left yesterday (today, the Inbox, or
 *  leave it), a few suggestions (due soon, flexible chores coming due,
 *  study reviews due) and a bar of the minutes planned against what the day
 *  can hold, which warns when the plan is more than that. Pure; checked in
 *  src/test/planday.check.mjs. */
import { addDays, isDay, weekdayOf } from './schedule-rules.ts'
import { busyness } from './plan-view-rules.ts'
import type { Task } from './types'

/* ---------- when it is offered ---------------------------------------------- */

/** On the first open of the day, when switched on, and only when there is
 *  something to decide: an empty morning is not interrupted. */
export function offerPlanDay(o: { on: boolean; lastShown: string | null; today: string; leftovers: number; suggestions: number }): boolean {
  return o.on && o.lastShown !== o.today && o.leftovers + o.suggestions > 0
}

/* ---------- what was left ----------------------------------------------------- */

export type LeftoverChoice = 'today' | 'inbox' | 'leave'

/** The choices a leftover has: a repeating task keeps a day in its series,
 *  so it cannot go to the Inbox. */
export function leftoverChoices(t: Pick<Task, 'series_id'>): LeftoverChoice[] {
  return t.series_id ? ['today', 'leave'] : ['today', 'inbox', 'leave']
}

/* ---------- suggestions -------------------------------------------------------- */

export type SuggestionKind = 'due' | 'flexible' | 'chore' | 'review'

export interface Suggestion {
  key: string
  kind: SuggestionKind
  title: string
  /** One quiet line: why it is suggested. */
  meta: string
  /** What it adds to the day if taken. */
  minutes: number
  task?: Task
  choreId?: string
  subject?: string
}

/** A household chore as the suggestions need it, its state worked out. */
export interface ChoreNow {
  id: string
  name: string
  mode: 'fixed' | 'after' | 'flexible'
  minutes: number | null
  /** How due a flexible chore is: 1 is due today. */
  dueness: number
  doneToday: boolean
  /** Already on today's list (due, or put there before). */
  onToday: boolean
}

export interface SuggestInput {
  today: string
  /** The person's tasks that are not done (any day, or none). */
  tasks: Task[]
  /** Series counted from the last time (GEN-22, "about every few days"). */
  flexibleSeries: ReadonlySet<string>
  chores: ChoreNow[]
  /** Study reviews due (study-review-rules.ts), when the schedule is on. */
  reviews: { subject: string; due: string }[]
}

/** Due within this many days counts as "due soon". */
export const SOON_DAYS = 2
/** A flexible repeat this many days ahead may be done today instead. */
export const FLEX_AHEAD_DAYS = 3
/** A flexible chore at least this due is worth a look. */
export const CHORE_DUENESS = 0.75
export const MAX_SUGGESTIONS = 8

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const near = (day: string, today: string) => day === today ? 'today' : day === addDays(today, 1) ? 'tomorrow'
  : day === addDays(today, -1) ? 'yesterday' : `${DAYS[weekdayOf(day)]} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`
const open = (t: Task) => !t.deleted_at && t.status !== 'done' && t.status !== 'dropped'
const length = (t: Pick<Task, 'duration_min'>) => (t.duration_min && t.duration_min > 0 ? Math.min(t.duration_min, 1440) : 15)

/** What could go on today and is not there yet, the most pressing first. */
export function suggestions(s: SuggestInput): Suggestion[] {
  const out: Suggestion[] = []
  const soon = addDays(s.today, SOON_DAYS)
  // Due soon: a due date close by, and not planned for today already. A
  // locked task is never moved by the app, and a meal follows the meal plan.
  const due = s.tasks
    .filter((t) => open(t) && !t.locked && t.source !== 'meal' && isDay(t.due_date) && t.due_date <= soon
      && t.planned_date !== s.today && !(t.planned_date && t.planned_date < s.today))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.title.localeCompare(b.title))
  for (const t of due) {
    const d = t.due_date as string
    out.push({ key: `due:${t.id}`, kind: 'due', title: t.title || 'Untitled task', task: t, minutes: length(t),
      meta: d < s.today ? `Was due ${near(d, s.today)}` : `Due ${near(d, s.today)}` })
  }
  // Flexible repeats coming up: done today, the next one counts from today.
  const ahead = addDays(s.today, FLEX_AHEAD_DAYS)
  for (const t of s.tasks) {
    if (!open(t) || t.locked || !t.series_id || !s.flexibleSeries.has(t.series_id)) continue
    if (!t.planned_date || t.planned_date <= s.today || t.planned_date > ahead) continue
    if (out.some((x) => x.task?.id === t.id)) continue
    out.push({ key: `flex:${t.id}`, kind: 'flexible', title: t.title || 'Untitled task', task: t, minutes: length(t),
      meta: `Comes up ${near(t.planned_date, s.today)}` })
  }
  // Flexible household chores nearly due and not on today's list.
  for (const c of [...s.chores].sort((a, b) => b.dueness - a.dueness || a.name.localeCompare(b.name))) {
    if (c.mode !== 'flexible' || c.doneToday || c.onToday || c.dueness < CHORE_DUENESS) continue
    out.push({ key: `chore:${c.id}`, kind: 'chore', title: c.name, choreId: c.id, minutes: c.minutes && c.minutes > 0 ? c.minutes : 15,
      meta: c.dueness >= 1 ? 'Chore, due' : 'Chore, nearly due' })
  }
  // Study reviews (LRN-05) due on or before today.
  for (const r of s.reviews) {
    out.push({ key: `review:${r.subject.toLowerCase()}`, kind: 'review', title: `Review ${r.subject}`, subject: r.subject, minutes: 30,
      meta: r.due < s.today ? `Review due since ${near(r.due, s.today)}` : 'Review due today' })
  }
  return out.slice(0, MAX_SUGGESTIONS)
}

/* ---------- the workload bar ------------------------------------------------------ */

/** Minutes already planned today plus what the choices add, against what
 *  the day can hold: the bar's share, whether it is over, and its words. */
export function workload(planned: number, adding: number[], capacity: number): { minutes: number; share: number; over: boolean; words: string } {
  const minutes = Math.max(0, planned) + adding.reduce((a, n) => a + Math.max(0, n), 0)
  return { minutes, ...busyness(minutes, capacity) }
}

/** What a leftover adds to today if chosen. */
export const leftoverMinutes = length

/* ---------- what "Start the day" does ----------------------------------------------- */

export interface PlanDayActions {
  /** Leftovers to move to today, and to the Inbox. */
  toToday: Task[]
  toInbox: Task[]
  /** Suggested tasks to plan for today. */
  planToday: Task[]
  /** Chores to put on today. */
  chores: string[]
  /** Study subjects to make a review task for, today. */
  reviews: string[]
}

export function planDayActions(leftovers: Task[], choices: Record<string, LeftoverChoice>, list: Suggestion[], taken: ReadonlySet<string>): PlanDayActions {
  const choice = (t: Task) => {
    const c = choices[t.id] ?? 'leave'
    return leftoverChoices(t).includes(c) ? c : 'leave'
  }
  const picked = list.filter((s) => taken.has(s.key))
  return {
    toToday: leftovers.filter((t) => choice(t) === 'today'),
    toInbox: leftovers.filter((t) => choice(t) === 'inbox'),
    planToday: picked.flatMap((s) => (s.task ? [s.task] : [])),
    chores: picked.flatMap((s) => (s.choreId ? [s.choreId] : [])),
    reviews: picked.flatMap((s) => (s.subject ? [s.subject] : [])),
  }
}

/** "3 tasks on today, 1 in the Inbox, 1 chore", or null when nothing changes. */
export function planDayWords(a: PlanDayActions): string | null {
  const n = (k: number, one: string, many: string) => (k ? `${k} ${k === 1 ? one : many}` : null)
  const today = a.toToday.length + a.planToday.length + a.reviews.length
  const parts = [
    today ? `${n(today, 'task', 'tasks')} on today` : null,
    a.toInbox.length ? `${n(a.toInbox.length, 'task', 'tasks')} to the Inbox` : null,
    a.chores.length ? `${n(a.chores.length, 'chore', 'chores')} on today` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}
