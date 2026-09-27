// Checks the recurring-series date rules against calendars read off by hand.
// 2026-09-24 is a Thursday; 2026-09-28 a Monday; 2028 is a leap year.
import {
  occurrences, plan, baseDates, addDays, weekdayOf, ruleFromChoice, describeRule, toDayNumber, fromDayNumber,
  occurrenceId, endsBeforeStart, everyN, choiceFromRule, isDay, cleanDates, togglePicked, seriesBounds,
  plannedRepeats, fillHorizon, WINDOW_DAYS,
} from '../lib/series-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}
const series = (rule, start, extra = {}) => ({
  rule, rule_config: {}, start_date: start, end_date: null, occurrence_count: null, ...extra,
})

// Day arithmetic.
eq('day number round trip', fromDayNumber(toDayNumber('2026-09-24')), '2026-09-24')
eq('add a day across a month', addDays('2026-09-30', 1), '2026-10-01')
eq('add a day across a year', addDays('2026-12-31', 1), '2027-01-01')
eq('add across the October clock change', addDays('2026-10-24', 2), '2026-10-26')
eq('leap day', addDays('2028-02-28', 1), '2028-02-29')
eq('2026-09-24 is a Thursday', weekdayOf('2026-09-24'), 4)
eq('2026-09-27 is a Sunday', weekdayOf('2026-09-27'), 0)

