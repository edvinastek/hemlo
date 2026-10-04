/** Close the day (TOD-23): what is left of today, moved to tomorrow or the
 *  Inbox in one go, or one by one. Pure; checked in
 *  src/test/closeday.check.mjs.
 *
 *  Some tasks stay where they are, each with a short note: a locked task is
 *  never moved by anyone but its owner, a fixed one belongs at its day and
 *  time (moving it asks first everywhere else, so a batch leaves it), a
 *  planned meal follows the meal plan, and a flexible repeat (GEN-22) comes
 *  back by itself until it is done. A repeating task keeps its day in its
 *  series, so it cannot go to the Inbox; it can go to tomorrow. */
import type { Task } from './types'

export type CloseTarget = 'tomorrow' | 'inbox'

/** Today's tasks that are not finished, in the order the day reads. */
export function leftToday(tasks: Task[], profileId: string, day: string): Task[] {
  return tasks
    .filter((t) => t.profile_id === profileId && !t.deleted_at && t.planned_date === day
      && t.status !== 'done' && t.status !== 'dropped')
    .sort((a, b) => (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99')
      || a.sort_order - b.sort_order || a.title.localeCompare(b.title))
}

/** Why a task stays where it is for a move, or null when it can go. */
export function whyStays(t: Task, target: CloseTarget, flexible: ReadonlySet<string> = new Set()): string | null {
  if (t.locked) return 'Locked'
  if (t.fixed) return 'Fixed to this day'
  if (t.source === 'meal') return 'Follows the meal plan'
  if (t.series_id && flexible.has(t.series_id)) return 'Comes back until done'
  if (target === 'inbox' && t.series_id) return 'Repeats keep a day'
  return null
}

export interface ClosePlan {
  move: Task[]
  stay: { task: Task; why: string }[]
}

/** What "Move all to tomorrow" or "Move all to Inbox" does. */
export function closePlan(tasks: Task[], target: CloseTarget, flexible: ReadonlySet<string> = new Set()): ClosePlan {
  const move: Task[] = []
  const stay: ClosePlan['stay'] = []
  for (const t of tasks) {
    const why = whyStays(t, target, flexible)
    if (why) stay.push({ task: t, why })
    else move.push(t)
  }
  return { move, stay }
}

/** The Undo line: "3 tasks moved to tomorrow, 1 stays", "“Gym” sent to the Inbox". */
export function closeWords(moved: Task[], target: CloseTarget, stayed = 0): string {
  const what = moved.length === 1 ? `“${moved[0].title || 'Task'}”` : `${moved.length} tasks`
  const where = target === 'tomorrow' ? 'moved to tomorrow' : 'sent to the Inbox'
  return `${what} ${where}${stayed ? `, ${stayed} ${stayed === 1 ? 'stays' : 'stay'}` : ''}`
}
