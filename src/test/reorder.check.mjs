// Checks moving tasks by hand: where a drag may land on Today, what a drop
// writes (swapped times, or new order numbers), the warnings asked first, and
// swapping two days on Plan's week. 2026-09-28 is a Monday, 2026-09-27 a
// Sunday.
import {
  zone, clampTarget, stepTarget, previewOrder, planMove, moveWarnings, overlaps, inLockedWork,
  staysPut, planDaySwap, singleMoveWarnings, count,
} from '../lib/reorder-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const task = (id, time, extra = {}) => ({
  id, title: id, planned_time: time, sort_order: 0, duration_min: null, locked: false, fixed: false,
  status: 'todo', series_id: null, ...extra,
})
const MON = '2026-09-28'
const SUN = '2026-09-27'
const off = { on: false, locked: false, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] }
const locked = { ...off, on: true, locked: true }

// A day as Today lists it: the timed tasks by time, then the rest.
const day = [
  task('gym', '07:00', { duration_min: 60 }),
  task('email', '08:15', { duration_min: 15 }),
  task('call', '12:00', { duration_min: 30 }),
  task('read', null, { sort_order: 0 }),
  task('bins', null, { sort_order: 1 }),
  task('plants', null, { sort_order: 2 }),
]

// Where a drag may land.
is('a timed task stays among the timed ones', zone(day, 1), [0, 2])
is('an untimed task among the untimed ones', zone(day, 4), [3, 5])
is('dragging a timed task past the last one stops at the last', clampTarget(day, 0, 5), 2)
is('dragging an untimed task above them stops at the first untimed', clampTarget(day, 5, 0), 3)
is('move up from the top of its kind: nowhere', stepTarget(day, 3, -1), null)
is('move down from the last timed task: nowhere', stepTarget(day, 2, 1), null)
is('move down one', stepTarget(day, 0, 1), 1)

// What the drag shows.
is('a timed task trades places with the one it lands on', previewOrder(day, 0, 2), [2, 1, 0, 3, 4, 5])
is('an untimed task slides in and the rest close up', previewOrder(day, 5, 3), [0, 1, 2, 5, 3, 4])
is('landing where it started changes nothing', previewOrder(day, 1, 1), [0, 1, 2, 3, 4, 5])

// What the drop writes.
is('timed: the two swap times, nothing else moves', planMove(day, 0, 2), [
  { id: 'gym', planned_time: '12:00' }, { id: 'call', planned_time: '07:00' },
])
is('timed, one place: still a swap', planMove(day, 1, 0), [
  { id: 'email', planned_time: '07:00' }, { id: 'gym', planned_time: '08:15' },
])
is('untimed: only the order numbers that change', planMove(day, 5, 3), [
  { id: 'plants', sort_order: 0 }, { id: 'read', sort_order: 1 }, { id: 'bins', sort_order: 2 },
])
is('untimed, all at 0 (new tasks): spread out so the order sticks', planMove([
  task('a', null), task('b', null), task('c', null),
], 0, 2), [{ id: 'c', sort_order: 1 }, { id: 'a', sort_order: 2 }])
is('untimed on a tab: the numbers it had are handed round again', planMove([
  task('a', null, { sort_order: 4 }), task('b', null, { sort_order: 9 }),
], 1, 0), [{ id: 'b', sort_order: 4 }, { id: 'a', sort_order: 9 }])
is('a drop past its kind is kept to its kind', planMove(day, 1, 4), [
  { id: 'email', planned_time: '12:00' }, { id: 'call', planned_time: '08:15' },
])
is('nothing when it lands where it started', planMove(day, 2, 2), [])
is('same time: the order numbers swap instead', planMove([
  task('a', '09:00', { sort_order: 1 }), task('b', '09:00:00', { sort_order: 5 }),
], 0, 1), [{ id: 'a', sort_order: 5 }, { id: 'b', sort_order: 1 }])
is('same time and number: the moved one is nudged past', planMove([
  task('a', '09:00'), task('b', '09:00'),
], 0, 1), [{ id: 'a', sort_order: 1 }])

// Clashes.
is('a task inside another overlaps', overlaps(task('x', '09:00', { duration_min: 60 }), task('y', '09:30')), true)
is('end to end does not', overlaps(task('x', '09:00', { duration_min: 60 }), task('y', '10:00')), false)
is('two tasks at the same moment do', overlaps(task('x', '09:00'), task('y', '09:00')), true)
is('an untimed task never does', overlaps(task('x', '09:00'), task('y', null)), false)
is('a Monday 10:00 task is in locked work hours', inLockedWork(task('x', '10:00'), locked, 1), true)
is('not on a Sunday', inLockedWork(task('x', '10:00'), locked, 0), false)
is('not when work is not locked', inLockedWork(task('x', '10:00'), { ...locked, locked: false }, 1), false)
is('an hour that runs into work does', inLockedWork(task('x', '08:30', { duration_min: 60 }), locked, 1), true)
const night = { ...locked, start: '22:00', end: '06:00', days: [5] }
is('a night shift reaches into Saturday morning', inLockedWork(task('x', '03:00'), night, 6), true)
is('but not Friday morning', inLockedWork(task('x', '03:00'), night, 5), false)

// Warnings on Today.
const kinds = (w) => w.map((x) => x.kind)
is('a plain swap with no clash asks nothing',
  moveWarnings(day, planMove(day, 1, 2), 'email', off, MON), [])
is('the gym hour swapped with the email: no clash, nothing to ask',
  kinds(moveWarnings(day, planMove(day, 0, 1), 'gym', off, MON)), [])
