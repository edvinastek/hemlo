// Checks the one repeat engine every module uses (schedule-rules.ts), and the
// settings that came with version 16. Calendars read off by hand:
// 2026-10-02 is a Friday; October 2026 starts on a Thursday; 2028 is a leap year.
import {
  ruleMatches, occursOn, daysIn, datesOf, nextOn, cleanRule, habitSchedule, habitDay, choreState, choreAssignee,
  describeSchedule, describeChore, toDayNumber,
} from '../lib/schedule-rules.ts'
import { readSettings, mergeSettings, mealTime } from '../lib/settings.ts'
import { readNoteTemplates, readTaskTemplates, fillTemplate, clearTicks, templateId, STARTER_NOTE_TEMPLATES } from '../lib/template-rules.ts'
import { readModuleViews, moduleView } from '../lib/module-view-rules.ts'
import { readStatsViews } from '../lib/stats-view-rules.ts'
import { ruleFromChoice, choiceFromRule, describeRule, occurrences } from '../lib/series-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}
const S = (rule, rule_config = {}, start = '2026-10-01', extra = {}) => ({ rule, rule_config, start_date: start, end_date: null, ...extra })

// New rule kinds.
eq('weekends in the first week of October', daysIn(S('weekends'), '2026-10-01', '2026-10-07'), ['2026-10-03', '2026-10-04'])
eq('weekdays skip the weekend', daysIn(S('weekdays'), '2026-10-02', '2026-10-05'), ['2026-10-02', '2026-10-05'])
eq('second Tuesday of each month', daysIn(S('monthly_nth', { nth: 2, weekday: 2 }), '2026-10-01', '2026-12-31'),
  ['2026-10-13', '2026-11-10', '2026-12-08'])
eq('last Friday of each month', daysIn(S('monthly_nth', { nth: -1, weekday: 5 }), '2026-10-01', '2026-12-31'),
  ['2026-10-30', '2026-11-27', '2026-12-25'])
eq('every 2 months on the 15th', daysIn(S('monthly', { day_of_month: 15, n: 2 }, '2026-10-15'), '2026-10-01', '2027-03-31'),
  ['2026-10-15', '2026-12-15', '2027-02-15'])
eq('the 31st falls on a short month\'s last day', daysIn(S('monthly', { day_of_month: 31 }, '2026-10-31'), '2026-11-01', '2026-11-30'), ['2026-11-30'])
eq('yearly on 29 Feb lands on the 28th in other years', daysIn(S('yearly', {}, '2028-02-29'), '2028-01-01', '2030-12-31'),
  ['2028-02-29', '2029-02-28', '2030-02-28'])
eq('yearly every 2 years', daysIn(S('yearly', { n: 2 }, '2026-10-02'), '2026-01-01', '2030-12-31'), ['2026-10-02', '2028-10-02', '2030-10-02'])
eq('every 3 weeks on Mon and Thu', daysIn(S('every_n_weeks', { n: 3, weekdays: [1, 4] }, '2026-09-28'), '2026-09-28', '2026-10-25'),
  ['2026-09-28', '2026-10-01', '2026-10-19', '2026-10-22'])
eq('nothing before the start', occursOn(S('daily', {}, '2026-10-05'), '2026-10-04'), false)
eq('nothing after the end', occursOn(S('daily', {}, '2026-10-01', { end_date: '2026-10-03' }), '2026-10-04'), false)
eq('a count stops it', datesOf(S('daily', {}, '2026-10-01', { occurrence_count: 3 }), '2026-12-31'), ['2026-10-01', '2026-10-02', '2026-10-03'])
eq('occursOn honours the count', occursOn(S('daily', {}, '2026-10-01', { occurrence_count: 3 }), '2026-10-04'), false)
eq('next on or after a day', nextOn(S('weekends'), '2026-10-05'), '2026-10-10')
eq('times a week matches any day', ruleMatches(S('times_per_week', { times: 3 }), toDayNumber('2026-10-06')), true)

