// Checks import and export: CSV as RFC 4180 with Excel's byte-order mark and
// no formula injection, reading values people type in spreadsheets, matching
// columns by name or label, the per-row problems, duplicates, ranges and the
// catalogue of datasets. 2026-09-28 is a Monday.
import {
  toCsv, parseCsv, csvCell, guardCell, unguard, detectSeparator, jsonTable, toJson, normHeader, matchHeaders,
  readCell, readDay, readTime, readNumber, guessDateOrder, planImport, rowKey, rangeFor, inRange, fileName,
  listDatasetsFrom, cellValue, googleDate, googleTime, statsRows, taskStats, noteText, headersFor, formatOfFile,
  PLANNER, TASK_FIELDS, CALENDAR_FIELDS, IMPORT_LIMITS,
} from '../lib/transfer-rules.ts'
import { MODULES } from '../modules/registry.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// ---- CSV out ----------------------------------------------------------------
eq('formula cells get an apostrophe', ['=1+1', '+31 6', '-x', '@SUM(A1)', '\tx', 'plain'].map(guardCell), ["'=1+1", "'+31 6", "'-x", "'@SUM(A1)", "'\tx", 'plain'])
eq('numbers are never guarded (a negative stays a number)', csvCell(-5), '-5')
eq('quotes doubled, commas and line breaks quoted', [csvCell('a,b'), csvCell('say "hi"'), csvCell('two\nlines'), csvCell(' pad')], ['"a,b"', '"say ""hi"""', '"two\nlines"', '" pad"'])
eq('yes/no and empty', [csvCell(true), csvCell(false), csvCell(null), csvCell(undefined)], ['TRUE', 'FALSE', '', ''])
const csv = toCsv(['Name', 'Note'], [['Oats, rolled', '=HYPERLINK("x")'], ['Kefyras ė', 'line1\r\nline2']])
eq('BOM first, CRLF lines', [csv.startsWith('﻿Name,Note\r\n'), csv.endsWith('\r\n')], [true, true])
eq('a guarded formula inside quotes', csv.includes('"\'=HYPERLINK(""x"")"'), true)

// ---- CSV in -------------------------------------------------------------------
eq('round trip', parseCsv(csv).rows, [['Name', 'Note'], ['Oats, rolled', '\'=HYPERLINK("x")'], ['Kefyras ė', 'line1\r\nline2']])
eq('the apostrophe comes off again', unguard('\'=HYPERLINK("x")'), '=HYPERLINK("x")')
eq('an apostrophe before ordinary text stays', unguard("'tis"), "'tis")
eq('semicolons (European Excel)', parseCsv('Datum;Bedrag\n28-09-2026;12,50\n').rows, [['Datum', 'Bedrag'], ['28-09-2026', '12,50']])
eq('tabs', detectSeparator('a\tb\tc\n1\t2\t3'), '\t')
eq('a separator inside quotes does not count', detectSeparator('"a;b;c",d\n'), ',')
eq('blank lines skipped, last line without a break', parseCsv('a,b\r\n\r\n1,2').rows, [['a', 'b'], ['1', '2']])
eq('empty cells kept', parseCsv('a,b,c\n1,,3\n').rows[1], ['1', '', '3'])
eq('row cap', parseCsv('h\n1\n2\n3\n4\n', 3), { rows: [['h'], ['1'], ['2']], truncated: true })

// ---- JSON -------------------------------------------------------------------
const js = toJson({ key: 'tasks', label: 'Tasks' }, TASK_FIELDS.slice(0, 2), [{ title: 'A', planned_date: '2026-09-28' }], null, '2026-09-27T10:00:00Z')
eq('our JSON reads back as a table', jsonTable(js), { table: [['title', 'planned_date'], ['A', '2026-09-28']], dataset: 'tasks' })
eq('a plain list of objects', jsonTable('[{"a":1,"b":{"x":2}},{"a":3,"c":true}]').table, [['a', 'b', 'c'], [1, '{"x":2}', null], [3, null, true]])
eq('a backup is sent to the backup choice', 'error' in jsonTable('{"format":"getit.bundle","records":{}}'), true)
eq('not JSON', jsonTable('{nope').error, 'That file is not valid JSON.')

