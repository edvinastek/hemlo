import { db } from './db'
import { edit } from './write'
import { materializeSeries } from './series'
import { saveTask } from './tasks'
import { addDays } from './schedule-rules'
import type { Series, Task } from './types'
import { sessionChange, type SeriesShape } from './training-rules'

/** A task series a module keeps on the planner for the person: a routine's
 *  planned sessions (Training), the bedtime block (Sleep). The module says
 *  what it wants; this makes the planner match, through the same series and
 *  tasks every repeating task uses, so Today, Plan, reminders, the widget
 *  and calendar export all see them with nothing extra. */

export type Want = Omit<SeriesShape, 'active' | 'deleted_at'> & { module_key: string }

const now = () => new Date().toISOString()
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)

async function tasksFrom(seriesId: string, profileId: string, from: string): Promise<Task[]> {
  return db.task.where('profile_id').equals(profileId)
    .filter((t) => t.series_id === seriesId && !t.deleted_at && t.status !== 'done' && !!t.planned_date && t.planned_date >= from).toArray()
}

/** End a series before `from`: what is still to come and not done leaves the
 *  planner; what is done stays where it happened. A series that had not
 *  started yet is deleted outright. */
export async function retireSeries(series: Series, from: string): Promise<void> {
  if (series.start_date >= from) await edit('series', series, { active: false, deleted_at: now() })
  else await edit('series', series, { end_date: addDays(from, -1) })
  for (const t of await tasksFrom(series.id, series.profile_id, from)) await saveTask({ ...t, deleted_at: now() }, ['deleted_at'])
}

export interface KeepResult {
  /** The series the planner now has for it, or null. */
  seriesId: string | null
  /** A series it had before, now ended (its past tasks still belong to it). */
  retired: string | null
  changed: boolean
}

/** Make the planner hold `want` (or nothing, for null), starting from the
 *  series it has now. With `full`, a changed title, time, length or lock is
 *  carried to the series and to what is still to come; without it, only a
 *  missing or unwanted series is dealt with, so a change made to one day on
 *  the planner is never undone behind the person's back. */
export async function keepSeries(profileId: string, seriesId: string | null, want: Want | null, today: string, full: boolean): Promise<KeepResult> {
  const have = seriesId ? (await db.series.get(seriesId)) ?? null : null
  const change = sessionChange(want, have)
  if (change === 'none' || (change === 'update' && !full)) return { seriesId: have && !have.deleted_at && have.active ? have.id : null, retired: null, changed: false }
  let retired: string | null = null
  if (change === 'retire' || change === 'replace') {
    if (have) { await retireSeries(have, today); retired = have.id }
    if (change === 'retire') return { seriesId: null, retired, changed: true }
  }
  if (change === 'update' && have && want) {
    await edit('series', have, { title: want.title, time_of_day: want.time_of_day, task_template: { ...have.task_template, ...want.task_template } })
    for (const t of await tasksFrom(have.id, have.profile_id, today)) {
      await saveTask({
        ...t, title: want.title, planned_time: want.time_of_day, duration_min: want.task_template.duration_min ?? null,
        locked: !!want.task_template.locked,
      }, ['title', 'planned_time', 'duration_min', 'locked'])
    }
    return { seriesId: have.id, retired: null, changed: true }
  }
  // A new series: from its own first day, or from today when it replaces one.
  const w = want!
  const start = change === 'replace' && w.start_date < today ? today : w.start_date
  const fields: Omit<Series, 'id' | 'updated_at'> = {
    profile_id: profileId, title: w.title, rule: w.rule as Series['rule'], rule_config: w.rule_config as Series['rule_config'],
    start_date: start, end_date: w.end_date, occurrence_count: null, time_of_day: hhmm(w.time_of_day),
    task_template: w.task_template as Series['task_template'], module_key: w.module_key, active: true, deleted_at: null,
  }
  const series = await edit<Series>('series', { id: crypto.randomUUID(), updated_at: now() } as Series, fields)
  await materializeSeries(profileId)
  return { seriesId: series.id, retired, changed: true }
}
