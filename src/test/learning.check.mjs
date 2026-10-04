// Checks Learning and reading: the task a study block puts on its day, the
// reading list, reading tasks that ask for a reflection, minutes studied.
import {
  studyPlan, studyChange, readBook, bookProgress, describePages, statusChange, orderBooks, finishedIn, readingTask,
  studyMinutes, minutesBySubject, describeMinutes,
  readWeeklyTargets, withTarget, reviewScheduleOn, weekProgress, describeTarget, knownSubjects,
} from '../lib/learning-rules.ts'
import {
  startFocus, elapsedMs, remainingMs, isFinished, pauseFocus, resumeFocus, endsAt, minutesToLog, clock, readFocus, focusRecord,
} from '../lib/learning-focus-rules.ts'
import { pendingAfterDone } from '../lib/after-done-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// Study blocks.
const block = (data, x = {}) => ({ id: 'b1', data, record_date: data.block_date ?? null, ...x })
eq('a dated block is a task on its day, at its start, as long as it is',
  studyPlan(block({ subject: 'Dutch', block_date: '2026-10-05', start: '19:00', minutes: 45 }), true),
  { title: 'Dutch', planned_date: '2026-10-05', planned_time: '19:00', duration_min: 45 })
eq('no start: any time that day', studyPlan(block({ subject: 'Dutch', block_date: '2026-10-05' }), true).planned_time, null)
eq('no day: no task', studyPlan(block({ subject: 'Dutch' }), true), null)
eq('rule off: no task', studyPlan(block({ subject: 'Dutch', block_date: '2026-10-05' }), false), null)
eq('deleted: no task', studyPlan(block({ subject: 'Dutch', block_date: '2026-10-05' }, { deleted_at: 'x' }), true), null)
eq('no subject: called Study', studyPlan(block({ block_date: '2026-10-05' }), true).title, 'Study')
const plan = { title: 'Dutch', planned_date: '2026-10-05', planned_time: '19:00', duration_min: 45 }
const task = { title: 'Dutch', planned_date: '2026-10-05', planned_time: '19:00:00', duration_min: 45, status: 'todo', deleted_at: null }
eq('the same: nothing', studyChange(plan, task), 'none')
eq('none yet: make it', studyChange(plan, null), 'create')
eq('moved block: update', studyChange({ ...plan, planned_date: '2026-10-06' }, task), 'update')
eq('longer block: update', studyChange({ ...plan, duration_min: 60 }, task), 'update')
eq('no plan: delete the task', studyChange(null, task), 'delete')
eq('a done task stays as it happened', studyChange({ ...plan, planned_date: '2026-10-06' }, { ...task, status: 'done' }), 'none')
eq('no plan and a done task: it stays', studyChange(null, { ...task, status: 'done' }), 'none')
eq('a deleted task comes back when wanted', studyChange(plan, { ...task, deleted_at: 'x' }), 'update')

// Books.
const b = readBook({ id: 'k', data: { title: ' Middlemarch ', author: 'George Eliot', status: 'reading', pages: '880', page_now: 220, rating: 9 } })
eq('a book read safely (a rating past 5 is dropped)', b,
  { id: 'k', title: 'Middlemarch', author: 'George Eliot', status: 'reading', pages: 880, page_now: 220, rating: null, started_on: null, finished_on: null })
eq('an unknown status is to read', readBook({ id: 'x', data: { title: 'X', status: 'skimmed' } }).status, 'to read')
eq('a quarter through', bookProgress(b), 0.25)
eq('finished is all the way', bookProgress({ ...b, status: 'finished' }), 1)
eq('no pages: unknown', bookProgress({ ...b, pages: null }), null)
eq('pages in words', describePages(b), 'p. 220 of 880')
eq('finished pages', describePages({ ...b, status: 'finished' }), '880 pages')
eq('starting sets the day it started', statusChange({ ...b, status: 'to read', started_on: null }, 'reading', '2026-10-03'),
  { status: 'reading', started_on: '2026-10-03' })
eq('finishing sets the day, the last page, and a start if missing', statusChange(b, 'finished', '2026-10-03'),
  { status: 'finished', finished_on: '2026-10-03', page_now: 880, started_on: '2026-10-03' })
eq('back to to read clears the finish', statusChange({ ...b, finished_on: '2026-01-01' }, 'to read', '2026-10-03'), { status: 'to read', finished_on: null })
const books = [
  { ...b, id: '1', title: 'B', status: 'finished', finished_on: '2026-03-01' }, { ...b, id: '2', title: 'A', status: 'to read' },
  { ...b, id: '3', title: 'C', status: 'reading' }, { ...b, id: '4', title: 'D', status: 'finished', finished_on: '2026-09-01' },
  { ...b, id: '5', title: 'E', status: 'stopped' }, { ...b, id: '6', title: 'F', status: 'finished', finished_on: '2025-12-30' },
]
eq('reading, to read, finished newest first, stopped', orderBooks(books).map((x) => x.id), ['3', '2', '4', '1', '6', '5'])
eq('finished this year', finishedIn(books, 2026), 2)

// Reading tasks.
const rt = readingTask(b)
eq('a reading task is named after the book', rt.title, 'Read Middlemarch')
eq('and asks for the reading reflection once done', pendingAfterDone(rt.notes), 'reading')

