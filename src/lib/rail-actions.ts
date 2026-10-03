import { db } from './db'
import { edit } from './write'
import { saveTask, setTaskDone } from './tasks'
import { deleteOccurrence, moveToDays } from './series'
import { reviewTask } from './review'
import { pushTask } from './reorder-rules'
import type { Task } from './types'

/** What the rail's buttons write, each through the same local-first path as
 *  the rest of the app (edit / saveTask, then the sync queue), and each
 *  handing back a way to undo it for the Undo bar (GEN-54). The decisions are
 *  in the rules files (reorder-rules, review-rules, day-items-rules). */

export type Undo = () => Promise<void>

/** Puts some fields of a task back as they were, on the row as it is now (a
 *  change that synced in meanwhile is kept for the other fields). */
async function restore(before: Task, fields: (keyof Task & string)[]): Promise<void> {
  const now = (await db.task.get(before.id)) ?? before
  const back = Object.fromEntries(fields.map((f) => [f, before[f]])) as Partial<Task>
  await edit('task', now, back)
}

const undoFields = (before: Task, fields: (keyof Task & string)[]): Undo => () => restore(before, fields)

/** Push 15 / 30 / 60. Null when the task has no time: ask for one first. */
export async function pushBy(task: Task, minutes: number, day: string): Promise<{ to: Task; undo: Undo } | null> {
  const change = pushTask(task, minutes, day)
  if (!change) return null
  const fields = ['planned_time', 'push_count', 'status', 'needs_review'] as (keyof Task & string)[]
  let next: Task = { ...task, ...change }
  if (change.planned_date !== task.planned_date) {
    // Past midnight: the next day, written like any move of a day, so a
    // repeating task's series knows this day moved.
    await moveToDays([{ task, to: change.planned_date! }])
    const moved = (await db.task.get(task.id)) ?? task
    next = await saveTask({ ...moved, ...change }, fields)
    return {
      to: next,
      undo: async () => {
        const now = (await db.task.get(task.id)) ?? next
        await moveToDays([{ task: now, to: task.planned_date! }])
        await restore(task, fields)
      },
    }
  }
  next = await saveTask(next, fields)
  return { to: next, undo: undoFields(task, fields) }
}

/** An untimed task pushed: it gets the time the person chose, counted as a push. */
export async function pushToTime(task: Task, time: string): Promise<{ to: Task; undo: Undo }> {
  const push_count = task.push_count + 1
  const fields = ['planned_time', 'push_count', 'status', 'needs_review'] as (keyof Task & string)[]
  const to = await saveTask({ ...task, planned_time: time, push_count, status: 'pushed', needs_review: push_count >= 3 }, fields)
  return { to, undo: undoFields(task, fields) }
}

/** Tick or untick. */
export async function tick(task: Task, done: boolean): Promise<Task> {
  return setTaskDone(task, done)
}

/** Move to another day (Move to…), keeping or changing the time. */
export async function moveTo(task: Task, to: string, time: string | null | undefined): Promise<Undo> {
  if (to !== task.planned_date) await moveToDays([{ task, to }])
  if (time !== undefined && (time ?? null) !== (task.planned_time?.slice(0, 5) ?? null)) {
    const now = (await db.task.get(task.id)) ?? task
    await saveTask({ ...now, planned_time: time }, ['planned_time'])
  }
  return async () => {
    const now = (await db.task.get(task.id)) ?? task
    if (now.planned_date !== task.planned_date && task.planned_date) await moveToDays([{ task: now, to: task.planned_date }])
    await restore(task, ['planned_time'])
  }
}

/** Skip this one: it stays on the day, marked skipped (dropped), so the
 *  day's record is complete and the review leaves it alone. */
export async function skip(task: Task): Promise<Undo> {
  const fields = ['status', 'completed_at', 'needs_review'] as (keyof Task & string)[]
  await saveTask({ ...task, status: 'dropped', completed_at: null, needs_review: false }, fields)
  return undoFields(task, fields)
}

/** Bring a skipped task back. */
export async function unskip(task: Task): Promise<Undo> {
  await saveTask({ ...task, status: 'todo' }, ['status'])
  return undoFields(task, ['status'])
}

/** Delete one task (one day of a series only). Undo brings the row back. */
export async function remove(task: Task): Promise<Undo> {
  await deleteOccurrence(task)
  return async () => {
    const now = (await db.task.get(task.id)) ?? task
    await saveTask({ ...now, deleted_at: null }, ['deleted_at'])
  }
}

/** Save a task's note: a tick inside it, or the note page's edits. */
export async function saveNote(task: Task, notes: string | null): Promise<Task> {
  const now = (await db.task.get(task.id)) ?? task
  return saveTask({ ...now, notes }, ['notes'])
}

/* ---------- carry-over (TOD-03) ------------------------------------------- */

export type CarryAction = 'today' | 'tomorrow' | 'pick' | 'inbox' | 'done' | 'drop'

const REVIEW_FIELDS = ['planned_date', 'extension_count', 'status', 'needs_review', 'completed_at'] as (keyof Task & string)[]

/** One carry-over decision for each of the tasks. Today and Pick a day move
 *  the task (counted as a move, like the review's); Tomorrow is the review's
 *  own; the Inbox takes the day away; Done and Drop are the review's. */
export async function carry(tasks: Task[], action: CarryAction, today: string, to?: string): Promise<Undo> {
  const before = await Promise.all(tasks.map(async (t) => (await db.task.get(t.id)) ?? t))
  for (const t of before) {
    if (action === 'inbox') await saveTask({ ...t, planned_date: null, status: 'todo', needs_review: false }, ['planned_date', 'status', 'needs_review'])
    else if (action === 'today') await reviewTask(t, { kind: 'pick', to: today }, today)
    else if (action === 'pick') await reviewTask(t, { kind: 'pick', to: to ?? today }, today)
    else await reviewTask(t, { kind: action }, today)
  }
  return async () => { for (const t of before) await restore(t, REVIEW_FIELDS) }
}
