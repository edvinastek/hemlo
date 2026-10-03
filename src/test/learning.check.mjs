// Checks Learning and reading: the task a study block puts on its day, the
// reading list, reading tasks that ask for a reflection, minutes studied.
import {
  studyPlan, studyChange, readBook, bookProgress, describePages, statusChange, orderBooks, finishedIn, readingTask,
  studyMinutes, minutesBySubject, describeMinutes,
} from '../lib/learning-rules.ts'
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

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall learning checks passed')
