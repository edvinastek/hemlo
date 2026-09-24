// Checks the recurring-series date rules against calendars read off by hand.
// 2026-09-24 is a Thursday; 2026-09-28 a Monday; 2028 is a leap year.
import {
  occurrences, plan, baseDates, addDays, weekdayOf, ruleFromChoice, describeRule, toDayNumber, fromDayNumber,
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

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
