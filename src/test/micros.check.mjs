// Checks vitamins and minerals (FOOD-17) and supplements that count towards
// them (SUP-07): the Annex XIII list and its NRVs, reading stored figures
// (unknown is never 0), % of the NRV, a food, a recipe, a day with a
// supplement ticked, the day's line, typed figures, and the stats measures.
import {
  MICROS, MICRO_CODES, readMicros, microOf, nrvPercent, microText, readMicroChoice, dayMicros, microsLine, partsMicros,
  readMicroForm, readMicroText, microTexts, sameMicros, storedMicros, doseText, withMicroFigures, measureCode, microMeasure,
} from '../lib/micros-rules.ts'
import { extraFigures, measureCatalogue, MICRO_FIGURE_NAMES } from '../lib/stats-builder-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// The list: Regulation (EU) No 1169/2011, Annex XIII part A.
is('all 27 vitamins and minerals of the annex', MICROS.length, 27)
is('codes are unique', new Set(MICRO_CODES).size, 27)
const nrv = Object.fromEntries(MICROS.map((m) => [m.code, `${m.nrv} ${m.unit}`]))
is('vitamin NRVs as the annex gives them', [nrv.va, nrv.vd, nrv.ve, nrv.vk, nrv.vc, nrv.b1, nrv.b2, nrv.b3, nrv.b6, nrv.b9, nrv.b12, nrv.b7, nrv.b5],
  ['800 µg', '5 µg', '12 mg', '75 µg', '80 mg', '1.1 mg', '1.4 mg', '16 mg', '1.4 mg', '200 µg', '2.5 µg', '50 µg', '6 mg'])
is('mineral NRVs as the annex gives them', [nrv.k, nrv.cl, nrv.ca, nrv.p, nrv.mg, nrv.fe, nrv.zn, nrv.cu, nrv.mn, nrv.f, nrv.se, nrv.cr, nrv.mo, nrv.i],
  ['2000 mg', '800 mg', '800 mg', '700 mg', '375 mg', '14 mg', '10 mg', '1 mg', '2 mg', '3.5 mg', '55 µg', '40 µg', '50 µg', '150 µg'])
is('NEVO publishes 20 of them', MICROS.filter((m) => m.nevo).length, 20)

// Reading stored figures.
is('known codes kept, a 0 kept', readMicros({ vd: 2.5, fe: 0, xx: 4 }), { vd: 2.5, fe: 0 })
is('odd values are unknown, never 0', readMicros({ vd: 'abc', fe: -1, ca: null, k: 2e6, mg: '12' }), { mg: 12 })
is('not an object is nothing', [readMicros(null), readMicros([1, 2]), readMicros('x')], [{}, {}, {}])
is('one figure of a food, null when unknown', [microOf({ micros: { vd: 1.2 } }, 'vd'), microOf({ micros: { vd: 1.2 } }, 'fe'), microOf({}, 'vd')], [1.2, null, null])

// % of the NRV.
is('vitamin D 2.5 µg is 50% of 5 µg', nrvPercent('vd', 2.5), 50)
is('iron 7 mg is 50%', nrvPercent('fe', 7), 50)
is('no amount, no percent', nrvPercent('fe', null), null)
is('amounts rounded to three figures in their unit', [microText('vc', 14), microText('b1', 0.123456), microText('k', 2450.4), microText('vd', 0), microText('vd', null)],
  ['14 mg', '0.123 mg', '2,450 mg', '0 µg', '–'])

// The choice.
is('the choice in the annex’s order, odd ones left out', readMicroChoice(['fe', 'vd', 'zz', 'ca']), ['vd', 'ca', 'fe'])
is('none by default', readMicroChoice(undefined), [])

// A recipe: lines with a food, raw grams for a portion.
const potato = { micros: { vc: 14, k: 450, fe: 0.5 } }
const milk = { micros: { vd: 0, ca: 120, k: 150 } }
const parts = [{ food: potato, grams: 200 }, { food: milk, grams: 100 }, { food: undefined, grams: 50 }]
const r = partsMicros(parts, ['vc', 'ca', 'k'], 1)
is('a recipe sums its lines: vitamin C, calcium, potassium', [r.total.vc, r.total.ca, r.total.k], [28, 120, 1050])
is('a line whose food lacks a figure makes it "at least"', [r.missing.vc, r.missing.ca, r.missing.k ?? 0], [1, 1, 0])
is('two portions are twice one', partsMicros(parts, ['k'], 2).total.k, 2100)

