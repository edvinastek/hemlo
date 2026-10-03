// Checks the stats pivot (pivot-rules.ts) against sums worked out by hand.
// 2026-09-21 is a Monday; "today" in these checks is Thursday 2026-09-24.
import {
  spanDays, isoWeekday, mondayFor, timeKey, timeLabel, keysOf, passes, dailyValues, cellValue, pivot, drill,
  withWithout, daysWith, heatSteps, heatLevel, heatGrid, pivotRows, unitFor, decimalsFor, shiftSpan, factMeasures,
} from '../lib/pivot-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const near = (label, got, want) => is(label, got == null ? got : Math.round(got * 1000) / 1000, want)
const today = '2026-09-24'
const week = { start: '2026-09-21', end: '2026-09-27' }

/* ---------- days and buckets ---------- */
is('a week of days', spanDays(week).length, 7)
is('a span the wrong way round is empty', spanDays({ start: '2026-09-27', end: '2026-09-21' }), [])
is('Monday is 1, Sunday 7', [isoWeekday('2026-09-21'), isoWeekday('2026-09-27')], [1, 7])
is('the Monday of a Sunday', mondayFor('2026-09-27'), '2026-09-21')
is('the Monday across a year end', mondayFor('2027-01-01'), '2026-12-28')
is('time keys', ['day', 'week', 'month', 'year', 'weekday'].map((d) => timeKey(d, '2026-09-24')), ['2026-09-24', '2026-09-21', '2026-09', '2026', '4'])
is('a day label, short as a weekday in a week', timeLabel('day', '2026-09-24', true), { label: 'Thu 24 Sep', short: 'Thu' })
is('a day label, short as a date in a month', timeLabel('day', '2026-09-24').short, '24')
is('a week label', timeLabel('week', '2026-09-21'), { label: 'Week of 21 Sep 2026', short: '21 Sep' })
is('a month label', timeLabel('month', '2026-09'), { label: 'September 2026', short: 'Sep' })
is('a weekday label', timeLabel('weekday', '7'), { label: 'Sunday', short: 'Sun' })

/* ---------- groupings and filters ---------- */
const f = { day: '2026-09-24', measure: 'm:x', value: 3, module: 'learning', item: 'Dutch', section: '', tags: ['a', 'b', 'a'], fields: { subject: 'Maths', mood: ['calm', 'tired'] } }
is('a fact under its item', keysOf(f, 'item'), ['Dutch'])
is('an empty section is the none key', keysOf(f, 'section'), [''])
is('tags, each once', keysOf(f, 'tag'), ['a', 'b'])
is('a multi-choice field sits under each choice', keysOf(f, 'field:mood'), ['calm', 'tired'])
is('a missing field is the none key', keysOf(f, 'field:nothing'), [''])
is('no grouping is one key', keysOf(f, 'none'), [''])
is('a filter ignores case and accents', passes({ ...f, item: 'Café' }, { field: 'item', op: 'is', value: 'cafe' }), true)
is('a "not" filter', passes(f, { field: 'item', op: 'not', value: 'Dutch' }), false)
is('a value filter', [passes(f, { field: 'value', op: 'gt', value: 2 }), passes(f, { field: 'value', op: 'lt', value: 2 })], [true, false])
is('a weekday filter (Thursday is 4)', passes(f, { field: 'weekday', op: 'is', value: 4 }), true)
is('a day filter', passes(f, { field: 'day', op: 'lt', value: '2026-09-24' }), false)
is('a module filter', passes(f, { field: 'module', op: 'is', value: 'learning' }), true)
is('a multi-choice filter matches any choice', passes(f, { field: 'field:mood', op: 'is', value: 'Tired' }), true)

