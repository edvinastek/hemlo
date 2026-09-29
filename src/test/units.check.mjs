// Checks the unit rules: a food's units read strictly, words and numbers
// ("1 egg", "2 eggs", "0.5 cup"), typing an amount in a unit and the grams it
// comes to, what a list adds up, stock kept in a unit, Open Food Facts'
// serving sizes, export cells, and a workbook's "1 large (50g)".
import {
  readUnits, findUnit, pluralOf, unitWord, formatQty, formatCount, gramsLabel, readQty, gramsOf, readUnitForm,
  addUnit, removeUnit, unitsText, parseUnitsText, amountChoices, readAmount, amountHint, entryText, unitColumns,
  addCounts, countOf, wholeToBuy, countIn, nudgeCount, parseServing, unitFromText, unitLine, MAX_UNITS,
  countFits, leadingAmount, plainFractions, stockUnitColumns,
} from '../lib/units-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const egg = { name: 'egg', plural: 'eggs', g: 50 }
const slice = { name: 'slice', g: 35 }

// Reading what is stored.
is('units read as stored', readUnits([egg, slice]), [egg, slice])
is('not a list is none', readUnits({ name: 'egg', g: 50 }), [])
is('nothing stored is none', readUnits(null), [])
is('a unit without a weight is left out', readUnits([{ name: 'egg' }]), [])
is('a weight past 5 kg is left out', readUnits([{ name: 'sack', g: 25000 }]), [])
is('a weight under 0.1 g is left out', readUnits([{ name: 'grain', g: 0.01 }]), [])
is('a weight as text is read', readUnits([{ name: 'egg', g: '50' }]), [{ name: 'egg', g: 50 }])
is('a name too long is cut', readUnits([{ name: 'x'.repeat(30), g: 5 }])[0].name.length, 24)
is('grams are not a unit', readUnits([{ name: 'g', g: 1 }, { name: 'Kg', g: 1000 }]), [])
is('a name twice keeps the first', readUnits([egg, { name: 'Egg', g: 60 }]), [egg])
is('a plural that is the name goes', readUnits([{ name: 'tbsp', plural: 'TBSP', g: 13.5 }]), [{ name: 'tbsp', g: 13.5 }])
is('at most eight', readUnits(Array.from({ length: 12 }, (_, i) => ({ name: `u${i}`, g: 1 }))).length, MAX_UNITS)
is('weights to a tenth', readUnits([{ name: 'clove', g: 4.96 }]), [{ name: 'clove', g: 5 }])
is('odd rows are skipped', readUnits([null, 'egg', 5, egg]), [egg])

is('found by name', findUnit([egg, slice], 'Egg'), egg)
is('found by plural', findUnit([egg, slice], 'eggs'), egg)
is('found by a plural worked out', findUnit([egg, slice], 'slices'), slice)
is('not found', findUnit([egg], 'slice'), undefined)

// Words and numbers.
is('egg → eggs', pluralOf('egg'), 'eggs')
is('glass → glasses', pluralOf('glass'), 'glasses')
is('berry → berries', pluralOf('berry'), 'berries')
is('loaf → loaves', pluralOf('loaf'), 'loaves')
is('tbsp stays', pluralOf('tbsp'), 'tbsp')
is('ml stays', pluralOf('ml'), 'ml')
is('one egg', formatCount(1, egg), '1 egg')
is('two eggs', formatCount(2, egg), '2 eggs')
is('half a cup reads singular', formatCount(0.5, { name: 'cup' }), '0.5 cup')
is('one and a half', formatCount(1.5, { name: 'slice' }), '1.5 slices')
is('the given plural wins', unitWord({ name: 'clove', plural: 'cloves of garlic' }, 3), 'cloves of garlic')
is('decimals are simple', [formatQty(0.5), formatQty(1.25), formatQty(2), formatQty(1 / 3)], ['0.5', '1.25', '2', '0.33'])
is('grams as written', [gramsLabel(4.5), gramsLabel(100), gramsLabel(99.6), gramsLabel(1250), gramsLabel(0)], ['4.5 g', '100 g', '100 g', '1.25 kg', '0 g'])

