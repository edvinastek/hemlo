// Plan's views (plan-view-rules.ts) and day and week templates
// (plan-templates-rules.ts). 2026-10-05 is a Monday; 2026-10-07 a Wednesday.
import {
  readPlanAddress, cleanWeekDays, weekSpan, stepSpan, weekColumns, spanLabel, dayCapacity, plannedMinutes, heatStep,
  busyness, moveInList, sortChanges, topOfList, sectionChoices, cleanSection, readPlanPrefs, toggleHidden,
} from '../lib/plan-view-rules.ts'
import {
  readPlanTemplates, planTemplateId, templateFrom, dropStart, dropTemplate, templateSummary, withTemplate, withoutTemplate,
  MAX_PLAN_TEMPLATES,
} from '../lib/plan-templates-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}
const range = { first: '2023-10-01', last: '2031-10-31' }

// The address.
eq('view and date from the address', readPlanAddress('day', '2026-10-07', '2026-10-03', range), { view: 'day', date: '2026-10-07' })
eq('the Inbox', readPlanAddress('inbox', null, '2026-10-03', range), { view: 'inbox', date: '2026-10-03' })
eq('unknown view is the week, a broken date today', readPlanAddress('agenda', '2026-02-30', '2026-10-03', range), { view: 'week', date: '2026-10-03' })
eq('a date past the range is its end', readPlanAddress('month', '2040-01-01', '2026-10-03', range).date, '2031-10-31')