// Daily.
eq('daily, a week', occurrences(series('daily', '2026-09-24'), '2026-09-24', '2026-09-30'),
  ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'])
eq('daily, window before the start gives only days from the start',
  occurrences(series('daily', '2026-09-28'), '2026-09-24', '2026-09-29'), ['2026-09-28', '2026-09-29'])
eq('every 3 days counts from the start', occurrences(series('daily', '2026-09-24', { rule_config: { n: 3 } }), '2026-09-25', '2026-10-03'),
  ['2026-09-27', '2026-09-30', '2026-10-03'])
eq('window entirely before the start is empty', occurrences(series('daily', '2026-10-01'), '2026-09-01', '2026-09-30'), [])

// Weekdays.
eq('weekdays skip the weekend', occurrences(series('weekdays', '2026-09-24'), '2026-09-24', '2026-09-30'),
  ['2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30'])
eq('weekdays started on a Saturday begin on Monday', occurrences(series('weekdays', '2026-09-26'), '2026-09-26', '2026-09-29'),
  ['2026-09-28', '2026-09-29'])

// Weekly.
eq('weekly on Mon and Wed', occurrences(series('weekly', '2026-09-24', { rule_config: { weekdays: [1, 3] } }), '2026-09-24', '2026-10-07'),
  ['2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07'])
eq('weekly with no day picked uses the start weekday', occurrences(series('weekly', '2026-09-24'), '2026-09-24', '2026-10-15'),
  ['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'])
eq('weekly on Sunday', occurrences(series('weekly', '2026-09-24', { rule_config: { weekdays: [0] } }), '2026-09-24', '2026-10-05'),
  ['2026-09-27', '2026-10-04'])

// Every 2 weeks, anchored to the week of start_date.
const biweekly = series('every_n_weeks', '2026-09-24', { rule_config: { n: 2, weekdays: [4] } })
eq('every 2 weeks on Thursday', occurrences(biweekly, '2026-09-24', '2026-11-05'),
  ['2026-09-24', '2026-10-08', '2026-10-22', '2026-11-05'])
eq('every 2 weeks, window starting in an off week', occurrences(biweekly, '2026-10-01', '2026-10-21'), ['2026-10-08'])
eq('every 2 weeks on Mon and Fri keeps the start week and skips the next',
  occurrences(series('every_n_weeks', '2026-09-24', { rule_config: { n: 2, weekdays: [1, 5] } }), '2026-09-21', '2026-10-11'),
  ['2026-09-25', '2026-10-05', '2026-10-09'])
eq('every 2 weeks, Monday before a Thursday start is not produced',
  occurrences(series('every_n_weeks', '2026-09-24', { rule_config: { n: 2, weekdays: [1, 4] } }), '2026-09-21', '2026-09-24'),
  ['2026-09-24'])
eq('every 2 weeks started on a Sunday: the week runs Monday to Sunday',
  occurrences(series('every_n_weeks', '2026-09-27', { rule_config: { n: 2, weekdays: [0, 1] } }), '2026-09-27', '2026-10-12'),
  ['2026-09-27', '2026-10-05', '2026-10-11'])
eq('every 2 weeks, 52 weeks on is still an on-week',
  occurrences(biweekly, '2027-09-20', '2027-10-03'), ['2027-09-23'])

// Monthly.
eq('monthly on the 15th', occurrences(series('monthly', '2026-09-15'), '2026-09-01', '2026-12-31'),
  ['2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15'])
eq('monthly on the 31st lands on each month end', occurrences(series('monthly', '2026-08-31'), '2026-08-01', '2027-03-31'),
  ['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'])
eq('monthly on the 30th in February of a leap year', occurrences(series('monthly', '2028-01-30'), '2028-02-01', '2028-03-31'),
  ['2028-02-29', '2028-03-30'])
eq('monthly on the 29th outside a leap year', occurrences(series('monthly', '2027-01-29'), '2027-02-01', '2027-02-28'),
  ['2027-02-28'])
eq('monthly day_of_month overrides the start day',
  occurrences(series('monthly', '2026-09-24', { rule_config: { day_of_month: 1 } }), '2026-09-01', '2026-11-30'),
  ['2026-10-01', '2026-11-01'])

// End date.
eq('end_date is included', occurrences(series('daily', '2026-09-24', { end_date: '2026-09-26' }), '2026-09-24', '2026-10-31'),
  ['2026-09-24', '2026-09-25', '2026-09-26'])
eq('end_date before the window gives nothing', occurrences(series('daily', '2026-09-01', { end_date: '2026-09-10' }), '2026-09-24', '2026-10-31'), [])
eq('end_date on the start day gives one', occurrences(series('weekly', '2026-09-24', { end_date: '2026-09-24' }), '2026-09-01', '2026-12-31'),
  ['2026-09-24'])

// Occurrence count: counted from the start, not from the window.
const three = series('weekly', '2026-09-24', { occurrence_count: 3 })
eq('three times', occurrences(three, '2026-09-24', '2026-12-31'), ['2026-09-24', '2026-10-01', '2026-10-08'])
eq('three times, window after the first two', occurrences(three, '2026-10-02', '2026-12-31'), ['2026-10-08'])
eq('three times, window after all three', occurrences(three, '2026-10-09', '2026-12-31'), [])
eq('count and end: the earlier wins', occurrences(series('daily', '2026-09-24', { occurrence_count: 10, end_date: '2026-09-25' }), '2026-09-24', '2026-12-31'),
  ['2026-09-24', '2026-09-25'])
eq('zero times gives nothing', occurrences(series('daily', '2026-09-24', { occurrence_count: 0 }), '2026-09-24', '2026-12-31'), [])
eq('count of weekdays skips the weekend', baseDates(series('weekdays', '2026-09-24', { occurrence_count: 4 }), '2026-12-31'),
  ['2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29'])

// Skips and moves.
const daily = series('daily', '2026-09-24')
eq('a skip removes the day', occurrences(daily, '2026-09-24', '2026-09-26', [{ exception_date: '2026-09-25', action: 'skip', moved_to: null }]),
  ['2026-09-24', '2026-09-26'])
eq('a deleted skip no longer applies', occurrences(daily, '2026-09-24', '2026-09-26',
  [{ exception_date: '2026-09-25', action: 'skip', moved_to: null, deleted_at: '2026-09-24T10:00:00Z' }]),
  ['2026-09-24', '2026-09-25', '2026-09-26'])
const weeklyThu = series('weekly', '2026-09-24')
eq('a move lands the occurrence on the new day',
  occurrences(weeklyThu, '2026-09-24', '2026-10-10', [{ exception_date: '2026-10-01', action: 'move', moved_to: '2026-10-03' }]),
  ['2026-09-24', '2026-10-03', '2026-10-08'])
eq('a move keeps its base, so it can be found again',
  plan(weeklyThu, '2026-10-01', '2026-10-05', [{ exception_date: '2026-10-01', action: 'move', moved_to: '2026-10-03' }]),
  [{ base: '2026-10-01', date: '2026-10-03' }])
eq('a move out of the window drops it from the window',
  occurrences(weeklyThu, '2026-09-24', '2026-10-02', [{ exception_date: '2026-10-01', action: 'move', moved_to: '2026-10-20' }]),
  ['2026-09-24'])
eq('a move into the window from a later base is found',
  occurrences(weeklyThu, '2026-09-24', '2026-10-02', [{ exception_date: '2026-10-15', action: 'move', moved_to: '2026-09-30' }]),
  ['2026-09-24', '2026-09-30', '2026-10-01'])
eq('a move onto a day that already has one gives that day once',
  occurrences(daily, '2026-09-24', '2026-09-26', [{ exception_date: '2026-09-24', action: 'move', moved_to: '2026-09-25' }]),
  ['2026-09-25', '2026-09-26'])
eq('an exception on a day the rule never produced changes nothing',
  occurrences(weeklyThu, '2026-09-24', '2026-10-02', [{ exception_date: '2026-09-26', action: 'move', moved_to: '2026-09-27' }]),
  ['2026-09-24', '2026-10-01'])
eq('a move of an occurrence beyond the count is ignored',
  occurrences(three, '2026-09-24', '2026-12-31', [{ exception_date: '2026-10-15', action: 'move', moved_to: '2026-10-10' }]),
  ['2026-09-24', '2026-10-01', '2026-10-08'])
eq('a skip still uses up its place in the count',
  occurrences(three, '2026-09-24', '2026-12-31', [{ exception_date: '2026-10-01', action: 'skip', moved_to: null }]),
  ['2026-09-24', '2026-10-08'])
eq('a change keeps the day',
  occurrences(weeklyThu, '2026-09-24', '2026-10-01', [{ exception_date: '2026-10-01', action: 'change', moved_to: null }]),
  ['2026-09-24', '2026-10-01'])

// The eight-week window the app materialises: a daily series gives 57 days, today included.
eq('eight weeks of a daily series', occurrences(daily, '2026-09-24', addDays('2026-09-24', 56)).length, 57)
eq('a series started years ago still answers', occurrences(series('weekly', '2020-01-02'), '2026-09-24', '2026-10-01'),
  ['2026-09-24', '2026-10-01'])

// The Repeat control.
eq('choice: weekly with no day picked', ruleFromChoice('weekly', '2026-09-24'), { rule: 'weekly', rule_config: { weekdays: [4] } })
eq('choice: every 2 weeks', ruleFromChoice('biweekly', '2026-09-24', [5, 1, 1]), { rule: 'every_n_weeks', rule_config: { n: 2, weekdays: [1, 5] } })
eq('choice: monthly takes the start day', ruleFromChoice('monthly', '2026-08-31'), { rule: 'monthly', rule_config: { day_of_month: 31 } })
eq('describe weekly', describeRule(series('weekly', '2026-09-24', { rule_config: { weekdays: [3, 1] } })), 'Weekly on Mon, Wed')
eq('describe every 2 weeks with Sunday last',
  describeRule(series('every_n_weeks', '2026-09-24', { rule_config: { n: 2, weekdays: [0, 4] } })), 'Every 2 weeks on Thu, Sun')
eq('describe monthly on the 31st', describeRule(series('monthly', '2026-08-31')), 'Monthly on the 31st, or the last day of a shorter month')
eq('describe monthly on the 2nd', describeRule(series('monthly', '2026-08-02')), 'Monthly on the 2nd')
eq('describe monthly on the 12th', describeRule(series('monthly', '2026-08-12')), 'Monthly on the 12th')
eq('describe with an end', describeRule(series('daily', '2026-09-24', { end_date: '2026-11-03' })), 'Every day until 3 Nov 2026')

// Occurrence ids: the same series and day give the same id on every device,
// so two phones filling one day while apart make one row, not two.
const sid = '6f1c2a3e-0000-4000-8000-000000000001'
const idA = await occurrenceId(sid, '2026-10-01')
eq('occurrence id is a UUID Postgres accepts', /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(idA), true)
eq('occurrence id is the same when made again', await occurrenceId(sid, '2026-10-01'), idA)
eq('occurrence id differs by day', (await occurrenceId(sid, '2026-10-02')) !== idA, true)
eq('occurrence id differs by series', (await occurrenceId('6f1c2a3e-0000-4000-8000-000000000002', '2026-10-01')) !== idA, true)
const ids = new Set()
for (let i = 0; i < 400; i++) ids.add(await occurrenceId(sid, addDays('2026-09-24', i)))
eq('four hundred days give four hundred ids', ids.size, 400)

// Every N days, from the Repeat control.
eq('choice: every 3 days', ruleFromChoice('every_n_days', '2026-09-24', [], { n: 3 }), { rule: 'daily', rule_config: { n: 3 } })
eq('choice: every N days with no N is every 2', ruleFromChoice('every_n_days', '2026-09-24'), { rule: 'daily', rule_config: { n: 2 } })
eq('every N days: 1 or less becomes 2, fractions round down, too many is capped',
  [everyN(1), everyN(-4), everyN(4.7), everyN(9999), everyN('abc'), everyN('10')], [2, 2, 4, 365, 2, 10])
eq('every N days shows as its own choice', choiceFromRule({ rule: 'daily', rule_config: { n: 4 } }), 'every_n_days')
eq('every day stays every day', choiceFromRule({ rule: 'daily', rule_config: {} }), 'daily')
eq('describe every 4 days', describeRule(series('daily', '2026-09-24', { rule_config: { n: 4 } })), 'Every 4 days')

// Days picked by hand.
eq('a real day', [isDay('2028-02-29'), isDay('2027-02-29'), isDay('2026-9-1'), isDay(20260901), isDay(null)],
  [true, false, false, false, false])
eq('picked days are cleaned: real days, once each, in order',
  cleanDates(['2026-10-05', '2026-10-01', 'nonsense', '2026-10-05', '2026-02-30', 7, '2026-09-30']),
  ['2026-09-30', '2026-10-01', '2026-10-05'])
eq('not a list gives none', [cleanDates(undefined), cleanDates('2026-10-01'), cleanDates({})], [[], [], []])
const many = Array.from({ length: 400 }, (_, i) => addDays('2026-09-24', i))
eq('no more than 366 are kept, the earliest', [cleanDates(many).length, cleanDates(many)[365]], [366, addDays('2026-09-24', 365)])
eq('a tap picks a day', togglePicked(['2026-10-05'], '2026-10-01'), ['2026-10-01', '2026-10-05'])
eq('a second tap unpicks it', togglePicked(['2026-10-01', '2026-10-05'], '2026-10-01'), ['2026-10-05'])
eq('a tap on a full list adds nothing', togglePicked(cleanDates(many), '2030-01-01').length, 366)
eq('but still unpicks', togglePicked(cleanDates(many), '2026-09-24').length, 365)
eq('a tap on something that is not a day changes nothing', togglePicked(['2026-10-01'], '2026-13-01'), ['2026-10-01'])

const picked = ['2026-09-24', '2026-10-02', '2026-11-15', '2027-03-01']
const byHand = series('dates', '2026-09-24', { rule_config: { dates: picked } })
eq('choice: picked days', ruleFromChoice('dates', '2026-09-20', [], { dates: ['2026-10-02', '2026-09-24', '2026-10-02'] }),
  { rule: 'dates', rule_config: { dates: ['2026-09-24', '2026-10-02'] } })
eq('picked days are the occurrences', occurrences(byHand, '2026-09-01', '2027-12-31'), picked)
eq('picked days in a window', occurrences(byHand, '2026-10-01', '2026-11-30'), ['2026-10-02', '2026-11-15'])
eq('picked days before the start are not produced', occurrences(series('dates', '2026-10-01', { rule_config: { dates: picked } }), '2026-01-01', '2027-12-31'),
  ['2026-10-02', '2026-11-15', '2027-03-01'])
eq('picked days stop at the end date', occurrences({ ...byHand, end_date: '2026-11-15' }, '2026-09-01', '2027-12-31'),
  ['2026-09-24', '2026-10-02', '2026-11-15'])
eq('picked days honour a count', baseDates({ ...byHand, occurrence_count: 2 }, '2027-12-31'), ['2026-09-24', '2026-10-02'])
eq('picked days: a skip removes one', occurrences(byHand, '2026-09-01', '2027-12-31',
  [{ exception_date: '2026-10-02', action: 'skip', moved_to: null }]), ['2026-09-24', '2026-11-15', '2027-03-01'])
eq('picked days: a move lands it elsewhere', plan(byHand, '2026-11-01', '2026-11-30',
  [{ exception_date: '2026-11-15', action: 'move', moved_to: '2026-11-17' }]), [{ base: '2026-11-15', date: '2026-11-17' }])
eq('picked days: a move in from a later picked day is found', occurrences(byHand, '2026-10-01', '2026-10-31',
  [{ exception_date: '2027-03-01', action: 'move', moved_to: '2026-10-20' }]), ['2026-10-02', '2026-10-20'])
eq('picked days stored untidily still work',
  occurrences(series('dates', '2026-09-24', { rule_config: { dates: ['2026-10-02', 'x', '2026-09-24', '2026-10-02'] } }), '2026-09-01', '2026-12-31'),
  ['2026-09-24', '2026-10-02'])
eq('no picked days gives nothing', occurrences(series('dates', '2026-09-24'), '2026-09-01', '2026-12-31'), [])
eq('a year of picked days, then the list stops', occurrences(series('dates', '2026-09-24', { rule_config: { dates: many } }), '2026-09-24', '2028-12-31').length, 366)
eq('picked days far ahead are found without walking every day',
  occurrences(series('dates', '2026-09-24', { rule_config: { dates: ['2031-09-30'] } }), '2031-09-01', '2031-09-30'), ['2031-09-30'])
eq('describe one picked day', describeRule(series('dates', '2026-10-02', { rule_config: { dates: ['2026-10-02'] } })), 'On 2 Oct 2026')
eq('describe picked days, with no "until"', describeRule({ ...byHand, end_date: '2027-03-01' }), 'On 4 picked days, 24 Sep 2026 to 1 Mar 2027')
eq('describe none picked', describeRule(series('dates', '2026-10-02')), 'No days picked')
eq('picked days show as their own choice', choiceFromRule({ rule: 'dates', rule_config: { dates: picked } }), 'dates')

// Where a new series starts and ends.
eq('bounds: most rules start on the task day and end when asked',
  seriesBounds({ rule: 'weekly', rule_config: {} }, '2026-09-24', '2026-12-31'), { start_date: '2026-09-24', end_date: '2026-12-31' })
eq('bounds: picked days run from the first to the last, whatever the task day',
  seriesBounds({ rule: 'dates', rule_config: { dates: ['2026-11-15', '2026-10-02'] } }, '2026-09-24', null),
  { start_date: '2026-10-02', end_date: '2026-11-15' })
eq('bounds: picked days before the task day still count',
  seriesBounds({ rule: 'dates', rule_config: { dates: ['2026-09-20', '2026-10-02'] } }, '2026-09-24', null),
  { start_date: '2026-09-20', end_date: '2026-10-02' })

// Planned repeats: days past the filled weeks, worked out rather than stored.
eq('the fill goes eight weeks ahead', [WINDOW_DAYS, fillHorizon('2026-09-24')], [56, '2026-11-19'])
const sA = {
  ...series('weekly', '2026-09-24'), id: 'A', title: 'Swim', time_of_day: '07:30:00',
  task_template: { duration_min: 45, category: 'Training' }, module_key: 'training', active: true, deleted_at: null,
}
const horizon = '2026-11-19'
const dates = (list) => list.map((r) => r.date)
eq('nothing is planned up to the horizon', plannedRepeats([sA], [], [], '2026-09-24', '2026-11-19', horizon), [])
eq('after it, every day the series lands on',
  dates(plannedRepeats([sA], [], [], '2026-11-01', '2026-12-10', horizon)), ['2026-11-26', '2026-12-03', '2026-12-10'])
eq('a planned repeat looks like the series makes it',
  plannedRepeats([sA], [], [], '2026-11-26', '2026-11-26', horizon),
  [{ seriesId: 'A', base: '2026-11-26', date: '2026-11-26', title: 'Swim', time: '07:30', duration_min: 45, category: 'Training', module_key: 'training' }])
eq('a day that already has a task of the series is left to the task',
  dates(plannedRepeats([sA], [], [{ series_id: 'A', planned_date: '2026-12-03' }], '2026-11-20', '2026-12-10', horizon)),
  ['2026-11-26', '2026-12-10'])
eq('a deleted task counts too: that day was taken off',
  dates(plannedRepeats([sA], [], [{ series_id: 'A', planned_date: '2026-11-26', deleted_at: 'x' }], '2026-11-20', '2026-12-03', horizon)),
  ['2026-12-03'])
eq('another series\' task does not count',
  dates(plannedRepeats([sA], [], [{ series_id: 'B', planned_date: '2026-11-26' }], '2026-11-20', '2026-11-30', horizon)), ['2026-11-26'])
eq('a skipped day is not planned', dates(plannedRepeats([sA], [{ series_id: 'A', exception_date: '2026-11-26', action: 'skip', moved_to: null }],
  [], '2026-11-20', '2026-12-03', horizon)), ['2026-12-03'])
eq('another series\' skip does not count', dates(plannedRepeats([sA], [{ series_id: 'B', exception_date: '2026-11-26', action: 'skip', moved_to: null }],
  [], '2026-11-20', '2026-11-30', horizon)), ['2026-11-26'])
eq('a moved day is planned where it lands', plannedRepeats([sA], [{ series_id: 'A', exception_date: '2026-11-26', action: 'move', moved_to: '2026-11-28' }],
  [], '2026-11-20', '2026-11-30', horizon).map((r) => [r.base, r.date]), [['2026-11-26', '2026-11-28']])
eq('a day moved in front of the horizon is the fill\'s, not planned', plannedRepeats([sA], [{ series_id: 'A', exception_date: '2026-11-26', action: 'move', moved_to: '2026-11-18' }],
  [], '2026-11-01', '2026-11-30', horizon), [])
eq('a day moved past the horizon from a filled week is the task\'s, not planned',
  plannedRepeats([sA], [{ series_id: 'A', exception_date: '2026-11-19', action: 'move', moved_to: '2026-11-21' }], [], '2026-11-20', '2026-11-25', horizon), [])
eq('a change to one day shows on that day', plannedRepeats([sA], [{ series_id: 'A', exception_date: '2026-11-26', action: 'change', moved_to: null,
  changes: { title: 'Swim, long', planned_time: '08:00' } }], [], '2026-11-26', '2026-11-26', horizon).map((r) => [r.title, r.time]), [['Swim, long', '08:00']])
eq('a stopped series plans nothing', plannedRepeats([{ ...sA, end_date: '2026-11-01' }], [], [], '2026-11-20', '2026-12-31', horizon), [])
eq('a paused or deleted series plans nothing',
  [plannedRepeats([{ ...sA, active: false }], [], [], '2026-11-20', '2026-12-31', horizon).length,
    plannedRepeats([{ ...sA, deleted_at: 'x' }], [], [], '2026-11-20', '2026-12-31', horizon).length], [0, 0])
const sB = { ...sA, id: 'B', title: 'Bills', rule: 'dates', time_of_day: null, rule_config: { dates: ['2026-11-26', '2027-06-01', '2031-09-30'] }, module_key: null }
eq('several series, sorted by day, then time',
  plannedRepeats([sA, sB], [], [], '2026-11-26', '2026-11-26', horizon).map((r) => r.title), ['Swim', 'Bills'])
eq('picked days far ahead are planned', dates(plannedRepeats([sB], [], [], '2027-01-01', '2031-09-30', horizon)), ['2027-06-01', '2031-09-30'])
eq('a window after the horizon is used as given', dates(plannedRepeats([sA], [], [], '2027-01-01', '2027-01-14', horizon)), ['2027-01-07', '2027-01-14'])
eq('a window that ends before it starts gives nothing', plannedRepeats([sA], [], [], '2027-01-14', '2027-01-01', horizon), [])
eq('five years of a daily series are worked out',
  plannedRepeats([{ ...sA, rule: 'daily' }], [], [], '2026-09-27', '2031-09-30', horizon).length,
  toDayNumber('2031-09-30') - toDayNumber(horizon))

// An end before the start: the sheet refuses to save rather than lose the task.
eq('end before start', endsBeforeStart('2026-09-24', '2026-09-23'), true)
eq('end on the start day is fine', endsBeforeStart('2026-09-24', '2026-09-24'), false)
eq('no end is fine', endsBeforeStart('2026-09-24', null), false)
eq('an end before the start produces no days', occurrences(series('daily', '2026-09-24', { end_date: '2026-09-23' }), '2026-09-01', '2026-10-30'), [])

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
