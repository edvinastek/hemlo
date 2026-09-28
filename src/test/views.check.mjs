// Board, grid and chart views: which column a card is in and where it can
// move, the grid's days, rows, cells and what a tap does, and the chart's
// sums per day, week and month and its axis.
import {
  boardColumns, moveTargets, gridDays, gridRows, gridCells, gridTap, cellKey, rowStreak,
  chartBuckets, chartPoints, niceMax, chartDomain, shortNumber, labelEvery, dayOf, shortDay,
} from '../modules/view-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const rec = (id, values) => ({ id, values })

// ---------- board ----------------------------------------------------------------
const status = { name: 'status', label: 'Status', type: 'select', options: ['to do', 'doing', 'done'] }
const cards = [rec('a', { status: 'doing' }), rec('b', { status: 'to do' }), rec('c', { status: null }), rec('d', { status: 'gone' }), rec('e', { status: 'doing' })]
is('a column per option, in order, cards in the order given',
  boardColumns(status, cards, 'status').map((c) => [c.key, c.ids]), [['to do', ['b']], ['doing', ['a', 'e']], ['done', []], ['', ['c', 'd']]])
is('records with no option, or an old one, go last under "No status"', boardColumns(status, cards, 'status').at(-1).label, 'No status')
is('that column is only there when something is in it', boardColumns(status, cards.slice(0, 2), 'status').length, 3)
is('a card moves to every other option, or to none', moveTargets(status, 'doing').map((t) => t.value), ['to do', 'done', null])
is('a card with no value moves to any option', moveTargets(status, null).map((t) => t.value), ['to do', 'doing', 'done'])
is('a required field cannot be emptied', moveTargets({ ...status, required: true }, 'doing').map((t) => t.value), ['to do', 'done'])
is('an old option counts as none', moveTargets(status, 'gone').map((t) => t.value), ['to do', 'doing', 'done'])

