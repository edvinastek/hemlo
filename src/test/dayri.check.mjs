// The day's share of the reference intake (FOOD-06): src/lib/day-ri-rules.ts.
import { dayRi, riLine } from '../lib/day-ri-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const oats = { id: 'oats', kcal: 370, fat_g: 7, sat_fat_g: 1.2, carbs_g: 60, sugars_g: 1, protein_g: 13, sodium_mg: 4 }
const milk = { id: 'milk', kcal: 46, fat_g: 1.5, sat_fat_g: 1, carbs_g: 4.7, sugars_g: 4.7, protein_g: 3.5, salt_g: 0.1 }
const odd = { id: 'odd', kcal: 100, fat_g: 1, carbs_g: 10, protein_g: 5 } // no saturates, sugars or salt
const foods = new Map([oats, milk, odd].map((f) => [f.id, f]))
const lines = new Map([['porridge', [
  { recipe_id: 'porridge', food_id: 'oats', grams_per_portion: 50 },
  { recipe_id: 'porridge', food_id: 'milk', grams_per_portion: 250 },
]]])

const one = dayRi([{ food_id: 'oats', grams: 100 }], foods, lines)
is('100 g of oats: its own figures', [one.total.kcal, one.total.fat_g, one.total.protein_g], [370, 7, 13])
is('salt worked out from sodium (4 mg is 0.01 g)', one.total.salt_g, 0.01)
is('energy is 19% of 2,000 kcal', riLine(one).startsWith('energy 19%'), true)
is('protein 26% of 50 g', riLine(one).includes('protein 26%'), true)

const recipe = dayRi([{ recipe_id: 'porridge', portion_multiplier: 2 }], foods, lines)
is('a recipe counts its lines, times the portions', Math.round(recipe.total.kcal), Math.round(2 * (185 + 115)))
// 50 g oats: 0.01 g salt per 100 g (from 4 mg sodium) is 0.005 g; 250 g milk at 0.1 g is 0.25 g; two portions.
is('a recipe’s salt: oats from sodium, milk as stated', Math.round(recipe.total.salt_g * 1000) / 1000, 0.51)

const skipped = dayRi([{ food_id: 'oats', grams: 100, status: 'skipped' }], foods, lines)
is('a skipped item is not eaten', [skipped.total.kcal, riLine(skipped)], [0, null])

const mixed = dayRi([{ food_id: 'oats', grams: 100 }, { food_id: 'odd', grams: 100 }], foods, lines)
is('a food without a figure is counted as missing', [mixed.missing.sat_fat_g, mixed.missing.kcal], [1, 0])
is('the line says "at least" where something was missing', riLine(mixed).includes('saturates at least 6%'), true)

const quick = dayRi([{ kcal: 500, protein_g: 20, carbs_g: 50, fat_g: 20 }], foods, lines)
is('a quick entry gives its own four numbers', [quick.total.kcal, quick.total.fat_g], [500, 20])
is('a quick entry alone: only what it gave is shown', riLine(quick), 'energy 25% · fat 29% · carbohydrate 19% · protein 40%')

const unknown = dayRi([{ food_id: 'gone', grams: 100 }], foods, lines)
is('a food not on this device is unknown, never nothing', [unknown.missing.kcal, riLine(unknown)], [1, null])
is('an empty day has no line', riLine(dayRi([], foods, lines)), null)

console.log(fail ? `\n${fail} failed` : '\nAll day %RI checks passed')
process.exit(fail ? 1 : 0)