// ---- headers ------------------------------------------------------------------
eq('normalised', ['Start Date', 'start_date', ' START-date ', 'Protein (g)'].map(normHeader), ['startdate', 'startdate', 'startdate', 'protein'])
const food = MODULES.find((m) => m.key === 'nutrition').entities[0].fields
eq('by name, by label, unknown', matchHeaders(['protein_g', 'Food', 'kcal', 'Colour'], food), ['protein_g', 'name', 'kcal', null])
eq('a field is filled once', matchHeaders(['name', 'Food'], food), ['name', null])
eq('Google Calendar CSV headers', matchHeaders(['Subject', 'Start Date', 'Start Time', 'End Date', 'End Time', 'All Day Event', 'Description', 'Location', 'Private'], CALENDAR_FIELDS),
  ['title', 'date', 'time', 'end_date', 'end_time', 'all_day', 'notes', 'location', null])
eq('task aliases', matchHeaders(['Summary', 'Date', 'Start time', 'Description'], TASK_FIELDS, PLANNER[0].aliases), ['title', 'planned_date', 'planned_time', 'notes'])
eq('headers are labels, names where labels clash', headersFor([{ name: 'a', label: 'X' }, { name: 'b', label: 'x' }, { name: 'c', label: 'Y' }]), ['a', 'b', 'Y'])

// ---- values -------------------------------------------------------------------
eq('ISO day', readDay('2026-09-28'), '2026-09-28')
eq('day first by default', readDay('03-04-2026'), '2026-04-03')
eq('month first when asked', readDay('03/04/2026', 'mdy'), '2026-03-04')
eq('a part over 12 settles it', [readDay('28/09/2026', 'mdy'), readDay('09/28/2026')], ['2026-09-28', '2026-09-28'])
eq('dotted day', readDay('28.09.2026'), '2026-09-28')
eq('no 31 September', readDay('2026-09-31'), null)
eq('Excel day number', readDay(46293), '2026-09-28')
eq('a Date cell', readDay(new Date(2026, 8, 28, 10, 0)), '2026-09-28')
eq('year out of range', readDay('0026-09-28'), null)
eq('times', ['9:30', '09:30:00', '7.15', '9:30 PM', '12:00 am', '12 pm', '24:00', '9'].map(readTime), ['09:30', '09:30', '07:15', '21:30', '00:00', '12:00', null, null])
eq('Excel time fraction', readTime(0.75), '18:00')
eq('numbers as people type them', ['1,5', '1.234,5', '1,234.5', ' 80 ', '1.234.567', '12a', '', '-3'].map(readNumber), [1.5, 1234.5, 1234.5, 80, 1234567, null, null, -3])
eq('guessing the date order', [guessDateOrder(['01/02/2026', '13/02/2026']), guessDateOrder(['01/13/2026']), guessDateOrder(['01/02/2026'], 'mdy')], ['dmy', 'mdy', 'mdy'])