/* ---------- one cell ---------- */
const done = { key: 'tasks:done', module: 'tasks', label: 'Tasks done', unit: '', decimals: 0, combine: 'sum', known: 'all', dims: ['section'], summary: 'sum' }
const planned = { ...done, key: 'tasks:planned', label: 'Tasks planned' }
const rate = { ...done, key: 'tasks:completion', label: 'Completed', unit: '%', ratio: { part: 'tasks:done', whole: 'tasks:planned' }, summary: 'avg' }
const sleep = { key: 'sleep:hours', module: 'sleep', label: 'Hours slept', unit: 'h', decimals: 1, combine: 'mean', known: 'logged', dims: [], summary: 'avg' }
const fact = (measure, day, value, extra = {}) => ({ measure, day, value, module: measure.split(':')[0], ...extra })
const days = spanDays(week)
const tasks = [
  fact('tasks:planned', '2026-09-21', 1, { section: 'Work' }), fact('tasks:done', '2026-09-21', 1, { section: 'Work' }),
  fact('tasks:planned', '2026-09-22', 1, { section: 'Home' }),
  fact('tasks:planned', '2026-09-23', 1, { section: 'Work' }), fact('tasks:done', '2026-09-23', 1, { section: 'Work' }),
  fact('tasks:planned', '2026-09-23', 1, { section: 'Home' }), fact('tasks:done', '2026-09-23', 1, { section: 'Home' }),
  // Planned for Saturday, still to come.
  fact('tasks:planned', '2026-09-26', 1, { section: 'Work' }),
]
is('days so far count, with nothing as 0, the future left out', dailyValues(done, tasks, days, today), [['2026-09-21', 1], ['2026-09-22', 0], ['2026-09-23', 2], ['2026-09-24', 0]])
is('a total counts what is planned ahead', cellValue(planned, { measure: 'tasks:planned', summary: 'sum' }, tasks, days, today), 5)
is('an average a day only over days that happened', cellValue(done, { measure: 'tasks:done', summary: 'avg' }, tasks, days, today), 0.75)
is('the best day', cellValue(done, { measure: 'tasks:done', summary: 'max' }, tasks, days, today), 2)
is('the quietest day', cellValue(done, { measure: 'tasks:done', summary: 'min' }, tasks, days, today), 0)
is('a count of entries', cellValue(done, { measure: 'tasks:done', summary: 'count' }, tasks, days, today), 3)
is('the latest day so far (today, nothing yet)', cellValue(done, { measure: 'tasks:done', summary: 'latest' }, tasks, days, today), 0)
is('a share over the days that happened: 3 of 4', cellValue(rate, { measure: 'tasks:completion', summary: 'avg' }, tasks, days, today), 75)
is('the lowest day of a share', cellValue(rate, { measure: 'tasks:completion', summary: 'min' }, tasks, days, today), 0)
is('a share with nothing to do is unknown', cellValue(rate, { measure: 'tasks:completion', summary: 'avg' }, [], days, today), null)
is('a week still to come has no total, not zero', cellValue(done, { measure: 'tasks:done', summary: 'sum' }, [], spanDays({ start: '2026-10-05', end: '2026-10-11' }), today), null)
is('a week that happened with nothing done is 0', cellValue(done, { measure: 'tasks:done', summary: 'sum' }, [], spanDays({ start: '2026-09-14', end: '2026-09-20' }), today), 0)

is('days before the module was in use are unknown, not 0', dailyValues({ ...done, since: '2026-09-23' }, tasks.filter((f) => f.day >= '2026-09-23'), days, today), [['2026-09-23', 2], ['2026-09-24', 0]])
is('a week before the module was in use has no total', cellValue({ ...done, since: '2026-09-23' }, { measure: 'tasks:done', summary: 'sum' }, [], spanDays({ start: '2026-09-14', end: '2026-09-20' }), today), null)
const nights = [fact('sleep:hours', '2026-09-21', 7), fact('sleep:hours', '2026-09-22', 8), fact('sleep:hours', '2026-09-22', 6), fact('sleep:hours', '2026-09-24', 6.5)]
is('a logged measure: unlogged days are unknown, two naps a day averaged', dailyValues(sleep, nights, days, today), [['2026-09-21', 7], ['2026-09-22', 7], ['2026-09-24', 6.5]])
near('the average night over logged nights only', cellValue(sleep, { measure: 'sleep:hours', summary: 'avg' }, nights, days, today), 6.833)
is('nothing logged is unknown', cellValue(sleep, { measure: 'sleep:hours', summary: 'avg' }, [], days, today), null)
is('a "sum" of a mean measure is its average, never hours added up', cellValue(sleep, { measure: 'sleep:hours', summary: 'sum' }, nights, days, today) != null, true)
is('the change from the first night to the last', cellValue(sleep, { measure: 'sleep:hours', summary: 'change' }, nights, days, today), -0.5)
is('days on target: at least 7 h on 2 of 3 nights', Math.round(cellValue(sleep, { measure: 'sleep:hours', summary: 'pct_target', target: 7 }, nights, days, today)), 67)
is('days on target need a target', cellValue(sleep, { measure: 'sleep:hours', summary: 'pct_target' }, nights, days, today), null)
is('a ceiling: at most 6.5 h on 1 of 3', Math.round(cellValue(sleep, { measure: 'sleep:hours', summary: 'pct_target', target: 6.5, target_mode: 'at_most' }, nights, days, today)), 33)
is('a target from the person\'s own targets per day', Math.round(cellValue({ ...sleep, targets: { '2026-09-21': 8, '2026-09-22': 6 } }, { measure: 'sleep:hours', summary: 'pct_target' }, nights, days, today)), 50)

