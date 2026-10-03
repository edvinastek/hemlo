// Checks the habit and supplement rules against calendars worked out by hand.
// 2026-09-21 is a Monday; 2026-09-26 and 27 are the weekend after it.
import {
  addDays, weekday, weekStart, isScheduled, currentStreak, doneThisWeek, streakText,
  cleanName, nextSortOrder, groupBySlot, pickLog, doneDays,
} from '../lib/tracking-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// Calendar arithmetic, including month, year and leap-day edges.
is('Monday is 1', weekday('2026-09-21'), 1)
is('Sunday is 0', weekday('2026-09-27'), 0)
is('next day across a month', addDays('2026-09-30', 1), '2026-10-01')
is('back across a year', addDays('2026-01-01', -1), '2025-12-31')
is('leap day', addDays('2028-02-28', 1), '2028-02-29')
// The last Sunday of March is when the Netherlands moves the clocks; a day is
// still one day on the calendar.
is('across the clock change', addDays('2026-03-28', 2), '2026-03-30')
is('week starts Monday, from Thursday', weekStart('2026-09-24'), '2026-09-21')
is('week starts Monday, from Sunday', weekStart('2026-09-27'), '2026-09-21')
is('week starts Monday, from Monday', weekStart('2026-09-21'), '2026-09-21')

// Schedules.
is('daily is due on Saturday', isScheduled('daily', '2026-09-26'), true)
is('weekdays is not due on Saturday', isScheduled('weekdays', '2026-09-26'), false)
is('weekdays is not due on Sunday', isScheduled('weekdays', '2026-09-27'), false)
is('weekdays is due on Friday', isScheduled('weekdays', '2026-09-25'), true)
is('weekly is due any day of its week', isScheduled('weekly', '2026-09-23'), true)

// Daily: Mon to Thu done, shown on Thursday -> 4.
const monThu = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']
is('daily, four in a row', currentStreak('daily', monThu, '2026-09-24'), 4)
// Shown on Friday, Friday not ticked yet: the day is still open, so still 4.
is('daily, today still open', currentStreak('daily', monThu, '2026-09-25'), 4)
// Shown on Saturday: Friday was missed, so the run is over.
is('daily, a missed day ends it', currentStreak('daily', monThu, '2026-09-26'), 0)
// A gap in the middle: only the days after it count.
is('daily, gap on Tuesday', currentStreak('daily', ['2026-09-21', '2026-09-23', '2026-09-24'], '2026-09-24'), 2)
// Ticks after the day shown are ignored.
is('daily, later ticks ignored', currentStreak('daily', monThu, '2026-09-22'), 2)
is('daily, nothing done', currentStreak('daily', [], '2026-09-24'), 0)
is('daily, across a month end', currentStreak('daily', ['2026-09-29', '2026-09-30', '2026-10-01'], '2026-10-01'), 3)

// Weekdays: Thu 17, Fri 18, (weekend skipped), Mon 21, Tue 22 -> 4 on Tuesday.
const acrossWeekend = ['2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22']
is('weekdays, weekend does not break it', currentStreak('weekdays', acrossWeekend, '2026-09-22'), 4)
// Viewed on the Sunday after Fri 25: weekend days are skipped, Fri counts.
const fullWeek = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
is('weekdays, viewed on Sunday', currentStreak('weekdays', fullWeek, '2026-09-27'), 5)
// Viewed on the next Monday, not ticked yet: still open, still 5.
is('weekdays, next Monday still open', currentStreak('weekdays', fullWeek, '2026-09-28'), 5)
// Viewed on the next Tuesday with Monday missed: over.
is('weekdays, missed Monday ends it', currentStreak('weekdays', fullWeek, '2026-09-29'), 0)
// A weekend tick on a weekdays habit neither adds nor breaks.
is('weekdays, weekend tick adds nothing', currentStreak('weekdays', [...acrossWeekend, '2026-09-19'], '2026-09-22'), 4)
// A missed Friday is a break even with the weekend in between.
is('weekdays, missed Friday ends it', currentStreak('weekdays', ['2026-09-17', '2026-09-21'], '2026-09-21'), 1)
// Viewed on the weekend itself: Friday is over, not open, so missing it ends
// the run. This used to read 4 because Friday was treated as the open day.
is('weekdays, missed Friday seen on Saturday', currentStreak('weekdays', monThu, '2026-09-26'), 0)
is('weekdays, missed Friday seen on Sunday', currentStreak('weekdays', monThu, '2026-09-27'), 0)
is('weekdays, missed Friday seen next Monday', currentStreak('weekdays', monThu, '2026-09-28'), 0)
// Viewed on the weekend with Friday done: the whole week counts.
is('weekdays, done Friday seen on Saturday', currentStreak('weekdays', fullWeek, '2026-09-26'), 5)

