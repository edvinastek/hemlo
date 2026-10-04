// Checks the evening review rules: which tasks need a look, in what order,
// when the compact line appears, and what each action does to a task.
import {
  addDays, applyReview, canPick, carriedNote, cleanLimit, cleanTime, dayName, isDay, limitNote,
  reviewOpen, summaryLine, tomorrowFor, toReview,
} from '../lib/review-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const P = 'profile-a'
let n = 0
const task = (over = {}) => ({
  id: `t${++n}`, profile_id: P, title: `Task ${n}`, category: null, module_key: null, horizon: 'day',
  goal_id: null, series_id: null, duration_min: null, total_effort_min: null, daily_quota_min: null,
  fixed: false, locked: false, planned_date: '2026-09-24', planned_time: null, start_date: null,
  due_date: null, sort_order: 0, status: 'todo', push_count: 0, extension_count: 0, needs_review: false,
  source: 'manual', source_ref: null, notes: null, updated_at: '2026-09-24T08:00:00Z',
  completed_at: null, deleted_at: null, ...over,
})

// ---- dates ----------------------------------------------------------------
is('add a day across a month', addDays('2026-09-30', 1), '2026-10-01')
is('add a day across a year', addDays('2026-12-31', 1), '2027-01-01')
is('add a day across the autumn clock change', addDays('2026-10-25', 1), '2026-10-26')
is('add a day across the spring clock change', addDays('2026-03-29', 1), '2026-03-30')
is('back a day across a leap day', addDays('2028-03-01', -1), '2028-02-29')
is('30 February is not a day', isDay('2026-02-30'), false)
is('an ISO timestamp is not a day', isDay('2026-09-24T00:00:00Z'), false)
is('null is not a day', isDay(null), false)

// ---- settings -------------------------------------------------------------
is('review time kept', cleanTime('20:30'), '20:30')
is('review time with seconds', cleanTime('20:30:00'), '20:30')
is('review time padded', cleanTime('9:05'), '09:05')
is('nonsense time falls back', cleanTime('25:00'), '21:00')
is('missing time falls back', cleanTime(undefined), '21:00')
is('limit kept', cleanLimit(5), 5)
is('zero limit falls back', cleanLimit(0), 3)
is('text limit falls back', cleanLimit('lots'), 3)

// ---- what needs review ----------------------------------------------------
const day = '2026-09-24'
const rows = [
  task({ id: 'open', title: 'Mobility', planned_time: '18:00' }),
  task({ id: 'early', title: 'Learning', planned_time: '07:00' }),
  task({ id: 'done', status: 'done' }),
  task({ id: 'dropped', status: 'dropped' }),
  task({ id: 'deleted', deleted_at: '2026-09-24T10:00:00Z' }),
  task({ id: 'locked', locked: true }),
  task({ id: 'meal', source: 'meal' }),
  task({ id: 'future', planned_date: '2026-09-25' }),
  task({ id: 'undated', planned_date: null }),
  task({ id: 'other', profile_id: 'profile-b' }),
  task({ id: 'pushed', status: 'pushed', planned_time: '12:00' }),
  task({ id: 'stuck', status: 'stuck', planned_time: '13:00' }),
  task({ id: 'old', planned_date: '2026-09-21', planned_time: '20:00' }),
  task({ id: 'flagged', planned_date: '2026-09-24', planned_time: '23:00', needs_review: true, extension_count: 3 }),
]
is('open tasks, flagged first, then oldest day, then time',
  toReview(rows, P, day).map((t) => t.id),
  ['flagged', 'old', 'early', 'pushed', 'stuck', 'open'])
is('a past day sees only its own and earlier', toReview(rows, P, '2026-09-22').map((t) => t.id), ['old'])

// ---- when the compact line shows -----------------------------------------
const at = (h, m) => new Date(2026, 8, 24, h, m)
is('today before the review time', reviewOpen(day, at(20, 59), '21:00'), false)
is('today at the review time', reviewOpen(day, at(21, 0), '21:00'), true)
is('today after the review time', reviewOpen(day, at(22, 15), '21:00'), true)
is('a past day any time', reviewOpen('2026-09-23', at(8, 0), '21:00'), true)
is('a future day never', reviewOpen('2026-09-25', at(23, 0), '21:00'), false)
is('a broken review time still opens in the evening', reviewOpen(day, at(21, 30), 'soon'), true)
// GEN-70: a day that runs past midnight. At 00:40 on the 25th it is still the 24th.
const night = new Date(2026, 8, 25, 0, 40)
is('after midnight, still the day: the review is open', reviewOpen(day, night, '21:00', day), true)
is('…and the next day has not begun', reviewOpen('2026-09-25', night, '21:00', day), false)

// ---- actions --------------------------------------------------------------
const opts = { day, today: day, limit: 3, now: '2026-09-24T19:30:00.000Z' }

const t1 = task({ planned_time: '18:00', status: 'pushed', push_count: 2 })
const r1 = applyReview(t1, { kind: 'tomorrow' }, opts)
is('tomorrow moves one day', r1.task.planned_date, '2026-09-25')
is('tomorrow keeps the time', r1.task.planned_time, '18:00')
is('tomorrow counts an extension', r1.task.extension_count, 1)
is('tomorrow resets the status', r1.task.status, 'todo')
is('tomorrow under the limit is not flagged', r1.task.needs_review, false)
is('tomorrow names what it changed', r1.changed.includes('planned_date') && r1.changed.includes('extension_count'), true)
is('the task given is not changed in place', t1.planned_date, '2026-09-24')

