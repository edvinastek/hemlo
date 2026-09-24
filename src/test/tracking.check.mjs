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

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
