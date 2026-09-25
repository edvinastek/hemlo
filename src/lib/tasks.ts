import { db } from './db'
import { queueChange } from './sync'
import type { Task } from './types'

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

/** Tick or untick, from Today or from the home-screen widget. */
export function setTaskDone(task: Task, done: boolean) {
  return saveTask({
    ...task,
    status: done ? 'done' : 'todo',
    completed_at: done ? new Date().toISOString() : null,
  }, ['status', 'completed_at'])
}

/** Deleting keeps the row with a date on it, so the deletion syncs to every
 *  device instead of the task reappearing from one that still has it. */
export async function deleteTask(task: Task) {
  return saveTask({ ...task, deleted_at: new Date().toISOString() }, ['deleted_at'])
}
