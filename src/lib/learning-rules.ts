/** Learning and reading, worked out with no database and no React (checked
 *  in src/test/learning.check.mjs): the task a dated study block puts on its
 *  day, the reading list (to read, reading, finished) with pages and a
 *  rating, a reading task with the "Reading reflection" asked after it is
 *  done, and minutes studied per subject. Days are 'yyyy-MM-dd'. */
import { withAfterDone } from './after-done-rules.ts'

/* ---------- study blocks become tasks (LRN-02) ------------------------------- */

export interface StudyRec { id: string; data: Record<string, unknown>; record_date: string | null; deleted_at?: string | null }
export interface StudyPlan { title: string; planned_date: string; planned_time: string | null; duration_min: number | null }

const TIME = /^([01]\d|2[0-3]):[0-5]\d/
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The task a study block should have: on its day, at its start time if it
 *  has one, as long as the block. None without a day, when deleted, or when
 *  the rule is switched off. */
export function studyPlan(r: StudyRec, ruleOn: boolean): StudyPlan | null {
  if (!ruleOn || r.deleted_at) return null
  const day = text(r.data.block_date) ?? r.record_date
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const subject = text(r.data.subject) ?? 'Study'
  const start = typeof r.data.start === 'string' && TIME.test(r.data.start) ? r.data.start.slice(0, 5) : null
  const m = Number(r.data.minutes)
  return {
    title: subject.slice(0, 200), planned_date: day, planned_time: start,
    duration_min: Number.isInteger(m) && m > 0 && m <= 1440 ? m : null,
  }
}

/** What to do to the block's task to match the plan. A task already done
 *  keeps its day and name: it happened. */
export function studyChange(plan: StudyPlan | null,
  task: { title: string; planned_date: string | null; planned_time: string | null; duration_min: number | null; status: string; deleted_at: string | null } | null): 'none' | 'create' | 'update' | 'delete' {
  if (!plan) return task && !task.deleted_at && task.status !== 'done' ? 'delete' : 'none'
  if (!task) return 'create'
  if (task.status === 'done' && !task.deleted_at) return 'none'
  const same = !task.deleted_at && task.title === plan.title && task.planned_date === plan.planned_date
    && (task.planned_time?.slice(0, 5) ?? null) === plan.planned_time && (task.duration_min ?? null) === plan.duration_min
  return same ? 'none' : 'update'
}

/** The namespace a study block's task id is made in: the same block gives
 *  the same task id on every device, so two phones never make two tasks. */
export const STUDY_TASK_NAMESPACE = '3b8f4f0e-6f1c-4f5e-9a63-2a6d1f0c7b21'

/* ---------- the reading list (LRN-03) ---------------------------------------- */

export type BookStatus = 'to read' | 'reading' | 'finished' | 'stopped'
export const BOOK_STATUSES: BookStatus[] = ['reading', 'to read', 'finished', 'stopped']
export const STATUS_LABEL: Record<BookStatus, string> = { 'to read': 'To read', reading: 'Reading', finished: 'Finished', stopped: 'Stopped' }

export interface Book {
  id: string
  title: string
  author: string | null
  status: BookStatus
  pages: number | null
  page_now: number | null
  rating: number | null
  started_on: string | null
  finished_on: string | null
}

const whole = (v: unknown, min: number, max: number) => {
  const n = Number(v)
  return v != null && v !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null
}
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

/** A book as kept in its record, read safely. */
export function readBook(r: { id: string; data: Record<string, unknown> }): Book {
  const d = r.data ?? {}
  const status = (['to read', 'reading', 'finished', 'stopped'] as string[]).includes(String(d.status)) ? d.status as BookStatus : 'to read'
  return {
    id: r.id, title: text(d.title) ?? 'A book without a title', author: text(d.author), status,
    pages: whole(d.pages, 1, 100000), page_now: whole(d.page_now, 0, 100000), rating: whole(d.rating, 1, 5),
    started_on: day(d.started_on), finished_on: day(d.finished_on),
  }
}