// Minutes.
const recs = [
  block({ subject: 'Dutch', block_date: '2026-10-01', minutes: 30 }), block({ subject: 'dutch', block_date: '2026-10-01', minutes: 15 }),
  block({ subject: 'Maths', block_date: '2026-10-02', minutes: 60 }), block({ subject: 'Maths', block_date: '2026-11-02', minutes: 60 }),
  block({ subject: 'Maths', block_date: '2026-10-03', minutes: 'x' }), block({ subject: 'Maths', block_date: '2026-10-04', minutes: 90 }, { deleted_at: 'x' }),
]
eq('minutes per day', studyMinutes(recs), { '2026-10-01': 45, '2026-10-02': 60, '2026-11-02': 60 })
eq('minutes per day for one subject, case aside', studyMinutes(recs, 'DUTCH'), { '2026-10-01': 45 })
eq('minutes per subject in a range, most first', minutesBySubject(recs, '2026-10-01', '2026-10-31'), [{ subject: 'Maths', minutes: 60 }, { subject: 'Dutch', minutes: 45 }])
eq('minutes in words', [describeMinutes(45), describeMinutes(90), describeMinutes(120)], ['45 min', '1 h 30 min', '2 h'])

// Weekly targets and the review switch (LRN-05).
eq('targets read safely: lower case keys, whole positive minutes',
  readWeeklyTargets({ weekly_targets: { Dutch: 120, maths: '90', x: -5, y: 1.5, z: 99999 } }), { dutch: 120, maths: 90 })
eq('no targets kept: none', readWeeklyTargets({}), {})
eq('a target set and taken off', [withTarget({}, ' Dutch ', 120), withTarget({ dutch: 120 }, 'DUTCH', 0)], [{ dutch: 120 }, {}])
eq('the review schedule is off unless switched on', [reviewScheduleOn({}), reviewScheduleOn({ review_schedule: 'yes' }), reviewScheduleOn({ review_schedule: true })], [false, false, true])
const wk = weekProgress(recs, { dutch: 120, physics: 60 }, '2026-09-28', '2026-10-04')
eq('this week: subjects with a target first, least done first, then studied ones',
  wk, [{ subject: 'Physics', minutes: 0, target: 60 }, { subject: 'Dutch', minutes: 45, target: 120 }, { subject: 'Maths', minutes: 60, target: null }])
eq('progress in words', [describeTarget(wk[1]), describeTarget(wk[2])], ['45 min of 2 h', '1 h'])
eq('known subjects, latest first, targets included', knownSubjects(recs, { physics: 60 }), ['Maths', 'dutch', 'Physics'])

// The focus timer (LRN-06): kept as a start time, never as a ticking counter.
const t0 = Date.UTC(2026, 9, 4, 9, 0, 0)
const min = 60_000
const down = startFocus(' Dutch ', 'down', 25, t0)
eq('a countdown starts with its length', [down.subject, down.length_min, down.mode], ['Dutch', 25, 'down'])
eq('ten minutes in: 10 focused, 15 left', [elapsedMs(down, t0 + 10 * min), remainingMs(down, t0 + 10 * min)], [10 * min, 15 * min])
eq('it ends 25 minutes after the start', endsAt(down), t0 + 25 * min)
eq('not finished at 24, finished at 25', [isFinished(down, t0 + 24 * min), isFinished(down, t0 + 25 * min)], [false, true])
eq('long after the end it still counts only 25', minutesToLog(down, t0 + 300 * min), 25)
const paused = pauseFocus(down, t0 + 10 * min)
eq('paused: time stands still', elapsedMs(paused, t0 + 40 * min), 10 * min)
eq('paused: no end to notify', endsAt(paused), null)
eq('paused: never finished', isFinished(paused, t0 + 400 * min), false)
const resumed = resumeFocus(paused, t0 + 40 * min)
eq('resumed after 30 minutes: the pause is left out', [elapsedMs(resumed, t0 + 45 * min), endsAt(resumed)], [15 * min, t0 + 55 * min])
eq('pausing twice keeps the first pause', pauseFocus(paused, t0 + 20 * min).paused_at, t0 + 10 * min)
const up = startFocus('Maths', 'up', null, t0)
eq('counting up has no length, no end and no time left', [up.length_min, endsAt(up), remainingMs(up, t0 + min)], [null, null, null])
eq('counting up: 52.6 minutes logs 53', minutesToLog(up, t0 + 52.6 * min), 53)
eq('under half a minute logs nothing', minutesToLog(up, t0 + 20_000), 0)
eq('a custom length is kept within a day', [startFocus('x', 'down', 0, t0).length_min, startFocus('x', 'down', 5000, t0).length_min], [1, 1440])
eq('no subject: Study', startFocus('  ', 'up', null, t0).subject, 'Study')
eq('the clock', [clock(0), clock(65_000), clock(25 * min), clock(3_725_000)], ['0:00', '1:05', '25:00', '1:02:05'])
eq('a stored timer read back', readFocus(JSON.parse(JSON.stringify(resumed))), resumed)
eq('a broken stored timer is no timer', [readFocus(null), readFocus({ subject: 'x', started_at: 'soon', mode: 'up' }), readFocus({ subject: 'x', started_at: 1, mode: 'down', length_min: 0 })], [null, null, null])
const local = (ms) => ({ day: new Date(ms).toISOString().slice(0, 10), time: new Date(ms).toISOString().slice(11, 16) })
eq('a finished timer leaves a logged study session on the day and time it started',
  focusRecord(down, t0 + 30 * min, local), { subject: 'Dutch', block_date: '2026-10-04', start: '09:00', minutes: 25, logged: true })
eq('stopped within half a minute: nothing to log', focusRecord(up, t0 + 10_000, local), null)
eq('a logged session still makes its (ticked) task', studyPlan(block({ subject: 'Dutch', block_date: '2026-10-04', start: '09:00', minutes: 25, logged: true }), true)?.planned_date, '2026-10-04')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall learning checks passed')