// A day: foods, a recipe, a quick entry, a skipped item, a supplement ticked.
const foods = new Map([['potato', potato], ['milk', milk]])
const recipes = new Map([['mash', parts]])
const items = [
  { food_id: 'potato', grams: 100 },
  { recipe_id: 'mash', portion_multiplier: 0.5 },
  { food_id: 'milk', grams: 200, status: 'skipped' },
  { kcal: 300 },
]
const doses = [{ amounts: { vd: 25, ca: 200 } }]
const day = dayMicros(items, foods, recipes, doses, ['vd', 'vc', 'ca', 'k'])
is('the day: food + half the recipe + the dose; skipped left out', [day.total.vd, day.total.vc, day.total.ca, day.total.k], [25, 28, 260, 975])
is('a quick entry leaves every figure "at least"', [day.missing.vc, day.missing.k], [2, 1])
is('the day’s line, in the order chosen', microsLine(day, ['vd', 'ca', 'k']), 'Vitamin D at least 500% · Calcium at least 33% · Potassium at least 49%')
is('nothing chosen, nothing summed', JSON.stringify(dayMicros(items, foods, recipes, doses, [])), JSON.stringify({ total: {}, missing: {} }))
is('a figure nothing gave is left out of the line', microsLine(dayMicros([{ kcal: 100 }], foods, recipes, [], ['vd']), ['vd']), null)
is('a supplement alone still gives a line', microsLine(dayMicros([], foods, recipes, doses, ['vd']), ['vd']), 'Vitamin D 500%')

// Typed figures (a label, a dose).
is('a comma is a point', readMicroText('2,5'), 2.5)
is('empty is unknown', readMicroText('  '), null)
is('words are refused', readMicroText('lots'), 'bad')
is('a form reads to figures, empty left out', readMicroForm({ vd: '25', fe: '', ca: '0' }), { micros: { vd: 25, ca: 0 } })
is('a bad figure says which', readMicroForm({ fe: 'x' }), { error: 'Iron: a number in mg, like 2.5, or leave it empty.' })
is('figures back to texts', microTexts({ vd: 25, fe: 0 }), { vd: '25', fe: '0' })
is('same figures in another order are the same', [sameMicros({ vd: 1, fe: 2 }, { fe: 2, vd: 1 }), sameMicros({ vd: 1 }, { vd: 1, fe: 0 }), sameMicros(null, {})], [true, false, true])
is('none is stored as null', [storedMicros({}), storedMicros({ vd: 1 })], [null, { vd: 1 }])
is('a dose in words', doseText({ ca: 200, vd: 25 }), 'Vitamin D 25 µg · Calcium 200 mg')

// The stats (additive measures): only the ones shown, read from the food row.
is('a measure key and back', [microMeasure('vd'), measureCode('m_vd'), measureCode('m_zz'), measureCode('kcal')], ['m_vd', 'vd', null, null])
is('a food row with flat figures for the stats', (({ m_vd, m_fe }) => [m_vd, m_fe])(withMicroFigures({ micros: { vd: 2, fe: 0 } })), [2, 0])
is('extra figures: label ones first, then vitamins and minerals shown', extraFigures(['m_fe', 'salt_g', 'm_vd', 'nonsense']), ['salt_g', 'm_vd', 'm_fe'])
is('every vitamin and mineral has a measure name', Object.keys(MICRO_FIGURE_NAMES).length, 27)
const cat = measureCatalogue([{ key: 'nutrition', name: 'Nutrition' }], ['kcal'], { figures: ['m_vd'] })
const vd = cat.find((m) => m.key === 'nutrition:m_vd')
is('Vitamin D eaten is offered when shown, in µg, with a decimal', [vd?.label, vd?.unit, vd?.decimals], ['Vitamin D eaten', 'µg', 1])
is('and its planned twin', cat.some((m) => m.key === 'nutrition:planned_m_vd'), true)
is('not offered when not shown', measureCatalogue([{ key: 'nutrition', name: 'Nutrition' }], ['kcal'], {}).some((m) => m.key.includes('m_')), false)

console.log(fail ? `\n${fail} failed` : '\nAll vitamin and mineral checks passed')
process.exit(fail ? 1 : 0)
