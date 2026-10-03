// Checks one day's items from every module (GEN-04, TOD-02, TOD-04, AGN-02)
// and how the rail lays them out: switched-off modules leave no trace, own
// and followed events in local time at the top, habits with counts and
// checklists, supplement slots as one item, carry-over and the Inbox; the
// timeline and the morning / afternoon / evening layout; the "now" line;
// "Mark it done?" only after the last tick. 2026-10-03 is a Saturday; the
// clock is Amsterdam's (summer time, UTC+2).
process.env.TZ = 'Europe/Amsterdam'
import {
  dayItems, shows, carryOver, inbox, taskModule, railGroups, eventDays, localParts, nowSlot,
  finishedChecklist, noteFinished, habitChecklistCount, flipCheck, slotFlips,
} from '../lib/day-items-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

const SAT = '2026-10-03'
const SUN = '2026-10-04'
const task = (id, extra = {}) => ({
  id, profile_id: 'p', title: id, category: null, module_key: null, planned_date: SAT, planned_time: null,
  duration_min: null, sort_order: 0, status: 'todo', locked: false, fixed: false, source: 'manual', source_ref: null,
  notes: null, deleted_at: null, series_id: null, push_count: 0, needs_review: false, ...extra,
})
const base = {
  today: SAT, enabled: [], views: {}, tasks: [], habits: [], habitLogs: [], chores: [], choreLogs: [],
  supplements: [], supplementLogs: [], events: [], records: [],
}
const keys = (items) => items.map((i) => i.key.split(':').slice(0, 2).join(':'))

// Visibility.
is('tasks of no module always show', shows(null, 'today', base), true)
is('a module that is off never shows', shows('habits', 'today', base), false)
is('on, and shown on Today by default', shows('habits', 'today', { ...base, enabled: ['habits'] }), true)
is('the person can keep it off Today', shows('habits', 'today', { ...base, enabled: ['habits'], views: { habits: { today: false } } }), false)
is('…and still on Plan', shows('habits', 'plan', { ...base, enabled: ['habits'], views: { habits: { today: false } } }), true)
is('a Training task belongs to training', taskModule({ module_key: null, category: 'Training' }), 'training')

const habit = (id, extra = {}) => ({ id, profile_id: 'p', name: id, schedule: 'daily', rule: 'daily', rule_config: {}, start_date: '2026-09-01', sort_order: 0, active: true, deleted_at: null, updated_at: 'x', ...extra })
const log = (habit_id, extra = {}) => ({ id: `${habit_id}-log`, habit_id, log_date: SAT, done: false, updated_at: '2026-10-03T08:00:00Z', ...extra })

const mixed = {
  ...base,
  enabled: ['habits', 'supplements', 'agenda', 'training'],
  tasks: [
    task('gym', { planned_time: '07:00', category: 'Training' }),
    task('read', { sort_order: 1 }),
    task('bins', { sort_order: 0 }),
    task('gone', { deleted_at: 'x' }),
    task('sunday', { planned_date: SUN }),
  ],
  habits: [
    habit('water', { target: 8, unit: 'glasses', time_of_day: '09:00' }),
    habit('stretch', { note: '- [ ] Neck\n- [ ] Back\n- [ ] Hips' }),
    habit('weekdays', { rule: 'weekdays' }),
  ],
  habitLogs: [
    log('water', { amount: 3 }),
    log('stretch', { checks: [0, 2] }),
    log('stretch', { id: 'old', checks: [0], updated_at: '2026-10-03T07:00:00Z' }),
  ],
  supplements: [
    { id: 'd', profile_id: 'p', name: 'Vitamin D', dose_text: '1', time_slot: 'morning', active: true, sort_order: 0, deleted_at: null, updated_at: 'x' },
    { id: 'm', profile_id: 'p', name: 'Magnesium', dose_text: null, time_slot: 'evening', active: true, sort_order: 0, deleted_at: null, updated_at: 'x' },
  ],
  supplementLogs: [{ id: 'l', supplement_id: 'd', log_date: SAT, done: true, updated_at: 'x' }],
  events: [
    // 08:30 in Amsterdam is 06:30 UTC.
    { id: 'dentist', profile_id: 'p', title: 'Dentist', starts_at: '2026-10-03T06:30:00.000Z', ends_at: '2026-10-03T07:15:00.000Z', all_day: false, location: 'Venlo', deleted_at: null, updated_at: 'x' },
    // Just after midnight on Saturday, local: still Friday in UTC.
    { id: 'night', profile_id: 'p', title: 'Night train', starts_at: '2026-10-02T22:30:00.000Z', ends_at: null, all_day: false, location: null, deleted_at: null, updated_at: 'x' },
    { id: 'fair', profile_id: 'p', title: 'Fair', starts_at: '2026-10-02T22:00:00.000Z', ends_at: '2026-10-03T22:00:00.000Z', all_day: true, location: null, deleted_at: null, updated_at: 'x' },
    { id: 'match', profile_id: 'p', title: 'Match', starts_at: '2026-10-03T06:30:00.000Z', ends_at: null, all_day: false, location: null, deleted_at: null, updated_at: 'x', subscription_id: 's', calendar_name: 'Club', calendar_colour: '#336699' },
  ],
}
const items = dayItems([SAT], 'today', mixed)
is('one list, all-day first, then by time, then any time',
  keys(items), ['event:fair', 'event:night', 'task:gym', 'event:dentist', 'event:match', 'habit:water', 'task:bins', 'task:read', 'habit:stretch', 'supplements:morning', 'supplements:evening'])