// Typing a number.
is('a number', readQty('2'), 2)
is('a comma is a decimal point', readQty('1,5'), 1.5)
is('a half', readQty('½'), 0.5)
is('one and a half', readQty('1½'), 1.5)
is('a fraction', readQty('3/4'), 0.75)
is('spaces in thousands', readQty('2 000', 1e6), 2000)
is('nothing typed', readQty(''), null)
is('words', readQty('two'), null)
is('below zero', readQty('-1'), null)
is('zero is a number (stock can be out)', readQty('0'), 0)
is('past what one entry holds', readQty('100001'), null)
is('three decimals at most', readQty('0.33333'), 0.333)
is('grams of a unit', gramsOf(2, egg), 100)

// A food's own units, edited.
is('a unit from the form', readUnitForm({ name: ' egg ', plural: 'eggs', g: '50' }), { unit: egg })
is('a name is needed', 'error' in readUnitForm({ name: '', plural: '', g: '50' }), true)
is('grams are not a unit', 'error' in readUnitForm({ name: 'grams', plural: '', g: '1' }), true)
is('a weight is needed', 'error' in readUnitForm({ name: 'egg', plural: '', g: '' }), true)
is('within 0.1 to 5000 g', ['0.05', '5001'].map((g) => 'error' in readUnitForm({ name: 'x', plural: '', g })), [true, true])
is('a name too long', 'error' in readUnitForm({ name: 'x'.repeat(25), plural: '', g: '1' }), true)
is('adding one', addUnit([egg], slice), { units: [egg, slice] })
is('a name twice is refused', 'error' in addUnit([egg], { name: 'EGG', g: 60 }), true)
is('a plural that is taken is refused', 'error' in addUnit([egg], { name: 'eggs', g: 60 }), true)
is('nine is refused', 'error' in addUnit(Array.from({ length: 8 }, (_, i) => ({ name: `u${i}`, g: 1 })), egg), true)
is('removing one', removeUnit([egg, slice], 'Egg'), [slice])
is('one as a line', unitLine(egg), '1 egg = 50 g')

// Export cells.
is('units as a cell', unitsText([egg, slice]), 'egg/eggs = 50 g; slice = 35 g')
is('and read back', parseUnitsText('egg/eggs = 50 g; slice = 35 g'), { units: [egg, slice] })
is('without the g', parseUnitsText('tbsp=13,5'), { units: [{ name: 'tbsp', g: 13.5 }] })
is('an empty cell is none', parseUnitsText(''), { units: [] })
is('a bad cell says why', 'error' in parseUnitsText('egg fifty'), true)
is('a name twice in a cell', 'error' in parseUnitsText('egg = 50; egg = 60'), true)

// Typing an amount in a unit.
const choices = amountChoices([egg])
is('grams, then the food’s units', choices.map((c) => c.key), ['g', 'u:egg'])
is('with kilos and packs', amountChoices([egg], { kilos: true, pack: 500 }).map((c) => c.label), ['packs', 'g', 'kg', 'egg'])
is('a unit the food has lost stays on offer', amountChoices([], { keep: { name: 'egg', g: 55 } }).map((c) => [c.label, c.g]), [['g', 1], ['egg', 55]])
is('but not twice', amountChoices([egg], { keep: { name: 'egg', g: 55 } }).length, 2)
is('two eggs are 100 g, remembered as eggs', readAmount('2', choices[1]), { grams: 100, unit: 'egg', unit_qty: 2 })
is('grams are grams', readAmount('120', choices[0]), { grams: 120, unit: null, unit_qty: null })
is('kilos are grams, no unit kept', readAmount('1,5', amountChoices([], { kilos: true })[1]), { grams: 1500, unit: null, unit_qty: null })
is('packs are grams', readAmount('2', amountChoices([], { pack: 400 })[0]), { grams: 800, unit: null, unit_qty: null })
is('not an amount', readAmount('lots', choices[1]), null)
is('no choice', readAmount('2', undefined), null)
is('a big stock in grams is fine', readAmount('200000', choices[0])?.grams, 200000)
is('past a tonne is not', readAmount('1000001', choices[0]), null)
is('the hint for eggs', amountHint('2', choices[1]), '2 eggs (100 g)')
is('the hint for one', amountHint('1', choices[1]), '1 egg (50 g)')
is('the hint for grams', amountHint('450', choices[0]), '450 g')
is('the hint for packs', amountHint('2', amountChoices([], { pack: 500 })[0]), '2 packs (1 kg)')
is('no hint for nothing', amountHint('', choices[1]), '')

