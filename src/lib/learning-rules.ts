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
 *  has one, as long as the block. None without a day, when deleted, when
 *  the rule is switched off. A session logged once it was done (the focus
 *  timer, `logged`) gets its task already ticked: see learning.ts. */
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

/* ---------- weekly targets and the review switch (LRN-05) ------------------------- */

/** Learning's own settings (module_instance.settings of 'learning'):
 *  `weekly_targets` maps a subject (lower case) to minutes a week, and
 *  `review_schedule` switches the 1-3-7-14-30 day reviews on. Both are off
 *  until the person sets them, so the page stays as it was. */
export const subjectKey = (s: string) => s.trim().toLowerCase()

export function readWeeklyTargets(settings: unknown): Record<string, number> {
  const raw = (settings && typeof settings === 'object' ? (settings as Record<string, unknown>).weekly_targets : null)
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v)
    const key = subjectKey(k)
    if (key && key.length <= 200 && Number.isInteger(n) && n > 0 && n <= 10080) out[key] = n
  }
  return out
}

/** The targets with one subject's changed: 0 or null takes it off. */
export function withTarget(targets: Record<string, number>, subject: string, minutes: number | null): Record<string, number> {
  const out = { ...targets }
  const key = subjectKey(subject)
  if (!key) return out
  if (minutes && minutes > 0) out[key] = Math.min(10080, Math.round(minutes))
  else delete out[key]
  return out
}

export const reviewScheduleOn = (settings: unknown) =>
  !!settings && typeof settings === 'object' && (settings as Record<string, unknown>).review_schedule === true

export interface SubjectWeek { subject: string; minutes: number; target: number | null }

/** This week's subjects: every one with a target, and every one studied this
 *  week; those with a target first (least done first), then by minutes. */
export function weekProgress(recs: StudyRec[], targets: Record<string, number>, monday: string, sunday: string): SubjectWeek[] {
  const studied = minutesBySubject(recs, monday, sunday)
  const names = new Map<string, string>()
  // A subject's name as last written, so a target typed in lower case still shows "Dutch".
  for (const r of [...recs].sort((a, b) => String(a.record_date ?? '').localeCompare(String(b.record_date ?? '')))) {
    const s = text(r.data.subject)
    if (s && !r.deleted_at) names.set(subjectKey(s), s)
  }
  const rows = new Map<string, SubjectWeek>()
  for (const s of studied) rows.set(subjectKey(s.subject), { subject: s.subject, minutes: s.minutes, target: targets[subjectKey(s.subject)] ?? null })
  for (const [k, t] of Object.entries(targets)) {
    if (!rows.has(k)) rows.set(k, { subject: names.get(k) ?? k.charAt(0).toUpperCase() + k.slice(1), minutes: 0, target: t })
  }
  const share = (r: SubjectWeek) => (r.target ? r.minutes / r.target : Infinity)
  return [...rows.values()].sort((a, b) => (a.target ? 0 : 1) - (b.target ? 0 : 1) || share(a) - share(b) || b.minutes - a.minutes || a.subject.localeCompare(b.subject))
}

/** "45 min of 2 h", "2 h 10 min of 2 h". */
export const describeTarget = (w: SubjectWeek) => (w.target ? `${describeMinutes(w.minutes)} of ${describeMinutes(w.target)}` : describeMinutes(w.minutes))

/** Every subject the person has used, latest spelling, most recent first,
 *  for the focus timer's subject list. */
export function knownSubjects(recs: StudyRec[], targets: Record<string, number> = {}): string[] {
  const seen = new Map<string, { name: string; day: string }>()
  for (const r of recs) {
    if (r.deleted_at) continue
    const s = text(r.data.subject)
    if (!s) continue
    const d = text(r.data.block_date) ?? r.record_date ?? ''
    const k = subjectKey(s)
    const was = seen.get(k)
    if (!was || d >= was.day) seen.set(k, { name: s, day: d })
  }
  for (const k of Object.keys(targets)) if (!seen.has(k)) seen.set(k, { name: k.charAt(0).toUpperCase() + k.slice(1), day: '' })
  return [...seen.values()].sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name)).map((x) => x.name)
}
