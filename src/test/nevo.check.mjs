// Checks the NEVO import (scripts/import-nevo.mjs) on a small made-up file in
// NEVO's own layout (scripts/fixtures/nevo-fixture.csv; its foods and figures
// are invented for this test): the file is read as published (quotes, '|',
// CRLF, a byte-order mark, decimal commas), every value lands unchanged, an
// empty cell stays empty, per 100 ml is kept, and Visuma's additions (display
// names, state, units) are marked as additions. Then the real catalogue in
// migration 027 is checked for the same rules.
import { readFileSync } from 'node:fs'
import {
  readNevo, parseDelimited, nevoNumber, foodRow, nevoId, compact, plan, generatedSql, withGenerated, BEGIN, END, MIGRATION,
  MICRO_COLUMNS, MICROS_MIGRATION, MICROS_BEGIN, MICROS_END, microsSql, missingMicroColumns,
} from '../../scripts/import-nevo.mjs'
import { MICROS, readMicros } from '../lib/micros-rules.ts'
import { displayName, stateOf, REPLACES, KEEP, NEVO_ATTRIBUTION, PORTIE } from '../../scripts/nevo-additions.mjs'
import { saltOf, NEVO_ATTRIBUTION as APP_ATTRIBUTION } from '../lib/eu-label-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const throws = (label, fn) => {
  let threw = false
  try { fn() } catch { threw = true }
  if (!threw) fail++
  console.log(`${threw ? 'ok  ' : 'FAIL'}  ${label}`)
}

// Reading the layout.
is('a quoted value with a doubled quote', parseDelimited('"a ""b"""|c\r\n'), [['a "b"', 'c']])
is('CRLF and LF both end a line', parseDelimited('a|b\r\nc|d\ne|f'), [['a', 'b'], ['c', 'd'], ['e', 'f']])
is('an empty cell is kept as empty', parseDelimited('a||c\r\n'), [['a', '', 'c']])
is('a decimal comma is a point', nevoNumber('1,8'), 1.8)
is('a whole number', nevoNumber('3700'), 3700)
is('an empty cell is unknown, not 0', nevoNumber(''), null)
throws('a cell that is not a number is refused, never guessed', () => nevoNumber('1.8.2'))

const fixture = readNevo(readFileSync(new URL('../../scripts/fixtures/nevo-fixture.csv', import.meta.url), 'utf8'))
is('three foods in the fixture', fixture.length, 3)
const [one, drink, oil] = fixture
is('the code', one.code, 90001)
is('the Dutch name as published', one.nl, 'Testvoedsel een rauw')
is('the English name as published', one.en, 'Testfood one raw')
is('synonyms as published', one.synonyms, 'Testje')
is('the remark as published', one.note, 'Een opmerking.')
is('a remark with quotes in it', oil.note, 'Zegt "iets".')
is('the version', one.version, 'NEVO-Online 2025 9.0')
is('every value unchanged', one.values, {
  kj: 1000, kcal: 239, protein_g: 10.5, fat_g: 12.3, sat_fat_g: 4.1, mufa_g: 5, pufa_g: 2.2, carbs_g: 20, sugars_g: 3.4,
  starch_g: 16.6, polyols_g: null, fiber_g: 2.5, alcohol_g: 0, sodium_mg: 450, organic_acid_g: null,
})
is('an empty polyols cell stays unknown', one.values.polyols_g, null)
is('per 100 ml read from the quantity', [one.per_ml, drink.per_ml], [false, true])
is('a value written without quotes is read the same', drink.values.kcal, 40)
throws('a file missing a nutrient column is refused', () => readNevo('"NEVO-code"|"Food group"\r\n1|x\r\n'))

// Vitamins and minerals (FOOD-17): read as published, empty stays unknown.
is('vitamin D and iron as published', one.micros, { vd: 1.5, k: 300, fe: 2.1 })
is('an empty cell is left out (unknown), a 0 is kept', [drink.micros, oil.micros], [{ k: 5, fe: 0 }, { vd: 0, k: 0 }])
is('the fixture lacks most micronutrient columns, and says which',
  missingMicroColumns(readFileSync(new URL('../../scripts/fixtures/nevo-fixture.csv', import.meta.url), 'utf8')).length, Object.keys(MICRO_COLUMNS).length - 3)