// Weekly: one tick in each of three weeks running -> 3.
const weekly = ['2026-09-09', '2026-09-14', '2026-09-24']
is('weekly, three weeks', currentStreak('weekly', weekly, '2026-09-24'), 3)
// This week not done yet, viewed on Monday 21 with ticks in the two weeks before: 2.
is('weekly, this week still open', currentStreak('weekly', ['2026-09-09', '2026-09-14'], '2026-09-21'), 2)
// A whole week missed ends it.
is('weekly, missed week', currentStreak('weekly', ['2026-09-01', '2026-09-24'], '2026-09-24'), 1)
// Two ticks in one week count once.
is('weekly, one week counted once', currentStreak('weekly', ['2026-09-21', '2026-09-23'], '2026-09-24'), 1)
is('done this week, earlier in the week', doneThisWeek(['2026-09-22'], '2026-09-24'), true)
is('done this week, only last week', doneThisWeek(['2026-09-20'], '2026-09-24'), false)
is('done this week, only later this week', doneThisWeek(['2026-09-25'], '2026-09-24'), false)

// How a streak reads.
is('streak text zero', streakText('daily', 0), '')
is('streak text one day', streakText('daily', 1), '1 day running')
is('streak text days', streakText('weekdays', 12), '12 days running')
is('streak text weeks', streakText('weekly', 3), '3 weeks running')

// Names and order.
is('clean name', cleanName('  Vitamin   D '), 'Vitamin D')
is('clean empty name', cleanName('   '), null)
is('first sort order', nextSortOrder([]), 0)
is('next sort order', nextSortOrder([{ sort_order: 2 }, { sort_order: 5 }]), 6)

// One log per day: the most recent edit decides.
const logs = [
  { log_date: '2026-09-21', done: true, updated_at: '2026-09-21T08:00:00Z' },
  { log_date: '2026-09-22', done: true, updated_at: '2026-09-22T08:00:00Z' },
  { log_date: '2026-09-22', done: false, updated_at: '2026-09-22T09:00:00Z' },
  { log_date: '2026-09-23', done: false, updated_at: '2026-09-23T08:00:00Z' },
]
is('pick the latest log', pickLog(logs.slice(1, 3)).done, false)
is('pick from none', pickLog([]), undefined)
is('done days use the latest log per day', doneDays(logs), ['2026-09-21'])

// Supplements in the order of the day, sorted within a slot, empty slots left out.
const sup = [
  { name: 'Magnesium', time_slot: 'evening', sort_order: 0 },
  { name: 'Vitamin D', time_slot: 'morning', sort_order: 1 },
  { name: 'Creatine', time_slot: 'morning', sort_order: 0 },
  { name: 'Fish oil', time_slot: null, sort_order: 0 },
]
is('slot groups in day order', groupBySlot(sup).map((g) => g.label), ['Morning', 'Evening', 'Any time'])
is('sorted within a slot', groupBySlot(sup)[0].rows.map((r) => r.name), ['Creatine', 'Vitamin D'])

// ---------- version 16: any schedule (HAB-01 to HAB-08) -----------------------
import {
  habitStreak, habitStreakText, habitStrength, habitMonth, habitYear, habitKept, dayChecklist, toggleDayCheck,
  amountText, habitWhen, readSlots, slotKey, supplementDue, supplementGroups, DEFAULT_SLOTS, monthAfter, monthBefore,
} from '../lib/tracking-rules.ts'