const f = (type, extra = {}) => ({ name: 'x', label: 'X', type, ...extra })
eq('text trimmed, apostrophe off', readCell(f('text'), "  '=cmd  "), { ok: true, value: '=cmd' })
eq('text too long', readCell(f('text'), 'a'.repeat(2001)).ok, false)
eq('notes may be longer', readCell(f('text', { name: 'notes' }), 'a'.repeat(5000)).ok, true)
eq('integer rounds', readCell(f('integer'), '7,6'), { ok: true, value: 8 })
eq('bad number in words', readCell(f('number'), 'eighty'), { ok: false, problem: 'X: "eighty" is not a number.' })
eq('negative length', readCell(f('duration'), '-5').ok, false)
eq('bounds', readCell(f('number'), '1500', {}, [1, 999]), { ok: false, problem: 'X: 1500 is outside 1 to 999.' })
eq('yes/no in several languages', ['yes', 'Ja', 'TRUE', '1', 'x', 'nee', 'FALSE', '0'].map((v) => readCell(f('boolean'), v).value), [true, true, true, true, true, false, false, false])
eq('empty yes/no is no', readCell(f('boolean'), '').value, false)
eq('select any case', readCell(f('select', { options: ['to_do', 'Done'] }), 'DONE').value, 'Done')
eq('select with spaces for underscores', readCell(f('select', { options: ['to_do'] }), 'to do').value, 'to_do')
eq('select not an option', readCell(f('select', { options: ['a', 'b'] }), 'c'), { ok: false, problem: 'X: "c" is not one of a, b.' })
eq('datetime with a space', readCell(f('datetime'), '2026-09-28 09:30').value, '2026-09-28T09:30')
eq('datetime, day first, PM', readCell(f('datetime'), '28-09-2026 9:30 PM').value, '2026-09-28T21:30')
eq('datetime, a date alone is midnight', readCell(f('datetime'), '2026-09-28').value, '2026-09-28T00:00')
eq('datetime from Excel', readCell(f('datetime'), 46293.5).value, '2026-09-28T12:00')
const ctx = { lookups: { recipe: [{ id: 'r1', name: 'Overnight oats' }] } }
eq('lookup by name', readCell(f('lookup', { lookup: 'recipe' }), 'overnight OATS', ctx).value, 'r1')
eq('lookup by id', readCell(f('lookup', { lookup: 'recipe' }), 'r1', ctx).value, 'r1')
eq('lookup not found', readCell(f('lookup', { lookup: 'recipe' }), 'Pizza', ctx).ok, false)

// ---- a file, planned ----------------------------------------------------------
const datasets = listDatasetsFrom(MODULES.map((def) => ({ def, enabled: def.key !== 'finance' })))
const byKey = (k) => datasets.find((d) => d.key === k)
const finance = byKey('m:finance:entry')
const table = [
  ['', '', '', ''],
  ['Date', 'Category', 'Amount', 'Colour'],
  ['28-09-2026', 'Food', '12,50', 'red'],
  ['2026-09-29', 'Rent', 'lots', ''],
  ['31-09-2026', 'Bills', '3', ''],
  ['', '', '', ''],
  ['28/09/2026', 'food', '12.5', ''],
  ['2026-09-30', 'Fun', '-4', ''],
  ['2026-09-30', 'Old', '7', ''],
]
const existing = new Set([rowKey(finance.fields, finance.natural, { entry_date: '2026-09-30', category: 'Old', amount: 7, note: null })])
const p = planImport(table, finance, existing)
eq('columns', p.columns, [{ header: 'Date', field: 'entry_date' }, { header: 'Category', field: 'category' }, { header: 'Amount', field: 'amount' }, { header: 'Colour', field: null }])
eq('lines count the file, blank rows skipped', p.rows.map((r) => r.line), [3, 4, 5, 7, 8, 9])
eq('first row read', p.rows[0].values, { entry_date: '2026-09-28', category: 'Food', amount: 12.5 })
eq('problems in words', p.rows.slice(1, 3).map((r) => r.problems), [['Amount: "lots" is not a number.'], ['Date: "31-09-2026" is not a date.']])
eq('the same row twice in a file is a duplicate', p.rows[3].duplicate, true)
eq('a row already here is a duplicate', p.rows[5].duplicate, true)
eq('counts', [p.valid, p.duplicates, p.withProblems, p.missing], [2, 2, 2, []])
const noName = planImport([['kcal'], ['100']], byKey('m:nutrition:food'), new Set())
eq('a required field with no column', [noName.missing, noName.valid], [['Food'], 0])
const blank = planImport([['Food', 'kcal'], ['', '100']], byKey('m:nutrition:food'), new Set())
eq('a required field left empty', blank.rows[0].problems, ['Food is needed.'])
eq('food natural key is the name, any case', planImport([['Food'], ['OATS']], byKey('m:nutrition:food'), new Set([rowKey([], ['name'], { name: 'Oats' })])).duplicates, 1)
const bounded = planImport([['Date', 'Weight'], ['2026-09-28', '1200']], byKey('m:health:body_log'), new Set())
eq('server column limits are checked', bounded.rows[0].problems, ['Weight: 1200 is outside 1 to 999.'])
eq('a weigh-in needs its weight', planImport([['Date'], ['2026-09-28']], byKey('m:health:body_log'), new Set()).missing, ['Weight'])
const google = planImport([['Subject', 'Start Date', 'Start Time', 'All Day Event'], ['Dentist', '10/02/2026', '9:30 AM', 'False']], byKey('calendar'), new Set())
eq('Google CSV dates are month first', google.rows[0].values, { title: 'Dentist', date: '2026-10-02', time: '09:30', all_day: false })
const many = [['Task'], ...Array.from({ length: 12 }, (_, i) => [`t${i}`])]
eq('row limit', [planImport(many, byKey('tasks'), new Set(), {}, 10).rows.length, planImport(many, byKey('tasks'), new Set(), {}, 10).truncated], [10, true])
eq('import limits', [IMPORT_LIMITS.bytes, IMPORT_LIMITS.rows], [5242880, 20000])

