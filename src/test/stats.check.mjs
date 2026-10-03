// Checks the Stats arithmetic against calendars and sums worked out by hand.
// 2026-09-21 is a Monday; "today" in these checks is Thursday 2026-09-24.
import {
  periodRange, shiftAnchor, previousRange, daysOf, dayCount, reach, canShift, clampAnchor, periodTitle, isCurrent,
  summarise, percent, ratioBuckets, latest, upTo, sumMetric, meanMetric, ratioMetric, habitSeries, supplementSeries,
  sleepHours, toNumber, fieldSeries, plural, formatNumber, formatDelta, statsRows, monthLength,
  habitFacts, choreFacts, clockHours,
} from '../lib/stats-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const today = '2026-09-24'
// A series with its days in order, so two with the same days compare equal.
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))

/* ---------- periods ---------- */
is('a day is itself', periodRange('day', '2026-09-24'), { start: '2026-09-24', end: '2026-09-24' })
is('a week runs Monday to Sunday', periodRange('week', '2026-09-24'), { start: '2026-09-21', end: '2026-09-27' })
is('a Sunday belongs to the week before it', periodRange('week', '2026-09-27').start, '2026-09-21')
is('a week across the new year', periodRange('week', '2026-01-01'), { start: '2025-12-29', end: '2026-01-04' })
is('a month', periodRange('month', '2026-09-24'), { start: '2026-09-01', end: '2026-09-30' })
is('February in a leap year', periodRange('month', '2028-02-10').end, '2028-02-29')
is('February otherwise', periodRange('month', '2026-02-10').end, '2026-02-28')
is('a year', periodRange('year', '2026-09-24'), { start: '2026-01-01', end: '2026-12-31' })
is('month lengths', [monthLength(2026, 1), monthLength(2026, 4), monthLength(2024, 2), monthLength(2100, 2)], [31, 30, 29, 28])

is('a day back and on', [shiftAnchor('day', '2026-03-01', -1), shiftAnchor('day', '2026-12-31', 1)], ['2026-02-28', '2027-01-01'])
is('a week on', shiftAnchor('week', '2026-09-24', 1), '2026-10-01')
is('31 January plus a month is the end of February', shiftAnchor('month', '2026-01-31', 1), '2026-02-28')
is('a month back across the year', shiftAnchor('month', '2026-01-15', -1), '2025-12-15')
is('twelve months on is a year', shiftAnchor('month', '2026-09-24', 12), '2027-09-24')
is('many months back', shiftAnchor('month', '2026-03-31', -13), '2025-02-28')
is('29 February plus a year', shiftAnchor('year', '2028-02-29', 1), '2029-02-28')
is('the period before: a week', previousRange('week', '2026-09-24'), { start: '2026-09-14', end: '2026-09-20' })
is('the period before: March is February', previousRange('month', '2026-03-31'), { start: '2026-02-01', end: '2026-02-28' })
is('the period before: a year', previousRange('year', '2026-06-01'), { start: '2025-01-01', end: '2025-12-31' })