// The week.
eq('7 by default', cleanWeekDays(undefined), 7)
eq('1 to 14 kept', [cleanWeekDays(1), cleanWeekDays('14'), cleanWeekDays(3.7)], [1, 14, 3])
eq('outside 1 to 14 is 7', [cleanWeekDays(0), cleanWeekDays(15), cleanWeekDays('x')], [7, 7, 7])
eq('a week starts on Monday', weekSpan('2026-10-07', 7), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
eq('a fortnight starts on Monday', [weekSpan('2026-10-07', 14)[0], weekSpan('2026-10-07', 14).length], ['2026-10-05', 14])
eq('three days start on the day', weekSpan('2026-10-07', 3), ['2026-10-07', '2026-10-08', '2026-10-09'])
eq('one day', weekSpan('2026-10-07', 1), ['2026-10-07'])
eq('arrows step a whole span', [stepSpan('2026-10-07', 3, 1), stepSpan('2026-10-07', 7, -1)], ['2026-10-10', '2026-09-30'])
eq('a fortnight is two rows of seven', [weekColumns(14), weekColumns(5)], [7, 5])
eq('span words, one month', spanLabel(weekSpan('2026-10-07', 7)), '5 – 11 Oct')
eq('span words across months', spanLabel(weekSpan('2026-09-30', 7)), '28 Sep – 4 Oct')
eq('span words, one day', spanLabel(['2026-10-07']), 'Wed 7 Oct')

// How full a day is.
eq('waking day from the profile', dayCapacity('07:00', '23:00'), 960)
eq('a day ending after midnight', dayCapacity('09:00:00', '01:00:00'), 960)
eq('missing or equal is sixteen hours', [dayCapacity(null, '23:00'), dayCapacity('07:00', '07:00')], [960, 960])
eq('minutes planned: lengths, 15 for a task without one, nothing for an untimed habit',
  plannedMinutes([{ kind: 'task', minutes: 60 }, { kind: 'task', minutes: null }, { kind: 'habit', minutes: null }, { kind: 'chore', minutes: 20 }]), 95)
eq('heat steps', [0, 30, 90, 200, 400].map(heatStep), [0, 1, 2, 3, 4])
eq('busy-ness in words', busyness(200, 960), { share: 200 / 960, over: false, words: '3 h 20 of 16 h planned' })
eq('over a full day', busyness(1000, 960), { share: 1, over: true, words: '16 h 40 planned, 40 min more than the day holds' })
eq('an empty day', busyness(0, 960).words, 'Nothing planned')

// The Inbox's own order.
eq('move a row down', moveInList(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd'])
eq('move a row up', moveInList(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c'])
eq('a move past the end stops at it', moveInList(['a', 'b'], 0, 9), ['b', 'a'])
eq('only changed numbers are written', sortChanges(['b', 'a', 'c'], new Map([['a', 0], ['b', 1], ['c', 2]])), [{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 1 }])
eq('a new task goes on top', [topOfList([3, 0, 5]), topOfList([])], [-1, 0])

// Sections (GEN-05).
eq('only sections of modules that are on', sectionChoices(['training'], [], null), ['Work', 'Training', 'Night'])
eq('the person\'s own and the task\'s own', sectionChoices([], ['Garden'], 'Errands'), ['Work', 'Night', 'Garden', 'Errands'])
eq('a section set already is not repeated', sectionChoices(['health'], ['Body'], 'Body'), ['Work', 'Body', 'Night'])
eq('typed section cleaned', [cleanSection('  Side   project  '), cleanSection(''), cleanSection(3)], ['Side project', null, null])

// Plan choices kept in the core module.
const prefs = readPlanPrefs({ week_days: 5, hidden_calendars: ['abc-1', 4, 'abc-1'], own_sections: ['Garden', 'Work', 'garden', ''], copy: { notes: 'none' } })
eq('choices read back', [prefs.week_days, prefs.hidden_calendars, prefs.own_sections, prefs.copy.notes], [5, ['abc-1'], ['Garden', 'garden'], 'none'])
eq('nothing stored', readPlanPrefs(null).week_days, 7)
eq('hide and show a calendar', [toggleHidden([], 'x'), toggleHidden(['x', 'y'], 'x')], [['x'], ['y']])

// Day and week templates (PLN-08).
const task = (over) => ({
  id: 'x', profile_id: 'p', title: 'T', category: null, module_key: null, horizon: 'day', goal_id: null, series_id: null,
  duration_min: null, total_effort_min: null, daily_quota_min: null, fixed: false, locked: false, planned_date: '2026-10-05',
  planned_time: null, start_date: null, due_date: null, sort_order: 0, status: 'todo', push_count: 0, extension_count: 0,
  needs_review: false, source: 'manual', source_ref: null, notes: null, updated_at: '', completed_at: null, deleted_at: null, ...over,
})
const tasks = [
  task({ id: 'a', title: 'Laundry', planned_time: '10:00:00', duration_min: 45, category: 'Home', notes: '- [x] Whites\n- [ ] Darks' }),
  task({ id: 'b', title: 'Standup', series_id: 's' }),
  task({ id: 'c', title: 'Dinner: stew', source: 'meal' }),
  task({ id: 'd', title: 'Plan the week', planned_date: '2026-10-11', planned_time: '19:00' }),
  task({ id: 'e', title: 'Gone', deleted_at: 'x' }),
]
const meals = [
  { id: 'm', profile_id: 'p', slot_date: '2026-10-05', slot: 'dinner', recipe_id: '11111111-1111-4111-8111-111111111111', portion_multiplier: 2,
    status: 'eaten', slot_time: '18:30', sort_order: 0, updated_at: '', deleted_at: null },
  { id: 'n', profile_id: 'p', slot_date: '2026-10-05', slot: 'lunch', recipe_id: null, portion_multiplier: 1, status: 'planned', updated_at: '', deleted_at: null },
]
const day = templateFrom('Sunday reset', 'day', '2026-10-05', tasks, meals, { repeats: false, meals: true }, [])
eq('a day template keeps the day\'s own tasks', day.tasks.map((t) => t.title), ['Laundry'])
eq('ticks cleared, time and length kept', [day.tasks[0].notes, day.tasks[0].time, day.tasks[0].minutes, day.tasks[0].section],
  ['- [ ] Whites\n- [ ] Darks', '10:00', 45, 'Home'])
eq('meals with food come along', day.meals.map((m) => [m.slot, m.portions, m.time]), [['dinner', 2, '18:30']])
eq('its id comes from its name', day.id, 'sunday-reset')
eq('repeats when asked', templateFrom('R', 'day', '2026-10-05', tasks, meals, { repeats: true, meals: false }, []).tasks.map((t) => t.title), ['Laundry', 'Standup'])
const week = templateFrom('Week', 'week', '2026-10-05', tasks, [], { repeats: false, meals: false }, [])
eq('a week template keeps each task\'s weekday', week.tasks.map((t) => [t.title, t.day]), [['Laundry', 0], ['Plan the week', 6]])
eq('summary of a day', templateSummary(day), '1 task, 1 meal')
eq('summary of a week', templateSummary(week), '2 tasks over 2 days')
eq('a day template drops on the day', dropStart(day, '2026-10-08'), '2026-10-08')
eq('a week template drops on that week\'s Monday', dropStart(week, '2026-10-08'), '2026-10-05')
const dropped = dropTemplate(week, '2026-10-14')
eq('dropped week rows land on the right days', dropped.tasks.map((t) => [t.title, t.planned_date, t.planned_time]),
  [['Laundry', '2026-10-12', '10:00'], ['Plan the week', '2026-10-18', '19:00']])
eq('dropped meals are planned', dropTemplate(day, '2026-10-20').meals.map((m) => [m.slot_date, m.status, m.portion_multiplier]), [['2026-10-20', 'planned', 2]])
const stored = readPlanTemplates([day, week, { id: 'bad id!', name: 'x' }, { id: 'sunday-reset', name: 'Again' },
  { id: 'w2', name: 'Broken rows', kind: 'week', tasks: [{ day: 9, title: 'Out of the week' }, { day: 2, title: '  ' }, { day: 2, title: 'Fine', minutes: 'x' }],
    meals: [{ day: 0, slot: 'lunch' }] }])
eq('stored templates read back, bad ones dropped', stored.map((t) => t.id), ['sunday-reset', 'week', 'w2'])
eq('broken rows dropped, good ones kept', stored[2].tasks, [{ day: 2, title: 'Fine', time: null, minutes: null, section: null, module_key: null, locked: false, notes: null }])
eq('a meal with nothing to eat is dropped', stored[2].meals.length, 0)
eq('not a list gives none', readPlanTemplates({}), [])
eq('a taken id gets a number', planTemplateId('Sunday reset', ['sunday-reset']), 'sunday-reset-2')
eq('replace by id', withTemplate([day], { ...day, name: 'New name' }).map((t) => t.name), ['New name'])
eq('remove by id', withoutTemplate([day, week], 'week').map((t) => t.id), ['sunday-reset'])
eq('at most 50', readPlanTemplates(Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, name: `T${i}` }))).length, MAX_PLAN_TEMPLATES)

if (fail) { console.log(`\n${fail} plan check(s) failed`); process.exit(1) }
console.log('\nall plan checks passed')
