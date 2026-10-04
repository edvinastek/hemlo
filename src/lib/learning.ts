import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { queueChange } from './sync'
import { blankTask, deleteTask, saveTask } from './tasks'
import { uuidV5 } from './sync-rules'
import type { ModuleRecord, Task } from './types'
import { readingTask, statusChange, studyChange, studyMinutes, studyPlan, STUDY_TASK_NAMESPACE, type Book, type BookStatus } from './learning-rules'
import { keepSeries, moduleRuleOn } from './training-series'
import type { RepeatValue } from './repeat-choice-rules'

/** Learning and reading on the device: study blocks and books are Learning
 *  records (module_record), so their fields can still be shaped in Edit
 *  module; a dated study block keeps a task on its day; a reading task asks
 *  for the reading reflection once it is done. */

const MODULE = 'learning'
const now = () => new Date().toISOString()

export function useLearningRecords(profileId: string | null | undefined, entity: 'study' | 'book'): ModuleRecord[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()).filter((r) => !r.deleted_at && r.entity === entity)
    : [], [profileId, entity])
}

/* ---------- study blocks become tasks (LRN-02) ----------------------------------- */

/** Bring every study block's task in line with the block and the rule "a
 *  study block with a day becomes a task on that day". Each block's task
 *  has an id worked out from the block's, so two devices doing this at
 *  once make the same task, not two. */
export async function syncStudyTasks(profileId: string): Promise<number> {
  const ruleOn = await moduleRuleOn(profileId, MODULE, 'study_task')
  const recs = (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()).filter((r) => r.entity === 'study')
  let changed = 0
  for (const r of recs) {
    const id = await uuidV5(`study:${r.id}`, STUDY_TASK_NAMESPACE)
    const task = (await db.task.get(id)) ?? null
    const plan = studyPlan(r, ruleOn)
    const change = studyChange(plan, task)
    if (change === 'none') continue
    changed++
    if (change === 'delete') { await deleteTask(task!); continue }
    if (change === 'create') {
      // A session logged once it was done (the focus timer) is a ticked task.
      const logged = r.data.logged === true
      await saveTask(blankTask(profileId, plan!.planned_date, {
        id, title: plan!.title, planned_time: plan!.planned_time, duration_min: plan!.duration_min,
        module_key: MODULE, category: 'Learning', source: 'module', source_ref: r.id,
        ...(logged ? { status: 'done' as const, completed_at: now() } : {}),
      }))
      continue
    }
    await saveTask({ ...task!, title: plan!.title, planned_date: plan!.planned_date, planned_time: plan!.planned_time,
      duration_min: plan!.duration_min, deleted_at: null }, ['title', 'planned_date', 'planned_time', 'duration_min', 'deleted_at'])
  }
  return changed
}

/* ---------- books (LRN-03) ----------------------------------------------------------- */

export interface BookDraft { title: string; author: string | null; status: BookStatus; pages: number | null; page_now: number | null; rating: number | null; started_on: string | null; finished_on: string | null }

/** Add a book or change one. Its day on the list is the day it was started. */
export async function saveBook(profileId: string, d: BookDraft, existing?: ModuleRecord): Promise<ModuleRecord> {
  const data: Record<string, unknown> = { title: d.title.trim(), author: d.author?.trim() || null, status: d.status, pages: d.pages,
    page_now: d.page_now, rating: d.rating, started_on: d.started_on, finished_on: d.finished_on }
  if (existing) {
    const current = (await db.module_record.get(existing.id)) ?? existing
    return edit<ModuleRecord>('module_record', current, { data: { ...current.data, ...data }, record_date: d.started_on, deleted_at: null })
  }
  const row: ModuleRecord = { id: crypto.randomUUID(), profile_id: profileId, module_key: MODULE, entity: 'book', data, record_date: d.started_on,
    created_at: now(), updated_at: now(), deleted_at: null }
  await db.module_record.put(row)
  await queueChange('module_record', row, ['profile_id', 'module_key', 'entity', 'data', 'record_date', 'deleted_at'])
  return row
}

/** Move a book along: reading, finished (with the day and the last page). */
export async function setBookStatus(rec: ModuleRecord, book: Book, next: BookStatus, today: string): Promise<ModuleRecord> {
  const current = (await db.module_record.get(rec.id)) ?? rec
  const data = { ...current.data, ...statusChange(book, next, today) }
  return edit<ModuleRecord>('module_record', current, { data, record_date: typeof data.started_on === 'string' ? data.started_on : null })
}

