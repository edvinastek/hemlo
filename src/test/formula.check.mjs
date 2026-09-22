import { evaluateFormula, checkFormula } from '../modules/formula.ts'
let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${ok ? '' : ` (wanted ${JSON.stringify(want)})`}`)
}
is('arithmetic', evaluateFormula('2 + 3 * 4', {}), 14)
is('parentheses', evaluateFormula('(2 + 3) * 4', {}), 20)
is('fields', evaluateFormula('grams * kcal / 100', { grams: 150, kcal: 82 }), 123)
is('packs rounds up', evaluateFormula('ceil((needed_g - from_stock_g) / pack_size_g)', { needed_g: 450, from_stock_g: 200, pack_size_g: 500 }), 1)
is('clock times', evaluateFormula('hours_between(went_to_bed, woke_at)', { went_to_bed: '22:30', woke_at: '06:00' }), 7.5)
is('divide by zero is not a number', evaluateFormula('1 / 0', {}), null)
is('unary minus', evaluateFormula('-weight + 10', { weight: 4 }), 6)
is('missing field reads as zero', evaluateFormula('a + 1', {}), 1)
// The point of parsing rather than eval: page internals are unreachable.
is('no property access', evaluateFormula('window.document', {}), null)
is('no calls out', evaluateFormula('fetch(1)', {}), null)
is('editor catches a typo', checkFormula('gramz * 2', ['grams']), 'There is no field called "gramz".')
is('editor passes a good one', checkFormula('grams * 2', ['grams']), null)
console.log(fail ? `\n${fail} failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
