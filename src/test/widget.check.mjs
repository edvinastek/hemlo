// Checks what the home-screen widget is given, against days worked out by hand.
// 2026-09-25 is a Friday, 2026-09-26 a Saturday; the week starts Monday 21.
import { buildDay, buildSnapshot, latestTicks, MAX_TASKS, dayFromItems, snapshotFromItems, slotIds, widgetPath, widgetPalette, WIDGET_LIGHT, MAX_ITEMS } from '../lib/widget-rules.ts'
import { dayItems } from '../lib/day-items-rules.ts'

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


// WID-02: the widget reads the same day items as Today, for the modules set
// to "Show on the widget".
const T = (id, over = {}) => ({ id, title: id, planned_date: '2026-09-25', planned_time: null, status: 'todo', horizon: 'day', deleted_at: null,
  duration_min: null, module_key: null, category: null, sort_order: 0, notes: null, source: null, source_ref: null, ...over })
const H = (id, over = {}) => ({ id, name: id, active: true, deleted_at: null, sort_order: 0, schedule: 'daily', rule: 'daily', rule_config: {},
  start_date: '2026-01-01', end_date: null, time_of_day: null, note: null, target: null, unit: null, ...over })
const C = (id, over = {}) => ({ id, name: id, deleted_at: null, mode: 'fixed', rule: 'daily', rule_config: {}, start_date: '2026-09-01', end_date: null,
  paused: false, time_of_day: null, minutes: 15, room: null, note: null, every_days: null, assign: null, members: [], ...over })
const S = (id, slot, over = {}) => ({ id, name: id, active: true, deleted_at: null, time_slot: slot, sort_order: 0, dose_text: null, ...over })
const src = (over = {}) => ({
  today: '2026-09-25', enabled: ['habits', 'household', 'supplements', 'agenda'], views: {},
  tasks: [], habits: [], habitLogs: [], chores: [], choreLogs: [], supplements: [], supplementLogs: [], events: [], records: [], ...over,
})
const sources = src({
  tasks: [T('Standup', { planned_time: '09:00:00' }), T('Dropped', { status: 'dropped' }), T('Week goal', { horizon: 'week' }), T('Done one', { status: 'done' })],
  habits: [H('Stretch')],
  habitLogs: [{ habit_id: 'Stretch', log_date: '2026-09-25', done: true, updated_at: '2026-09-25T07:00:00Z' }],
  chores: [C('Dishes', { time_of_day: '19:00' }), C('Bins', { start_date: '2026-09-20', rule: 'weekly', rule_config: { days: [1] } })],
  supplements: [S('11111111-1111-1111-1111-111111111111', 'morning'), S('22222222-2222-2222-2222-222222222222', 'morning')],
  events: [{ id: 'e1', title: 'Dentist', starts_at: '2026-09-25T14:00:00', ends_at: '2026-09-25T14:30:00', all_day: false, deleted_at: null, subscription_id: null, location: null }],
})
const di = dayItems(['2026-09-25'], 'widget', sources)
const wd = dayFromItems(di, '2026-09-25')
is('day items: tasks of the day, dropped and week goals left out', wd.tasks.map((t) => t.id), ['Standup', 'Done one'])
is('day items: habits with their state', wd.habits, [{ id: 'Stretch', name: 'Stretch', done: true }])
is('day items: the rest by time, events and chores and the slot',
  wd.items.map((i) => [i.kind, i.title, i.time, i.tick]),
  [['event', 'Dentist', '14:00', false], ['chore', 'Dishes', '19:00', true], ['chore', 'Bins', null, true], ['supplements', 'Morning supplements', null, true]])
is('a slot tick names its supplements', slotIds(wd.items.find((i) => i.kind === 'supplements').id).length, 2)
is('slot ids are checked', slotIds('11111111-1111-1111-1111-111111111111,../etc,'), ['11111111-1111-1111-1111-111111111111'])
const off = dayFromItems(dayItems(['2026-09-25'], 'widget', { ...sources, views: { household: { widget: false }, habits: { widget: false } } }), '2026-09-25')
is('"Show on the widget" off: chores and habits leave the widget', [off.habits.length, off.items.some((i) => i.kind === 'chore')], [0, false])
is('…but stay on Today', dayItems(['2026-09-25'], 'today', { ...sources, views: { household: { widget: false } } }).some((i) => i.kind === 'chore'), true)
const offMod = dayFromItems(dayItems(['2026-09-25'], 'widget', { ...sources, enabled: [] }), '2026-09-25')
is('modules switched off show nowhere on the widget', [offMod.habits.length, offMod.items.map((i) => i.kind)], [0, []])
is('a chore waiting since Monday is marked late',
  dayFromItems(dayItems(['2026-09-25'], 'widget', src({ chores: [C('Bins', { start_date: '2026-09-21', rule: 'weekly', rule_config: { days: [1] } })] })), '2026-09-25').items[0]?.late, true)
const lots = dayFromItems(dayItems(['2026-09-25'], 'widget', src({ chores: Array.from({ length: 30 }, (_, i) => C(`c${i}`)) })), '2026-09-25')
is('at most MAX_ITEMS other items', lots.items.length, MAX_ITEMS)
const snap2 = snapshotFromItems(['2026-09-25', '2026-09-26'], dayItems(['2026-09-25', '2026-09-26'], 'widget', sources), new Date('2026-09-25T10:00:00Z'))
is('the snapshot from items has both days', Object.keys(snap2.days), ['2026-09-25', '2026-09-26'])
is('a snapshot from items keeps the old shape for old widgets', Object.keys(snap2.days['2026-09-25']), ['tasks', 'habits', 'items'])

// Ticks of the new kinds are their own rows too.
is('chore and slot ticks', latestTicks([
  { kind: 'chore', id: 'a', day: '2026-09-25', done: true, at: '1' },
  { kind: 'supplements', id: 'a', day: '2026-09-25', done: true, at: '2' },
]).length, 2)

// A stats widget's tap opens the view in the app.
is('widget link to a path', widgetPath('app.getit.planner://open/stats?view=abc'), '/stats?view=abc')
is('the bare link opens the app', widgetPath('app.getit.planner://open'), '/')
is('an auth link is not ours', widgetPath('app.getit.planner://auth-callback?code=1'), null)
is('no leaving the app', widgetPath('app.getit.planner://open//evil.example'), null)

// The widgets' colours (LOOK-09): plain colours only, else the default's.
is('palette takes hex colours', widgetPalette({ paper: '#000000', ink: 'red' }, WIDGET_LIGHT).paper, '#000000')
is('…and ignores anything else', widgetPalette({ paper: '#000000', ink: 'red' }, WIDGET_LIGHT).ink, WIDGET_LIGHT.ink)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