throws('a micronutrient column in another unit is refused', () => readNevo(readFileSync(new URL('../../scripts/fixtures/nevo-fixture.csv', import.meta.url), 'utf8').replace('VITD (µg)', 'VITD (mg)')))
is('the catalogue row (migration 027) is untouched by them', 'micros' in foodRow(one) || 'vd' in foodRow(one), false)
is('every column read is a code the app knows, in the app’s unit',
  Object.entries(MICRO_COLUMNS).every(([nevo, [code, unit]]) => MICROS.some((m) => m.code === code && m.unit === unit && m.nevo === nevo)), true)
is('every vitamin or mineral the app reads from NEVO is read by the import',
  MICROS.filter((m) => m.nevo).every((m) => MICRO_COLUMNS[m.nevo]?.[0] === m.code), true)
const fixtureMicros = microsSql(fixture)
is('the micros part has its markers', [fixtureMicros.startsWith(MICROS_BEGIN), fixtureMicros.endsWith(MICROS_END)], [true, true])
is('it is set by NEVO code, on shared rows, only where it differs',
  [/f\.nevo_code = \(e->>0\)::int/.test(fixtureMicros), /f\.owner_id is null/.test(fixtureMicros), /is distinct from e->1/.test(fixtureMicros)], [true, true, true])
is('its data reads back as [code, figures]', JSON.parse(fixtureMicros.slice(fixtureMicros.indexOf('$nevo$[') + 6, fixtureMicros.indexOf(']$nevo$') + 1)),
  [[90001, { vd: 1.5, k: 300, fe: 2.1 }], [90002, { k: 5, fe: 0 }], [90003, { vd: 0, k: 0 }]])