// Streaks: today not done yet does not break the run.
const ticks = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-22', '2026-09-23'].map((d) => fact('habits:ticks', d, 1))
const tickInfo = { ...done, key: 'habits:ticks' }
const long = spanDays({ start: '2026-09-14', end: '2026-09-27' })
is('the current streak, today still open', cellValue(tickInfo, { measure: 'habits:ticks', summary: 'streak' }, ticks, long, today), 2)
is('the best streak', cellValue(tickInfo, { measure: 'habits:ticks', summary: 'best_streak' }, ticks, long, today), 3)
is('a streak counts today once it is done', cellValue(tickInfo, { measure: 'habits:ticks', summary: 'streak' }, [...ticks, fact('habits:ticks', today, 1)], long, today), 3)
is('a streak of a logged measure breaks on an unknown day', cellValue(sleep, { measure: 'sleep:hours', summary: 'streak', target: 6 }, nights, days, today), 1)
// A share's streak skips days with nothing to do (a weekday habit's weekend).
const kept = { ...rate, key: 'habits:kept', ratio: { part: 'habits:hit', whole: 'habits:due' } }
const habitFacts = [
  ['2026-09-17', 1, 1], ['2026-09-18', 1, 1], ['2026-09-21', 1, 1], ['2026-09-22', 1, 1], ['2026-09-23', 0, 1],
].flatMap(([d, h, w]) => [fact('habits:hit', d, h), fact('habits:due', d, w)])
is('a share\'s best streak runs over the weekend it was not due', cellValue(kept, { measure: 'habits:kept', summary: 'best_streak', target: 100 }, habitFacts, long, today), 4)
is('and is broken by a missed day', cellValue(kept, { measure: 'habits:kept', summary: 'streak', target: 100 }, habitFacts, long, today), 0)

