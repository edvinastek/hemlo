// Checks the field kinds MOD-12 added, end to end in the rules (v22): stars
// on a scale, a share in a range, money in one currency, a start and end as
// minutes, a checklist, a photo and a link to another built module's record.
// Each kind's settings kept and checked (the field editor's rules), values
// read and refused, sorted and filtered, counted in Stats and the page's
// totals (money in its own currency only, stars and shares averaged), out to
// and back from a file, in a module design file (links found again by the
// module's name), and through the JSON a sync sends (definition and record).
import {
  RATING_SCALES, ratingMax, starsText, percentRange, CURRENCIES, isCurrency, moneyCurrency, moneyText, currencySign,
  spanMinutes, minutesText, linkKey, linkText, fieldMeasure, statsChoices, combineValues, isMeasurable,
} from '../modules/field-kinds.ts'
import { cleanField, cleanFields, cleanValues, coerce, fieldProblem, needs, readBuiltDefinition, definitionFor } from '../modules/def-rules.ts'
import { sortRecs, passesFilter, sortDirs, filterOps } from '../modules/list-rules.ts'
import { readCell, cellValue, statsRows } from '../lib/transfer-rules.ts'
import { recordMeasures } from '../lib/stats-builder-rules.ts'
import { designFile, readDesignFile, builtNames, IMPORT_KEY } from '../modules/design-file-rules.ts'
import { photoRefs, photosToRemove } from '../modules/photo-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// ---- rating: stars on a scale -----------------------------------------------------------
is('five stars unless set', [ratingMax({}), ratingMax({ max: 10 }), ratingMax({ max: 3 }), ratingMax({ max: 99 })], [5, 10, 3, 5])
is('the scales offered', RATING_SCALES, [3, 5, 10])
is('stars as signs', [starsText(4, 5), starsText(0, 3), starsText(12, 10)], ['★★★★☆', '☆☆☆', '★★★★★★★★★★'])
const stars10 = { name: 'service', label: 'Service', type: 'rating', max: 10 }
is('a value within the scale', [coerce(stars10, 9), coerce(stars10, 11), coerce({ ...stars10, max: undefined }, 6), coerce(stars10, 2.5)], [9, undefined, undefined, undefined])
is('the message says the scale', needs(stars10), '1 to 10 stars')
is('a scale not offered is refused', fieldProblem({ ...stars10, max: 7 }, []), 'Stars run to 3, 5, 10.')
is('kept from storage only when offered', [cleanField(stars10).max, cleanField({ ...stars10, max: 7 }).max], [10, undefined])

// ---- percent: a share in a range -------------------------------------------------------------
is('0 to 100 unless set', [percentRange({}), percentRange({ min: -50, max: 50 }), percentRange({ max: 200 }), percentRange({ min: 10, max: 5 })],
  [{ min: 0, max: 100 }, { min: -50, max: 50 }, { min: 0, max: 200 }, { min: 10, max: 100 }])
const growth = { name: 'growth', label: 'Growth', type: 'percent', min: -100, max: 300 }
is('a value within the range', [coerce(growth, -20), coerce(growth, '250 %'), coerce(growth, 301), coerce({ name: 'p', label: 'P', type: 'percent' }, 101)], [-20, 250, undefined, undefined])
is('the message says the range', needs(growth), 'a share from -100 to 300')
is('a range upside down is refused', fieldProblem({ ...growth, min: 50, max: 10 }, []), 'The highest share must be above the lowest.')
is('kept from storage: the range, never the defaults', [cleanField(growth), cleanField({ name: 'p', label: 'P', type: 'percent', min: 0, max: 100 })],
  [{ name: 'growth', label: 'Growth', type: 'percent', min: -100, max: 300 }, { name: 'p', label: 'P', type: 'percent' }])

