// Checks recipe and food books and the several-rows-at-once actions: books
// read strictly, filtering, pruning rows that have gone, making, renaming,
// colouring and deleting books, adding and removing rows, which rows may be
// deleted, and the combined ingredient list copied as plain text.
import {
  readBooks, booksOf, inBook, liveCount, pruneBooks, addBook, renameBook, recolourBook, deleteBook, addToBook,
  removeFromBook, splitOwned, sharedNote, countOf, recipeIngredients, combineIngredients, roundAmount,
  ingredientText, namesText, chosen, toggleAll, MAX_BOOKS, MAX_ITEMS,
} from '../lib/books-rules.ts'
import { SWATCHES } from '../lib/colours-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// Reading.
const green = SWATCHES.find((s) => s.name === 'Green').hex
is('a good book is kept as it is', readBooks([{ id: 'b1', name: 'Snacks', kind: 'food', items: ['f1'], colour: green }]),
  [{ id: 'b1', name: 'Snacks', kind: 'food', items: ['f1'], colour: green }])
is('a colour that is not a swatch is dropped', readBooks([{ id: 'b1', name: 'Snacks', kind: 'food', items: [], colour: '#ff0000' }])[0].colour, undefined)
is('a swatch in capitals is kept, lower-cased', readBooks([{ id: 'b1', name: 'S', kind: 'food', items: [], colour: green.toUpperCase() }])[0].colour, green)
is('missing items are an empty book', readBooks([{ id: 'b1', name: 'S', kind: 'recipe' }])[0].items, [])
is('an id with odd characters is refused', readBooks([{ id: 'a b', name: 'S', kind: 'recipe', items: [] }]), [])
is('names are cut to 60 characters', readBooks([{ id: 'b', name: 'y'.repeat(61), kind: 'recipe', items: [] }])[0].name.length, 60)
is('not a list at all', readBooks('books'), [])

// Filtering.
const books = [
  { id: 'lunch', name: 'Quick lunches', kind: 'recipe', items: ['r3', 'r1', 'gone'] },
  { id: 'snack', name: 'Snacks', kind: 'food', items: ['f2'] },
  { id: 'bulk', name: 'Bulk prep', kind: 'recipe', items: [] },
]
const recipes = [{ id: 'r1', name: 'Oat bowl' }, { id: 'r2', name: 'Chilli' }, { id: 'r3', name: 'Wrap' }]
is('each tab has its own books', booksOf(books, 'recipe').map((b) => b.id), ['lunch', 'bulk'])
is('no book shows every row', inBook(recipes, null).map((r) => r.id), ['r1', 'r2', 'r3'])
is('a book shows its rows in the table’s order, rows gone ignored', inBook(recipes, books[0]).map((r) => r.id), ['r1', 'r3'])
is('an empty book shows nothing', inBook(recipes, books[2]), [])
is('the count leaves out rows that have gone', liveCount(books[0], new Set(['r1', 'r2', 'r3'])), 2)

// Pruning.
const pruned = pruneBooks(books, { recipe: new Set(['r1', 'r2', 'r3']), food: new Set() })
is('rows that have gone are pruned', pruned[0].items, ['r3', 'r1'])
is('a kind with no rows loaded yet is left alone', pruned[1].items, ['f2'])
is('an untouched book stays the same object', pruned[2] === books[2], true)

// Making and changing books.
const made = addBook(books, 'new1', '  Bulk   prep 2 ', 'recipe', green)
is('a new book is empty, named tidily, coloured', made.books.at(-1), { id: 'new1', name: 'Bulk prep 2', kind: 'recipe', items: [], colour: green })
is('a book needs a name', addBook(books, 'x', '   ', 'recipe').error, 'Give the book a name.')
is('an id already used is refused', !!addBook(books, 'lunch', 'Again', 'recipe').error, true)
const fifty = Array.from({ length: MAX_BOOKS }, (_, i) => ({ id: `b${i}`, name: `B${i}`, kind: 'food', items: [] }))
is('at most 50 books', addBook(fifty, 'one-more', 'One more', 'food').error, 'There can be at most 50 books.')
is('a colour that is not a swatch is not stored', 'colour' in addBook([], 'c', 'C', 'food', '#000000').books[0], false)
is('renaming', renameBook(books, 'snack', ' Evening snacks ').books[1].name, 'Evening snacks')
is('renaming to nothing is refused', renameBook(books, 'snack', '').error, 'Give the book a name.')
const coloured = recolourBook(books, 'snack', green)
is('recolouring', coloured[1].colour, green)
is('back to no colour', 'colour' in recolourBook(coloured, 'snack', null)[1], false)
is('a colour off the swatches clears it', 'colour' in recolourBook(coloured, 'snack', '#abcdef')[1], false)
is('deleting a book leaves the others', deleteBook(books, 'lunch').map((b) => b.id), ['snack', 'bulk'])