/** How far through: 0 to 1 by pages, 1 when finished, null when unknown. */
export function bookProgress(b: Book): number | null {
  if (b.status === 'finished') return 1
  if (!b.pages || b.page_now == null) return null
  return Math.min(1, Math.round((b.page_now / b.pages) * 1000) / 1000)
}

/** "p. 120 of 340", "340 pages", "". */
export function describePages(b: Book): string {
  if (b.status === 'finished') return b.pages ? `${b.pages} pages` : ''
  if (b.pages && b.page_now != null) return `p. ${b.page_now} of ${b.pages}`
  if (b.page_now != null) return `p. ${b.page_now}`
  return b.pages ? `${b.pages} pages` : ''
}

/** The changes a new status brings: starting sets the day it started,
 *  finishing the day it finished and the last page. */
export function statusChange(b: Book, next: BookStatus, today: string): Record<string, unknown> {
  const out: Record<string, unknown> = { status: next }
  if (next === 'reading' && !b.started_on) out.started_on = today
  if (next === 'finished') {
    out.finished_on = b.finished_on ?? today
    if (b.pages) out.page_now = b.pages
    if (!b.started_on) out.started_on = today
  }
  if (next === 'to read') out.finished_on = null
  return out
}

/** Books in the order the list shows them: reading first, then to read,
 *  then finished (newest first), then stopped. */
export function orderBooks<T extends Book>(books: T[]): T[] {
  const rank: Record<BookStatus, number> = { reading: 0, 'to read': 1, finished: 2, stopped: 3 }
  return [...books].sort((a, b) => rank[a.status] - rank[b.status]
    || (a.status === 'finished' ? (b.finished_on ?? '').localeCompare(a.finished_on ?? '') : 0)
    || a.title.localeCompare(b.title))
}

/** Books finished in a year, for "12 books this year". */
export const finishedIn = (books: Book[], year: number) => books.filter((b) => b.status === 'finished' && b.finished_on?.startsWith(`${year}-`)).length

/* ---------- reading tasks (LRN-04) ---------------------------------------------- */

/** A reading task for a book: its name, and a note that asks for the
 *  "Reading reflection" once it is ticked (NOT-14). */
export function readingTask(b: Pick<Book, 'title' | 'author'>, note: string | null = null): { title: string; notes: string } {
  return { title: `Read ${b.title}`.slice(0, 200), notes: withAfterDone(note, 'reading') }
}

/* ---------- minutes studied (Stats) ---------------------------------------------- */

/** Minutes studied per day, for one subject or all. */
export function studyMinutes(recs: StudyRec[], subject?: string): Record<string, number> {
  const out: Record<string, number> = {}
  const f = (s: string) => s.trim().toLowerCase()
  for (const r of recs) {
    if (r.deleted_at) continue
    const d = text(r.data.block_date) ?? r.record_date
    const m = Number(r.data.minutes)
    if (!d || !Number.isFinite(m) || m <= 0) continue
    if (subject && f(String(r.data.subject ?? '')) !== f(subject)) continue
    out[d] = (out[d] ?? 0) + m
  }
  return out
}

/** Minutes per subject over a range, most first. */
export function minutesBySubject(recs: StudyRec[], from: string, to: string): { subject: string; minutes: number }[] {
  const m = new Map<string, { subject: string; minutes: number }>()
  for (const r of recs) {
    if (r.deleted_at) continue
    const d = text(r.data.block_date) ?? r.record_date
    const n = Number(r.data.minutes)
    if (!d || d < from || d > to || !Number.isFinite(n) || n <= 0) continue
    const s = text(r.data.subject) ?? 'Study'
    const k = s.toLowerCase()
    const row = m.get(k) ?? { subject: s, minutes: 0 }
    row.minutes += n
    m.set(k, row)
  }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes || a.subject.localeCompare(b.subject))
}

export const LEARNING_MEASURES = [
  { source: 'learning.minutes', label: 'Minutes studied', per: ['subject'], summary: 'sum' as const },
  { source: 'learning.books_finished', label: 'Books finished', per: [], summary: 'sum' as const },
]

/** "1 h 30 min", "45 min". */
export function describeMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const r = Math.round(m % 60)
  return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`
}
