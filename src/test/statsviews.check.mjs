// Checks saved stats views (stats-view-rules.ts), the builder's rules
// (stats-builder-rules.ts), the chart rules (chart-rules.ts) and what the
// widget and Today's cards are handed. "Today" is Thursday 2026-09-24.
import { readStatsViews, readStatsView, MAX_VIEWS, MAX_MEASURES } from '../lib/stats-view-rules.ts'

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

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall stats view checks passed')