// Adding and removing rows.
const added = addToBook(books, 'lunch', ['r2', 'r1', 'r2'])
is('adding puts new rows after the old, once each', [added.books[0].items, added.added, added.already], [['r3', 'r1', 'gone', 'r2'], 1, 2])
const nearlyFull = [{ id: 'f', name: 'Full', kind: 'food', items: Array.from({ length: MAX_ITEMS - 1 }, (_, i) => `x${i}`) }]
const overflow = addToBook(nearlyFull, 'f', ['a', 'b', 'c'])
is('past 500 the rest do not fit', [overflow.books[0].items.length, overflow.added, overflow.full], [500, 1, 2])
const removed = removeFromBook(books, 'lunch', ['r1', 'nope'])
is('removing from a book', [removed.books[0].items, removed.removed], [['r3', 'gone'], 1])
is('removing leaves other books alone', removed.books[1] === books[1], true)

// Deleting several rows: only one’s own.
const rows = [{ id: 'a', owner_id: 'me' }, { id: 'b', owner_id: null }, { id: 'c', owner_id: null }, { id: 'd', owner_id: 'someone' }]
const split = splitOwned(rows, 'me')
is('own rows can be deleted', split.mine.map((r) => r.id), ['a'])
is('catalogue rows cannot', split.shared.map((r) => r.id), ['b', 'c', 'd'])
is('signed out, nothing is one’s own', splitOwned(rows, null).mine, [])
is('the note for several', sharedNote(3), "3 shared catalogue items can't be deleted")
is('the note for one', sharedNote(1), "1 shared catalogue item can't be deleted")
is('no note for none', sharedNote(0), '')
is('counts', [countOf(1, 'recipe'), countOf(2, 'recipe'), countOf(1, 'food'), countOf(0, 'food')], ['1 recipe', '2 recipes', '1 food', '0 foods'])

// Combining ingredients across recipes.
const foods = new Map([
  ['oats', { id: 'oats', name: 'Oats rolled', cook_yield: null }],
  ['rice', { id: 'rice', name: 'Rice brown', cook_yield: 2.5 }],
  ['beans', { id: 'beans', name: 'Beans kidney', cook_yield: null }],
  ['milk', { id: 'milk', name: 'Milk semi-skimmed', cook_yield: null }],
])
const lines = [
  { recipe_id: 'r1', food_id: 'oats', raw_text: 'Oats', grams_per_portion: 60, state: 'raw', sort_order: 0 },
  { recipe_id: 'r1', food_id: 'milk', raw_text: 'Milk', grams_per_portion: 200, state: 'raw', sort_order: 1 },
  { recipe_id: 'r1', food_id: null, raw_text: 'Salt, to taste', grams_per_portion: null, state: null, sort_order: 2 },
  { recipe_id: 'r2', food_id: 'rice', raw_text: 'Brown rice (cooked)', grams_per_portion: 150, state: 'cooked', sort_order: 1 },
  { recipe_id: 'r2', food_id: 'oats', raw_text: 'Porridge oats', grams_per_portion: 30, state: 'raw', sort_order: 0 },
  { recipe_id: 'r2', food_id: 'beans', raw_text: 'Kidney beans (drained)', grams_per_portion: 80, state: 'cooked', sort_order: 2 },
  { recipe_id: 'r2', food_id: null, raw_text: 'salt, to taste', grams_per_portion: null, state: null, sort_order: 3 },
  { recipe_id: 'r2', food_id: null, raw_text: 'Chilli flakes', grams_per_portion: 0.75, state: 'raw', sort_order: 4 },
]
const one = recipeIngredients({ id: 'r1', portions_per_batch: 2 }, lines, foods)
is('one recipe, scaled to a batch of two', one.map((i) => [i.name, i.amount, i.unit]), [['Oats', 120, 'g'], ['Milk', 400, 'g'], ['Salt, to taste', null, 'g']])
const two = recipeIngredients({ id: 'r2', portions_per_batch: 4 }, lines, foods)
is('in the recipe’s order; cooked rice back to its raw weight; beans that cannot be turned back say cooked',
  two.map((i) => [i.name, i.amount, i.unit]),
  [['Porridge oats', 120, 'g'], ['Brown rice', 240, 'g'], ['Kidney beans (drained)', 320, 'g cooked'], ['salt, to taste', null, 'g'], ['Chilli flakes', 3, 'g']])
