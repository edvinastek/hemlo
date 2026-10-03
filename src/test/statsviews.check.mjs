// Checks saved stats views (stats-view-rules.ts), the builder's rules
// (stats-builder-rules.ts), the chart rules (chart-rules.ts) and what the
// widget and Today's cards are handed. "Today" is Thursday 2026-09-24.
import { readStatsViews, readStatsView, MAX_VIEWS, MAX_MEASURES } from '../lib/stats-view-rules.ts'
import {
  measureCatalogue, recordMeasures, cardMeasures, groupingsFor, summariesFor, summaryName, viewSpan, rangeName, spanName,
  rangeChoice, newViewId, autoChart, blankView, viewSpec, viewModules, migrateSource, putView, duplicateView, moveView,
  removeView, TEMPLATES, templatesFor, fromTemplate, cardsFor, addCard, moveCard, changeCard, plural,
} from '../lib/stats-builder-rules.ts'
import { formatValue, shortNumber, niceScale, readable, splitColour, chartData, labelStep, describe, toWidgetView } from '../lib/chart-rules.ts'
import { contrast, PAPER } from '../lib/colours-rules.ts'
import { pivot } from '../lib/pivot-rules.ts'
import { MODULES } from '../modules/registry.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

/* ---------- reading stored views ---------- */
const good = { id: 'v1', name: ' Protein ', measures: [{ source: 'nutrition:protein_g', summary: 'avg', target: 140, colour: '#AABBCC' }] }
const one = readStatsView(good)
is('a minimal view reads, with defaults', one, {
  id: 'v1', name: 'Protein',
  measures: [{ source: 'nutrition:protein_g', summary: 'avg', colour: '#aabbcc', target: 140 }],
  rows: 'day', columns: 'none', filters: [],
  range: { kind: 'last', n: 30, unit: 'days', from: undefined, to: undefined },
  chart: { type: 'bar', sort: 'label', y_min: null, y_max: null, labels: true, target_line: null },
  compare: null, pinned: { today: false, stats: true },
})
is('not a list', readStatsViews({ a: 1 }), [])
is('a bad id is dropped', readStatsViews([{ ...good, id: 'has space' }]), [])
is('no name is dropped', readStatsViews([{ ...good, name: '  ' }]), [])
is('no measures is dropped', readStatsViews([{ ...good, measures: [{ source: 'bad source!' }] }]), [])
is('a second view with the same id is dropped', readStatsViews([good, { ...good, name: 'Other' }]).length, 1)
is('at most 50 views', readStatsViews(Array.from({ length: 60 }, (_, i) => ({ ...good, id: `v${i}` }))).length, MAX_VIEWS)
is('at most 10 measures', readStatsView({ ...good, measures: Array.from({ length: 14 }, () => good.measures[0]) }).measures.length, MAX_MEASURES)
is('an unknown summary reads as a total', readStatsView({ ...good, measures: [{ source: 'a:b', summary: 'median' }] }).measures[0].summary, 'sum')
is('new summaries read', readStatsView({ ...good, measures: [{ source: 'a:b', summary: 'best_streak' }, { source: 'a:b', summary: 'change' }] }).measures.map((m) => m.summary), ['best_streak', 'change'])
is('a ceiling target reads', readStatsView({ ...good, measures: [{ source: 'a:b', summary: 'sum', target: 20, target_mode: 'at_most' }] }).measures[0].target_mode, 'at_most')
is('groupings: person and tag are new, nonsense falls back', ['person', 'tag', 'field:subject', 'field:Bad Name', 'cheese'].map((g) => readStatsView({ ...good, rows: g }).rows), ['person', 'tag', 'field:subject', 'day', 'day'])
is('a custom range the wrong way round is turned round', readStatsView({ ...good, range: { kind: 'custom', from: '2026-09-30', to: '2026-09-01' } }).range, { kind: 'custom', n: 30, unit: 'days', from: '2026-09-01', to: '2026-09-30' })
is('a custom range without ends is the last 30 days', readStatsView({ ...good, range: { kind: 'custom' } }).range.kind, 'last')
is('a range is at most ten years of days', readStatsView({ ...good, range: { kind: 'last', n: 99999, unit: 'days' } }).range.n, 3650)
is('chart: hidden series and split colours kept when well formed', readStatsView({ ...good, chart: { type: 'line', hidden: ['m0', 'm0', 'x'], colours: { 'c:Home': '#112233', 'c:Work': 'red' }, table: true } }).chart,
  { type: 'line', sort: 'label', y_min: null, y_max: null, labels: true, target_line: null, hidden: ['m0'], colours: { 'c:Home': '#112233' }, table: true })