const by = (k) => items.find((i) => i.key.startsWith(k))
is('own events are shown, in local time (AGN-02)', [by('event:dentist').time, by('event:dentist').minutes, by('event:dentist').meta], ['08:30', 45, 'Venlo'])
is('an event just after midnight is on the local day', by('event:night').time, '00:30')
is('an all-day event sits on top', [by('event:fair').allDay, by('event:fair').time, by('event:fair').meta], [true, null, 'All day'])
is('a followed event is read-only, with its calendar and colour', [by('event:match').readonly, by('event:match').meta, by('event:match').colour], [true, 'Club', '#336699'])
is('a count habit keeps a count that is not reached yet', [by('habit:water').amount, by('habit:water').target, by('habit:water').done], [3, 8, false])
is('a checklist habit carries the newest log\'s ticks', by('habit:stretch').checks, [0, 2])
is('weekday habits are off on Saturday', items.some((i) => i.key.startsWith('habit:weekdays')), false)
is('a supplement slot is one item with its parts', [by('supplements:morning').title, by('supplements:morning').meta, by('supplements:morning').done], ['Morning supplements', '1 of 1', true])
is('training tasks hide when training is off',
  keys(dayItems([SAT], 'today', { ...mixed, enabled: ['habits'] })).filter((k) => k.startsWith('task')), ['task:bins', 'task:read'])
is('agenda off: own events go, followed ones stay',
  keys(dayItems([SAT], 'today', { ...mixed, enabled: [] })).filter((k) => k.startsWith('event')), ['event:match'])

// Event spans.
is('a timed event that ends at midnight stays on its day',
  eventDays({ starts_at: '2026-10-03T18:00:00.000Z', ends_at: '2026-10-03T22:00:00.000Z', all_day: false }), { first: SAT, last: SAT, time: '20:00' })
is('a three-day all-day event', eventDays({ starts_at: '2026-10-02T22:00:00.000Z', ends_at: '2026-10-04T22:00:00.000Z', all_day: true }).last, '2026-10-05')
is('an end before the start is the first day', eventDays({ starts_at: '2026-10-03T08:00:00.000Z', ends_at: '2026-10-01T08:00:00.000Z', all_day: false }).last, SAT)
is('nonsense is no event', eventDays({ starts_at: 'never', ends_at: null, all_day: false }), null)
is('local parts', localParts('2026-12-31T23:30:00.000Z'), { day: '2027-01-01', time: '00:30' })
const long = dayItems([SUN], 'today', { ...mixed, today: SUN, events: [{ ...mixed.events[0], id: 'trip', starts_at: '2026-10-03T08:00:00.000Z', ends_at: '2026-10-05T08:00:00.000Z' }] })
is('the middle day of a long timed event is all day', [long.find((i) => i.kind === 'event').allDay, long.find((i) => i.kind === 'event').time], [true, null])

