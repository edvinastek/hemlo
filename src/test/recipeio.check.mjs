// Checks recipes in and out (DATA-05, REC-07): an ingredient line read
// ("2 tbsp olive oil, warmed"), its grams from the food it was matched to,
// schema.org Recipe from JSON-LD and from a page's source, GetIt's own file,
// CSV both ways, plain text, and schema.org written out.
import {
  readLine, lineGrams, isoMinutes, isoDuration, yieldPortions, recipesInJsonLd, jsonLdBlocks, readRecipes, toGetItJson,
  toCsv, csvRows, toSchemaOrg, CSV_HEAD, planRecipes,
} from '../lib/recipe-io-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const pick = (l) => [l.qty, l.unit, l.name, l.note]

// A line read.
is('grams', pick(readLine('200 g oats')), [200, 'g', 'oats', null])
is('grams written together', pick(readLine('200g oats')), [200, 'g', 'oats', null])
is('a count', pick(readLine('2 eggs')), [2, null, 'eggs', null])
is('a spoon, and a note after a comma', pick(readLine('2 tbsp olive oil, warmed')), [2, 'tbsp', 'olive oil', 'warmed'])
is('a fraction and a note in brackets', pick(readLine('½ onion (finely chopped)')), [0.5, null, 'onion', 'finely chopped'])
is('one and a half', pick(readLine('1 1/2 cups milk')), [1.5, 'cup', 'milk', null])
is('an amount repeated in brackets is dropped', pick(readLine('1 cup (250 ml) milk')), [1, 'cup', 'milk', null])
is('Dutch spoons', pick(readLine('1 el honing')), [1, 'tbsp', 'honing', null])
is('a range counts its first number', pick(readLine('2-3 cloves garlic')), [2, 'clove', 'garlic', null])
is('no amount: free text', pick(readLine('Salt to taste')), [null, null, 'Salt to taste', null])
is('a bullet is not part of the line', readLine('• 100 g rice').name, 'rice')
is('a cooked line', readLine('150 g rice, cooked').state, 'cooked')

// Its grams from the matched food.
const onion = { units: [{ name: 'onion', plural: 'onions', g: 95, size: 'M' }, { name: 'tbsp chopped', g: 20 }] }
const oil = { units: [{ name: 'tbsp', g: 13.5 }], density: 0.92 }
const milk = { units: [], per_ml: true }
is('grams as they are', lineGrams({ qty: 200, unit: 'g' }, onion), { grams: 200 })
is('kilos', lineGrams({ qty: 1.5, unit: 'kg' }, onion), { grams: 1500 })
is('"2 onions": the food’s usual one', lineGrams({ qty: 2, unit: null }, onion), { grams: 190, unit: 'onion', unit_qty: 2 })
is('the food’s own spoon wins', lineGrams({ qty: 2, unit: 'tbsp' }, oil), { grams: 27, unit: 'tbsp', unit_qty: 2 })
is('a teaspoon by density', lineGrams({ qty: 1, unit: 'tsp' }, oil), { grams: 4.6, unit: 'tsp', unit_qty: 1 })
is('a drink by the millilitre', lineGrams({ qty: 250, unit: 'ml' }, milk), { grams: 250 })
is('a cup of a drink', lineGrams({ qty: 1, unit: 'cup' }, milk), { grams: 250, unit: 'cup', unit_qty: 1 })
is('a spoon of a food without a density: left for the person', lineGrams({ qty: 1, unit: 'tbsp' }, { units: [] }), null)
is('no food: no grams', lineGrams({ qty: 1, unit: 'g' }, null), null)