is('an unknown chart type is bars', readStatsView({ ...good, chart: { type: 'pie' } }).chart.type, 'bar')
is('a compare reads', readStatsView({ ...good, compare: { source: 'training:sessions', summary: 'sum', shade: true, label: 'Training' } }).compare, { source: 'training:sessions', summary: 'sum', shade: true, label: 'Training' })
is('a broken compare is none', readStatsView({ ...good, compare: { source: 3 } }).compare, null)
is('pinned to Today, taken off the Stats page', readStatsView({ ...good, pinned: { today: true, stats: false } }).pinned, { today: true, stats: false })
is('filters: kept when readable, at most 8', readStatsView({ ...good, filters: [{ field: 'section', op: 'is', value: 'Work' }, { field: 'value', op: 'gt', value: 3 }, { field: 'x', op: 'is', value: null }, ...Array.from({ length: 10 }, () => ({ field: 'item', op: 'nope', value: 'a' }))] }).filters.length, 8)
is('an unknown filter operation reads as "is"', readStatsView({ ...good, filters: [{ field: 'item', op: 'like', value: 'a' }] }).filters[0].op, 'is')
// A view saved before any of the new fields existed still reads whole.
const old = { id: 'old', name: 'Old', measures: [{ source: 'tasks.done', summary: 'sum' }], rows: 'week', columns: 'none', filters: [], range: { kind: 'this', unit: 'months' }, chart: { type: 'bar' }, compare: null, pinned: { today: true } }
is('an old view still reads, on the Stats page', [readStatsView(old).rows, readStatsView(old).pinned], ['week', { today: true, stats: true }])