// ---- the catalogue ------------------------------------------------------------
eq('planner datasets first, backup last', [datasets[0].key, datasets[1].key, datasets[2].key, datasets[3].key, datasets.at(-1).key], ['tasks', 'calendar', 'notes', 'stats', 'backup'])
eq('every built-in record module is there', ['m:learning:study', 'm:projects:project', 'm:finance:entry', 'm:household:chore', 'm:agenda:calendar_event', 'm:sleep:sleep_log', 'm:training:workout_log', 'm:habits:habit', 'm:supplements:supplement', 'm:health:body_log', 'm:nutrition:food', 'm:nutrition:recipe', 'm:nutrition:meal_plan_slot', 'stock'].every((k) => byKey(k)), true)
eq('shopping trips (no local table) are not', datasets.some((d) => d.key.startsWith('m:shopping:')), false)
eq('a switched-off module is marked', byKey('m:finance:entry').off, true)
eq('dated datasets can be a calendar file', [byKey('m:finance:entry').formats, byKey('m:nutrition:food').formats], [['csv', 'xlsx', 'json', 'ics'], ['csv', 'xlsx', 'json']])
eq('agenda events import from a calendar file', byKey('m:agenda:calendar_event').imports.includes('ics'), true)
eq('weigh-ins do not (a calendar has no weights)', byKey('m:health:body_log').imports.includes('ics'), false)
eq('the meal plan has its day and is export only', [byKey('m:nutrition:meal_plan_slot').fields[0].name, byKey('m:nutrition:meal_plan_slot').imports], ['slot_date', []])
eq('stats are export only', byKey('stats').imports, [])
eq('household chores come from the chore table, with their done history', [byKey('m:household:chore').store, byKey('m:household:chore_log').store, byKey('m:household:chore_log').dateField],
  ['chore', 'chore_log', 'done_on'])
eq('both are saved only; the chores also as a calendar file with their repeats (v18, GEN-26)', [byKey('m:household:chore').imports, byKey('m:household:chore').formats, byKey('m:household:chore_log').formats],
  [[], ['csv', 'xlsx', 'json', 'ics'], ['csv', 'xlsx', 'json']])
eq('habits go to and come from a calendar file with their repeats (GEN-26)', [byKey('m:habits:habit').formats.includes('ics'), byKey('m:habits:habit').imports.includes('ics')], [true, true])
eq('supplements go to a calendar file (GEN-26)', [byKey('m:supplements:supplement').formats.includes('ics'), byKey('m:supplements:supplement').imports.includes('ics')], [true, false])
eq('natural keys', [byKey('m:sleep:sleep_log').natural, byKey('m:agenda:calendar_event').natural, byKey('m:learning:study').natural], [['log_date'], ['title', 'starts_at'], null])
const built = { key: 'u_abc123', name: 'Reading', summary: '', depth: 'light', built: true, views: [], rules: [],
  entities: [{ name: 'book', label: 'Book', fields: [{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'finished', label: 'Finished', type: 'date' }] }] }
const withBuilt = listDatasetsFrom([{ def: built, enabled: true }])
eq('a built module is listed', withBuilt.find((d) => d.key === 'm:u_abc123:book')?.label, 'Reading')