// Cleaning stored rules.
eq('unknown kind is dropped', cleanRule('fortnightly-ish', {}).rule, null)
eq('numbers are kept in range', cleanRule('monthly_nth', { nth: 9, weekday: 12, n: 0 }).rule_config, { n: 1, weekday: 6, nth: 5 })
eq('last is -1', cleanRule('monthly_nth', { nth: -1 }).rule_config.nth, -1)
eq('weekdays are cleaned and sorted', cleanRule('weekly', { weekdays: [5, 1, 1, 9, 'x'] }).rule_config.weekdays, [1, 5])

// Habits.
eq('an old daily habit is every day', habitSchedule({ schedule: 'daily' }).rule, 'daily')
eq('an old weekly habit is once a week', habitSchedule({ schedule: 'weekly' }).rule_config, { times: 1 })
eq('a weekend habit is off on Friday', habitDay({ rule: 'weekends' }, '2026-10-02', []), 'off')
eq('a weekend habit is due on Saturday', habitDay({ rule: 'weekends' }, '2026-10-03', []), 'due')
eq('a ticked day is done', habitDay({ rule: 'weekends' }, '2026-10-03', ['2026-10-03']), 'done')
const thrice = { rule: 'times_per_week', rule_config: { times: 3 } }
eq('3× a week is due until three ticks', habitDay(thrice, '2026-10-01', ['2026-09-28', '2026-09-29']), 'due')
eq('3× a week is met after three', habitDay(thrice, '2026-10-02', ['2026-09-28', '2026-09-29', '2026-10-01']), 'met')
eq('a new week starts again', habitDay(thrice, '2026-10-05', ['2026-09-28', '2026-09-29', '2026-10-01']), 'due')
eq('custom dates habit', habitDay({ rule: 'dates', rule_config: { dates: ['2026-10-07'] } }, '2026-10-07', []), 'due')
eq('a habit before its start day is off', habitDay({ rule: 'daily', start_date: '2026-10-10' }, '2026-10-02', []), 'off')

// Chores.
const weekly = { mode: 'fixed', rule: 'weekly', rule_config: { weekdays: [6] }, every_days: null, start_date: '2026-09-26', end_date: null }
eq('a fixed chore is due on its day', choreState(weekly, '2026-10-03', []).shows, true)
eq('…and stays due until done (overdue days)', choreState(weekly, '2026-10-05', []).overdueDays, 2)
eq('…done after its day is no longer due', choreState(weekly, '2026-10-05', [{ done_on: '2026-10-04', done_by: null }]).shows, false)
eq('…its next day after that', choreState(weekly, '2026-10-05', [{ done_on: '2026-10-04', done_by: null }]).next, '2026-10-10')
const after = { mode: 'after', rule: null, rule_config: {}, every_days: 7, start_date: '2026-09-01', end_date: null }
eq('an "after" chore falls due 7 days after it was done', choreState(after, '2026-10-02', [{ done_on: '2026-09-25', done_by: null }]).shows, true)
eq('…not before', choreState(after, '2026-10-01', [{ done_on: '2026-09-25', done_by: null }]).next, '2026-10-02')
const flex = { mode: 'flexible', rule: null, rule_config: {}, every_days: 10, start_date: null, end_date: null }
eq('a flexible chore grows more due', choreState(flex, '2026-10-02', [{ done_on: '2026-09-27', done_by: null }]).dueness, 0.5)
eq('…and is never "failed", only more due', choreState(flex, '2026-10-17', [{ done_on: '2026-09-27', done_by: null }]).dueness, 2)
eq('a paused chore shows nothing', choreState({ ...weekly, paused: true }, '2026-10-03', []).shows, false)
eq('deleted logs do not count', choreState(weekly, '2026-10-05', [{ done_on: '2026-10-04', done_by: null, deleted_at: 'x' }]).shows, true)
const people = { ...weekly, assignees: ['e', 'p'] }
eq('rotate each time: after E comes P', choreAssignee({ ...people, rotation: 'each_time' }, '2026-10-10', [{ done_on: '2026-10-03', done_by: 'e' }]), ['p'])
eq('rotate each week (weeks counted from the Monday of 26 Sep)', [choreAssignee({ ...people, rotation: 'each_week' }, '2026-09-28', []), choreAssignee({ ...people, rotation: 'each_week' }, '2026-10-05', [])], [['p'], ['e']])
eq('least recent goes to whoever waited longest', choreAssignee({ ...people, rotation: 'least_recent' }, '2026-10-10',
  [{ done_on: '2026-10-01', done_by: 'p' }, { done_on: '2026-09-20', done_by: 'e' }]), ['e'])