/* ---------- the measure catalogue ---------- */
const today = '2026-09-24'
const regs = Object.fromEntries(MODULES.map((m) => [m.key, m]))
const mods = ['nutrition', 'habits', 'learning', 'finance', 'household', 'stats', 'custom'].map((k) => ({ key: k, name: regs[k].name, entities: regs[k].entities }))
const cat = measureCatalogue(mods, ['kcal', 'protein_g'])
const keys = cat.map((m) => m.key)
is('tasks always come first', keys[0], 'tasks:done')
is('every module that is given has measures; Stats and Custom none', [...new Set(cat.map((m) => m.module))], ['tasks', 'nutrition', 'habits', 'learning', 'finance', 'household'])
is('every nutrient eaten and planned', ['nutrition:kcal', 'nutrition:fiber_g', 'nutrition:planned_protein_g'].every((k) => keys.includes(k)), true)
is('habits kept is a share of hits over due', cat.find((m) => m.key === 'habits:kept').ratio, { part: 'habits:hit', whole: 'habits:due' })
is('learning: study blocks and minutes from its record fields', ['learning:study:count', 'learning:study:minutes'].every((k) => keys.includes(k)), true)
is('finance: amount by category', [keys.includes('finance:entry:amount'), cat.find((m) => m.key === 'finance:entry:amount').dimNames['field:category']], [true, 'Category'])
is('household: chores done by person, and the old undated chores counted as added', ['household:chores_done', 'household:chore:added'].every((k) => keys.includes(k)), true)
is('every key is unique', new Set(keys).size, keys.length)
is('every key fits a Today card key', keys.every((k) => /^[a-z0-9_:-]{1,60}$/i.test(k)), true)
const built = recordMeasures([{ name: 'log', label: 'Entry', fields: [
  { name: 'day', label: 'Day', type: 'date' }, { name: 'mood', label: 'Mood', type: 'select', options: ['ok', 'good'] },
  { name: 'score', label: 'Score', type: 'integer', stats: 'average' }, { name: 'km', label: 'Distance', type: 'number', unit: 'km' },
  { name: 'rest', label: 'Rest day', type: 'boolean' }, { name: 'secret', label: 'Hidden', type: 'number', hidden: true },
] }, { name: 'idea', label: 'Idea', fields: [{ name: 'title', label: 'Title', type: 'text' }] }])
is('a built module: counts, every number, yes/no, and undated records added', built.map((m) => m.name), ['log:count', 'log:score', 'log:km', 'log:rest', 'idea:added'])
is('an averaged field is a mean of logged records', [built[1].combine, built[1].known, built[1].summary], ['mean', 'logged', 'avg'])
is('a summed field counts every day', [built[2].combine, built[2].known, built[2].unit], ['sum', 'all', 'km'])
is('choice fields become groupings', built[0].dimNames, { item: 'Name', 'field:mood': 'Mood' })
is('plurals', [plural('Entry'), plural('Block'), plural('Box')], ['Entries', 'Blocks', 'Boxes'])
const habitCard = cardMeasures(cat, 'habits')
is('a card shows its main measures before any are picked', habitCard.shown.map((m) => m.key), ['habits:ticks', 'habits:kept'])
is('a card lists every measure but the hidden parts', habitCard.all.map((m) => m.key), ['habits:ticks', 'habits:kept', 'habits:due', 'habits:amount'])
is('a card shows what was picked, in that order', cardMeasures(cat, 'habits', ['habits:due', 'gone', 'habits:ticks']).shown.map((m) => m.key), ['habits:due', 'habits:ticks'])
const g = (ks) => groupingsFor(ks.map((k) => cat.find((m) => m.key === k))).map((x) => x.key)
is('groupings for tasks', g(['tasks:done']), ['none', 'day', 'week', 'month', 'year', 'weekday', 'section', 'category', 'item'])
is('groupings two modules share: time and module', g(['tasks:done', 'nutrition:kcal']), ['none', 'day', 'week', 'month', 'year', 'weekday', 'module'])
is('summaries for a count, the natural first', summariesFor(cat[0]).map((x) => x.key).slice(0, 3), ['sum', 'avg', 'min'])
is('summaries for a share', summariesFor(cat.find((m) => m.key === 'habits:kept')).map((x) => x.key)[0], 'avg')
is('an average of a count is per day', summaryName('avg', cat[0]), 'Average a day')
is('an average of food is per day logged', summaryName('avg', cat.find((m) => m.key === 'nutrition:kcal')), 'Average a day logged')

/* ---------- ranges ---------- */
is('last 30 days', viewSpan({ kind: 'last', n: 30, unit: 'days' }, today), { start: '2026-08-26', end: today })
is('the 30 days before', viewSpan({ kind: 'last', n: 30, unit: 'days' }, today, -1), { start: '2026-07-27', end: '2026-08-25' })
is('this week, Monday to Sunday', viewSpan({ kind: 'this', unit: 'weeks' }, today), { start: '2026-09-21', end: '2026-09-27' })
is('last 12 weeks are whole weeks ending this one', viewSpan({ kind: 'last', n: 12, unit: 'weeks' }, today), { start: '2026-07-06', end: '2026-09-27' })
is('this month', viewSpan({ kind: 'this', unit: 'months' }, today), { start: '2026-09-01', end: '2026-09-30' })
is('last month, back one', viewSpan({ kind: 'this', unit: 'months' }, today, -1), { start: '2026-08-01', end: '2026-08-31' })
is('last 12 months across the year', viewSpan({ kind: 'last', n: 12, unit: 'months' }, today), { start: '2025-10-01', end: '2026-09-30' })
is('February in a leap year, from March', viewSpan({ kind: 'this', unit: 'months' }, '2028-03-31', -1), { start: '2028-02-01', end: '2028-02-29' })
is('this year and the one before', [viewSpan({ kind: 'this', unit: 'years' }, today), viewSpan({ kind: 'this', unit: 'years' }, today, -1).start], [{ start: '2026-01-01', end: '2026-12-31' }, '2025-01-01'])
is('today', viewSpan({ kind: 'this', unit: 'days' }, today), { start: today, end: today })
is('chosen days, and the same length before', [viewSpan({ kind: 'custom', from: '2026-09-01', to: '2026-09-10' }, today), viewSpan({ kind: 'custom', from: '2026-09-01', to: '2026-09-10' }, today, -1)],
  [{ start: '2026-09-01', end: '2026-09-10' }, { start: '2026-08-22', end: '2026-08-31' }])