// ---- money: one currency --------------------------------------------------------------------
is('a list of real codes, the euro first', [CURRENCIES[0].code, CURRENCIES.every((c) => /^[A-Z]{3}$/.test(c.code)), isCurrency('GBP'), isCurrency('XXX')], ['EUR', true, true, false])
is('the field’s own currency, an older sign, the country’s, else the euro', [
  moneyCurrency({ currency: 'CHF' }), moneyCurrency({ unit: '€' }), moneyCurrency({ unit: '£' }), moneyCurrency({ unit: 'sek' }), moneyCurrency({}, 'GBP'), moneyCurrency({}),
], ['CHF', 'EUR', 'GBP', 'SEK', 'GBP', 'EUR'])
is('amounts in words', [moneyText(249.5, 'EUR'), moneyText(1200, 'JPY'), moneyText(12, 'CHF')], ['€249.50', 'JP¥1,200', 'CHF\u00a012.00'])
is('a currency’s sign', [currencySign('EUR'), currencySign('GBP'), currencySign('CHF')], ['€', '£', 'CHF'])
const cost = { name: 'cost', label: 'Cost', type: 'money', currency: 'GBP' }
is('an amount typed with its sign or code', [coerce(cost, '£12.50'), coerce(cost, '12,5'), coerce(cost, '40 GBP'), coerce(cost, 'twelve')], [12.5, 12.5, 40, undefined])
is('a currency not offered is refused', fieldProblem({ ...cost, currency: 'ABC' }, []), 'Pick a currency.')
is('kept from storage only when real', [cleanField(cost).currency, cleanField({ ...cost, currency: 'abc' }).currency], ['GBP', undefined])

// ---- timespan: a start and an end ---------------------------------------------------------------
is('minutes, across midnight too', [spanMinutes('08:30-12:15'), spanMinutes('22:00-06:30'), spanMinutes('9-10')], [225, 510, null])
is('minutes in words', [minutesText(45), minutesText(225), minutesText(120)], ['45 min', '3 h 45 min', '2 h'])

// ---- links -----------------------------------------------------------------------------------------
const garage = { name: 'garage', label: 'Garage', type: 'lookup', lookup: 'record', module: 'u_garage01' }
is('which list a link picks from', [linkKey(garage), linkKey({ ...garage, entity: 'bay' }), linkKey({ lookup: 'food' })], ['record:u_garage01', 'record:u_garage01:bay', 'food'])
const items = [{ id: 'g1', name: 'Van Dijk' }, { id: 'g2', name: 'Quick Fit', gone: true }]
is('a link says its name, "(deleted)", or "Deleted", never the id and never a crash', [linkText('g1', items), linkText('g2', items), linkText('g9', items), linkText('g9', undefined), linkText(null, items)],
  ['Van Dijk', 'Quick Fit (deleted)', 'Deleted', 'Deleted', ''])

// ---- in Stats and totals --------------------------------------------------------------------------------
const m = (f) => { const x = fieldMeasure(f); return x && [x.combine, x.unit, x.decimals] }
is('stars are averaged, of their scale', m({ type: 'rating', stats: 'sum', max: 10 }), ['mean', 'of 10', 1])
is('shares are averaged', m({ type: 'percent' }), ['mean', '%', 1])
is('money adds up in its currency, or averages when asked', [m({ type: 'money', currency: 'CHF' }), m({ type: 'money', unit: '€', stats: 'average' })], [['sum', 'CHF', 2], ['mean', 'EUR', 2]])
is('a start and end counts as minutes', m({ type: 'timespan' }), ['sum', 'min', 0])
is('a checklist, a photo and a link are only counted', [isMeasurable({ type: 'checklist' }), isMeasurable({ type: 'photo' }), isMeasurable({ type: 'lookup' })], [false, false, false])
is('what In Stats offers', [statsChoices({ type: 'rating' }), statsChoices({ type: 'money' }), statsChoices({ type: 'timespan' }), statsChoices({ type: 'checklist' })],
  [['average', 'count'], ['sum', 'average', 'count'], ['sum', 'average', 'count'], ['count']])