is('a batch of nothing counts as one', recipeIngredients({ id: 'r1', portions_per_batch: 0 }, lines, foods)[0].amount, 60)
const both = combineIngredients([one, two])
is('the same food and unit are summed, first name and place kept; text lines match without case',
  both.map((i) => [i.name, i.amount]),
  [['Oats', 240], ['Milk', 400], ['Salt, to taste', null], ['Brown rice', 240], ['Kidney beans (drained)', 320], ['Chilli flakes', 3]])
is('different units are not summed', combineIngredients([[{ key: 'k', name: 'Rice', amount: 100, unit: 'g' }], [{ key: 'k', name: 'Rice', amount: 50, unit: 'g cooked' }]]).length, 2)
is('rounding', [roundAmount(7.46), roundAmount(0.04), roundAmount(12.5), roundAmount(999.4), roundAmount(1234), roundAmount(-5), roundAmount(NaN)], [7.5, 0, 13, 999, 1230, 0, 0])
is('the plain-text list', ingredientText(both),
  'Oats — 240 g\nMilk — 400 g\nSalt, to taste\nBrown rice — 240 g\nKidney beans (drained) — 320 g cooked\nChilli flakes — 3 g')
is('nothing chosen gives an empty list', ingredientText(combineIngredients([])), '')
is('names, one a line', namesText([{ name: ' Oats ' }, { name: '' }, { name: 'Milk' }]), 'Oats\nMilk')

// Choosing rows.
is('chosen rows keep the table’s order', chosen(recipes, new Set(['r3', 'r1'])).map((r) => r.id), ['r1', 'r3'])
is('select all shown ticks every shown row, keeping others', [...toggleAll(new Set(['x']), recipes)], ['x', 'r1', 'r2', 'r3'])
is('when all shown are ticked it clears them', [...toggleAll(new Set(['x', 'r1', 'r2', 'r3']), recipes)], ['x'])
is('nothing shown changes nothing', [...toggleAll(new Set(['x']), [])], ['x'])

// Ingredients typed in a unit (022): "2 eggs" a portion, counted as eggs.
const eggFoods = new Map([['egg', { id: 'egg', name: 'Eggs', cook_yield: null, units: [{ name: 'egg', plural: 'eggs', g: 50 }] }]])
const eggLines = [
  { recipe_id: 'e1', food_id: 'egg', raw_text: null, grams_per_portion: 100, state: null, sort_order: 0, unit: 'egg', unit_qty: 2 },
  { recipe_id: 'e2', food_id: 'egg', raw_text: null, grams_per_portion: 50, state: null, sort_order: 0, unit: 'egg', unit_qty: 1 },
  { recipe_id: 'e3', food_id: 'egg', raw_text: null, grams_per_portion: 30, state: null, sort_order: 0 },
]
const eggs1 = recipeIngredients({ id: 'e1', portions_per_batch: 1 }, eggLines, eggFoods)
is('a line in eggs reads as eggs', ingredientText(eggs1), 'Eggs — 2 eggs')
is('and still carries its grams', eggs1[0].amount, 100)
is('times the batch', ingredientText(recipeIngredients({ id: 'e1', portions_per_batch: 3 }, eggLines, eggFoods)), 'Eggs — 6 eggs')
is('eggs from two recipes add up as eggs',
  ingredientText(combineIngredients([eggs1, recipeIngredients({ id: 'e2', portions_per_batch: 1 }, eggLines, eggFoods)])), 'Eggs — 3 eggs')
is('eggs and grams of the same food add up in grams',
  ingredientText(combineIngredients([eggs1, recipeIngredients({ id: 'e3', portions_per_batch: 1 }, eggLines, eggFoods)])), 'Eggs — 130 g')
is('grams then eggs, the same', ingredientText(combineIngredients([recipeIngredients({ id: 'e3', portions_per_batch: 1 }, eggLines, eggFoods), eggs1])), 'Eggs — 130 g')
is('a line in grams has no count', 'count' in one[0], false)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