is('range names', [rangeName({ kind: 'last', n: 30, unit: 'days' }), rangeName({ kind: 'this', unit: 'months' }), rangeName({ kind: 'this', unit: 'days' }), rangeName({ kind: 'custom' })], ['Last 30 days', 'This month', 'Today', 'Chosen days'])
is('span names', [spanName({ start: '2026-09-21', end: '2026-09-27' }), spanName({ start: '2026-09-28', end: '2026-10-04' }), spanName({ start: '2025-12-29', end: '2026-01-04' })],
  ['21 – 27 Sep 2026', '28 Sep – 4 Oct 2026', '29 Dec 2025 – 4 Jan 2026'])
is('a range matched to its one-tap choice', [rangeChoice({ kind: 'last', n: 90, unit: 'days' }), rangeChoice({ kind: 'last', n: 45, unit: 'days' })], ['l90', 'other'])

/* ---------- views ---------- */
let n = 0
const seq = () => [0.1, 0.1, 0.2][n++ % 3]
is('a new id is not one already taken', newViewId([newViewId([], () => 0.1)], seq) !== newViewId([], () => 0.1), true)
is('a chart picked: a line over many days, bars over few, a ring for a share alone, a figure for one total',
  [autoChart('day', [{ unit: '' }], ['sum'], 30), autoChart('week', [{ unit: '' }], ['sum'], 12), autoChart('none', [{ unit: '%', ratio: {} }], ['avg'], 1), autoChart('none', [{ unit: 'g' }], ['sum'], 1), autoChart('section', [{ unit: '' }], ['sum'], 40)],
  ['line', 'bar', 'ring', 'number', 'bar'])
const v1 = blankView('v1', cat.find((m) => m.key === 'nutrition:protein_g'))
is('a blank view from a measure', [v1.name, v1.measures, v1.rows, v1.chart.type], ['Protein eaten', [{ source: 'nutrition:protein_g', summary: 'avg' }], 'day', 'line'])
const spec = viewSpec({ ...v1, measures: [{ source: 'nutrition:protein_g', summary: 'avg', target: 140 }], compare: { source: 'training:sessions', summary: 'sum', shade: false } }, today)
is('a view as the pivot reads it: the drawn comparison is a second value', spec.values.map((x) => x.measure), ['nutrition:protein_g', 'training:sessions'])
is('a shaded comparison is not a value', viewSpec({ ...v1, compare: { source: 'training:sessions', summary: 'sum', shade: true } }, today).values.length, 1)
is('the modules a view reads', viewModules({ measures: [{ source: 'nutrition:kcal' }, { source: 'u_ab12cd:log:km' }], compare: { source: 'training:sessions' } }), ['nutrition', 'u_ab12cd', 'training'])
is('old dotted keys read with a colon', [migrateSource('tasks.done'), migrateSource('learning:study:minutes')], ['tasks:done', 'learning:study:minutes'])
let views = putView([], v1)
views = putView(views, { ...blankView('v2', cat[0]), name: 'Two' })
is('views put in, in order', views.map((v) => v.id), ['v1', 'v2'])
is('an edited view keeps its place', putView(views, { ...v1, name: 'Renamed' }).map((v) => v.name), ['Renamed', 'Two'])
is('a broken view is not put in', putView(views, { ...v1, id: 'bad id' }).length, 2)
const dup = duplicateView(views, 'v1', 'v9')
is('a copy goes right after, named so, not on Today', [dup.map((v) => v.id), dup[1].name, dup[1].pinned.today], [['v1', 'v9', 'v2'], 'Protein eaten (copy)', false])
is('moved down and back up', [moveView(views, 'v1', 1).map((v) => v.id), moveView(views, 'v1', -1).map((v) => v.id)], [['v2', 'v1'], ['v1', 'v2']])
is('removed', removeView(views, 'v1').map((v) => v.id), ['v2'])
is('no more than 50', putView(Array.from({ length: 50 }, (_, i) => ({ ...v1, id: `x${i}` })), { ...v1, id: 'one-more' }).length, 50)