// ---------- grid -----------------------------------------------------------------
is('seven days up to today, oldest first', gridDays('2026-03-02', 7), ['2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
is('thirty days', gridDays('2026-09-28', 30).length, 30)
is('across a leap day', gridDays('2028-03-01', 2), ['2028-02-29', '2028-03-01'])
const name = { name: 'name', label: 'Habit', type: 'text' }
const day = { name: 'day', label: 'Day', type: 'date' }
const done = { name: 'done', label: 'Done', type: 'boolean' }
const glasses = { name: 'glasses', label: 'Glasses', type: 'integer' }
const logs = [
  rec('1', { name: 'Read', day: '2026-09-28', done: true }),
  rec('2', { name: 'read ', day: '2026-09-27', done: true }),
  rec('3', { name: 'Walk', day: '2026-09-26', done: false }),
  rec('4', { name: 'Walk', day: '2026-09-28T07:30', done: true }),
  rec('5', { name: 'Stretch', day: '2026-08-01', done: true }),
  rec('6', { name: '', day: '2026-09-28', done: true }),
]
is('rows: every name, once whatever its capitals, A to Z, old ones too', gridRows(name, logs), ['Read', 'Stretch', 'Walk'])
is('rows of a choice: its options', gridRows(status, []), ['to do', 'doing', 'done'])
const days = gridDays('2026-09-28', 7)
const g = { row: name, date: day, mark: done }
const cells = gridCells(g, logs, days)
is('a ticked day is on', cells.get(cellKey('Read', '2026-09-28')).on, true)
is('the same name in other capitals is the same row', cells.get(cellKey('Read', '2026-09-27')).ids, ['2'])
is('a record not ticked is there but off', cells.get(cellKey('Walk', '2026-09-26')), { ids: ['3'], on: false, total: null })
is('a date-time counts on its day', cells.get(cellKey('Walk', '2026-09-28')).on, true)
is('days outside the grid are not drawn', cells.has(cellKey('Stretch', '2026-08-01')), false)
is('an empty cell: add a ticked record for that row and day', gridTap(g, 'Read', '2026-09-25', undefined, logs),
  { kind: 'add', values: { name: 'Read', day: '2026-09-25', done: true } })
is('a date-time field gets midday', gridTap({ ...g, date: { ...day, type: 'datetime' } }, 'Read', '2026-09-25', undefined, logs).values.day, '2026-09-25T12:00')
is('a ticked cell: untick it', gridTap(g, 'Read', '2026-09-28', cells.get(cellKey('Read', '2026-09-28')), logs),
  { kind: 'update', changes: [{ id: '1', values: { done: false } }] })
is('an unticked record: tick it', gridTap(g, 'Walk', '2026-09-26', cells.get(cellKey('Walk', '2026-09-26')), logs),
  { kind: 'update', changes: [{ id: '3', values: { done: true } }] })
is('a run of days counts back from today', rowStreak('Read', days, cells), 2)
is('today not done yet does not break the run', rowStreak('Read', [...days.slice(1), '2026-09-29'], cells), 2)
const water = [rec('w1', { name: 'Water', day: '2026-09-28', glasses: 3 }), rec('w2', { name: 'Water', day: '2026-09-28', glasses: '2' }), rec('w3', { name: 'Water', day: '2026-09-27', glasses: 0 })]
const gw = { row: name, date: day, mark: glasses }
const wc = gridCells(gw, water, days)
is('a number cell adds up the day', wc.get(cellKey('Water', '2026-09-28')), { ids: ['w1', 'w2'], on: true, total: 5 })
is('nought is not ticked', wc.get(cellKey('Water', '2026-09-27')).on, false)
is('an empty number cell: add one with 1', gridTap(gw, 'Water', '2026-09-26', undefined, water).values.glasses, 1)
is('a number at nought: count one', gridTap(gw, 'Water', '2026-09-27', wc.get(cellKey('Water', '2026-09-27')), water),
  { kind: 'update', changes: [{ id: 'w3', values: { glasses: 1 } }] })
is('a number already counted: open it to change', gridTap(gw, 'Water', '2026-09-28', wc.get(cellKey('Water', '2026-09-28')), water), { kind: 'open', id: 'w1' })
const gn = { row: name, date: day }
is('nothing to tick: a record is enough', gridCells(gn, logs, days).get(cellKey('Walk', '2026-09-26')).on, true)
is('nothing to tick: an empty cell adds a plain record', gridTap(gn, 'Walk', '2026-09-25', undefined, logs), { kind: 'add', values: { name: 'Walk', day: '2026-09-25' } })
is('nothing to tick: a full cell opens', gridTap(gn, 'Walk', '2026-09-26', gridCells(gn, logs, days).get(cellKey('Walk', '2026-09-26')), logs).kind, 'open')

// ---------- chart ----------------------------------------------------------------
const pts = [
  { day: '2026-09-28', value: 5 }, { day: '2026-09-28', value: 2.5 }, { day: '2026-09-21', value: 4 },
  { day: '2026-09-01', value: 1 }, { day: '2026-08-31', value: 10 }, { day: '2026-09-29', value: 99 }, { day: '2025-01-01', value: 7 },
]
const byDay = chartBuckets(pts, 'day', '2026-09-28')
is('fourteen days, ending today', [byDay.length, byDay[0].key, byDay.at(-1).key], [14, '2026-09-15', '2026-09-28'])
is('a day adds up its values', byDay.at(-1).value, 7.5)
is('a day with nothing is empty, not nought', byDay.at(-2).value, null)
is('the future is left out', byDay.some((b) => b.value === 99), false)
is('day labels and names', [byDay.at(-1).label, byDay.at(-1).name], ['28', 'Mon 28 Sep'])
const byWeek = chartBuckets(pts, 'week', '2026-09-28')
is('weeks start on Monday', [byWeek.at(-1).start, byWeek.at(-1).end], ['2026-09-28', '2026-10-04'])
is('twelve weeks', byWeek.length, 12)
is('a week adds up its days', byWeek.find((b) => b.start === '2026-09-21').value, 4)
is('a week across two months', byWeek.find((b) => b.start === '2026-08-31').value, 11)
is('week names', byWeek.at(-1).name, 'Week of 28 Sep')
const byMonth = chartBuckets(pts, 'month', '2026-09-28')
is('twelve months back to October', [byMonth[0].start, byMonth.at(-1).start, byMonth.at(-1).end], ['2025-10-01', '2026-09-01', '2026-09-30'])
is('a month adds up', [byMonth.at(-1).value, byMonth.at(-2).value], [12.5, 10])
is('month names', [byMonth.at(-1).label, byMonth.at(-1).name], ['Sep', 'September 2026'])
is('a year back in January', chartBuckets([], 'month', '2026-01-15')[0].start, '2025-02-01')
is('February in a leap year ends on the 29th', chartBuckets([], 'month', '2028-02-10').at(-1).end, '2028-02-29')
const fields = [{ name: 'd', label: 'D', type: 'date' }, { name: 'a', label: 'A', type: 'number' }, { name: 'b', label: 'B', type: 'formula', formula: 'a * 2' }]
const recs = [rec('1', { d: '2026-09-28', a: 3 }), rec('2', { d: '2026-09-27T10:00', a: '4' }), rec('3', { d: null, a: 1 }), rec('4', { d: '2026-09-26', a: null })]
is('points from records, dates and numbers as stored', chartPoints(fields, fields[1], fields[0], recs), [{ day: '2026-09-28', value: 3 }, { day: '2026-09-27', value: 4 }])
is('a calculated field is worked out', chartPoints(fields, fields[2], fields[0], recs).map((p) => p.value), [6, 8])
is('a round top for the axis', [niceMax(0), niceMax(7.5), niceMax(12), niceMax(21), niceMax(250), niceMax(0.3)], [1, 10, 20, 25, 250, 0.5])
is('the axis from nought', chartDomain([3, null, 7.5]), [0, 10])
is('below nought too, even both ways', chartDomain([-4, 12]), [-20, 20])
is('all below nought', chartDomain([-3]), [-5, 0])
is('nothing at all still has an axis', chartDomain([null, null]), [0, 1])
is('numbers for the axis', [shortNumber(12.345), shortNumber(2500), shortNumber(12500)], ['12.35', '2500', '13k'])
const every = labelEvery(14, 7)
is('at most seven labels, the last always', [...Array(14).keys()].filter(every), [1, 3, 5, 7, 9, 11, 13])
is('a day from a date-time', [dayOf('2026-09-28T07:00'), dayOf('yesterday'), dayOf(null)], ['2026-09-28', null, null])
is('a short day', shortDay('2026-02-01'), 'Sun 1 Feb')

console.log(fail ? `\n${fail} failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
