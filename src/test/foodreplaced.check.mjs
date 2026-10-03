// Checks how a device follows foods the catalogue replaced (027): old ids to
// new ones (through a replacement that was replaced again), every reference
// at any depth (a book in the settings, a module record's data), nothing
// touched when nothing pointed at an old food, and when to look again.
import { replacementMap, swapMany, movedFields, mapKey } from '../lib/food-replaced-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const foods = [
  { id: 'old-onion', replaced_by: 'nevo-onion' },
  { id: 'nevo-onion', replaced_by: null },
  { id: 'old-a', replaced_by: 'old-b' },
  { id: 'old-b', replaced_by: 'nevo-c' },
  { id: 'loop-1', replaced_by: 'loop-2' },
  { id: 'loop-2', replaced_by: 'loop-1' },
  { id: 'self', replaced_by: 'self' },
]
const map = replacementMap(foods)
is('an old food points at its replacement', map.get('old-onion'), 'nevo-onion')
is('a replacement replaced again is followed to the end', map.get('old-a'), 'nevo-c')
is('a food that is not replaced is not in the map', map.has('nevo-onion'), false)
is('a food replaced by itself is ignored', map.has('self'), false)
is('a loop of replacements ends, and goes nowhere', map.get('loop-1') !== 'loop-1', true)

is('a plain id is swapped', swapMany('old-onion', map), 'nevo-onion')
is('other text is left alone', swapMany('onion', map), 'onion')
const settings = { books: [{ id: 'b1', kind: 'food', items: ['x', 'old-onion'] }], nutrients: ['kcal'] }
const moved = swapMany(settings, map)
is('an id inside a book is swapped', moved.books[0].items, ['x', 'nevo-onion'])
is('the rest of the settings stays as it was', moved.nutrients, ['kcal'])
is('nothing to swap gives the same value back', swapMany(settings.nutrients, map) === settings.nutrients, true)

is('a row pointing at an old food', movedFields({ id: 'l1', food_id: 'old-onion', grams: 95 }, ['food_id'], map), { food_id: 'nevo-onion' })
is('a row pointing at a new food is left alone', movedFields({ id: 'l2', food_id: 'nevo-onion' }, ['food_id'], map), null)
is('a module record holding the food anywhere', movedFields({ id: 'r', data: { ingredients: [{ food: 'old-a' }] } }, ['data'], map), { data: { ingredients: [{ food: 'nevo-c' }] } })

is('the fingerprint is the same for the same replacements', mapKey(map) === mapKey(replacementMap([...foods].reverse())), true)
is('the fingerprint changes when a replacement is added', mapKey(map) === mapKey(replacementMap([...foods, { id: 'new-old', replaced_by: 'nevo-onion' }])), false)
is('no replacements, an empty map', replacementMap([{ id: 'a' }]).size, 0)

console.log(fail ? `\n${fail} failed` : '\nAll replaced-food checks passed')
process.exit(fail ? 1 : 0)
