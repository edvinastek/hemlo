import { db } from './db'
import { queueChange } from './sync'
import type { Task } from './types'
import { planDayOf } from './day-edge'

const ALL_FIELDS: (keyof Task & string)[] = [
  'profile_id', 'title', 'category', 'module_key', 'horizon', 'goal_id', 'series_id', 'duration_min',
  'total_effort_min', 'daily_quota_min', 'fixed', 'locked', 'planned_date', 'planned_time', 'start_date',
  'due_date', 'sort_order', 'status', 'push_count', 'extension_count', 'needs_review', 'source',
  'source_ref', 'notes', 'completed_at', 'deleted_at',
]

export function blankTask(profileId: string, day: string, partial: Partial<Task> = {}): Task {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), profile_id: profileId, title: '', category: null, module_key: null,
    horizon: 'day', goal_id: null, series_id: null, duration_min: null, total_effort_min: null,
    daily_quota_min: null, fixed: false, locked: false, planned_date: day, planned_time: null,
    start_date: null, due_date: null, sort_order: 0, status: 'todo', push_count: 0, extension_count: 0,
    needs_review: false, source: 'manual', source_ref: null, notes: null, updated_at: now,
    completed_at: null, deleted_at: null, ...partial,
  }
}

/** Save a task made or changed on this device. A new one is sent whole; the
 *  sync layer inserts it because no server row matches its id yet. */
export async function saveTask(task: Task, changed?: (keyof Task & string)[]) {
  const row = { ...task, updated_at: new Date().toISOString() }
  await db.task.put(row)
  await queueChange('task', row, changed ?? ALL_FIELDS)
  return row
}

/** Tick or untick, from Today or from the home-screen widget. A meal's task
 *  ticks its meal eaten too, and unticking un-eats it (GEN-31). */
export async function setTaskDone(task: Task, done: boolean) {
  // A flexible repeat waiting on today (GEN-22) is done today: it takes
  // today's date, so it stays on today's list, ticked, and its history says
  // when it was really done.
  const today = localDayOf(null)
  const catchUp = done && !!task.series_id && !!task.planned_date && task.planned_date < today
    && await (await import('./series')).isFlexibleSeries(task.series_id)
  const row = await saveTask({
    ...task,
    ...(catchUp ? { planned_date: today } : {}),
    status: done ? 'done' : 'todo',
    completed_at: done ? new Date().toISOString() : null,
  }, catchUp ? ['status', 'completed_at', 'planned_date'] : ['status', 'completed_at'])
  if (task.source === 'meal') await (await import('./meals')).mealTaskTicked(row, done)
  if (task.series_id) await followTick(task, done)
  return row
}

/** A task of an "after completion" or flexible series (GEN-22): its tick
 *  makes the next one, and unticking takes that one away again. Every tick
 *  comes through here (Today, Plan, the widget, a reminder, the review). */
export async function followTick(before: Task, done: boolean) {
  const series = await import('./series')
  if (done && before.status !== 'done') await series.followDone(before)
  else if (!done && before.status === 'done') await series.unfollowDone(before, localDayOf(before.completed_at))
}

/** The person's day of a moment ('yyyy-MM-dd' on this phone), today when
 *  unknown; just after midnight it can still be the day before (GEN-70). */
function localDayOf(at: string | null): string {
  return planDayOf(at)
}

/** Deleting keeps the row with a date on it, so the deletion syncs to every
 *  device instead of the task reappearing from one that still has it. */
export async function deleteTask(task: Task) {
  return saveTask({ ...task, deleted_at: new Date().toISOString() }, ['deleted_at'])
}