// A saved entry, shown.
is('an entry in eggs', entryText({ grams: 100, unit: 'egg', unit_qty: 2 }, [egg]), '2 eggs (100 g)')
is('without the grams', entryText({ grams: 100, unit: 'egg', unit_qty: 2 }, [egg], false), '2 eggs')
is('the saved grams win over a slightly changed weight', entryText({ grams: 100, unit: 'egg', unit_qty: 2 }, [{ name: 'egg', g: 52 }]), '2 eggs (100 g)')
is('a count far from its grams shows grams (an older version changed them)', entryText({ grams: 300, unit: 'egg', unit_qty: 2 }, [egg]), '300 g')
is('so does one after a big change of weight', entryText({ grams: 100, unit: 'egg', unit_qty: 2 }, [{ name: 'egg', g: 60 }]), '100 g')
is('within 5% a count stands', [countFits(2, 50, 95.3), countFits(2, 50, 105), countFits(2, 50, 94), countFits(2, 50, 106)], [true, true, false, false])
is('no weight to judge by, or no grams: the count stands', [countFits(2, null, 300), countFits(2, 50, null), countFits(2, undefined, '')], [true, true, true])
is('a count of something beside no grams does not', [countFits(2, 50, 0), countFits(0, 50, 0)], [false, true])
is('a stale count adds nothing to a list', countOf({ unit: 'egg', unit_qty: 2, grams: 300 }, [egg]), null)
is('a fitting one does', countOf({ unit: 'egg', unit_qty: 2, grams: '100' }, [egg])?.qty, 2)
is('a unit the food no longer has still reads', entryText({ grams: 70, unit: 'slice', unit_qty: '2' }, []), '2 slices (70 g)')
is('an entry in grams', entryText({ grams: 75, unit: null, unit_qty: null }), '75 g')

// What a write carries.
is('a unit is written', unitColumns({ unit: 'egg', unit_qty: 2 }, false), { unit: 'egg', unit_qty: 2 })
is('grams on an entry that had a unit clear it', unitColumns({ unit: null, unit_qty: null }, true), { unit: null, unit_qty: null })
is('grams on a plain entry write no unit columns', unitColumns({ unit: null, unit_qty: null }, false), {})

// Lists that add up.
const two = countOf({ unit: 'egg', unit_qty: 2 }, [egg])
is('an entry’s count', two, { qty: 2, unit: { name: 'egg', plural: 'eggs' } })
is('times the portions', countOf({ unit: 'egg', unit_qty: 2 }, [egg], 3)?.qty, 6)
is('grams have no count', countOf({ unit: null, unit_qty: null }), null)
is('same unit adds up', addCounts(two, countOf({ unit: 'Egg', unit_qty: 4 }, [egg])), { qty: 6, unit: { name: 'egg', plural: 'eggs' } })
is('different units do not', addCounts(two, countOf({ unit: 'slice', unit_qty: 1 }, [slice])), null)
is('a count and grams do not', addCounts(two, null), null)
is('whole ones to buy', [wholeToBuy(2), wholeToBuy(2.004), wholeToBuy(2.4), wholeToBuy(0)], [2, 2, 3, 0])

// Stock in a unit.
is('600 g is 12 eggs', countIn(600, egg), 12)
is('+ is one more egg', nudgeCount(600, egg, 1), 650)
is('− is one fewer', nudgeCount(600, egg, -1), 550)
is('from a part, up to the next whole', nudgeCount(570, egg, 1), 600)
is('from a part, down to the whole below', nudgeCount(570, egg, -1), 550)
is('never below none', nudgeCount(20, egg, -1), 0)

// Open Food Facts' serving sizes.
is('1 egg (50 g)', parseServing('1 egg (50 g)', 50), { name: 'egg', g: 50 })
is('30g is a portion', parseServing('30g', null), { name: 'portion', g: 30 })
is('2 biscuits (25 g)', parseServing('2 biscuits (25 g)', '25'), { name: 'biscuit', plural: 'biscuits', g: 12.5 })
is('1 bar (30 g)', parseServing('1 bar (30 g)', undefined), { name: 'bar', g: 30 })
is('a Dutch slice', parseServing('1 plak (20 g)', 20), { name: 'plak', g: 20 })
is('millilitres count as grams', parseServing('250 ml', 250), { name: 'portion', g: 250 })
is('a glass in cl', parseServing('1 glass (20 cl)', null), { name: 'glass', g: 200 })
is('Open Food Facts’ figure wins', parseServing('1 portion (30 g)', 32), { name: 'portion', g: 32 })
is('only the figure', parseServing('', 40), { name: 'portion', g: 40 })
is('no weight at all', parseServing('1 piece', null), null)
is('nothing', parseServing(null, null), null)
is('an absurd serving', parseServing('9000 g', null), null)

