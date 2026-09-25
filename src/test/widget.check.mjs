// Checks what the home-screen widget is given, against days worked out by hand.
// 2026-09-25 is a Friday, 2026-09-26 a Saturday; the week starts Monday 21.
import { buildDay, buildSnapshot, latestTicks, MAX_TASKS } from '../lib/widget-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const task = (id, over = {}) => ({ id, title: id, planned_date: '2026-09-25', planned_time: null, status: 'todo', horizon: 'day', deleted_at: null, ...over })
const habit = (id, schedule, sort_order, over = {}) => ({ id, name: id, schedule, sort_order, active: true, deleted_at: null, ...over })
const log = (habit_id, log_date, done = true, updated_at = '2026-09-20T10:00:00Z') => ({ habit_id, log_date, done, updated_at })

// Tasks: the day's, in time order, untimed last; deleted, dropped and other days left out.
const tasks = [
  task('Lunch', { planned_time: '12:00:00' }),
  task('Untimed'),
  task('Standup', { planned_time: '09:00' }),
  task('Gone', { planned_time: '08:00', deleted_at: '2026-09-25T07:00:00Z' }),
  task('Dropped', { planned_time: '08:30', status: 'dropped' }),
  task('Tomorrow', { planned_date: '2026-09-26', planned_time: '07:00' }),
  task('Goal for the week', { horizon: 'week' }),
  task('Done one', { planned_time: '07:00', status: 'done' }),
  task('Pushed', { planned_time: '15:30', status: 'pushed' }),
]
const fri = buildDay('2026-09-25', tasks, [], [])
is('the day’s tasks in time order, untimed last', fri.tasks.map((t) => t.id), ['Done one', 'Standup', 'Lunch', 'Pushed', 'Untimed'])
is('times as hours and minutes', fri.tasks.map((t) => t.time), ['07:00', '09:00', '12:00', '15:30', null])
is('done means status done; pushed is still open', fri.tasks.map((t) => t.done), [true, false, false, false, false])
is('tomorrow has its own', buildDay('2026-09-26', tasks, [], []).tasks.map((t) => t.id), ['Tomorrow'])

const many = Array.from({ length: 40 }, (_, i) => task(`t${String(i).padStart(2, '0')}`, { planned_time: '10:00' }))
is('at most MAX_TASKS a day', buildDay('2026-09-25', many, [], []).tasks.length, MAX_TASKS)
is('a long title is clipped', buildDay('2026-09-25', [task('x', { title: 'a'.repeat(100) })], [], []).tasks[0].title.length, 80)
is('an empty title reads Untitled', buildDay('2026-09-25', [task('x', { title: '  ' })], [], []).tasks[0].title, 'Untitled')

// Habits: due ones only, in their order; archived and deleted left out.
const habits = [
  habit('Stretch', 'daily', 1),
  habit('Walk', 'weekdays', 0),
  habit('Call home', 'weekly', 2),
  habit('Old', 'daily', 3, { active: false }),
  habit('Deleted', 'daily', 4, { deleted_at: '2026-09-01T00:00:00Z' }),
]
const logs = [
  log('Stretch', '2026-09-25'),
  log('Call home', '2026-09-22'),
  log('Walk', '2026-09-25', true, '2026-09-25T08:00:00Z'),
  log('Walk', '2026-09-25', false, '2026-09-25T09:00:00Z'),
]
const h = buildDay('2026-09-25', [], habits, logs).habits
is('due habits in their own order', h.map((x) => x.id), ['Walk', 'Stretch', 'Call home'])
is('the latest log for a day decides', h.find((x) => x.id === 'Walk').done, false)
is('ticked today is done', h.find((x) => x.id === 'Stretch').done, true)
is('a weekly habit done on Tuesday is done all week', h.find((x) => x.id === 'Call home').done, true)
is('a weekdays habit is not on Saturday', buildDay('2026-09-26', [], habits, logs).habits.map((x) => x.id), ['Stretch', 'Call home'])
is('the weekly habit is still done on Sunday of that week', buildDay('2026-09-27', [], habits, logs).habits.find((x) => x.id === 'Call home').done, true)
is('and open again next Monday', buildDay('2026-09-28', [], habits, logs).habits.find((x) => x.id === 'Call home').done, false)
is('habits switched off means none', buildDay('2026-09-25', [], null, logs).habits, [])

// The snapshot holds each day asked for.
const snap = buildSnapshot(['2026-09-25', '2026-09-26'], tasks, habits, logs, new Date('2026-09-25T10:00:00Z'))
is('snapshot days', Object.keys(snap.days), ['2026-09-25', '2026-09-26'])
is('snapshot stamp', snap.updated_at, '2026-09-25T10:00:00.000Z')

// Ticks from the widget: the last per row and day wins.
const ticks = latestTicks([
  { kind: 'task', id: 'a', day: '2026-09-25', done: true, at: '2026-09-25T10:00:01Z' },
  { kind: 'habit', id: 'a', day: '2026-09-25', done: true, at: '2026-09-25T10:00:02Z' },
  { kind: 'task', id: 'a', day: '2026-09-25', done: false, at: '2026-09-25T10:00:03Z' },
  { kind: 'task', id: 'a', day: '2026-09-26', done: true, at: '2026-09-25T10:00:00Z' },
])
is('tick then untick nets to untick', ticks.find((t) => t.kind === 'task' && t.day === '2026-09-25').done, false)
is('a habit with the same id is its own row', ticks.filter((t) => t.kind === 'habit').length, 1)
is('another day is its own row', ticks.length, 3)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