/* ---------- ready-made views ---------- */
is('the eight asked for, and more', ['Protein vs target (week)', 'Calories eaten vs planned', 'Training volume by muscle group', 'Study minutes by subject', 'Spending by category (month)', 'Chores per person', 'Sleep vs training days', 'Habit kept % by habit'].every((name) => TEMPLATES.some((t) => t.name === name)), true)
is('every ready-made view reads back whole', TEMPLATES.every((t) => readStatsView(fromTemplate(t, 'x')) !== null), true)
const allCat = measureCatalogue(MODULES.map((m) => ({ key: m.key, name: m.name, entities: m.entities })), ['kcal'])
is('every ready-made view measures something a module keeps', TEMPLATES.flatMap((t) => [...t.view.measures.map((m) => m.source), ...(t.view.compare ? [t.view.compare.source] : [])]).filter((k) => !allCat.some((m) => m.key === k)), [])
is('every ready-made grouping is one its measure offers', TEMPLATES.filter((t) => !groupingsFor(t.view.measures.map((m) => allCat.find((c) => c.key === m.source))).some((x) => x.key === t.view.rows)).map((t) => t.key), [])
is('only those whose modules are on', templatesFor(['habits']).map((t) => t.key), ['habit_kept', 'tasks_weeks', 'tasks_sections', 'habits_year'])

/* ---------- Today's cards ---------- */
const cards = [{ kind: 'module', key: 'nutrition', size: 'large', show: 'always' }, { kind: 'module', key: 'training', size: 'small', show: 'weekdays' }, { kind: 'stats', key: 'v1', size: 'small', show: 'weekends' }]
is('a weekday shows always and weekday cards', cardsFor(cards, today, () => true).map((c) => c.key), ['nutrition', 'training'])
is('a Sunday shows always and weekend cards', cardsFor(cards, '2026-09-27', () => true).map((c) => c.key), ['nutrition', 'v1'])
is('a card of a module that is off does not show', cardsFor(cards, today, (c) => c.key !== 'nutrition').map((c) => c.key), ['training'])
is('a card is not added twice', addCard(cards, { ...cards[0] }).length, 3)
is('no more than six', addCard(Array.from({ length: 6 }, (_, i) => ({ ...cards[0], key: `k${i}` })), { ...cards[0], key: 'seven' }).length, 6)
is('moved', moveCard(cards, 0, 1).map((c) => c.key), ['training', 'nutrition', 'v1'])
is('not moved past the end', moveCard(cards, 2, 1), cards)
is('made large and weekend only', changeCard(cards, 1, { size: 'large', show: 'weekends' })[1], { kind: 'module', key: 'training', size: 'large', show: 'weekends' })

/* ---------- charts ---------- */
is('values written out', [formatValue(142.4, 'g'), formatValue(86, '%'), formatValue(23.5, 'time'), formatValue(24.75, 'time'), formatValue(1, 'days'), formatValue(3, 'days'), formatValue(null, 'g'), formatValue(2216.4, 'kcal'), formatValue(7.25, 'h', 1)],
  ['142 g', '86%', '23:30', '00:45', '1 day', '3 days', '–', '2,216 kcal', '7.3 h'])