// ---- ranges and names -----------------------------------------------------------
eq('a day', rangeFor('day', '2026-09-30'), { from: '2026-09-30', to: '2026-09-30', label: '30 Sep 2026' })
eq('a week is Monday to Sunday', [rangeFor('week', '2026-10-04').from, rangeFor('week', '2026-10-04').to], ['2026-09-28', '2026-10-04'])
eq('a month', [rangeFor('month', '2026-02-10').from, rangeFor('month', '2026-02-10').to, rangeFor('month', '2026-12-10').to], ['2026-02-01', '2026-02-28', '2026-12-31'])
eq('a leap February', rangeFor('month', '2028-02-10').to, '2028-02-29')
eq('a year', rangeFor('year', '2026-06-01'), { from: '2026-01-01', to: '2026-12-31', label: '2026' })
eq('custom, and backwards', [rangeFor('custom', '', { from: '2026-09-01', to: '2026-09-10' }).label, rangeFor('custom', '', { from: '2026-09-10', to: '2026-09-01' })], ['1 Sep 2026 to 10 Sep 2026', null])
eq('everything', rangeFor('all', '2026-09-28'), null)
eq('in range', [inRange('2026-09-28', rangeFor('week', '2026-09-28')), inRange('2026-10-05', rangeFor('week', '2026-09-28')), inRange(null, null), inRange('2026-09-28T09:00', rangeFor('day', '2026-09-28'))], [true, false, true, true])
eq('file names', fileName('Learning and reading · Block', rangeFor('month', '2026-09-01'), 'csv'), 'getit-learning-and-reading-block-september-2026.csv')
eq('letters with accents', fileName('Kūryba ė', null, 'ics'), 'getit-kuryba-e.ics')
eq('formats from file names', ['a.CSV', 'b.xlsx', 'c.json', 'd.ics', 'e.pdf'].map(formatOfFile), ['csv', 'xlsx', 'json', 'ics', null])

// ---- values out -------------------------------------------------------------------
const names = { recipe: new Map([['r1', 'Overnight oats']]) }
eq('a lookup by its name', cellValue({ name: 'r', label: 'R', type: 'lookup', lookup: 'recipe' }, 'r1', names), 'Overnight oats')
eq('date-time with a space', cellValue(f('datetime'), '2026-09-28T09:30'), '2026-09-28 09:30')
eq('numbers rounded, empty is null', [cellValue(f('number'), 1 / 3), cellValue(f('number'), '')], [0.333, null])
eq('Google dates and times', [googleDate('2026-09-28'), googleTime('09:05'), googleTime('00:30'), googleTime('12:00'), googleTime('21:45')], ['09/28/2026', '9:05 AM', '12:30 AM', '12:00 PM', '9:45 PM'])

// ---- figures for charts -------------------------------------------------------------
const study = MODULES.find((m) => m.key === 'learning').entities[0].fields
eq('stats: numbers of dated records, one per row', statsRows([
  { module: 'Learning', date: '2026-09-29', fields: study, values: { subject: 'Dutch', minutes: 45 } },
  { module: 'Learning', date: '2026-09-28', fields: study, values: { subject: 'Dutch', minutes: '30' } },
  { module: 'Learning', date: null, fields: study, values: { minutes: 10 } },
]), [
  { date: '2026-09-28', module: 'Learning', measure: 'Length', value: 30, unit: 'min' },
  { date: '2026-09-29', module: 'Learning', measure: 'Length', value: 45, unit: 'min' },
])
eq('task stats per day', taskStats([
  { planned_date: '2026-09-28', status: 'done', duration_min: 30 }, { planned_date: '2026-09-28', status: 'todo', duration_min: 60 },
  { planned_date: '2026-09-28', status: 'dropped', duration_min: 60 }, { planned_date: '2026-09-28', status: 'done', duration_min: 10, deleted_at: 'x' },
]).map((r) => [r.measure, r.value]), [['Planned', 2], ['Done', 1], ['Minutes done', 30]])
eq('a note as text', noteText('Pack', '2026-09-28', '- [ ] passport\n'), '# Pack\n\n28 Sep 2026\n\n- [ ] passport\n')

console.log(fail ? `\n${fail} failed` : '\nall passed')
process.exit(fail ? 1 : 0)