// 2026-10-03 is a Saturday. October 2026 starts on a Thursday.
const daily = { rule: 'daily', rule_config: {}, start_date: '2026-09-01' }
const run = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i))
is('streak of a daily habit', habitStreak(daily, run('2026-09-26', 7), '2026-10-02'), { n: 7, unit: 'day' })
is('today still open keeps the run', habitStreak(daily, run('2026-09-26', 7), '2026-10-03'), { n: 7, unit: 'day' })
is('a missed day ends it', habitStreak(daily, ['2026-09-28', '2026-09-30', '2026-10-01'], '2026-10-01'), { n: 2, unit: 'day' })
const mwf = { rule: 'weekly', rule_config: { weekdays: [1, 3, 5] }, start_date: '2026-09-01' }
is('Mon, Wed, Fri counts times, skipping the days between', habitStreak(mwf, ['2026-09-25', '2026-09-28', '2026-09-30', '2026-10-02'], '2026-10-03'), { n: 4, unit: 'time' })
const thrice = { rule: 'times_per_week', rule_config: { times: 3 }, start_date: '2026-09-01' }
is('3 times a week counts weeks that got three', habitStreak(thrice, ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-21', '2026-09-23', '2026-09-25', '2026-09-29'], '2026-10-01'), { n: 2, unit: 'week' })
is('the week still running does not break it', habitStreak(thrice, ['2026-09-21', '2026-09-23', '2026-09-25'], '2026-09-29'), { n: 1, unit: 'week' })
is('weekends habit skips the week', habitStreak({ rule: 'weekends', start_date: '2026-09-01' }, ['2026-09-26', '2026-09-27', '2026-10-03'], '2026-10-03'), { n: 3, unit: 'day' })
is('old weekdays habit still reads as before', habitStreak({ schedule: 'weekdays' }, ['2026-09-25', '2026-09-28'], '2026-09-28'), { n: 2, unit: 'day' })
is('streak words', [habitStreakText({ n: 1, unit: 'day' }), habitStreakText({ n: 3, unit: 'week' }), habitStreakText({ n: 6, unit: 'time' }), habitStreakText({ n: 0, unit: 'day' })],
  ['1 day running', '3 weeks running', '6 times running', ''])

// Strength: forgiving (HAB-07).
const month = run('2026-09-01', 30)
const s30 = habitStrength(daily, month, '2026-09-30')
is('a month every day is strong', s30 >= 75 && s30 < 100, true)
const oneMiss = habitStrength(daily, month.filter((d) => d !== '2026-09-29'), '2026-09-30')
is('one miss costs a few points, not everything', s30 - oneMiss > 0 && s30 - oneMiss <= 8, true)
is('nothing done is 0', habitStrength(daily, [], '2026-09-30'), 0)
is('today open does not lower it', habitStrength(daily, month, '2026-10-01'), s30)
const weekMet = habitStrength(thrice, ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-14', '2026-09-15', '2026-09-16'], '2026-09-20')
is('a times-a-week habit is weighed by weeks', weekMet > 0, true)
is('strength grows with more good days', habitStrength({ ...daily, start_date: '2026-08-01' }, run('2026-08-01', 61), '2026-09-30') > s30, true)

// History grid (HAB-08).
const oct = habitMonth(mwf, ['2026-10-02'], '2026-10', '2026-10-07')
is('October starts on a Thursday: three blanks first', oct[0].slice(0, 3).map((c) => c.cell), ['blank', 'blank', 'blank'])
is('Friday 2 Oct done', oct[0][4], { day: '2026-10-02', cell: 'done' })
is('Monday 5 Oct missed, Tuesday off', [oct[1][0].cell, oct[1][1].cell], ['missed', 'off'])
is('Wednesday 7 Oct today is open, Friday 9 is to come', [oct[1][2].cell, oct[1][4].cell], ['open', 'future'])
is('the grid has whole weeks', oct.every((w) => w.length === 7) && oct.length === 5, true)
is('month steps', [monthAfter('2026-12'), monthBefore('2026-01'), monthAfter('2026-09')], ['2027-01', '2025-12', '2026-10'])
is('a year is 53 weeks of 7', [habitYear(daily, [], '2026-10-03').length, habitYear(daily, [], '2026-10-03')[0].length], [53, 7])
is('kept: 28 of 30 due days', habitKept(daily, month.slice(2), '2026-09-01', '2026-09-30'), { done: 28, due: 30, unit: 'day' })
is('kept: weeks for a times-a-week habit', habitKept(thrice, ['2026-09-07', '2026-09-08', '2026-09-09'], '2026-09-07', '2026-09-20'), { done: 1, due: 2, unit: 'week' })

// The pinned checklist ticked for the day (HAB-11).
const note = '## Mobility\n- [ ] Hips\n  - [x] Left\n- [ ] Shoulders\nText'
is('the day ticks, not the note', dayChecklist(note, [2]).map((i) => [i.index, i.text, i.depth, i.done]), [[0, 'Hips', 0, false], [1, 'Left', 1, false], [2, 'Shoulders', 0, true]])
is('toggle a tick on and off', [toggleDayCheck([2], 0), toggleDayCheck([0, 2], 2)], [[0, 2], [0]])
is('count words', [amountText(5, 8, 'glasses'), amountText(null, 10, 'min'), amountText(3, null, null)], ['5 of 8 glasses', '0 of 10 min', '3'])
is('when: time, part of day, any time', [habitWhen({ time_of_day: '07:30:00' }).label, habitWhen({ day_part: 'evening' }).label, habitWhen({}).label], ['07:30', 'Evening', 'Any time'])
is('morning sorts before a 9 o\'clock habit, evening after 18:00', [habitWhen({ day_part: 'morning' }).key < '09:00', habitWhen({ day_part: 'evening' }).key > '18:00'], [true, true])

// Supplements: the person's slots and schedules (SUP-02, SUP-03).
is('nothing stored: three default slots', readSlots(undefined).map((s) => s.key), ['morning', 'midday', 'evening'])
is('the server\'s old word list: still the defaults', readSlots(['morning', 'evening']), DEFAULT_SLOTS)
is('own slots are checked', readSlots([{ key: 'wake', name: ' On waking ', time: '06:45' }, { key: 'wake', name: 'dupe' }, { key: 'BAD KEY', name: 'x' }, { key: 'bed', name: 'Bed', time: '25:00' }]),
  [{ key: 'wake', name: 'On waking', time: '06:45' }, { key: 'bed', name: 'Bed', time: null }])
is('slot keys are unique', slotKey('Before training', ['before-training']), 'before-training-2')
const vitD = { rule: 'dates', rule_config: { dates: ['2026-10-05'] } }
is('no rule: every day', supplementDue({}, '2026-10-03'), true)
is('creatine on training days', [supplementDue({ rule: 'weekly', rule_config: { weekdays: [1, 4] }, start_date: '2026-09-01' }, '2026-10-05'), supplementDue({ rule: 'weekly', rule_config: { weekdays: [1, 4] }, start_date: '2026-09-01' }, '2026-10-06')], [true, false])
is('only in winter: between its first and last day', [supplementDue({ start_date: '2026-10-01', end_date: '2027-03-31' }, '2026-09-30'), supplementDue({ start_date: '2026-10-01', end_date: '2027-03-31' }, '2026-12-01')], [false, true])
is('picked days', supplementDue(vitD, '2026-10-05'), true)
const rows = [
  { id: 'a', name: 'Zinc', dose_text: null, time_slot: 'wake', sort_order: 1, active: true, deleted_at: null },
  { id: 'b', name: 'Creatine', dose_text: '5 g', time_slot: 'wake', sort_order: 0, active: true, deleted_at: null, rule: 'weekly', rule_config: { weekdays: [1] }, start_date: '2026-09-01' },
  { id: 'c', name: 'Magnesium', dose_text: null, time_slot: 'midday', sort_order: 0, active: true, deleted_at: null },
  { id: 'd', name: 'Old', dose_text: null, time_slot: 'wake', sort_order: 0, active: false, deleted_at: 'x' },
]
const slots = [{ key: 'wake', name: 'On waking', time: '06:45' }, { key: 'bed', name: 'Bed', time: null }]
is('grouped by the person\'s slots; a removed slot goes to Any time', supplementGroups(rows, slots).map((g) => [g.label, g.rows.map((r) => r.id)]), [['On waking', ['b', 'a']], ['Any time', ['c']]])
is('only the ones due that day (Saturday: no creatine)', supplementGroups(rows, slots, '2026-10-03').map((g) => g.rows.map((r) => r.id)), [['a'], ['c']])

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