// schema.org.
is('ISO minutes', [isoMinutes('PT1H30M'), isoMinutes('PT45M'), isoMinutes('P1DT2H'), isoMinutes('soon')], [90, 45, 1560, null])
is('ISO duration', [isoDuration(90), isoDuration(45), isoDuration(120)], ['PT1H30M', 'PT45M', 'PT2H'])
is('yield', [yieldPortions('4 servings'), yieldPortions(['6', '6 porties']), yieldPortions(2), yieldPortions('a few')], [4, 6, 2, 1])
const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', name: 'Blog' },
    {
      '@type': ['Recipe'], name: 'Shakshuka', recipeYield: '2 servings', totalTime: 'PT30M', recipeCategory: 'Breakfast',
      recipeIngredient: ['4 eggs', '400 g tinned tomatoes', '1 onion, chopped'],
      recipeInstructions: [{ '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Fry the onion.' }, { '@type': 'HowToStep', text: 'Add the eggs.' }] }],
    },
  ],
}
const [shak] = recipesInJsonLd(ld)
is('a recipe in a graph', [shak.name, shak.portions, shak.minutes, shak.role], ['Shakshuka', 2, 30, 'breakfast'])
is('its ingredients read', shak.lines.map((l) => [l.qty, l.unit, l.name]), [[4, null, 'eggs'], [400, 'g', 'tinned tomatoes'], [1, null, 'onion']])
is('its steps numbered', shak.steps, '1. Fry the onion.\n2. Add the eggs.')
const page = `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script><script type="application/ld+json">{broken</script></head></html>`
is('JSON-LD in a page’s source, a broken block skipped', jsonLdBlocks(page).length, 1)
is('a page read as schema.org', [readRecipes(page).kind, readRecipes(page).recipes[0].name], ['schema.org', 'Shakshuka'])
is('a page with no recipe data says so', readRecipes('<script type="application/ld+json">{"@type":"WebPage"}</script>').kind, 'a page without recipe data')

// GetIt's own file, out and back.
const mine = [{
  name: 'Oat bowl', role: 'breakfast', portions: 2, minutes: 10, steps: 'Stir.',
  lines: [
    { text: 'Oats', food: 'Oat flakes', nevo_code: 213, grams_per_portion: 40, unit: null, unit_qty: null, state: 'raw', note: null },
    { text: 'Eggs', food: 'Egg average, raw', nevo_code: 83, grams_per_portion: 100, unit: 'egg', unit_qty: 2, state: null, note: 'beaten' },
    { text: 'Salt to taste', food: null, nevo_code: null, grams_per_portion: null, unit: null, unit_qty: null, state: null, note: null },
  ],
  per_portion: { kcal: 278, protein_g: 18, fat_g: 11.8, carbs_g: 24, salt_g: 0.35 },
}]
const file = toGetItJson(mine, 'Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven')
const back = readRecipes(file)
is('a GetIt file is known', back.kind, 'GetIt file')
is('the recipe comes back whole', [back.recipes[0].name, back.recipes[0].role, back.recipes[0].portions, back.recipes[0].minutes, back.recipes[0].steps], ['Oat bowl', 'breakfast', 2, 10, 'Stir.'])
is('lines keep grams a portion, NEVO code, unit and note', back.recipes[0].lines.map((l) => [l.name, l.grams_per_portion, l.nevo_code, l.unit_name, l.unit_qty, l.note]),
  [['Oat flakes', 40, 213, null, null, null], ['Egg average, raw', 100, 83, 'egg', 2, 'beaten'], ['Salt to taste', null, null, null, null, null]])
is('the file carries the attribution', JSON.parse(file).attribution, 'Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven')

// CSV, out and back.
const csv = toCsv(mine)
is('CSV has its head', csv.split('\r\n')[0], CSV_HEAD.join(','))
is('one row an ingredient', csv.split('\r\n').length, 4)
is('quotes and commas survive', csvRows('a,"b, c","d ""e"""\r\n1,2,3'), [['a', 'b, c', 'd "e"'], ['1', '2', '3']])
const csvBack = readRecipes(csv)
is('CSV read back', [csvBack.kind, csvBack.recipes[0].name, csvBack.recipes[0].portions, csvBack.recipes[0].role, csvBack.recipes[0].steps], ['CSV', 'Oat bowl', 2, 'breakfast', 'Stir.'])
is('CSV lines read back', csvBack.recipes[0].lines.map((l) => [l.name, l.grams_per_portion, l.unit_name, l.unit_qty]),
  [['Oat flakes', 40, null, null], ['Egg average, raw', 100, 'egg', 2], ['Salt to taste', null, null, null]])

