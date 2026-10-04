// Checks a built module's records as a list a person arranges (competitor
// review 4.2, GEN-52, CALM-08): sort and filter by a field, copies, and the
// record form staged into what is needed and "More options".
import {
  sortRecs, passesFilter, arrange, orderSummary, readOrder, readOrders, sortDirs, filterOps, sortableFields,
  copyValues, stageFields, stagedSummary, STAGE_FROM,
} from '../modules/list-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const fields = [
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'read_on', label: 'Read on', type: 'date' },
  { name: 'pages', label: 'Pages', type: 'integer' },
  { name: 'genre', label: 'Genre', type: 'select', options: ['Novel', 'History', 'Science'] },
  { name: 'tags', label: 'Tags', type: 'multi', options: ['Loan', 'Gift', 'Audio'] },
  { name: 'done', label: 'Finished', type: 'boolean' },
  { name: 'notes', label: 'Notes', type: 'note' },
  { name: 'per_day', label: 'Pages a day', type: 'formula', formula: 'pages / 10' },
]
const recs = [
  { id: 'a', values: { title: 'Émile', read_on: '2026-09-02', pages: 300, genre: 'Novel', tags: ['Loan'], done: true } },
  { id: 'b', values: { title: 'atlas', read_on: '2026-10-01', pages: 120, genre: 'Science', tags: [], done: false } },
  { id: 'c', values: { title: 'Zola', read_on: null, pages: null, genre: null, tags: ['Gift', 'Audio'], done: false } },
  { id: 'd', values: { title: 'Bede', read_on: '2026-08-15', pages: 120, genre: 'History', tags: null, done: true } },
]
const ids = (list) => list.map((r) => r.id)

/* ---------- sorting ---------- */
is('A to Z ignores case and accents', ids(sortRecs(recs, fields, { field: 'title', dir: 'asc' })), ['b', 'd', 'a', 'c'])
is('Z to A', ids(sortRecs(recs, fields, { field: 'title', dir: 'desc' })), ['c', 'a', 'd', 'b'])
is('numbers as numbers, ties keep their order, empty last', ids(sortRecs(recs, fields, { field: 'pages', dir: 'asc' })), ['b', 'd', 'a', 'c'])
is('empty last also the other way round', ids(sortRecs(recs, fields, { field: 'pages', dir: 'desc' })), ['a', 'b', 'd', 'c'])
is('days, newest first', ids(sortRecs(recs, fields, { field: 'read_on', dir: 'desc' })), ['b', 'a', 'd', 'c'])
is('a calculated field sorts by its value', ids(sortRecs(recs, fields, { field: 'per_day', dir: 'desc' })), ['a', 'b', 'd', 'c'])
is('yes first', ids(sortRecs(recs, fields, { field: 'done', dir: 'desc' })), ['a', 'd', 'b', 'c'])
is('no sort: the list as it came', ids(sortRecs(recs, fields, null)), ['a', 'b', 'c', 'd'])
is('a link sorts by the name a person reads', ids(sortRecs([{ id: 'x', values: { l: 'id2' } }, { id: 'y', values: { l: 'id1' } }],
  [{ name: 'l', label: 'Book', type: 'lookup' }], { field: 'l', dir: 'asc' }, (_f, v) => (v === 'id1' ? 'Zebra' : 'Apple'))), ['x', 'y'])
is('notes and checklists cannot be sorted by', sortableFields(fields).some((f) => f.name === 'notes'), false)
is('directions in words that fit the field', [sortDirs(fields[2])[0].label, sortDirs(fields[1])[0].label, sortDirs(fields[0])[0].label], ['Highest first', 'Newest first', 'A to Z'])

/* ---------- filtering ---------- */
const keep = (filter) => ids(recs.filter((r) => passesFilter(r, fields, filter)))
is('a choice is…', keep({ field: 'genre', op: 'is', value: 'novel' }), ['a'])
is('a choice is not… (an empty one is not it either)', keep({ field: 'genre', op: 'not', value: 'Novel' }), ['b', 'c', 'd'])
is('tags include', keep({ field: 'tags', op: 'has', value: 'gift' }), ['c'])
is('tags do not include', keep({ field: 'tags', op: 'not', value: 'Loan' }), ['b', 'c', 'd'])
is('text contains, accents aside', keep({ field: 'title', op: 'has', value: 'emi' }), ['a'])
is('more than', keep({ field: 'pages', op: 'gt', value: '150' }), ['a'])
is('less than leaves the empty one out', keep({ field: 'pages', op: 'lt', value: '200' }), ['b', 'd'])
is('a number is', keep({ field: 'pages', op: 'is', value: '120' }), ['b', 'd'])
is('after a day', keep({ field: 'read_on', op: 'gt', value: '2026-09-01' }), ['a', 'b'])
is('on a day', keep({ field: 'read_on', op: 'is', value: '2026-08-15' }), ['d'])
is('filled in', keep({ field: 'read_on', op: 'filled' }), ['a', 'b', 'd'])
is('empty (an empty tag list too)', keep({ field: 'tags', op: 'empty' }), ['b', 'd'])
is('yes and no', [keep({ field: 'done', op: 'yes' }), keep({ field: 'done', op: 'no' })], [['a', 'd'], ['b', 'c']])
is('filter, then sort', ids(arrange(recs, fields, { filter: { field: 'done', op: 'no' }, sort: { field: 'title', dir: 'desc' } })), ['c', 'b'])
is('tests that fit a choice', filterOps(fields[3]).map((o) => o.op), ['is', 'not', 'filled', 'empty'])
is('tests that fit a yes/no', filterOps(fields[5]).map((o) => o.op), ['yes', 'no'])

