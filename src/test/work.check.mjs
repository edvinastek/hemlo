// Checks work hours and the commute as repeating series: the times and
// lengths (night shifts included), which weekdays each lands on, and which
// stored series are kept, stopped or started when the settings change.
// 2026-09-27 is a Sunday.
import {
  toMinutes, clock, span, shiftDays, workSpecs, planWorkChanges, matchesSpec, managedKey, isRunning, describeWork,
  distanceNote,
} from '../lib/work-rules.ts'
import { readSettings } from '../lib/settings.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const TODAY = '2026-09-27'
const settings = (work = {}, commute = {}) => readSettings({ settings: { work: { on: true, ...work }, commute } })
const byKey = (specs) => Object.fromEntries(specs.map((s) => [s.key, s]))
/** A stored series as applyWorkPlan leaves it. */
const stored = (spec, extra = {}) => ({
  id: extra.id ?? `s-${spec.key}`, profile_id: 'p', title: spec.title, rule: 'weekly',
  rule_config: { weekdays: spec.weekdays }, start_date: '2026-09-01', end_date: null, occurrence_count: null,
  time_of_day: spec.time_of_day,
  task_template: { category: spec.category, duration_min: spec.duration_min, locked: spec.locked, notes: spec.notes, managed: spec.key },
  module_key: null, active: true, updated_at: '', deleted_at: null, ...extra,
})

// Clock arithmetic.
is('minutes of a time', toMinutes('07:30'), 450)
is('seconds from Postgres are ignored', toMinutes('07:30:00'), 450)
is('clock pads', clock(65), '01:05')
is('clock wraps forward past midnight', clock(24 * 60 + 30), '00:30')
is('clock wraps back before midnight', clock(-15), '23:45')
is('a day shift', span('09:00', '17:00'), 480)
is('a night shift ends the next morning', span('22:00', '06:00'), 480)
is('the same start and end is no length', span('09:00', '09:00'), 0)
is('days moved back a day, Monday to Sunday', shiftDays([1, 2, 3, 4, 5], -1), [0, 1, 2, 3, 4])
is('days moved on a day, Saturday to Sunday', shiftDays([5, 6], 1), [0, 6])
is('distance note', [distanceNote(12.5), distanceNote(null), distanceNote(0)], ['12.5 km each way', null, null])

// What the settings call for.
is('work off: nothing', workSpecs(readSettings({ settings: {} })), [])
is('no days: nothing', workSpecs(settings({ days: [] })), [])
is('same start and end: nothing', workSpecs(settings({ start: '08:00', end: '08:00' })), [])

const plain = workSpecs(settings())
is('work on with the defaults: one series', plain.map((s) => s.key), ['work:hours'])
is('Work, weekly Mon to Fri at 09:00 for 8 hours, not locked', plain[0], {
  key: 'work:hours', title: 'Work', weekdays: [1, 2, 3, 4, 5], time_of_day: '09:00',
  duration_min: 480, locked: false, notes: null, category: 'Work',
})
is('locked when asked', workSpecs(settings({ locked: true }))[0].locked, true)
is('days come out sorted, once each', workSpecs(settings({ days: [5, 1, 3, 1] }))[0].weekdays, [1, 3, 5])
is('commute ticked but off in the settings: work only', workSpecs(settings({}, { on: false })).length, 1)

const withCommute = byKey(workSpecs(settings({ start: '08:30', end: '17:00', locked: true }, { on: true, before_min: 40, after_min: 25, km: 18 })))
is('three series with a commute', Object.keys(withCommute), ['work:hours', 'work:commute-to', 'work:commute-from'])
is('commute there ends when work starts', [withCommute['work:commute-to'].time_of_day, withCommute['work:commute-to'].duration_min], ['07:50', 40])
is('commute home starts when work ends', [withCommute['work:commute-from'].time_of_day, withCommute['work:commute-from'].duration_min], ['17:00', 25])
is('both are called Commute', [withCommute['work:commute-to'].title, withCommute['work:commute-from'].title], ['Commute', 'Commute'])
is('the distance goes in the notes', withCommute['work:commute-to'].notes, '18 km each way')
is('the commute takes the lock from work', withCommute['work:commute-from'].locked, true)
is('no distance, no note', workSpecs(settings({}, { on: true }))[1].notes, null)
is('no minutes before: no commute there', workSpecs(settings({}, { on: true, before_min: 0 })).map((s) => s.key), ['work:hours', 'work:commute-from'])

const night = byKey(workSpecs(settings({ start: '22:00', end: '06:00' }, { on: true, before_min: 30, after_min: 30 })))
is('night shift: 8 hours from 22:00', [night['work:hours'].time_of_day, night['work:hours'].duration_min], ['22:00', 480])
is('night shift: commute there the same evening', [night['work:commute-to'].time_of_day, night['work:commute-to'].weekdays], ['21:30', [1, 2, 3, 4, 5]])
is('night shift: commute home the next morning', [night['work:commute-from'].time_of_day, night['work:commute-from'].weekdays], ['06:00', [2, 3, 4, 5, 6]])
const early = byKey(workSpecs(settings({ start: '00:15', end: '08:00' }, { on: true, before_min: 30, after_min: 30 })))
is('a start just after midnight: commute the evening before', [early['work:commute-to'].time_of_day, early['work:commute-to'].weekdays], ['23:45', [0, 1, 2, 3, 4]])
is('ending exactly at midnight: home the next day at 00:00', byKey(workSpecs(settings({ start: '16:00', end: '00:00', days: [6] }, { on: true })))['work:commute-from'].weekdays, [0])