export async function setBookField(rec: ModuleRecord, change: Record<string, unknown>): Promise<ModuleRecord> {
  const current = (await db.module_record.get(rec.id)) ?? rec
  return edit<ModuleRecord>('module_record', current, { data: { ...current.data, ...change } })
}

export async function deleteLearningRecord(rec: ModuleRecord): Promise<void> {
  await edit('module_record', (await db.module_record.get(rec.id)) ?? rec, { deleted_at: now() })
}
export async function restoreLearningRecord(rec: ModuleRecord): Promise<void> {
  await edit('module_record', (await db.module_record.get(rec.id)) ?? rec, { deleted_at: null })
}

/* ---------- reading tasks (LRN-04) ----------------------------------------------------- */

/** Plan time to read a book: a task on a day (or repeating), named after the
 *  book, that asks for the "Reading reflection" once it is ticked. */
export async function planReading(profileId: string, book: Book, day: string, time: string | null, minutes: number | null,
  repeat: RepeatValue, today: string): Promise<{ task?: Task; seriesId?: string }> {
  const { title, notes } = readingTask(book)
  if (repeat.rule) {
    const res = await keepSeries(profileId, null, {
      title, rule: repeat.rule, rule_config: repeat.rule_config, start_date: day, end_date: repeat.end_date, time_of_day: time,
      task_template: { category: 'Learning', duration_min: minutes, locked: false, notes }, module_key: MODULE,
    }, today, true)
    return { seriesId: res.seriesId ?? undefined }
  }
  const task = await saveTask(blankTask(profileId, day, { title, notes, planned_time: time, duration_min: minutes, module_key: MODULE, category: 'Learning' }))
  return { task }
}

/** Reading tasks still to come for a book (by its name), for its sheet. */
export function useReadingTasks(profileId: string | null | undefined, title: string | null, today: string): Task[] | undefined {
  return useLiveQuery(async () => (profileId && title
    ? (await db.task.where('profile_id').equals(profileId).filter((t) => !t.deleted_at && t.title === `Read ${title}` && t.status !== 'done'
      && !!t.planned_date && t.planned_date >= today).toArray()).sort((a, b) => a.planned_date!.localeCompare(b.planned_date!))
    : []), [profileId, title, today])
}

/** Minutes studied per day (LEARNING_MEASURES in learning-rules.ts), for the
 *  stats builder, optionally for one subject. */
export async function loadStudyMinutes(profileId: string, from: string, to: string, subject?: string): Promise<Record<string, number>> {
  const recs = (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()).filter((r) => r.entity === 'study')
  return Object.fromEntries(Object.entries(studyMinutes(recs, subject)).filter(([d]) => d >= from && d <= to))
}

/* ---------- weekly targets, the review switch and the focus timer (LRN-05, LRN-06) ---- */

/** Learning's own settings row, live: weekly targets and the review switch. */
export function useLearningSettings(profileId: string | null | undefined): Record<string, unknown> | undefined {
  return useLiveQuery(async () => (profileId
    ? ((await db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === MODULE).first())?.settings ?? {})
    : {}), [profileId])
}

/** Every Learning record, any kind, for the review schedule. */
export async function allStudyRecords(profileId: string): Promise<ModuleRecord[]> {
  return (await db.module_record.where('[profile_id+module_key]').equals([profileId, MODULE]).toArray()).filter((r) => r.entity === 'study')
}

/** Log a study session that has happened (a finished focus timer). */
export async function logStudySession(profileId: string, data: { subject: string; block_date: string; start: string; minutes: number; logged: true }): Promise<ModuleRecord> {
  const row: ModuleRecord = { id: crypto.randomUUID(), profile_id: profileId, module_key: MODULE, entity: 'study', data: { ...data, source: null },
    record_date: data.block_date, created_at: now(), updated_at: now(), deleted_at: null }
  await db.module_record.put(row)
  await queueChange('module_record', row, ['profile_id', 'module_key', 'entity', 'data', 'record_date', 'deleted_at'])
  return row
}

/** Take back a logged session: the record and the ticked task it made. */
export async function unlogStudySession(rec: ModuleRecord): Promise<void> {
  await deleteLearningRecord(rec)
  const task = await db.task.get(await uuidV5(`study:${rec.id}`, STUDY_TASK_NAMESPACE))
  if (task && !task.deleted_at) await deleteTask(task)
}
