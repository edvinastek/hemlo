/** The optional review schedule for Learning (LRN-05), worked out with no
 *  database and no React (checked in src/test/studyreview.check.mjs).
 *
 *  A study session starts a chain of five reviews of its subject: 1, 3, 7,
 *  14 and 30 days after it. Any later session of the same subject on or
 *  after a review's day counts as that review; a late one clears every
 *  review that had fallen due by then, so a missed week never turns into a
 *  pile of reviews (as Anki does). Sessions between two reviews are extra
 *  study and change nothing. Once the fifth review is done the next session
 *  starts a fresh chain. A review left more than 30 days past its day lapses:
 *  the subject has plainly been put down, and Today should not nag about it.
 *
 *  A session is any study record (Learning's "study" entity) with a day on or
 *  before the day asked about. Days are 'yyyy-MM-dd'. */
import { addDays, toDayNumber } from './series-rules.ts'

/** Days after a session that its reviews fall on. */
export const REVIEW_DAYS = [1, 3, 7, 14, 30] as const

/** Past this many days late a review lapses (see above). */
export const REVIEW_LAPSE_DAYS = 30

export interface StudyRecordLike {
  data: Record<string, unknown>
  record_date: string | null
  deleted_at?: string | null
  entity?: string
}

export interface ReviewDue {
  /** The subject as the person last wrote it. */
  subject: string
  /** The day the review fell due (on or before the day asked about). */
  due: string
  /** Which review: 1, 3, 7, 14 or 30 days after the session that started the chain. */
  after_days: number
  /** The session that started the chain. */
  since: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The day a study record happened on: its own Day field, else the record's day. */
export function sessionDay(r: StudyRecordLike): string | null {
  const d = text(r.data?.block_date) ?? r.record_date
  return d && DAY.test(d) ? d : null
}

/** Where one subject's review chain stands after its sessions (sorted, unique days). */
function chainState(days: string[]): { anchor: string; step: number } | null {
  let anchor: string | null = null
  let step = 0
  for (const d of days) {
    if (anchor === null || step >= REVIEW_DAYS.length) { anchor = d; step = 0; continue }
    const gap = toDayNumber(d) - toDayNumber(anchor)
    // Every review whose day has come is done by this session.
    while (step < REVIEW_DAYS.length && gap >= REVIEW_DAYS[step]) step++
  }
  return anchor === null ? null : { anchor, step }
}

/** The subjects with a review due on or before `day`, earliest first. One
 *  entry per subject (its oldest open review); "3 reviews due" is the length. */
export function reviewsDue(records: StudyRecordLike[], day: string): ReviewDue[] {
  const bySubject = new Map<string, { name: string; nameDay: string; days: Set<string> }>()
  for (const r of records) {
    if (r.deleted_at || (r.entity && r.entity !== 'study')) continue
    const d = sessionDay(r)
    if (!d || d > day) continue
    const name = text(r.data?.subject) ?? 'Study'
    const key = name.toLowerCase()
    const s = bySubject.get(key) ?? { name, nameDay: d, days: new Set<string>() }
    if (d >= s.nameDay) { s.name = name; s.nameDay = d }
    s.days.add(d)
    bySubject.set(key, s)
  }
  const out: ReviewDue[] = []
  const today = toDayNumber(day)
  for (const s of bySubject.values()) {
    const state = chainState([...s.days].sort())
    if (!state || state.step >= REVIEW_DAYS.length) continue
    const due = addDays(state.anchor, REVIEW_DAYS[state.step])
    const late = today - toDayNumber(due)
    if (late < 0 || late > REVIEW_LAPSE_DAYS) continue
    out.push({ subject: s.name, due, after_days: REVIEW_DAYS[state.step], since: state.anchor })
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.subject.localeCompare(b.subject))
}

/** The next review day per subject (due or not), for the subject's own line
 *  on the Learning page: "Review on 12 Oct". Null when the chain is done or
 *  has lapsed. */
export function nextReview(records: StudyRecordLike[], subject: string, day: string): string | null {
  const key = subject.trim().toLowerCase()
  const days = [...new Set(records.filter((r) => !r.deleted_at && (!r.entity || r.entity === 'study')
    && (text(r.data?.subject) ?? 'Study').toLowerCase() === key).map(sessionDay).filter((d): d is string => !!d && d <= day))].sort()
  const state = chainState(days)
  if (!state || state.step >= REVIEW_DAYS.length) return null
  const due = addDays(state.anchor, REVIEW_DAYS[state.step])
  return toDayNumber(day) - toDayNumber(due) > REVIEW_LAPSE_DAYS ? null : due
}

/** "1 review due", "3 reviews due". */
export const describeReviews = (n: number) => `${n} review${n === 1 ? '' : 's'} due`