// The row the catalogue gets.
const row = foodRow(one)
is('the id is the same every run', [row.id, nevoId(90001)], [nevoId(90001), nevoId(90001)])
is('ids of different foods differ', nevoId(90001) === nevoId(90002), false)
is('the id is a version 5 UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id), true)
is('the published names stay beside the display name', [row.name_nl, row.name_en], ['Testvoedsel een rauw', 'Testfood one raw'])
is('sodium kept in mg as published; salt is worked out where shown', [row.sodium_mg, row.salt_g, saltOf(row)], [450, undefined, 1.125])
is('the state read from the name (an addition)', row.state, 'raw')
is('a drink keeps its per 100 ml', foodRow(drink).per_ml, true)
// The tag for the app's own additions is "GetIt", the name it had when the catalogue was made (applied migrations).
is('an oil gets spoons, marked as the app’s own', foodRow(oil).units.map((u) => `${u.name}:${u.source}`), ['tbsp:GetIt', 'tsp:GetIt'])
is('empty fields are left out of the data', 'polyols_g' in compact(row), false)
is('a known zero is kept', compact(row).alcohol_g, 0)

// Display names (additions): short words spelt out, the Dutch word order
// turned round, the state after a comma. The published names never change.
is('w and wo', displayName('Apple wo skin av'), 'Apple without skin average')
is('the kind after the sort', displayName('Oil olive'), 'Olive oil')
is('state after a comma', displayName('Cabbage red raw'), 'Red cabbage, raw')
is('a proper name keeps its capital', displayName('Cheese Gouda 48+ av'), 'Gouda cheese 48+ average')
is('no swap before a state word', displayName('Potatoes raw'), 'Potatoes, raw')
is('no swap when the second word is a food itself', displayName('Rice drink wo sugar'), 'Rice drink without sugar')
is('a name said another way', displayName('Peas chick boiled'), 'Chickpeas, boiled')
is('British spelling', displayName('Yogurt Greek skimmed'), 'Greek yoghurt skimmed')
is('state: boiled is cooked', stateOf('Rice brown boiled'), 'cooked')
is('state: tinned', stateOf('Tuna in water tinned'), 'canned')
is('state: dried', stateOf('Apricots dried'), 'dried')
is('state: soaked dried fruit is not dried', stateOf('Prunes dried soaked in water'), 'raw')
is('state: frozen, unprepared', stateOf('Spinach cut frozen unprepared'), 'frozen')

// The generated part of the migration.
const fixturePlan = plan(fixture, [])
const fixtureSql = generatedSql({ ...fixturePlan, hidden: ['Old food'] })
is('the generated part starts and ends with its markers', [fixtureSql.startsWith(BEGIN), fixtureSql.endsWith(END)], [true, true])
const jsonPart = fixtureSql.slice(fixtureSql.indexOf('$nevo$[') + 6, fixtureSql.indexOf(']$nevo$') + 1)
is('the data inside is JSON a check can read back', JSON.parse(jsonPart).map((r) => r.nevo_code), [90001, 90002, 90003])
is('a row is rewritten only when it changed', /is distinct from/.test(fixtureSql), true)
is('replacing the generated part keeps the rest', withGenerated(`a\n${BEGIN}\nold\n${END}\nb`, 'NEW'), 'a\nNEW\nb')
throws('a migration without markers is refused', () => withGenerated('nothing here', 'NEW'))

// The real catalogue, as migration 027 carries it.
const sql = readFileSync(MIGRATION, 'utf8')
const data = JSON.parse(sql.slice(sql.indexOf('$nevo$[') + 6, sql.indexOf(']$nevo$') + 1))
is('every NEVO-online 2025/9.0 food is in the catalogue', data.length, 2328)
is('NEVO codes are unique', new Set(data.map((r) => r.nevo_code)).size, data.length)
is('ids are worked out from the code', data.every((r) => r.id === nevoId(r.nevo_code)), true)
is('display names are unique', new Set(data.map((r) => r.name.toLowerCase())).size, data.length)
is('kept old foods do not take a NEVO food’s name', Object.values(KEEP).filter((n) => data.some((r) => r.name.toLowerCase() === n.toLowerCase())), [])
is('every replacement points at a food in the catalogue', Object.values(REPLACES).every((c) => data.some((r) => r.nevo_code === c)), true)
is('every published name is kept', data.every((r) => r.name_nl && r.name_en), true)
is('units carry where their weight came from', data.flatMap((r) => r.units ?? []).every((u) => u.source === PORTIE || u.source === 'GetIt'), true)
is('the migration says which version it is', sql.includes("'NEVO-online 2025/9.0'"), true)
is('the app and the import use the same attribution', APP_ATTRIBUTION, NEVO_ATTRIBUTION)
is('the attribution is NEVO’s own wording', NEVO_ATTRIBUTION, 'Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven')
is('the raw NEVO files are not in the repository', (() => { try { readFileSync(new URL('../../scripts/fixtures/NEVO2025_v9.0.csv', import.meta.url)); return 'there' } catch { return 'absent' } })(), 'absent')

// The real vitamins and minerals, as migration 036 carries them.
const sql36 = readFileSync(MICROS_MIGRATION, 'utf8')
const part36 = sql36.slice(sql36.indexOf(MICROS_BEGIN), sql36.indexOf(MICROS_END))
const micros36 = JSON.parse(part36.slice(part36.indexOf('$nevo$[') + 6, part36.indexOf(']$nevo$') + 1))
const codes = new Set(data.map((r) => r.nevo_code))
is('vitamins and minerals for (nearly) every NEVO food', micros36.length > 2300, true)
is('each is a food in the catalogue, once', [micros36.every(([c]) => codes.has(c)), new Set(micros36.map(([c]) => c)).size === micros36.length], [true, true])
is('every figure is a known code with a plain number, read back whole',
  micros36.every(([, m]) => Object.keys(readMicros(m)).length === Object.keys(m).length), true)
is('only codes NEVO publishes', [...new Set(micros36.flatMap(([, m]) => Object.keys(m)))].every((k) => Object.values(MICRO_COLUMNS).some(([c]) => c === k)), true)
is('raw potatoes as NEVO publishes them (vitamin C 14 mg, potassium 450 mg, iron 0.5 mg; no vitamin K given)',
  (([, m]) => [m.vc, m.k, m.fe, 'vk' in m])(micros36.find(([c]) => c === 1)), [14, 450, 0.5, false])
is('the micros file is a sane size (under 600 kB)', sql36.length < 600_000, true)

console.log(fail ? `\n${fail} failed` : '\nAll NEVO import checks passed')
process.exit(fail ? 1 : 0)