// Which stored series to keep, stop or start.
const specs = workSpecs(settings({}, { on: true, km: 5 }))
const [work, to, from] = specs
const ids = (list) => list.map((s) => s.id)
let c = planWorkChanges([], specs, TODAY)
is('nothing stored: all three start today', c.start.map((x) => [x.spec.key, x.start_date]),
  [['work:hours', TODAY], ['work:commute-to', TODAY], ['work:commute-from', TODAY]])
is('nothing stored: nothing to stop', c.stop, [])

c = planWorkChanges([stored(work), stored(to), stored(from)], specs, TODAY)
is('stored and unchanged: all kept', ids(c.keep), ['s-work:hours', 's-work:commute-to', 's-work:commute-from'])
is('stored and unchanged: nothing stopped or started', [c.stop.length, c.start.length], [0, 0])

const later = workSpecs(settings({ start: '10:00', end: '18:00' }, { on: true, km: 5 }))
c = planWorkChanges([stored(work), stored(to), stored(from)], later, TODAY)
is('new hours: all three stopped', ids(c.stop), ['s-work:hours', 's-work:commute-to', 's-work:commute-from'])
is('new hours: replacements start tomorrow, so today is not doubled', c.start.map((x) => x.start_date), ['2026-09-28', '2026-09-28', '2026-09-28'])

c = planWorkChanges([stored(work), stored(to), stored(from)], workSpecs(settings({}, { on: false })), TODAY)
is('commute turned off: work kept, both commutes stopped', [ids(c.keep), ids(c.stop), c.start.length],
  [['s-work:hours'], ['s-work:commute-to', 's-work:commute-from'], 0])

c = planWorkChanges([stored(work)], [], TODAY)
is('work turned off: stopped, nothing new', [ids(c.stop), c.start.length], [['s-work:hours'], 0])

c = planWorkChanges([stored(work, { end_date: TODAY })], [work], TODAY)
is('stopped earlier today and turned back on: starts tomorrow', c.start.map((x) => x.start_date), ['2026-09-28'])
is('and the stopped one is not stopped again', c.stop, [])
c = planWorkChanges([stored(work, { end_date: '2026-08-01' })], [work], TODAY)
is('stopped long ago and turned back on: starts today', c.start.map((x) => x.start_date), [TODAY])

c = planWorkChanges([stored(work, { id: 'a' }), stored(work, { id: 'b' })], [work], TODAY)
is('two running copies (two phones offline): one kept, the other stopped', [ids(c.keep), ids(c.stop), c.start.length], [['a'], ['b'], 0])

c = planWorkChanges([stored(work, { deleted_at: '2026-09-01T00:00:00Z' })], [work], TODAY)
is('a deleted series is ignored', [c.stop.length, c.start.map((x) => x.start_date)], [0, [TODAY]])

const mine = { ...stored(work, { id: 'own' }), task_template: { category: 'Work', duration_min: 480, locked: false, notes: null } }
c = planWorkChanges([mine], [], TODAY)
is('a series the person made, also called Work, is left alone', [managedKey(mine), c.stop.length], [null, 0])
is('an older series marked by module_key is still recognised',
  managedKey({ module_key: 'work:commute-from', task_template: {} }), 'work:commute-from')

is('Postgres time with seconds still matches', matchesSpec(stored(work, { time_of_day: '09:00:00' }), work), true)
is('days in another order still match', matchesSpec(stored(work, { rule_config: { weekdays: [5, 4, 3, 2, 1] } }), work), true)
is('a different lock does not match', matchesSpec(stored(work), { ...work, locked: true }), false)
is('a different distance does not match', matchesSpec(stored(to), { ...to, notes: '9 km each way' }), false)
is('a series changed to daily does not match', matchesSpec(stored(work, { rule: 'daily' }), work), false)
is('running: no end', isRunning(stored(work), TODAY), true)
is('running: ends later', isRunning(stored(work, { end_date: '2026-10-01' }), TODAY), true)
is('not running: stopped today', isRunning(stored(work, { end_date: TODAY }), TODAY), false)
is('not running: paused', isRunning(stored(work, { active: false }), TODAY), false)

// The settings line.
is('describe office hours', describeWork(settings()), 'Mon to Fri, 09:00 to 17:00 (8 h)')
is('describe scattered days', describeWork(settings({ days: [5, 1, 3], start: '07:30', end: '16:15' })), 'Mon, Wed, Fri, 07:30 to 16:15 (8 h 45 min)')
is('describe a weekend night shift', describeWork(settings({ days: [5, 6, 0], start: '22:00', end: '06:00' })), 'Fri to Sun, 22:00 to 06:00 (8 h)')

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
