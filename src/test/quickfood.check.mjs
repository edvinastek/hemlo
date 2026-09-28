// Checks the maths of meals entered as plain numbers, and which figures the
// food pages and Today show for the nutrients a person chose.
import {
  num, factor, readQuick, formFrom, isQuick, quickMacros, quickTitle,
  shownNutrients, amountLine, metricLine, EMPTY_FORM, quickFromFood, quickAmount,
} from '../lib/quick-food.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}
const form = (change) => ({ ...EMPTY_FORM, ...change })

// Reading what was typed.
is('a comma decimal reads as a point', num('12,5'), 12.5)
is('empty is unknown, not zero', num('  '), null)
is('text is unknown', num('abc'), null)

// Calories: a total, or per a size with the grams eaten.
is('a total is taken as it is', readQuick(form({ kcal: '450' })),
  { entry: { label: null, kcal: 450, grams: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null } })
is('per 100 g with 180 g eaten', readQuick(form({ basis: '100', kcal: '250', grams: '180' })).entry?.kcal, 450)
is('per 25 g with 60 g eaten', readQuick(form({ basis: '25', kcal: '120', grams: '60' })).entry?.kcal, 288)
is('per 30 g portion, 45 g eaten', readQuick(form({ basis: '30', kcal: '110', grams: '45' })).entry?.kcal, 165)
is('per a portion of 40 g, 100 g eaten', readQuick(form({ basis: 'portion', portion_g: '40', kcal: '200', grams: '100' })).entry?.kcal, 500)
is('grams eaten are kept', readQuick(form({ basis: '100', kcal: '250', grams: '180' })).entry?.grams, 180)
is('the factor is grams over the size', factor({ basis: '100', portion_g: '', grams: '150' }), 1.5)
is('no factor until the grams are there', factor({ basis: '100', portion_g: '', grams: '' }), null)

// Macros: optional, scaled like the calories, unknown stays unknown.
const m = readQuick(form({ basis: '100', kcal: '250', grams: '200', protein_g: '10,5', fat_g: '' })).entry
is('a macro per 100 g is scaled to what was eaten', m?.protein_g, 21)
is('a macro left empty stays unknown', m?.fat_g, null)
is('macros with a total are totals', readQuick(form({ kcal: '450', carbs_g: '40' })).entry?.carbs_g, 40)

// What stops it saving.
is('calories are required', readQuick(form({ protein_g: '30' })), { error: 'Calories are needed.' })
is('per 100 g needs the grams eaten', readQuick(form({ basis: '100', kcal: '250' })), { error: 'Say how many grams were eaten.' })
is('a portion needs its size', readQuick(form({ basis: 'portion', kcal: '200', grams: '100' })), { error: 'Say how many grams one portion is.' })
is('no negative calories', 'error' in readQuick(form({ kcal: '-5' })), true)
is('no negative macros', 'error' in readQuick(form({ kcal: '100', fat_g: '-1' })), true)
is('more than the database holds is refused', 'error' in readQuick(form({ basis: '100', kcal: '900', grams: '5000' })), true)
is('zero calories is allowed (black coffee)', readQuick(form({ kcal: '0' })).entry?.kcal, 0)

// The label.
is('the label is tidied', readQuick(form({ kcal: '450', label: '  cheese   sandwich ' })).entry?.label, 'cheese sandwich')
is('a long label is cut to what the database holds', readQuick(form({ kcal: '1', label: 'x'.repeat(200) })).entry?.label.length, 120)

// Stored and read back.
const entry = readQuick(form({ basis: '100', kcal: '250', grams: '180', protein_g: '12', label: 'Wrap' })).entry
is('a stored entry reads back as its totals', readQuick(formFrom(entry)).entry, entry)
is('numbers from the server read back too', formFrom({ kcal: 450, grams: null, label: null }).kcal, '450')

