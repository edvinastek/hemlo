import { db, getMeta, setMeta } from './db'
import { saveTask } from './tasks'
import type { Task } from './types'
import { applyReview, cleanLimit, cleanTime, localDay, toReview, type ReviewAction } from './review-rules'

/** The evening review against the local database. The decisions live in
 *  review-rules.ts; this file only reads rows, reads the device settings and
 *  saves the result through saveTask so every change syncs like any other. */

export const DEFAULT_REVIEW_TIME = '21:00'
export const DEFAULT_EXTENSION_LIMIT = 3

/** Both settings belong to the device, like reminders: the evening on a phone
 *  may not be the evening on a work laptop. */
export async function reviewSettings(): Promise<{ time: string; limit: number }> {
  const [time, limit] = await Promise.all([
    getMeta<unknown>('review_time', DEFAULT_REVIEW_TIME),
    getMeta<unknown>('extension_limit', DEFAULT_EXTENSION_LIMIT),
  ])
  return { time: cleanTime(time, DEFAULT_REVIEW_TIME), limit: cleanLimit(limit, DEFAULT_EXTENSION_LIMIT) }
}

export async function setReviewTime(value: string) {
  await setMeta('review_time', cleanTime(value, DEFAULT_REVIEW_TIME))
}

/** Every open task on or before the day shown. The compound index holds only
 *  tasks with a day, so tasks without one are left out before the filter runs. */
export async function loadReview(profileId: string, day: string): Promise<Task[]> {
  const rows = await db.task
    .where('[profile_id+planned_date]')
    .between([profileId, ''], [profileId, day], true, true)
    .toArray()
  return toReview(rows, profileId, day)
}

/** Apply one action and save only the fields it changed. The row is re-read
 *  first, so a change that synced in while the list was open is not undone. */
export async function reviewTask(task: Task, action: ReviewAction, day: string): Promise<Task> {
  const current = (await db.task.get(task.id)) ?? task
  const { limit } = await reviewSettings()
  const { task: next, changed } = applyReview(current, action, { day, today: localDay(new Date()), limit })
  return saveTask(next, changed)
}