const short = [task('x', '09:00', { duration_min: 15 }), task('y', '09:15', { duration_min: 120 })]
is('a long task swapped earlier runs into the short one: asks',
  moveWarnings(short, planMove(short, 1, 0), 'y', off, MON).map((w) => w.text), ['“y” would overlap “x”.'])
const withLock = [task('work', '09:00', { duration_min: 480, locked: true }), task('walk', '18:00')]
is('dragging a locked task asks first, and says why',
  moveWarnings(withLock, planMove(withLock, 0, 1), 'work', off, MON)[0].text, '“work” is locked. Nothing is meant to move it.')
is('dropping onto a locked task asks too (it would move)',
  kinds(moveWarnings(withLock, planMove(withLock, 1, 0), 'walk', off, MON)), ['locked'])
const fixed = [task('dentist', '10:00', { fixed: true }), task('shop', '18:00')]
is('a fixed task asks too', kinds(moveWarnings(fixed, planMove(fixed, 1, 0), 'shop', off, MON)), ['fixed'])
is('into locked work hours asks, on a work day',
  kinds(moveWarnings(fixed, planMove(fixed, 1, 0), 'shop', locked, MON)), ['fixed', 'work'])
is('and not on a Sunday', kinds(moveWarnings(fixed, planMove(fixed, 1, 0), 'shop', locked, SUN)), ['fixed'])
const both = [
  task('a', '10:00', { duration_min: 30 }), task('b', '10:15'), task('c', '20:00', { duration_min: 60 }),
]
is('an overlap that was already there is not news',
  moveWarnings(both, planMove(both, 2, 1), 'c', off, MON).map((w) => w.text), ['“c” would overlap “a”.'])
const reorder = [task('p', null, { locked: true }), task('q', null)]
is('an untimed task sliding past a locked one does not ask about it',
  moveWarnings(reorder, planMove(reorder, 1, 0), 'q', locked, MON), [])
const workBlock = [task('Work', '09:00', { duration_min: 480, locked: true }), task('Call', '18:00'), task('Lunch', '12:30')]
is('a task swapped into work hours: the work warning, not also an overlap with the work block',
  kinds(moveWarnings([workBlock[1], workBlock[2]], planMove([workBlock[1], workBlock[2]], 0, 1), 'Call', locked, MON)), ['work'])

// Plan's week: two days swapped.
const monday = [
  task('m-run', '07:00', { planned_date: MON }), task('m-work', '09:00', { planned_date: MON, locked: true, duration_min: 480 }),
  task('m-done', '06:00', { planned_date: MON, status: 'done' }), task('m-rep', '19:00', { planned_date: MON, series_id: 's1' }),
]
const sunday = [task('s-brunch', '11:00', { planned_date: SUN }), task('s-dentist', '15:00', { planned_date: SUN, fixed: true })]
const swap = planDaySwap(MON, monday, SUN, sunday, locked)
is('movable Monday tasks go to Sunday', swap.there.map((t) => t.id), ['m-run', 'm-rep'])
is('movable Sunday tasks come back', swap.back.map((t) => t.id), ['s-brunch'])
is('locked, done and fixed stay put, each with its reason',
  swap.stay.map((s) => `${s.task.id}:${s.why}`), ['m-work:locked', 'm-done:done', 's-dentist:fixed'])
is('repeating tasks are counted', swap.repeating, 1)
is('the sheet is told what stays, that a repeating task moves alone, and where brunch lands',
  swap.warnings.map((w) => w.text), [
    '“m-work” is locked and stays where it is.',
    '“s-dentist” is fixed and stays where it is.',
    '“m-rep” repeats. Only this day moves; the series keeps its days.',
    '“s-brunch” would land in your locked work hours (09:00 to 17:00).',
  ])
is('a swap that clashes with a task staying there says so',
  kinds(planDaySwap(MON, [task('a', '15:00', { duration_min: 60 })], SUN, sunday, off).warnings), ['fixed', 'overlap'])
is('two repeating tasks are counted together',
  planDaySwap(MON, [task('a', null, { series_id: 's' })], SUN, [task('b', null, { series_id: 't' })], off).warnings[0].text,
  '2 of these repeat. Only these days move; each series keeps its days.')
is('a plain swap asks nothing', planDaySwap(MON, [task('a', null)], SUN, [task('b', '10:00')], off).warnings, [])
is('staysPut for a plain task', staysPut(task('x', null)), null)

// Plan's week: one task to another day.
is('a plain task to an empty day asks nothing', singleMoveWarnings(task('x', '10:00'), SUN, MON, [], off), [])
is('a locked one asks', kinds(singleMoveWarnings(task('x', '10:00', { locked: true }), SUN, MON, [], off)), ['locked'])
is('a repeating one says only this day moves', kinds(singleMoveWarnings(task('x', null, { series_id: 's' }), SUN, MON, [], off)), ['repeating'])
is('onto a task at the same time asks', kinds(singleMoveWarnings(task('x', '10:00'), SUN, MON, [task('y', '10:00')], off)), ['overlap'])
is('into work hours asks, not also about the work block',
  kinds(singleMoveWarnings(task('x', '10:00'), SUN, MON, [workBlock[0]], locked)), ['work'])
is('work day to work day at the same hour is not news',
  kinds(singleMoveWarnings(task('x', '10:00'), MON, '2026-09-29', [], locked)), [])
is('counting', [count(1), count(3)], ['1 task', '3 tasks'])

if (fail) { console.log(`\n${fail} check(s) failed`); process.exit(1) }
console.log('\nall reorder checks passed')