// The layouts.
const groups = (layout) => railGroups(items, layout).map((g) => [g.key, g.label, keys(g.items)])
is('timeline: all day, the clock, any time', groups('time'), [
  ['allday', 'All day', ['event:fair']],
  ['timed', null, ['event:night', 'task:gym', 'event:dentist', 'event:match', 'habit:water']],
  ['any', 'Any time', ['task:bins', 'task:read', 'habit:stretch', 'supplements:morning', 'supplements:evening']],
])
is('parts of the day: supplement slots go to their part', groups('parts'), [
  ['allday', 'All day', ['event:fair']],
  ['morning', 'Morning', ['event:night', 'task:gym', 'event:dentist', 'event:match', 'habit:water', 'supplements:morning']],
  ['evening', 'Evening', ['supplements:evening']],
  ['any', 'Any time', ['task:bins', 'task:read', 'habit:stretch']],
])
is('noon is afternoon, six is evening',
  railGroups([task('a', { planned_time: '12:00' }), task('b', { planned_time: '17:59' }), task('c', { planned_time: '18:00' })]
    .map((t, k) => ({ key: `task:${t.id}`, kind: 'task', time: t.planned_time, ref: { id: t.id } })), 'parts').map((g) => g.key),
  ['afternoon', 'evening'])
is('nothing, no groups', railGroups([], 'time'), [])

const timed = railGroups(items, 'time')[1].items
is('now before the first later item', nowSlot(timed, '08:00'), 2)
is('now after everything', nowSlot(timed, '22:00'), 5)
is('now before everything', nowSlot(timed, '00:10'), 0)
is('no times, no line', nowSlot(railGroups(items, 'time')[2].items, '12:00'), null)

// Checklists.
is('the last tick asks', noteFinished('- [x] a\n- [ ] b', '- [x] a\n- [x] b'), true)
is('a tick that leaves one open does not', noteFinished('- [ ] a\n- [ ] b', '- [x] a\n- [ ] b'), false)
is('unticking never asks', noteFinished('- [x] a\n- [x] b', '- [x] a\n- [ ] b'), false)
is('no checklist, no question', noteFinished('hello', 'hello'), false)
is('habit counts', [finishedChecklist({ done: 2, total: 3 }, { done: 3, total: 3 }), habitChecklistCount('- [ ] a\nnote\n- [x] b')], [true, 2])
is('flip a habit tick on', flipCheck([0, 2], 1, 3), [0, 1, 2])
is('and off', flipCheck([0, 1, 2], 1, 3), [0, 2])
is('ticks past the list are dropped', flipCheck([0, 7], 1, 3), [0, 1])
is('a slot ticks what is not taken', slotFlips([{ id: 'a', done: true }, { id: 'b', done: false }]), ['b'])
is('all taken: one tap unticks all', slotFlips([{ id: 'a', done: true }, { id: 'b', done: true }]), ['a', 'b'])

// Carry-over and the Inbox.
const tasks = [
  task('old', { planned_date: '2026-10-01', planned_time: '09:00' }),
  task('yday', { planned_date: '2026-10-02' }),
  task('done', { planned_date: '2026-10-02', status: 'done' }),
  task('dropped', { planned_date: '2026-10-02', status: 'dropped' }),
  task('locked', { planned_date: '2026-10-02', locked: true }),
  task('meal', { planned_date: '2026-10-02', source: 'meal' }),
  task('today', { planned_date: SAT }),
  task('later', { planned_date: null, sort_order: 1 }),
  task('first', { planned_date: null, sort_order: 0 }),
]
is('carry-over: open tasks from earlier days, newest first', carryOver(tasks, SAT).map((t) => t.id), ['yday', 'old'])
is('the Inbox: tasks with no day, in their order', inbox(tasks).map((t) => t.id), ['first', 'later'])

if (fail) { console.error(`\n${fail} failed`); process.exit(1) }
console.log('\ndayitems: all good')