// Plain text.
const pasted = readRecipes('Banana pancakes\n1 banana\n2 eggs\n30 g oats\nMethod\nMash.\nFry.')
is('pasted text: name, lines, steps', [pasted.kind, pasted.recipes[0].name, pasted.recipes[0].lines.length, pasted.recipes[0].steps], ['text', 'Banana pancakes', 3, 'Mash.\nFry.'])
const oneLine = readRecipes('200 g oats, 2 eggs, 1 banana')
is('one line with commas', [oneLine.recipes[0].name, oneLine.recipes[0].lines.map((l) => l.name)], ['Pasted recipe', ['oats', 'eggs', 'banana']])
is('"serves 4"', readRecipes('Soup\nServes 4\n1 l water').recipes[0].portions, 4)
is('nothing pasted', readRecipes('  ').recipes, [])

// schema.org out.
const out = toSchemaOrg(mine[0], 'Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven')
is('schema.org type and yield', [out['@type'], out.recipeYield, out.totalTime, out.recipeCategory], ['Recipe', '2 portions', 'PT10M', 'Breakfast'])
is('ingredients for the batch, in their unit', out.recipeIngredient, ['80 g Oat flakes', '4 eggs (Egg average, raw), beaten', 'Salt to taste'])
is('steps', out.recipeInstructions, [{ '@type': 'HowToStep', text: 'Stir.' }])
is('nutrition a portion, sodium from salt', [out.nutrition.calories, out.nutrition.proteinContent, out.nutrition.sodiumContent], ['278 kcal', '18 g', '140 mg'])
is('and read back in', readRecipes(JSON.stringify(out)).recipes[0].name, 'Oat bowl')

// An import planned: matched lines in grams a portion, the rest as text.
const cat = [
  { id: 'egg', name: 'Egg average, raw', nevo_code: 83, units: [{ name: 'egg', plural: 'eggs', g: 50, size: 'M' }] },
  { id: 'tom', name: 'Tomatoes, tinned', units: [] },
  { id: 'onion', name: 'Onions, raw', units: [{ name: 'onion', plural: 'onions', g: 95, size: 'M' }] },
  { id: 'oats', name: 'Oat flakes', nevo_code: 213, units: [] },
]
const byName = (n) => cat.find((f) => n.toLowerCase().includes(f.name.split(/[ ,]/)[0].toLowerCase().replace(/s$/, ''))) ?? null
const [pl] = planRecipes([shak], cat, byName)
is('portions and name kept', [pl.name, pl.portions_per_batch, pl.cook_minutes], ['Shakshuka', 2, 30])
is('4 eggs for 2 portions: 2 eggs a portion', pl.lines[0], { food_id: 'egg', raw_text: '4 eggs', grams_per_portion: 100, unit: 'egg', unit_qty: 2, state: null, note: null })
is('400 g tinned tomatoes: 200 g a portion', [pl.lines[1].food_id, pl.lines[1].grams_per_portion], ['tom', 200])
is('a note travels with the line', pl.lines[2].note, 'chopped')
is('counted matches', [pl.matched, pl.unmatched], [3, []])
const [gp] = planRecipes(readRecipes(file).recipes, cat, () => null)
is('a GetIt file finds foods by their NEVO code', gp.lines.map((l) => l.food_id), ['oats', 'egg', null])
is('… keeps its grams a portion and its unit', [gp.lines[1].grams_per_portion, gp.lines[1].unit, gp.lines[1].unit_qty], [100, 'egg', 2])
is('… and keeps unknown lines as text', gp.unmatched, ['Salt to taste'])
const [nf] = planRecipes(readRecipes('Toast\n1 tbsp mystery paste\n2 slices bread').recipes, cat, () => null)
is('no food: every line kept as text, nothing lost', [nf.lines.map((l) => l.raw_text), nf.matched], [['1 tbsp mystery paste', '2 slices bread'], 0])

console.log(fail ? `\n${fail} failed` : '\nAll recipe import and export checks passed')
process.exit(fail ? 1 : 0)