is('short numbers for an axis', [shortNumber(12500), shortNumber(1250), shortNumber(7.25), shortNumber(140)], ['13k', '1.3k', '7.3', '140'])
is('an axis from zero in round steps', niceScale([3, 142]), { min: 0, max: 150, ticks: [0, 50, 100, 150] })
is('an axis the person fixed', niceScale([3, 142], { min: 50, max: 200 }).ticks[0], 50)
is('an axis across zero', niceScale([-30, 70]).ticks, [-50, -25, 0, 25, 50, 75])
is('an axis with nothing in it', niceScale([]).ticks, [0, 0.25, 0.5, 0.75, 1])
is('a pale colour made readable on the light page', contrast(readable('#f0e68c', PAPER.light), PAPER.light) >= 3, true)
is('a dark colour made readable on the dark page', contrast(readable('#202040', PAPER.dark), PAPER.dark) >= 3, true)
is('a readable colour is left alone', readable('#4777d2', PAPER.light), '#4777d2')
is('every split colour reads on both pages', Array.from({ length: 16 }, (_, i) => splitColour(i)).every((c) => contrast(c, PAPER.light) >= 3 && contrast(c, PAPER.dark) >= 3), true)
is('labels thinned to fit', [labelStep(7, 320), labelStep(31, 320), labelStep(0, 320)], [1, 4, 1])

const tasksCat = measureCatalogue([], [])
const facts = [
  { measure: 'tasks:planned', day: '2026-09-21', value: 1, module: 'tasks', section: 'Work' }, { measure: 'tasks:done', day: '2026-09-21', value: 1, module: 'tasks', section: 'Work' },
  { measure: 'tasks:planned', day: '2026-09-22', value: 1, module: 'tasks', section: 'Home' },
]
const view = { ...blankView('t1', tasksCat[0]), measures: [{ source: 'tasks:done', summary: 'sum' }, { source: 'tasks:minutes_done', summary: 'sum', colour: '#f0e68c' }], range: { kind: 'this', unit: 'weeks' } }
const res = pivot(viewSpec(view, today), facts, tasksCat, today)
const data = chartData(res, view, () => '#6d7198', PAPER.light, new Set(['2026-09-22']))
is('a series per measure, with labels per day', [data.series.map((s) => s.key), data.labels.length], [['m0', 'm1'], 7])
is('the second measure of the same module takes a swatch, the chosen pale one is made readable', [data.series[0].colour, contrast(data.series[1].colour, PAPER.light) >= 3], ['#6d7198', true])
is('a second axis when the units differ', data.series.map((s) => s.axis), [0, 1])
is('days to shade', data.shaded.slice(0, 3), [false, true, false])
const splitView = { ...view, measures: [{ source: 'tasks:planned', summary: 'sum' }], rows: 'week', columns: 'section', chart: { ...view.chart, hidden: ['c:Home'] } }
const splitData = chartData(pivot(viewSpec(splitView, today), facts, tasksCat, today), splitView, () => '#6d7198', PAPER.dark)
is('a split: a series per column, one hidden', splitData.series.map((s) => [s.label, s.hidden, s.values]), [['Home', true, [1]], ['Work', false, [1]]])
is('the chart in words', describe(res, 'This week'), 'Tasks done, this week: 1 overall. Highest 1 (Mon 21 Sep); lowest 0 (Tue 22 Sep). Minutes done: 0 min.')
const w = toWidgetView({ ...view, name: 'Done', chart: { ...view.chart, type: 'bar' } }, res, data, 'This week', 'Day')
is('the widget: bars, a figure, a tap that opens the view', [w.kind, w.headline, w.points.length, w.link, w.sub], ['bars', '1', 7, '/stats?view=t1', 'Tasks done · This week'])
const ring = toWidgetView({ ...view, chart: { ...view.chart, type: 'ring' }, measures: [{ source: 'tasks:completion', summary: 'avg' }] },
  pivot({ ...viewSpec(view, today), values: [{ measure: 'tasks:completion', summary: 'avg' }], rows: 'none' }, facts, tasksCat, today), data, 'This week', 'Day')
is('a ring shows the share as progress', [ring.kind, ring.headline, ring.progress], ['ring', '50%', 0.5])
const table = toWidgetView({ ...view, chart: { ...view.chart, type: 'table' } }, res, data, 'This week', 'Day')
is('a table: a heading row and at most five more', [table.rows.length, table.rows[0]], [6, ['Day', 'Tasks done', 'Minutes done']])

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall stats view checks passed')