is('stars cannot be added up', fieldProblem({ name: 'r', label: 'R', type: 'rating', stats: 'sum' }, []), 'Stars and shares are averaged, not added up.')
is('a start and end may be added up', fieldProblem({ name: 't', label: 'T', type: 'timespan', stats: 'sum' }, []), null)
const tm = fieldMeasure({ type: 'timespan' })
is('a total of starts and ends', tm.text(combineValues(tm, ['08:30-12:15', '14:00-15:30', null, 'x'])), '5 h 15 min')
const mm = fieldMeasure(cost)
is('a money total in its own currency', mm.text(combineValues(mm, [12.5, '40', null])), '£52.50')
const rm = fieldMeasure({ type: 'rating' })
is('an average of stars', rm.text(combineValues(rm, [4, 5, 3])), '4 of 5')
is('nothing to count is nothing', combineValues(mm, [null, '']), null)
// Each money field is its own measure with its own currency, so two
// currencies are never one sum.
const ms = recordMeasures([{ name: 'item', label: 'Job', fields: [
  { name: 'day', label: 'Day', type: 'date' }, { name: 'eur', label: 'Parts', type: 'money', currency: 'EUR', stats: 'sum' },
  { name: 'gbp', label: 'Ferry', type: 'money', currency: 'GBP', stats: 'sum' }, { name: 'service', label: 'Service', type: 'rating', stats: 'average' },
  { name: 'share', label: 'Tyres', type: 'percent' }, { name: 'shop', label: 'Workshop', type: 'timespan', stats: 'sum' },
  { name: 'checks', label: 'Checks', type: 'checklist' }, { name: 'photo', label: 'Photo', type: 'photo' },
] }])
is('Stats: a measure a field, each in its own unit', ms.filter((x) => x.name !== 'item:count').map((x) => [x.name, x.unit, x.combine]),
  [['item:eur', 'EUR', 'sum'], ['item:gbp', 'GBP', 'sum'], ['item:service', 'of 5', 'mean'], ['item:shop', 'min', 'sum'], ['item:share', '%', 'mean']])

// ---- sorting and filtering ----------------------------------------------------------------------------
const spanF = { name: 'shop', label: 'Workshop', type: 'timespan' }
const recs = [{ id: 'a', values: { shop: '08:30-12:15' } }, { id: 'b', values: { shop: '14:00-15:30' } }, { id: 'c', values: {} }, { id: 'd', values: { shop: '22:00-06:30' } }]
is('a start and end in order of how long it lasts', sortRecs(recs, [spanF], { field: 'shop', dir: 'desc' }).map((r) => r.id), ['d', 'a', 'b', 'c'])
is('…in words that fit', sortDirs(spanF).map((d) => d.label), ['Longest first', 'Shortest first'])
is('filtered by minutes', recs.filter((r) => passesFilter(r, [spanF], { field: 'shop', op: 'gt', value: '120' })).map((r) => r.id), ['a', 'd'])
is('its filters', filterOps(spanF).map((o) => o.op), ['gt', 'lt', 'filled', 'empty'])
const money = [{ id: 'x', values: { cost: 12 } }, { id: 'y', values: { cost: 400 } }]
is('money sorts as a number', sortRecs(money, [cost], { field: 'cost', dir: 'desc' }).map((r) => r.id), ['y', 'x'])
is('a photo can be filtered by being there', filterOps({ type: 'photo' }).map((o) => o.label), ['is there', 'is missing'])

// ---- files: out and back -------------------------------------------------------------------------------
is('out: money, stars, a share and a span as they are kept', [cellValue(cost, 52.5), cellValue(stars10, 9), cellValue(growth, -20), cellValue(spanF, '08:30-12:15')], [52.5, 9, -20, '08:30-12:15'])
const names = { 'record:u_garage01': new Map([['g1', 'Van Dijk'], ['g2', 'Quick Fit (deleted)']]) }
is('out: a link by its name, a deleted one says so', [cellValue(garage, 'g1', names), cellValue(garage, 'g2', names)], ['Van Dijk', 'Quick Fit (deleted)'])
const ctx = { lookups: { 'record:u_garage01': items } }
is('back: a link by name or id; a deleted record is not linked again', [readCell(garage, 'van dijk', ctx), readCell(garage, 'g1', ctx).value, readCell(garage, 'Quick Fit', ctx).ok], [{ ok: true, value: 'g1' }, 'g1', false])
is('back: money with its sign or code', [readCell(cost, '£52.50').value, readCell(cost, '52.50 GBP').value], [52.5, 52.5])
is('back: stars outside the scale say the scale', readCell(stars10, '11').problem, 'Service: "11" is not 1 to 10 stars.')
is('back: a share outside the range says the range', readCell(growth, '400%').problem, 'Growth: "400%" is not a share from -100 to 300.')
const photoPath = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg'
is('back: a photo’s own name is kept; anything else is left empty, not an error', [readCell({ name: 'p', label: 'Photo', type: 'photo' }, photoPath).value, readCell({ name: 'p', label: 'Photo', type: 'photo' }, 'holiday.jpg')], [photoPath, { ok: true, value: null }])
is('back: a start and end', [readCell(spanF, '09:00–10:30').value, readCell(spanF, 'all morning').ok], ['09:00-10:30', false])
is('chart rows: a span as minutes, money in its currency, a share in %',
  statsRows([{ module: 'Car', date: '2026-10-05', fields: [spanF, cost, growth], values: { shop: '08:30-12:15', cost: 12, growth: 5 } }]).map((r) => [r.measure, r.value, r.unit]),
  [['Cost', 12, 'GBP'], ['Growth', 5, '%'], ['Workshop', 225, 'min']])