// A workbook's amount.
is('1 large (50g) is an egg', unitFromText('1 large (50g)', [egg], 50), { grams: 50, unit: 'egg', unit_qty: 1 })
is('2 slices', unitFromText('2 slices', [slice], null), { grams: 70, unit: 'slice', unit_qty: 2 })
is('a bare whole number is grams, not a count', unitFromText('3', [egg], null), null)
is('"Milk – 200" is not 200 glasses', unitFromText('200', [{ name: 'glass', g: 250 }], 200), null)
const avocado = { name: 'avocado', g: 150 }
is('a bare half is half of one', unitFromText('½', [avocado], null), { grams: 75, unit: 'avocado', unit_qty: 0.5 })
is('as NFKC writes it (fraction slash)', unitFromText('1⁄2', [avocado], null), { grams: 75, unit: 'avocado', unit_qty: 0.5 })
is('1/2 egg', unitFromText('1/2 egg', [egg], null), { grams: 25, unit: 'egg', unit_qty: 0.5 })
is('1 1/2 eggs', unitFromText('1 1/2 eggs', [egg], null), { grams: 75, unit: 'egg', unit_qty: 1.5 })
is('1½ eggs', unitFromText('1½ eggs', [egg], null), { grams: 75, unit: 'egg', unit_qty: 1.5 })
is('½ avocado (75g) keeps its grams', unitFromText('½ avocado (75g)', [avocado], 75), { grams: 75, unit: 'avocado', unit_qty: 0.5 })
is('2 eggs', unitFromText('2 eggs', [egg], null), { grams: 100, unit: 'egg', unit_qty: 2 })
is('past 10 kg a portion is no amount', unitFromText('300 eggs', [egg], null), null)
is('unless asked with no limit', unitFromText('300 eggs', [egg], null, Infinity)?.grams, 15000)
is('the start of a text read', [leadingAmount('1/2 egg'), leadingAmount('200'), leadingAmount('Salt')],
  [{ qty: 0.5, word: 'egg', fraction: true }, { qty: 200, word: '', fraction: false }, null])
is('fractions made plain', [plainFractions('½'), plainFractions('1½'), plainFractions('1 ½ cups'), plainFractions('1⁄2'), plainFractions('10¼')],
  ['1/2', '1 1/2', '1 1/2 cups', '1/2', '10 1/4'])

// Numbers with fractions, every way they are written.
is('fractions read', [readQty('1⁄2'), readQty('1 1/2'), readQty('1 ½'), readQty('1½'), readQty('⅓'), readQty('1/0')],
  [0.5, 1.5, 1.5, 1.5, 0.333, null])

// Stock of a food this device does not have (a housemate's scan): its unit is left alone.
is('a food not here: no unit columns written', stockUnitColumns({ unit: 'egg' }, null, 650, undefined), {})
is('choosing grams outright still clears it', stockUnitColumns({ unit: 'egg' }, null, 650, null), { unit: null, unit_qty: null })
is('a food here: the count follows the grams', stockUnitColumns({ unit: 'egg' }, [egg], 650, undefined), { unit: 'egg', unit_qty: 13 })
is('a unit the food lost goes back to grams', stockUnitColumns({ unit: 'slice' }, [egg], 650, undefined), { unit: null, unit_qty: null })
is('grams on a plain row write nothing', stockUnitColumns({ unit: null }, [egg], 650, undefined), {})
is('grams are not a unit', unitFromText('60g', [egg], 60), null)
is('millilitres are not either', unitFromText('150ml', [{ name: 'cup', g: 240 }], null), null)
is('a food without units', unitFromText('2 slices', [], null), null)
is('a word that is no unit of it', unitFromText('2 cups', [egg], null), null)

is('every Unicode fraction reads right: 1⅜, 2⅓, ⅝', [readQty(plainFractions('1⅜')), readQty(plainFractions('2⅓')), readQty(plainFractions('⅝'))], [1.375, 2.333, 0.625])

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall unit checks passed')