eq('no rotation: everyone', choreAssignee(people, '2026-10-10', []), ['e', 'p'])

// Words.
eq('describe last Friday', describeSchedule(S('monthly_nth', { nth: -1, weekday: 5 })), 'Monthly on the last Friday')
eq('describe weekends', describeSchedule(S('weekends')), 'Weekends')
eq('describe 3 times a week', describeSchedule(S('times_per_week', { times: 3 })), '3 times a week')
eq('describe every 2 months', describeSchedule(S('monthly', { day_of_month: 15, n: 2 })), 'Every 2 months on the 15th')
eq('describe a flexible chore', describeChore(flex), 'About every 10 days')
eq('describe an after chore', describeChore(after), '7 days after it was last done')

// The task sheet's new choices.
eq('weekends from the sheet', ruleFromChoice('weekends', '2026-10-02'), { rule: 'weekends', rule_config: {} })
eq('nth weekday from the start day (2 Oct = 1st Friday)', ruleFromChoice('monthly_nth', '2026-10-02'), { rule: 'monthly_nth', rule_config: { nth: 1, weekday: 5 } })
eq('last weekday', ruleFromChoice('monthly_last', '2026-10-30').rule_config, { nth: -1, weekday: 5 })
eq('yearly from the start day', ruleFromChoice('yearly', '2026-10-02').rule_config, { month: 10, day: 2 })
eq('every 3 weeks', ruleFromChoice('every_n_weeks', '2026-10-02', [5], { n: 3 }).rule_config, { n: 3, weekdays: [5] })
eq('the sheet reads them back', ['monthly_last', 'monthly_nth', 'every_n_weeks', 'biweekly'].map((k) =>
  choiceFromRule(ruleFromChoice(k, '2026-10-30', [5], { n: 3 }))), ['monthly_last', 'monthly_nth', 'every_n_weeks', 'biweekly'])
eq('series describe still works', describeRule({ rule: 'weekly', rule_config: { weekdays: [1, 3] }, start_date: '2026-10-01', end_date: null, occurrence_count: null }), 'Weekly on Mon, Wed')
eq('series occurrences on weekends', occurrences({ rule: 'weekends', rule_config: {}, start_date: '2026-10-01', end_date: null, occurrence_count: null }, '2026-10-01', '2026-10-04'), ['2026-10-03', '2026-10-04'])

// Settings that came with version 16.
const d = readSettings({ settings: {} })
eq('hold times default', d.hold, { drag_ms: 350, expand_ms: 800 })
eq('expanding always takes longer than dragging', readSettings({ settings: { hold: { drag_ms: 900, expand_ms: 500 } } }).hold, { drag_ms: 900, expand_ms: 1100 })
eq('no meals unless named', d.meals, { names: [], cards: false, main: null })
eq('old default meal times keep their meals as cards', readSettings({ settings: { meal_times: { lunch: '12:30' } } }).meals,
  { names: [{ key: 'lunch', name: 'Lunch', time: '12:30' }], cards: true, main: null })