// ---- through a sync: the definition and the record as JSON ------------------------------------------------
const carDef = readBuiltDefinition({ key: 'u_car0001', name: 'Car', definition: { entities: [{ name: 'item', label: 'Job', fields: [
  { name: 'job', label: 'Job', type: 'text', required: true }, cost, stars10, growth, spanF, garage,
  { name: 'checks', label: 'Checks', type: 'checklist' }, { name: 'photo', label: 'Photo', type: 'photo' },
] }, { name: 'bay', label: 'Bay', fields: [{ name: 'name', label: 'Name', type: 'text' }, { name: 'job', label: 'Job', type: 'lookup', lookup: 'record', module: 'u_car0001' }] }] } })
const again = readBuiltDefinition({ key: 'u_car0001', name: 'Car', definition: JSON.parse(JSON.stringify(definitionFor(carDef))) })
is('a definition with every kind comes back the same through JSON', JSON.stringify(again.entities), JSON.stringify(carDef.entities))
const values = { job: 'Service', cost: 249.5, service: 9, growth: -20, shop: '08:30-12:15', garage: 'g1', checks: '- [x] Oil\n- [ ] Lights', photo: photoPath }
const kept = cleanValues(carDef.entities[0].fields, values)
const synced = cleanValues(carDef.entities[0].fields, JSON.parse(JSON.stringify(kept.data)))
is('a record with every kind comes back the same through JSON', [Object.keys(kept.errors).length, JSON.stringify(synced.data) === JSON.stringify(kept.data)], [0, true])

// ---- a design file -----------------------------------------------------------------------------------------
const file = designFile(carDef, builtNames([{ key: 'u_garage01', name: 'Garages' }, { key: 'u_old00001', name: 'Old', deleted_at: '2026-01-01' }, { key: 'nutrition', name: 'Food', builtin: true }]))
const linkOut = file.definition.entities[0].fields.find((f) => f.name === 'garage')
const selfOut = file.definition.entities[1].fields.find((f) => f.name === 'job')
is('out: a link keeps its module’s name; one to its own kind is marked', [linkOut.module_name, selfOut.module_self], ['Garages', true])
const text = JSON.stringify(file)
const theirs = readDesignFile(text, [{ key: 'u_theirs01', name: 'garages' }])
const field = (r, e, n) => r.def.entities[e].fields.find((f) => f.name === n)
is('in: the link finds their module of the same name', [field(theirs, 0, 'garage').type, field(theirs, 0, 'garage').module], ['lookup', 'u_theirs01'])
is('in: a link to its own kind follows the module', field(theirs, 1, 'job').module, IMPORT_KEY)
const same = readDesignFile(text, [{ key: 'u_garage01', name: 'Renamed' }])
is('in: the same module (one’s own file) by its key', field(same, 0, 'garage').module, 'u_garage01')
const none = readDesignFile(text, [])
is('in: no such module, the field stays as text of the same name', [field(none, 0, 'garage').type, field(none, 0, 'garage').label], ['text', 'Garage'])
is('in: every kind’s settings come back', [field(none, 0, 'cost').currency, field(none, 0, 'service').max, field(none, 0, 'growth').min, field(none, 0, 'shop').type, field(none, 0, 'photo').type], ['GBP', 10, -100, 'timespan', 'photo'])

// ---- a photo goes with its record ----------------------------------------------------------------------------
const day = 86_400_000
const now = Date.parse('2026-10-07T12:00:00Z')
const known = new Map([['22222222-2222-4222-8222-222222222222', { deleted_at: new Date(now - 2 * day).toISOString() }]])
is('a deleted record’s photo goes after a day (Undo keeps it until then)', photosToRemove([{ path: photoPath, created_at: new Date(now - 5 * day).toISOString() }], known, new Set(), now), [photoPath])
is('a live record’s photo stays', photoRefs(carDef.entities[0].fields, [{ data: { photo: photoPath } }]).has(photoPath), true)

void cleanFields
console.log(fail ? `\n${fail} failed` : '\nAll field kind checks passed')
process.exit(fail ? 1 : 0)