/* ---------- the whole pivot ---------- */
const catalogue = [done, planned, rate, sleep]
const spec = { rows: 'day', columns: 'none', values: [{ measure: 'tasks:done', summary: 'sum' }, { measure: 'tasks:completion', summary: 'avg' }], filters: [], range: week }
const p = pivot(spec, tasks, catalogue, today)
is('a row per day of the week, empty days included', p.rows.map((r) => r.short), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
is('days still to come are marked', p.rows.map((r) => r.future), [false, false, false, false, true, true, true])
is('the done column', p.cells.map((r) => r[0][0]), [1, 0, 2, 0, null, null, null])
is('the completion column, unknown where nothing was planned', p.cells.map((r) => r[0][1]), [100, 0, 100, null, null, null, null])
is('the grand totals come from the facts, not from adding cells', p.grand, [3, 75])

const bySection = pivot({ ...spec, rows: 'section', columns: 'week', values: [{ measure: 'tasks:done', summary: 'sum' }, { measure: 'tasks:planned', summary: 'sum' }] }, tasks, catalogue, today)
is('rows by section, in name order', bySection.rows.map((r) => r.label), ['Home', 'Work'])
is('cells by section', bySection.cells.map((r) => r[0]), [[1, 2], [2, 3]])
is('column totals', bySection.colTotals, [[3, 5]])
is('sorted by value, highest first', pivot({ ...spec, rows: 'section', sort: 'value_desc' }, tasks, catalogue, today).rows.map((r) => r.label), ['Work', 'Home'])
is('sorted by value, lowest first', pivot({ ...spec, rows: 'section', sort: 'value_asc' }, tasks, catalogue, today).rows.map((r) => r.label), ['Home', 'Work'])
is('a filter keeps only Work (the Saturday one is still to come)', pivot({ ...spec, rows: 'none', filters: [{ field: 'section', op: 'is', value: 'work' }] }, tasks, catalogue, today).grand, [2, 100])
is('weekdays in order Monday first', pivot({ ...spec, rows: 'weekday', range: { start: '2026-09-17', end: '2026-09-23' } }, tasks, catalogue, today).rows.map((r) => r.short), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
is('a measure no module gives is reported, not drawn', pivot({ ...spec, values: [{ measure: 'gone:x', summary: 'sum' }] }, tasks, catalogue, today).missing, ['gone:x'])
is('the measures a share needs', [...factMeasures([{ measure: 'tasks:completion', summary: 'avg' }], new Map(catalogue.map((m) => [m.key, m])))], ['tasks:done', 'tasks:planned'])
const named = pivot({ ...spec, rows: 'module' }, [...tasks, ...nights], [...catalogue], today, { moduleName: (k) => (k === 'tasks' ? 'Tasks' : k) })
is('module rows take the module\'s name', named.rows.map((r) => r.label), ['Tasks'])

// Drill-down: the facts behind a cell.
is('the facts behind Wednesday', drill(p, spec, '2026-09-23', null).length, 4)
is('the facts behind Home in the week', drill(bySection, { rows: 'section', columns: 'week' }, 'Home', '2026-09-21').map((x) => x.day), ['2026-09-23', '2026-09-23', '2026-09-22'])

/* ---------- compare ---------- */
const trained = new Set(['2026-09-01', '2026-09-03', '2026-09-05'])
const sleepSeries = [['2026-09-01', 8], ['2026-09-02', 7], ['2026-09-03', 8], ['2026-09-04', 6], ['2026-09-05', 8.5], ['2026-09-06', 7]]
is('with and without', withWithout(sleepSeries, trained), { with: { days: 3, mean: 24.5 / 3 }, without: { days: 3, mean: 20 / 3 }, enough: true, difference: 24.5 / 3 - 20 / 3 })
is('too few days says so and gives no difference', withWithout(sleepSeries.slice(0, 4), trained).enough, false)
is('days with something above zero', [...daysWith(tasks, done, week, today)], ['2026-09-21', '2026-09-23'])

/* ---------- heat grid ---------- */
is('levels start at the quartiles of the days above zero', heatSteps([0, 1, 2, 3, 4, 5, 6, 7, 8]), [1, 3, 5, 7])
is('levels: unknown, nothing, low, top', [heatLevel(null, [1, 3, 5, 7]), heatLevel(0, [1, 3, 5, 7]), heatLevel(1, [1, 3, 5, 7]), heatLevel(8, [1, 3, 5, 7])], [null, 0, 1, 4])
const g = heatGrid([['2026-09-21', 1], ['2026-09-23', 3]], { start: '2026-09-17', end: '2026-09-30' }, today)
is('a short range is a calendar, a row per week from Monday', [g.mode, g.rows.length, g.rows[0].label], ['weeks', 3, '14 Sep'])
is('days before the range are blank', g.rows[0].cells.slice(0, 3), [null, null, null])
is('an unlogged day is unknown, not 0', g.rows[1].cells[1].level, null)
const year = heatGrid([['2026-02-28', 2]], { start: '2026-01-01', end: '2026-12-31' }, today)
is('a year is twelve months by 31 days', [year.mode, year.columns.length, year.rows.length], ['months', 12, 31])
is('30 February does not exist', year.rows[29].cells[1], null)

/* ---------- out of the table ---------- */
const rows = pivotRows(bySection, 'Section', 'Week')
is('export rows: one per cell and value, with totals', rows.length, 2 * 2 + 2 * 2 + 2)
is('an export row', rows[0], { Section: 'Home', Week: 'Week of 21 Sep 2026', measure: 'Tasks done', summary: 'Total', value: 1, unit: '' })
is('units of summaries', [unitFor({ unit: 'g' }, 'avg'), unitFor({ unit: 'g' }, 'streak'), unitFor({ unit: 'g' }, 'pct_target'), unitFor({ unit: 'g' }, 'count')], ['g', 'days', '%', 'entries'])
is('an average of a count has a decimal', decimalsFor({ decimals: 0, unit: '' }, 'avg'), 1)
is('a span shifted back one', shiftSpan(week, -1), { start: '2026-09-14', end: '2026-09-20' })

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall pivot checks passed')
