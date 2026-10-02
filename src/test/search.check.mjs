// The one search every list and picker uses (search-rules.ts).
import { search, fold, words, matches } from '../lib/search-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}
const items = ['Chicken breast', 'Breast of chicken, roasted', 'Chickpeas', 'Onion', 'Onion Spring', 'Crème fraîche', 'Red onion']
  .map((name) => ({ name }))
const names = (r) => r.map((x) => x.name)
eq('accents and case do not matter', fold('Crème Fraîche'), 'creme fraiche')
eq('words', words('  chicken,  BREAST '), ['chicken', 'breast'])
eq('every word, any order (the one starting with the first word first)', names(search(items, 'breast chicken')), ['Breast of chicken, roasted', 'Chicken breast'])
eq('starts-with first, then plainer names', names(search(items, 'onion')), ['Onion', 'Onion Spring', 'Red onion'])
eq('a word inside a name counts', names(search(items, 'spring')), ['Onion Spring'])
eq('accents in the query too', names(search(items, 'creme')), ['Crème fraîche'])
eq('nothing typed: A to Z', names(search(items, '')).slice(0, 3), ['Breast of chicken, roasted', 'Chicken breast', 'Chickpeas'])
eq('own things first', names(search([{ name: 'Oats' }, { name: 'Oat milk', mine: true }], 'oat')), ['Oat milk', 'Oats'])
eq('extra text is searched', matches({ name: 'Hagelslag', extra: 'De Ruijter Albert Heijn' }, words('ruijter')), true)
eq('no match is empty', search(items, 'banana'), [])
console.log(fail ? `\n${fail} failed` : '\nall passed')
process.exit(fail ? 1 : 0)