const meals = readSettings({ settings: { meals: { names: [{ key: 'pre', name: 'Pre-workout', time: '17:00' }, { key: 'pre', name: 'dupe' }, { key: 'BAD KEY', name: 'x' }], main: 'pre' } } }).meals
eq('named meals are checked', meals, { names: [{ key: 'pre', name: 'Pre-workout', time: '17:00' }], cards: true, main: 'pre' })
eq('a named meal gives its time', mealTime({ slot: 'pre' }, readSettings({ settings: { meals: { names: [{ key: 'pre', name: 'Pre', time: '17:00' }] } } })), '17:00')
eq('starter note templates are there', d.note_templates.length, STARTER_NOTE_TEMPLATES.length)
eq('an emptied template list stays empty', readNoteTemplates([]), [])
eq('bad templates are dropped', readNoteTemplates([{ id: 'ok', name: 'Fine', body: 'x' }, { id: 'no name', body: 'x' }, { id: 'ok', name: 'dupe', body: 'y' }]).map((t) => t.name), ['Fine'])
eq('task templates are checked', readTaskTemplates([{ id: 'read', name: 'Read', title: 'Reading', minutes: 30, note_template_id: 'reading' }, { id: 'x', name: 'No title' }]),
  [{ id: 'read', name: 'Read', title: 'Reading', minutes: 30, section: null, locked: false, note_template_id: 'reading', note: null }])
eq('fill-ins', fillTemplate('{weekday} {date}: {title} at {time} {other}', { day: '2026-10-02', title: 'Read', time: '18:30:00' }), 'Friday 2 October 2026: Read at 18:30 {other}')
eq('ticks cleared', clearTicks('- [x] one\n  - [X] two\n- [ ] three\nnot [x] a box'), '- [ ] one\n  - [ ] two\n- [ ] three\nnot [x] a box')
eq('template ids are unique', templateId('Reading reflection', ['reading-reflection']), 'reading-reflection-2')
eq('module views default to shown', moduleView({}, 'habits'), { today: true, plan: true, widget: true, stats: true, reminders: true })
eq('stats never shows on the planner', moduleView({}, 'stats').today, false)
eq('module views keep only booleans', readModuleViews({ habits: { today: false, plan: 'yes' }, 'Bad Key': { today: true } }), { habits: { today: false } })
eq('one switch changes, the others stay', mergeSettings(readSettings({ settings: { module_views: { habits: { plan: false } } } }), { module_views: { habits: { today: false } } }).module_views,
  { habits: { today: false, plan: false } })
eq('shopping trip defaults off', d.shopping.trip.on, false)
eq('shops are checked', readSettings({ settings: { shopping: { shops: [{ name: 'Albert Heijn', aisles: ['Fruit', 'Fruit', 'Dairy'] }, { name: 'albert heijn' }, { name: '' }] } } }).shopping.shops,
  [{ name: 'Albert Heijn', aisles: ['Fruit', 'Dairy'] }])
eq('trip merges one level', mergeSettings(d, { shopping: { trip: { on: true } } }).shopping.trip.time, '10:00')
eq('looks default', d.looks, { theme: 'notebook', mode: 'system', seed: null, icon: 'classic', text_size: 'default' })
eq('looks are checked', readSettings({ settings: { looks: { theme: 'ub', mode: 'neon', seed: '#FFA500', icon: '<x>' } } }).looks,
  { theme: 'ub', mode: 'system', seed: '#ffa500', icon: 'classic', text_size: 'default' })
eq('at most 6 Today cards', readSettings({ settings: { today_cards: Array.from({ length: 9 }, (_, i) => ({ kind: 'module', key: 'm' + i })) } }).today_cards.length, 6)
eq('stats views need a measure', readStatsViews([{ id: 'a', name: 'A', measures: [] }, { id: 'b', name: 'B', measures: [{ source: 'nutrition.protein_g', summary: 'avg' }], chart: { type: 'pie' } }]).map((v) => [v.id, v.chart.type]),
  [['b', 'bar']])

console.log(fail ? `\n${fail} failed` : '\nall passed')
process.exit(fail ? 1 : 0)