// Which rows are quick entries.
is('own calories and no recipe is quick', isQuick({ recipe_id: null, kcal: 450 }), true)
is('zero calories is still quick', isQuick({ recipe_id: null, kcal: 0 }), true)
is('a recipe is not', isQuick({ recipe_id: 'r1', kcal: null }), false)
is('an empty slot is not', isQuick({ recipe_id: null, kcal: null }), false)
is('a catalogue food log is not', isQuick({ food_id: 'f1', kcal: null }), false)
is('unknown macros add up as zero', quickMacros({ kcal: '450', protein_g: null, fat_g: 12 }),
  { kcal: 450, protein_g: 0, carbs_g: 0, fat_g: 12, fiber_g: 0 })

// The meal's task title.
is('with a name', quickTitle('Lunch', { label: 'sandwich', kcal: 450 }), 'Lunch: sandwich · 450 kcal')
is('without one', quickTitle('Snack', { label: null, kcal: 212.4 }), 'Snack · 212 kcal')

// What is shown.
is('calories alone by default', shownNutrients({ nutrients: ['kcal'] }), ['kcal'])
is('tracked ones follow, in the app’s order', shownNutrients({ nutrients: ['fiber_g', 'protein_g'] }), ['kcal', 'protein_g', 'fiber_g'])
is('calories even when not ticked', shownNutrients({ nutrients: [] }), ['kcal'])
is('a meal line names only what is shown', amountLine({ kcal: 450.4, protein_g: 30, fiber_g: 6 }, ['kcal', 'fiber_g']), '450 kcal · 6 g fibre')
is('no protein unless tracked', amountLine({ kcal: 450, protein_g: 30 }, ['kcal']), '450 kcal')

const eaten = { kcal: 1200.4, protein_g: 40, carbs_g: 0, fat_g: 0, fiber_g: 0 }
const target = { kcal: 2600, protein_g: 150, carbs_g: null }
is('calories against the target', metricLine('kcal', eaten, target), { text: '1200 / 2600 kcal', share: 1200 / 2600 })
is('protein when chosen', metricLine('protein_g', eaten, target)?.text, 'Protein 40 / 150 g')
is('without a target, only what was eaten and no bar', metricLine('kcal', eaten, null), { text: '1200 kcal', share: null })
is('a nutrient with no target figure has no bar', metricLine('carbs_g', eaten, target), { text: 'Carbs 0 g', share: null })
is('nothing when none', metricLine('none', eaten, target), null)
is('the bar stops at full', metricLine('kcal', { kcal: 3000 }, target)?.share, 1)

// A meal from a food, in grams or one of its units (022).
const eggFood = { name: 'Egg Chicken', kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5, fiber_g: null }
is('two eggs of 50 g', quickFromFood(eggFood, { grams: 100, unit: 'egg', unit_qty: 2 }), { entry: {
  label: 'Egg Chicken', kcal: 143, grams: 100, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5, fiber_g: null, unit: 'egg', unit_qty: 2,
} })
is('in grams, no unit kept', 'unit' in quickFromFood(eggFood, { grams: 50, unit: null, unit_qty: null }).entry, false)
is('half the grams, half the calories', quickFromFood(eggFood, { grams: 50, unit: null, unit_qty: null }).entry.kcal, 72)
is('a food without calories', 'error' in quickFromFood({ name: 'Mystery', kcal: null }, { grams: 50, unit: null, unit_qty: null }), true)
is('no amount', 'error' in quickFromFood(eggFood, null), true)
is('the task says how many', quickTitle('Breakfast', { label: 'Egg Chicken', kcal: 143, unit: 'egg', unit_qty: 2 }), 'Breakfast: Egg Chicken, 2 eggs · 143 kcal')
is('the amount shown', [quickAmount({ grams: 100, unit: 'egg', unit_qty: 2 }), quickAmount({ grams: 180 }), quickAmount({})], ['2 eggs (100 g)', '180 g', null])

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