const r2 = applyReview(task({ extension_count: 2 }), { kind: 'tomorrow' }, opts)
is('third move reaches the limit', r2.task.extension_count, 3)
is('reaching the limit flags it', r2.task.needs_review, true)
is('the flag note', limitNote(r2.task), 'moved 3 times — keep it, make it smaller, or drop it?')
is('a lower limit flags sooner', applyReview(task(), { kind: 'tomorrow' }, { ...opts, limit: 1 }).task.needs_review, true)
is('tomorrow keeps an existing flag',
  applyReview(task({ extension_count: 4, needs_review: true }), { kind: 'tomorrow' }, { ...opts, limit: 9 }).task.needs_review, true)

const old = task({ planned_date: '2026-09-20' })
is('tomorrow for a task left from last week is the real tomorrow', tomorrowFor(old, day, day), '2026-09-25')
is('tomorrow while looking at a past day never lands on a day already gone', tomorrowFor(old, '2026-09-21', day), day)
// Reviewing yesterday after midnight: "Tomorrow" for yesterday's task is today,
// the day after its own, not the day after today.
is('tomorrow for yesterday\'s task while looking at yesterday is today',
  applyReview(task({ planned_date: '2026-09-23' }), { kind: 'tomorrow' }, { ...opts, day: '2026-09-23' }).task.planned_date, day)
is('tomorrow for a task carried into today is the day after today',
  tomorrowFor(task({ planned_date: '2026-09-23' }), day, day), '2026-09-25')
is('tomorrow while looking ahead is the day after the one shown', tomorrowFor(task(), '2026-09-27', day), '2026-09-28')

const flagged = task({ extension_count: 3, needs_review: true })
const r3 = applyReview(flagged, { kind: 'pick', to: '2026-10-02' }, opts)
is('pick moves to the day chosen', r3.task.planned_date, '2026-10-02')
is('pick counts an extension', r3.task.extension_count, 4)
is('pick clears the flag', r3.task.needs_review, false)
is('pick resets the status', r3.task.status, 'todo')
let threw = false
try { applyReview(task(), { kind: 'pick', to: 'next week' }, opts) } catch { threw = true }
is('pick refuses something that is not a day', threw, true)
is('today can be picked', canPick(day, day), true)
is('a past day cannot be picked', canPick('2026-09-23', day), false)
is('an empty pick is refused', canPick('', day), false)

const r4 = applyReview(flagged, { kind: 'done' }, opts)
is('done marks it done', r4.task.status, 'done')
is('done stamps the time', r4.task.completed_at, '2026-09-24T19:30:00.000Z')
is('done clears the flag', r4.task.needs_review, false)
is('done keeps the day', r4.task.planned_date, '2026-09-24')
is('done does not count an extension', r4.task.extension_count, 3)

const r5 = applyReview(flagged, { kind: 'drop' }, opts)
is('drop marks it dropped', r5.task.status, 'dropped')
is('drop clears the flag', r5.task.needs_review, false)
is('drop is not a delete', r5.task.deleted_at, null)
is('drop sends only what changed', r5.changed, ['status', 'needs_review'])
is('a dropped task leaves the review', toReview([r5.task], P, day).length, 0)
is('a task moved to tomorrow leaves today\'s review', toReview([r1.task], P, day).length, 0)

// ---- wording --------------------------------------------------------------
is('day name today', dayName(day, day), 'today')
is('day name yesterday', dayName('2026-09-23', day), 'yesterday')
is('day name earlier', dayName('2026-09-21', day), 'Mon 21 Sep')
is('carried note for an older task', carriedNote(task({ planned_date: '2026-09-23' }), day, day), 'left from yesterday')
is('no carried note for the day itself', carriedNote(task(), day, day), null)
// Today flags a task pushed three times within the day, with no extension.
is('the flag note for a task pushed within the day',
  limitNote(task({ needs_review: true, push_count: 3 })), 'pushed 3 times — keep it, make it smaller, or drop it?')
is('the flag note never says moved 0 times',
  limitNote(task({ needs_review: true })), 'Keep it, make it smaller, or drop it?')
is('no flag note without the flag', limitNote(task({ extension_count: 3 })), null)
is('summary for three', summaryLine([task(), task(), task()], day, day), '3 tasks are left from today. Review them?')
is('summary for one', summaryLine([task()], day, day), '1 task is left from today. Review it?')
is('summary with older tasks',
  summaryLine([task(), task({ planned_date: '2026-09-22' })], day, day),
  '2 tasks are left from today and earlier. Review them?')
is('summary for a past day', summaryLine([task({ planned_date: '2026-09-23' })], '2026-09-23', day),
  '1 task is left from yesterday. Review it?')
const words = [limitNote(flagged), summaryLine([task()], day, day), carriedNote(old, day, day)].join(' ')
is('no exclamation marks in anything the review says', /!/.test(words), false)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