/* ---------- kept arrangements, read safely ---------- */
is('a kept sort and filter read back', readOrder({ sort: { field: 'pages', dir: 'desc' }, filter: { field: 'genre', op: 'is', value: ' Novel ' } }, fields),
  { sort: { field: 'pages', dir: 'desc' }, filter: { field: 'genre', op: 'is', value: 'Novel' } })
is('a field that has gone is dropped', readOrder({ sort: { field: 'gone', dir: 'asc' }, filter: { field: 'gone', op: 'is', value: 'x' } }, fields), {})
is('a test the field cannot take is dropped', readOrder({ filter: { field: 'done', op: 'gt', value: '3' } }, fields), {})
is('a test that needs a value and has none is dropped', readOrder({ filter: { field: 'genre', op: 'is', value: '' } }, fields), {})
is('a test with no value keeps none', readOrder({ filter: { field: 'genre', op: 'empty', value: 'x' } }, fields), { filter: { field: 'genre', op: 'empty', value: null } })
is('nonsense is nothing', [readOrder(null, fields), readOrder('x', fields), readOrders([1]), readOrders({ 'bad key!': {} })], [{}, {}, {}, {}])
is('the line over the list', orderSummary({ sort: { field: 'pages', dir: 'desc' }, filter: { field: 'genre', op: 'is', value: 'Novel' } }, fields), 'Pages, highest first · Genre is Novel')
is('no line when nothing is arranged', orderSummary({}, fields), null)

/* ---------- copies ---------- */
const withRepeat = { ...recs[0].values, _series: 's1', per_day: 30 }
is('a copy leaves its repeat and calculated values behind', Object.keys(copyValues(fields, withRepeat)).includes('_series') || 'per_day' in copyValues(fields, withRepeat), false)
is('a copy keeps the rest', copyValues(fields, withRepeat).title, 'Émile')
is('a copy has its own list of tags', copyValues(fields, withRepeat).tags !== withRepeat.tags, true)
is('copied to a day, the date moves', copyValues(fields, withRepeat, '2026-10-10').read_on, '2026-10-10')
const timed = [{ name: 'at', label: 'At', type: 'datetime' }]
is('a date and time keeps its time of day', copyValues(timed, { at: '2026-09-02T18:30' }, '2026-10-10').at, '2026-10-10T18:30')
is('an event\'s end moves with its start', copyValues([{ name: 's', label: 'Starts', type: 'datetime' }, { name: 'e', label: 'Ends', type: 'datetime' }],
  { s: '2026-09-30T22:00', e: '2026-10-01T01:00' }, '2026-10-10'), { s: '2026-10-10T22:00', e: '2026-10-11T01:00' })
is('…or takes nine o\'clock when it had none', copyValues(timed, { at: null }, '2026-10-10').at, '2026-10-10T09:00')

/* ---------- staging the form (CALM-08) ---------- */
const staged = stageFields(fields)
is('up front: what makes the record (name, day) and enough to make three', staged.main.map((f) => f.name), ['title', 'read_on', 'pages'])
is('behind More options: the rest', staged.more.map((f) => f.name), ['genre', 'tags', 'done', 'notes', 'per_day'])
is(`a form of fewer than ${STAGE_FROM} fields is shown whole`, stageFields(fields.slice(0, 4)).more.length, 0)
is('a required field is always up front', stageFields([...fields.slice(1), { name: 'isbn', label: 'ISBN', type: 'text', required: true }]).main.some((f) => f.name === 'isbn'), true)
is('hidden fields are in neither', stageFields([...fields, { name: 'h', label: 'H', type: 'text', hidden: true }]).more.some((f) => f.name === 'h'), false)
is('the closed line says what is set inside', stagedSummary(staged.more, recs[0].values), 'Genre · Tags · Finished')
is('…and nothing when nothing is', stagedSummary(staged.more, { tags: [], done: false }), null)
is('…with more than three, how many more', stagedSummary(staged.more, { ...recs[0].values, notes: 'x' }, ['Repeats weekly']), 'Genre · Tags · Finished +2')

if (fail) { console.log(`\n${fail} check(s) failed`); process.exit(1) }
console.log('\nall checks passed')