is('days of a week', daysOf(periodRange('week', today)).length, 7)
is('days across a month end', daysOf({ start: '2026-09-29', end: '2026-10-02' }), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
is('day counts', [dayCount(periodRange('year', '2028-05-01')), dayCount(periodRange('year', '2026-05-01')), dayCount({ start: '2026-09-24', end: '2026-09-24' })], [366, 365, 1])

// How far the arrows go.
is('the reach: three years back, five ahead', reach(today), { start: '2023-09-24', end: '2031-09-24' })
is('a year can step back to the one the reach starts in', canShift('year', '2024-06-01', -1, today), true)
is('but not before it', canShift('year', '2023-06-01', -1, today), false)
is('a year can step on to the last one', canShift('year', '2030-06-01', 1, today), true)
is('but not past it', canShift('year', '2031-06-01', 1, today), false)
is('a month at the far end', [canShift('month', '2023-09-24', -1, today), canShift('month', '2031-09-24', 1, today)], [false, false])
is('a day inside steps freely', [canShift('day', today, -1, today), canShift('day', today, 1, today)], [true, true])
is('an anchor too far back is pulled in', clampAnchor('2019-01-01', today), '2023-09-24')
is('one too far ahead too', clampAnchor('2040-01-01', today), '2031-09-24')
is('one inside is kept', clampAnchor('2027-02-02', today), '2027-02-02')

// Titles.
is('a day title', periodTitle('day', '2026-09-27'), 'Sun 27 September 2026')
is('a week inside one month', periodTitle('week', '2026-09-24'), '21 – 27 Sep 2026')
is('a week across two months', periodTitle('week', '2026-10-01'), '28 Sep – 4 Oct 2026')
is('a week across two years', periodTitle('week', '2026-01-01'), '29 Dec 2025 – 4 Jan 2026')
is('a month title', periodTitle('month', '2026-09-24'), 'September 2026')
is('a year title', periodTitle('year', '2026-09-24'), '2026')
is('the current period', [isCurrent('week', '2026-09-27', today), isCurrent('week', '2026-09-28', today)], [true, false])

/* ---------- adding up ---------- */
const week = periodRange('week', today)
// Mon 3, Tue 0, Wed 5, Thu 2; Sat 4 is planned ahead (after today).
const s = { '2026-09-21': 3, '2026-09-22': 0, '2026-09-23': 5, '2026-09-24': 2, '2026-09-26': 4, '2026-09-30': 99 }
const w = summarise(s, week, 'week', today)
is('the total includes the planned day ahead, not a day outside the week', w.total, 14)
is('so far: Monday to today', w.sofar, 10)
is('days logged, zero included', w.logged, 5)
is('the average runs over the four days so far, not seven', [w.days, w.average], [4, 2.5])
is('the best day', w.best, { day: '2026-09-23', value: 5 })
is('a bar per day, Monday first', w.buckets.map((b) => b.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
is('bar values: a day gone with nothing is 0, a day ahead with nothing is empty', w.buckets.map((b) => b.value), [3, 0, 5, 2, null, 4, null])
is('the days ahead are marked', w.buckets.map((b) => b.future), [false, false, false, false, true, true, true])

const logged = summarise(s, week, 'week', today, { per: 'logged' })
is('per day logged: over the five days with a value', [logged.days, logged.average], [5, 14 / 5])

const past = summarise({ '2026-09-14': 7 }, previousRange('week', today), 'week', today)
is('a week that is over is averaged over all seven days', [past.days, past.average], [7, 1])
const ahead = summarise({ '2026-10-06': 2 }, periodRange('week', '2026-10-06'), 'week', today)
is('a week not yet started has no average', [ahead.days, ahead.average, ahead.total], [0, null, 2])
const none = summarise({}, week, 'week', today)
is('nothing at all: total 0, no best day', [none.total, none.best, none.logged], [0, null, 0])
is('a zero is never the best day', summarise({ '2026-09-21': 0 }, week, 'week', today).best, null)

// Means: hours slept, weight.
const sleep = summarise({ '2026-09-21': 7, '2026-09-22': 8, '2026-09-24': 6 }, week, 'week', today, { how: 'mean' })
is('a mean is over the nights logged', [sleep.average, sleep.days], [7, 3])
is('its bars are that day’s value, empty where nothing was logged', sleep.buckets.map((b) => b.value), [7, 8, null, 6, null, null, null])
const weighted = summarise({ '2026-09-21': 30, '2026-09-22': 10 }, week, 'week', today, { how: 'mean', counts: { '2026-09-21': 2, '2026-09-22': 1 } })
is('a mean of records weighs each record, not each day', weighted.average, 40 / 3)

// A month's bars and a year's.
const month = summarise({ '2026-09-01': 1, '2026-09-30': 2 }, periodRange('month', today), 'month', today)
is('a month has a bar per day, labelled by date', [month.buckets.length, month.buckets[0].label, month.buckets[29].label], [30, '1', '30'])
is('a month is averaged over its days so far', month.days, 24)
const yr = summarise({ '2026-01-05': 2, '2026-01-20': 3, '2026-09-01': 4, '2026-11-11': 1 }, periodRange('year', today), 'year', today)
is('a year has a bar per month', yr.buckets.map((b) => b.label).join(''), 'JFMAMJJASOND')
is('each month’s bar adds its days up', yr.buckets.map((b) => b.value), [5, 0, 0, 0, 0, 0, 0, 0, 4, null, 1, null])
is('months keyed yyyy-MM', [yr.buckets[0].key, yr.buckets[11].key], ['2026-01', '2026-12'])
is('months ahead are marked', yr.buckets.map((b) => b.future).filter(Boolean).length, 3)
const yrMean = summarise({ '2026-01-05': 80, '2026-01-20': 82 }, periodRange('year', today), 'year', today, { how: 'mean' })
is('a year of means: each month’s bar is its average', yrMean.buckets[0].value, 81)
const oneDay = summarise({ [today]: 4 }, periodRange('day', today), 'day', today)
is('a day: one bar, average is the day', [oneDay.buckets.length, oneDay.average], [1, 4])

// Shares.
is('percent rounds, and never passes 100', [percent(1, 3), percent(2, 3), percent(5, 4)], [33, 67, 100])
is('nothing to do is no share at all', [percent(0, 0), percent(3, 0)], [null, null])
is('upTo drops days after today', upTo({ '2026-09-24': 1, '2026-09-25': 2 }, today), { '2026-09-24': 1 })
const rb = ratioBuckets({ '2026-09-21': 1, '2026-09-22': 2, '2026-09-26': 1 }, { '2026-09-21': 2, '2026-09-22': 2, '2026-09-23': 2, '2026-09-26': 2 }, week, 'week', today)
is('share bars: done over due each day so far, none ahead', rb.map((b) => b.value), [50, 100, 0, null, null, null, null])

/* ---------- figures ---------- */
const cur = summarise({ '2026-09-21': 4, '2026-09-22': 2 }, week, 'week', today)
const prev = summarise({ '2026-09-14': 7 }, previousRange('week', today), 'week', today)
is('a total: the sum, the average a day, and the change in that average', sumMetric('m', 'Minutes', 'min', cur, prev),
  { key: 'm', label: 'Minutes', unit: 'min', value: 6, perDay: 1.5, delta: 0.5, decimals: 0 })
const hPrev = summarise({ '2026-09-15': 8 }, previousRange('week', today), 'week', today, { how: 'mean' })
is('a mean: the average and its change', meanMetric('h', 'Hours', 'h', sleep, hPrev),
  { key: 'h', label: 'Hours', unit: 'h', value: 7, perDay: null, delta: -1, decimals: 1 })
const done = summarise({ '2026-09-21': 1, '2026-09-22': 2, '2026-09-26': 1 }, week, 'week', today)
const planned = summarise({ '2026-09-21': 2, '2026-09-22': 2, '2026-09-26': 3 }, week, 'week', today)
const pDone = summarise({ '2026-09-14': 1 }, previousRange('week', today), 'week', today)
const pPlanned = summarise({ '2026-09-14': 4 }, previousRange('week', today), 'week', today)
is('a share counts days so far only: 3 of 4, not 4 of 7', ratioMetric('c', 'Done', done, planned, pDone, pPlanned).value, 75)
is('and its change in points', ratioMetric('c', 'Done', done, planned, pDone, pPlanned).delta, 50)

/* ---------- habits and supplements ---------- */
const habits = [
  { id: 'daily', schedule: 'daily', active: true },
  { id: 'wd', schedule: 'weekdays', active: true },
  { id: 'weekly', schedule: 'weekly', active: true },
  { id: 'old', schedule: 'daily', active: false },
]
const hs = habitSeries(habits, {
  daily: ['2026-09-21', '2026-09-22', '2026-09-24'],
  wd: ['2026-09-21', '2026-09-26'],
  weekly: ['2026-09-23'],
  old: ['2026-09-22', '2026-09-10'],
}, week)
is('ticks: every tick in the week, a put-away habit’s too', sorted(hs.ticks), { '2026-09-21': 2, '2026-09-22': 2, '2026-09-23': 1, '2026-09-24': 1, '2026-09-26': 1 })
is('due: daily every day, weekdays Monday to Friday, weekly on the day done', sorted(hs.due),
  { '2026-09-21': 2, '2026-09-22': 2, '2026-09-23': 3, '2026-09-24': 2, '2026-09-25': 2, '2026-09-26': 1, '2026-09-27': 1 })
is('hits: a Saturday tick on a weekdays habit is not a hit', sorted(hs.hits), { '2026-09-21': 2, '2026-09-22': 1, '2026-09-23': 1, '2026-09-24': 1 })
const undone = habitSeries([{ id: 'weekly', schedule: 'weekly', active: true }], {}, week)
is('a weekly habit not done is due on its Sunday', undone.due, { '2026-09-27': 1 })
const partial = habitSeries([{ id: 'weekly', schedule: 'weekly', active: true }], {}, { start: '2026-09-21', end: '2026-09-23' })
is('a week cut short by the range without its Sunday asks nothing', partial.due, {})
const twiceGym = habitSeries([{ id: 'gym', rule: 'times_per_week', rule_config: { times: 2 }, active: true }], { gym: ['2026-09-22'] }, week)
is('twice a week, done once: due on the day done and once more on Sunday', twiceGym.due, { '2026-09-22': 1, '2026-09-27': 1 })
const weekends = habitSeries([{ id: 'we', rule: 'weekends', rule_config: {}, active: true }], { we: ['2026-09-26'] }, week)
is('a weekends habit is due Saturday and Sunday only', [sorted(weekends.due), weekends.hits], [{ '2026-09-26': 1, '2026-09-27': 1 }, { '2026-09-26': 1 }])
const late = habitSeries([{ id: 'late', rule: 'daily', rule_config: {}, start_date: '2026-09-25', active: true }], {}, week)
is('nothing due before its start day', Object.keys(late.due), ['2026-09-25', '2026-09-26', '2026-09-27'])
const hDone = summarise(hs.hits, week, 'week', today); const hDue = summarise(hs.due, week, 'week', today)
is('the week so far: 5 hits of 9 due', percent(hDone.sofar, hDue.sofar), 56)

const sup = supplementSeries(2, ['2026-09-21', '2026-09-21', '2026-09-22', '2026-09-01'], week)
is('supplements taken per day, outside the week left out', sup.taken, { '2026-09-21': 2, '2026-09-22': 1 })
is('two in use: two due every day', Object.values(sup.due), [2, 2, 2, 2, 2, 2, 2])
is('none in use: nothing due', supplementSeries(0, [], week).due, {})

/* ---------- sleep, records, weight ---------- */
is('hours across midnight', sleepHours('23:30', '07:00'), 7.5)
is('hours on the same day', sleepHours('01:00', '09:15'), 8.25)
is('seconds on the time are fine', sleepHours('22:00:00', '06:00:00'), 8)
is('missing a time is no hours', [sleepHours(null, '07:00'), sleepHours('23:00', '')], [null, null])
is('numbers from records', [toNumber(3), toNumber('2,5'), toNumber(' 4 '), toNumber(''), toNumber('abc'), toNumber(null), toNumber(Infinity)],
  [3, 2.5, 4, null, null, null, null])
const recs = [
  { date: '2026-09-21', values: { amount: 10, note: 'a' } },
  { date: '2026-09-21', values: { amount: '5', note: '' } },
  { date: '2026-09-22', values: { amount: null, note: 'b' } },
  { date: null, values: { amount: 99, note: 'c' } },
]
is('a summed field: per day, undated records left out', fieldSeries(recs, 'amount', 'sum'), { values: { '2026-09-21': 15 }, counts: { '2026-09-21': 2 } })
is('a counted field: records with something in it', fieldSeries(recs, 'note', 'count').values, { '2026-09-21': 1, '2026-09-22': 1 })
is('plurals for record counts', ['Entry', 'Block', 'Chore', 'Box', 'Day'].map(plural), ['Entries', 'Blocks', 'Chores', 'Boxes', 'Days'])
const weights = { '2026-09-10': 82, '2026-09-22': 81.2, '2026-09-24': 80.9, '2026-10-02': 80 }
is('the weight as it stands at the end of a period', latest(weights, '2026-09-27'), { day: '2026-09-24', value: 80.9 })
is('and before it began', latest(weights, '2026-09-20'), { day: '2026-09-10', value: 82 })
is('inside the period only', latest(weights, '2026-09-20', '2026-09-14'), null)

/* ---------- showing and exporting ---------- */
is('numbers group thousands and keep the decimals asked for', [formatNumber(12345.678, 1), formatNumber(2.5), formatNumber(0.25, 2)], ['12,345.7', '3', '0.25'])
is('changes carry a sign', [formatDelta(1.25, 1), formatDelta(-3), formatDelta(0.04, 1), formatDelta(-1200)], ['+1.3', '−3', 'no change', '−1,200'])
const rows = statsRows('week', week, [
  { key: 'tasks', label: 'Tasks', off: false, chart: null, empty: null, metrics: [
    { key: 'done', label: 'Done', unit: '', value: 6, perDay: 1.5, delta: null, decimals: 0 },
    { key: 'rate', label: 'Completion', unit: '%', value: 75, perDay: null, delta: null, decimals: 0 },
    { key: 'none', label: 'Nothing', unit: '', value: null, perDay: null, delta: null, decimals: 0 },
  ] },
  { key: 'sleep', label: 'Sleep', off: false, chart: null, empty: 'Log a night.', metrics: [] },
  { key: 'nutrition', label: 'Nutrition', off: true, chart: null, empty: null, metrics: [
    { key: 'kcal', label: 'Calories', unit: 'kcal', value: 12000.4, perDay: 2000.07, perLabel: 'a day logged', delta: null, decimals: 0 },
  ] },
])
is('export rows: one per figure and per average, none for empty cards or missing figures', rows, [
  { period: 'week 2026-09-21 to 2026-09-27', module: 'Tasks', metric: 'Done', value: 6, unit: '' },
  { period: 'week 2026-09-21 to 2026-09-27', module: 'Tasks', metric: 'Done, a day', value: 1.5, unit: '' },
  { period: 'week 2026-09-21 to 2026-09-27', module: 'Tasks', metric: 'Completion', value: 75, unit: '%' },
  { period: 'week 2026-09-21 to 2026-09-27', module: 'Nutrition', metric: 'Calories', value: 12000, unit: 'kcal' },
  { period: 'week 2026-09-21 to 2026-09-27', module: 'Nutrition', metric: 'Calories, a day logged', value: 2000.1, unit: 'kcal' },
])
is('a day’s rows name the day once', statsRows('day', { start: today, end: today }, [
  { key: 'x', label: 'X', off: false, chart: null, empty: null, metrics: [{ key: 'a', label: 'A', unit: '', value: 1, perDay: null, delta: null, decimals: 0 }] },
])[0].period, 'day 2026-09-24')

/* ---------- facts for the stats builder ---------- */
const sum = (fs, m, day) => fs.filter((f) => f.measure === m && (!day || f.day === day)).reduce((a, f) => a + f.value, 0)
const wk = { start: '2026-09-21', end: '2026-09-27' }
const daily = { id: 'h1', name: 'Walk', schedule: 'daily', active: true, start_date: '2026-09-01' }
const hf = habitFacts([daily], { h1: ['2026-09-21', '2026-09-23', '2026-09-24'] }, { h1: { '2026-09-21': 5 } }, wk, today)
is('a daily habit: ticks', sum(hf, 'habits:ticks'), 3)
is('due: every day so far, today counted once done', sum(hf, 'habits:due'), 4)
is('hit: the ticks that answered a due day', sum(hf, 'habits:hit'), 3)
is('nothing due after today', hf.filter((f) => f.day > today).length, 0)
is('an amount counted', sum(hf, 'habits:amount'), 5)
is('facts carry the habit\'s name and row', [hf[0].item, hf[0].ref.table], ['Walk', 'habit'])
const notDoneToday = habitFacts([daily], { h1: [] }, {}, wk, today)
is('today not ticked yet is not missed', sum(notDoneToday, 'habits:due', today), 0)
const twice = { id: 'h2', name: 'Swim', rule: 'times_per_week', rule_config: { times: 2 }, active: true, start_date: '2026-09-01' }
const lastWeek = { start: '2026-09-14', end: '2026-09-20' }
const tw = habitFacts([twice], { h2: ['2026-09-15'] }, {}, lastWeek, today)
is('twice a week, done once: one hit, and the missing one due on Sunday', [sum(tw, 'habits:hit'), sum(tw, 'habits:due'), sum(tw, 'habits:due', '2026-09-20')], [1, 2, 1])
is('a week still under way is not short yet', sum(habitFacts([twice], { h2: [] }, {}, wk, today), 'habits:due'), 0)
is('done three times, still due twice', sum(habitFacts([twice], { h2: ['2026-09-14', '2026-09-15', '2026-09-16'] }, {}, lastWeek, today), 'habits:due'), 2)
is('a habit put away keeps its ticks but is not due', [sum(habitFacts([{ ...daily, active: false }], { h1: ['2026-09-21'] }, {}, wk, today), 'habits:ticks'), sum(habitFacts([{ ...daily, active: false }], { h1: ['2026-09-21'] }, {}, wk, today), 'habits:due')], [1, 0])
is('a deleted habit gives nothing', habitFacts([{ ...daily, deleted_at: 'x' }], { h1: ['2026-09-21'] }, {}, wk, today), [])
is('a habit not started yet is not due', sum(habitFacts([{ ...daily, start_date: '2026-09-23' }], { h1: [] }, {}, wk, today), 'habits:due'), 1)

const chores = [
  { id: 'c1', name: 'Bins', room: 'Kitchen', minutes: 5, mode: 'fixed', rule: 'weekly', rule_config: { weekdays: [1] }, every_days: null, start_date: '2026-09-01', end_date: null },
  { id: 'c2', name: 'Dust', room: null, minutes: null, mode: 'flexible', rule: null, rule_config: {}, every_days: 3, start_date: '2026-09-01', end_date: null },
]
const clogs = [{ id: 'l1', chore_id: 'c1', done_on: '2026-09-23', done_by: 'u1' }, { id: 'l2', chore_id: 'c2', done_on: '2026-09-22', done_by: 'u2' }]
const cf = choreFacts(chores, clogs, wk, today, (u) => (u === 'u1' ? 'You' : 'Sam'))
is('chores done, by person', [sum(cf, 'household:chores_done'), cf.filter((f) => f.measure === 'household:chores_done').map((f) => f.person)], [2, ['You', 'Sam']])
is('minutes of chores done', sum(cf, 'household:chore_minutes'), 5)
is('a fixed chore overdue from the day after it fell due until done', cf.filter((f) => f.measure === 'household:chores_overdue').map((f) => f.day), ['2026-09-22'])
is('a flexible chore is never overdue', cf.some((f) => f.measure === 'household:chores_overdue' && f.item === 'Dust'), false)
is('bedtime after midnight counts on from the evening', [clockHours('23:30', true), clockHours('00:30', true), clockHours('07:15'), clockHours('nope')], [23.5, 24.5, 7.25, null])

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
