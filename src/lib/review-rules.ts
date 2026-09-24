import type { Task } from './types'

/** The evening review, as rules with no database and no React, so every
 *  decision it makes can be checked in plain Node. Days are local calendar
 *  days written 'yyyy-MM-dd'; they compare correctly as strings. */

export type ReviewAction =
  | { kind: 'tomorrow' }
  | { kind: 'pick'; to: string }
  | { kind: 'done' }
  | { kind: 'drop' }

export interface ReviewResult {
  task: Task
  changed: (keyof Task & string)[]
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar day, not just the right shape: '2026-02-30' is refused. */
export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** Local calendar arithmetic. Built from the parts rather than from an ISO
 *  string, so a daylight-saving change or the UTC date never shifts the day. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return localDay(dt)
}

export function localDay(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/** 'HH:mm' from a clock, for comparing against the review time. */
export function localTime(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getHours())}:${p(dt.getMinutes())}`
}

/** A review time the person typed or an old device stored; anything that is
 *  not a clock time falls back to the default rather than hiding the review. */
export function cleanTime(value: unknown, fallback = '21:00'): string {
  if (typeof value !== 'string') return fallback
  const m = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!m) return fallback
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return fallback
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/** The limit is a device setting; a bad value must not make every task (0) or
 *  no task (NaN) need a second look. */
export function cleanLimit(value: unknown, fallback = 3): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : fallback
}

/** What is still open for this person on or before the day shown. Locked
 *  tasks are never moved by anyone but their owner, and meal tasks follow the
 *  meal plan, so neither belongs in a review of loose ends. */
export function reviewable(task: Task, profileId: string, day: string): boolean {
  return task.profile_id === profileId
    && !task.deleted_at
    && !task.locked
    && task.source !== 'meal'
    && task.status !== 'done'
    && task.status !== 'dropped'
    && isDay(task.planned_date)
    && task.planned_date <= day
}

/** Tasks that were moved too often come first, because they are the ones that
 *  need a decision rather than another move. Then oldest day first, then the
 *  order the day itself uses. */
export function toReview(tasks: Task[], profileId: string, day: string): Task[] {
  return tasks
    .filter((t) => reviewable(t, profileId, day))
    .sort((a, b) =>
      Number(b.needs_review) - Number(a.needs_review)
      || (a.planned_date ?? '').localeCompare(b.planned_date ?? '')
      || (a.planned_time ?? '99').localeCompare(b.planned_time ?? '99')
      || a.sort_order - b.sort_order
      || a.title.localeCompare(b.title))
}

/** The compact line waits for the evening so it does not nag during the day.
 *  A past day has nothing left to wait for, and a future day has not happened. */
export function reviewOpen(day: string, now: Date, reviewTime: string): boolean {
  const today = localDay(now)
  if (day < today) return true
  if (day > today) return false
  return localTime(now) >= cleanTime(reviewTime)
}

/** Where "Tomorrow" lands: the day after the task's own day, as the brief
 *  says, but measured from the day being reviewed when the task was carried
 *  into it, and never a day that has already gone. Reviewing yesterday after
 *  midnight sends yesterday's task to today, not past it; a task left from
 *  last week goes to the next day that is still ahead rather than to another
 *  past day, where it would only turn up in the review again. */
export function tomorrowFor(task: Task, day: string, today: string): string {
  const own = isDay(task.planned_date) ? task.planned_date : day
  const next = addDays(own > day ? own : day, 1)
  return next < today ? today : next
}

/** The earliest day "Pick a day" accepts. Today is allowed: a task left over
 *  from yesterday can be done today. */
export function earliestPick(today: string): string {
  return today
}

export function canPick(to: string, today: string): boolean {
  return isDay(to) && to >= earliestPick(today)
}

/** The next state of a task after one review action, and the fields that
 *  changed, ready for saveTask. Moving counts as an extension; reaching the
 *  limit flags the task for a decision. Choosing a day, finishing or dropping
 *  is that decision, so those clear the flag. */
export function applyReview(
  task: Task,
  action: ReviewAction,
  opts: { day: string; today: string; limit: number; now?: string },
): ReviewResult {
  const limit = cleanLimit(opts.limit)
  const now = opts.now ?? new Date().toISOString()

  if (action.kind === 'tomorrow' || action.kind === 'pick') {
    const to = action.kind === 'tomorrow' ? tomorrowFor(task, opts.day, opts.today) : action.to
    if (!isDay(to)) throw new Error(`Not a day: ${to}`)
    const extension_count = task.extension_count + 1
    const needs_review = action.kind === 'pick' ? false : task.needs_review || extension_count >= limit
    return {
      task: { ...task, planned_date: to, extension_count, status: 'todo', needs_review, completed_at: null },
      changed: ['planned_date', 'extension_count', 'status', 'needs_review', 'completed_at'],
    }
  }

  if (action.kind === 'done') {
    return {
      task: { ...task, status: 'done', completed_at: now, needs_review: false },
      changed: ['status', 'completed_at', 'needs_review'],
    }
  }

  return {
    task: { ...task, status: 'dropped', needs_review: false },
    changed: ['status', 'needs_review'],
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A day the way a person would say it: today, yesterday, or 'Tue 22 Sep'. */
export function dayName(day: string, today: string): string {
  if (day === today) return 'today'
  if (day === addDays(today, -1)) return 'yesterday'
  if (day === addDays(today, 1)) return 'tomorrow'
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${WEEKDAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`
}

/** The note under a task carried over from an earlier day. Nothing for a task
 *  that belongs to the day being reviewed. */
export function carriedNote(task: Task, day: string, today: string): string | null {
  if (!isDay(task.planned_date) || task.planned_date >= day) return null
  return `left from ${dayName(task.planned_date, today)}`
}

/** The note on a task flagged for a decision. The flag is also set on Today
 *  when a task is pushed within the day too often, with no extension at all,
 *  so the count names whichever kind of move put it there. */
export function limitNote(task: Task): string | null {
  if (!task.needs_review) return null
  const ask = 'keep it, make it smaller, or drop it?'
  const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`
  if (task.extension_count > 0 && task.extension_count >= task.push_count) return `moved ${times(task.extension_count)} — ${ask}`
  if (task.push_count > 0) return `pushed ${times(task.push_count)} — ${ask}`
  return ask[0].toUpperCase() + ask.slice(1)
}

/** The one line at the top of Today. Two short sentences, ending on an offer
 *  the person can ignore. */
export function summaryLine(tasks: Task[], day: string, today: string): string {
  const n = tasks.length
  const earlier = tasks.some((t) => (t.planned_date ?? day) < day)
  const when = dayName(day, today)
  const from = earlier ? `from ${when} and earlier` : `from ${when}`
  const noun = n === 1 ? '1 task is' : `${n} tasks are`
  return `${noun} left ${from}. Review ${n === 1 ? 'it' : 'them'}?`
}
