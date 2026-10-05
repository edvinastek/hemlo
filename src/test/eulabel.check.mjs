// Checks the EU label rules (Regulation (EU) No 1169/2011): energy from the
// macros with the Annex XIV factors, the 15% review, salt and sodium, the
// reference intakes, figures as printed, where a food came from and the
// attribution NEVO's conditions ask for, and a food typed in by hand.
import {
  LABEL, RI, energyFrom, energyCheck, kjFromKcal, kcalFromKj, saltOf, sodiumOf, figureOf, riPercent, figureText,
  sourceKind, sourceText, attributionFor, copiedFromNevo, readFoodForm, readFigure, draftOf, foodSearchText,
  NEVO_ATTRIBUTION, NEVO_AND_OTHERS,
} from '../lib/eu-label-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// The label's order (Annex XV) and what must be declared (Article 30).
is('the order of a label', LABEL.map((r) => r.key), ['kj', 'kcal', 'fat_g', 'sat_fat_g', 'mufa_g', 'pufa_g', 'carbs_g', 'sugars_g', 'polyols_g', 'starch_g', 'fiber_g', 'protein_g', 'salt_g', 'alcohol_g'])
is('the declaration every label gives', LABEL.filter((r) => r.required).map((r) => r.key), ['kj', 'kcal', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugars_g', 'protein_g', 'salt_g'])
is('reference intakes (Annex XIII part B)', RI, { kj: 8400, kcal: 2000, fat_g: 70, sat_fat_g: 20, carbs_g: 260, sugars_g: 90, protein_g: 50, salt_g: 6 })

// Energy (Annex XIV): carbohydrate 4/17, protein 4/17, fat 9/37, fibre 2/8,
// alcohol 7/29, polyols 2.4/10, organic acid 3/13.
is('10 g each of carbohydrate, protein and fat', energyFrom({ carbs_g: 10, protein_g: 10, fat_g: 10 }), { kj: 710, kcal: 170 })
is('fibre counts 2 kcal a gram', energyFrom({ carbs_g: 0, protein_g: 0, fat_g: 0, fiber_g: 10 }), { kj: 80, kcal: 20 })
is('alcohol counts 7 kcal a gram', energyFrom({ carbs_g: 0, protein_g: 0, fat_g: 0, alcohol_g: 10 }), { kj: 290, kcal: 70 })
is('polyols are part of carbohydrate, at 2.4 kcal', energyFrom({ carbs_g: 10, polyols_g: 10, protein_g: 0, fat_g: 0 }), { kj: 100, kcal: 24 })
is('organic acids count 3 kcal a gram', energyFrom({ carbs_g: 0, protein_g: 0, fat_g: 0, organic_acid_g: 10 }), { kj: 130, kcal: 30 })
is('unknown protein: energy cannot be worked out', energyFrom({ carbs_g: 10, fat_g: 1 }), null)
is('numbers as a numeric column sends them', energyFrom({ carbs_g: '10', protein_g: '0', fat_g: '0' }), { kj: 170, kcal: 40 })
is('within 15% is fine', energyCheck({ kcal: 180, carbs_g: 10, protein_g: 10, fat_g: 10 }).flagged, false)
is('more than 15% off is flagged', energyCheck({ kcal: 884, carbs_g: 0, protein_g: 0, fat_g: 0 }).flagged, true)
is('a low-energy food is judged by 4 kcal', energyCheck({ kcal: 15, carbs_g: 2, protein_g: 1, fat_g: 0.2 }).flagged, false)
is('no stated energy: nothing to check', energyCheck({ carbs_g: 1, protein_g: 1, fat_g: 1 }), null)
is('kJ from kcal', kjFromKcal(100), 418)
is('kcal from kJ', kcalFromKj(418), 100)

// Salt and sodium (Annex I: salt = sodium × 2.5).
is('salt as stored', saltOf({ salt_g: 1.2 }), 1.2)
is('salt from published sodium (NEVO, mg)', saltOf({ sodium_mg: 400 }), 1)
is('salt unknown stays unknown', saltOf({}), null)
is('sodium from salt', sodiumOf({ salt_g: 2.5 }), 1)
is('sodium as published wins', sodiumOf({ salt_g: 2.5, sodium_mg: 900 }), 0.9)
is('a figure reads salt the same way', figureOf({ sodium_mg: 450 }, 'salt_g'), 1.125)
is('a figure from a numeric column', figureOf({ fat_g: '3.5' }, 'fat_g'), 3.5)

// %RI and printing.
is('6 g of salt is 100% RI', riPercent('salt_g', 6), 100)
is('fibre has no RI', riPercent('fiber_g', 5), null)
is('unknown is no percentage', riPercent('fat_g', null), null)
is('unknown is a dash, never 0', figureText(null, 'g'), '–')
is('whole kcal', figureText(239.4, 'kcal'), '239 kcal')
is('grams to a tenth', figureText(12.34, 'g'), '12.3 g')
is('under a gram to two places', figureText(0.456, 'g'), '0.46 g')
is('salt to two places', figureText(1.125, 'g', 'salt_g'), '1.13 g')
is('a trace is not shown as 0', figureText(0.001, 'g'), '<0.01 g')

// Where a food came from (FOOD-13) and the attribution (NEVO's conditions).
const nevoFood = { source: 'nevo', owner_id: null, nevo_code: 63, source_version: 'NEVO-online 2025/9.0' }
is('a NEVO food', [sourceKind(nevoFood), sourceText(nevoFood)], ['nevo', 'NEVO-online 2025/9.0 (RIVM), code 63'])
is('a kept old food', sourceKind({ source: 'usda', owner_id: null }), 'usda')
is('a scanned product', sourceText({ source: 'off', owner_id: 'u', source_ref: '8710400000000' }), 'Open Food Facts, product 8710400000000')
is('a USDA FoodData Central staple says which food', sourceText({ source: 'usda', source_version: 'USDA FoodData Central, SR Legacy (April 2018)', source_ref: 'fdc:175051' }), 'USDA FoodData Central (SR Legacy), food 175051')
is('a food kept from the first list says so', sourceText({ source: 'usda', source_version: 'USDA SR Legacy (GetIt version 15 catalogue)' }), 'USDA (US list from Visuma’s first catalogue)')
is('a workbook food', sourceKind({ source: 'import', owner_id: 'u' }), 'import')
const copy = { source: 'own', owner_id: 'u', source_ref: 'nevo:63' }
is('a copy of a NEVO food is the person’s own', [sourceKind(copy), copiedFromNevo(copy), sourceText(copy)], ['own', true, 'Your own copy of a NEVO food'])
is('NEVO alone: NEVO’s line', attributionFor([nevoFood, nevoFood]), NEVO_ATTRIBUTION)
is('NEVO with others: "and other data sources"', attributionFor([nevoFood, { source: 'off', owner_id: 'u' }]), NEVO_AND_OTHERS)
is('a copy of a NEVO food still carries the line', attributionFor([copy]), NEVO_ATTRIBUTION)
is('no NEVO food: no line', attributionFor([{ source: 'own', owner_id: 'u' }]), null)
is('the search reaches the Dutch name and synonyms', foodSearchText({ name_nl: 'Ui rauw', name_en: 'Onions raw', synonyms: 'Uien' }), 'Ui rauw Onions raw Uien')

// A food typed in by hand.
const blank = draftOf(null)
const form = (figures, extra = {}) => readFoodForm({ ...blank, name: 'Test bar', figures, ...extra })
is('a number with a comma', readFigure('12,5'), 12.5)
is('empty is unknown', readFigure(''), null)
is('letters are not a number', readFigure('12g'), 'bad')
is('a name is needed', 'error' in readFoodForm(blank), true)
const read = form({ kcal: '400', fat_g: '20', sat_fat_g: '5', carbs_g: '40', sugars_g: '20', protein_g: '15', salt_g: '0,5' })
is('a label read in', [read.values.kcal, read.values.kj, read.values.fat_g, read.values.salt_g, read.values.carb_basis], [400, 1674, 20, 0.5, 'eu'])
is('a figure left empty stays unknown', [read.values.fiber_g, read.values.polyols_g], [null, null])
const worked = form({ fat_g: '10', carbs_g: '10', protein_g: '10' })
is('no energy given: worked out from the macros', [worked.values.kcal, worked.values.kj], [170, 710])
is('… and the person is told', worked.notes[0], 'Energy worked out from the macros with the EU factors: 170 kcal, 710 kJ.')
is('kJ only: kcal follows', form({ kj: '418', fat_g: '0', carbs_g: '25', protein_g: '0' }).values.kcal, 100)
is('energy far from the macros is pointed out', form({ kcal: '900', fat_g: '1', carbs_g: '1', protein_g: '1' }).notes[0], 'The macros come to 17 kcal, not 900: check the label.')
is('neither energy nor macros: asked for', form({ fat_g: '1' }).error, 'Give the energy, or fat, carbohydrate and protein so it can be worked out.')
is('saturates more than fat is refused', form({ kcal: '100', fat_g: '2', sat_fat_g: '5' }).error, 'Saturates and the other fats are part of fat: none can be more than fat.')
is('sugars more than carbohydrate is refused', form({ kcal: '100', carbs_g: '2', sugars_g: '5' }).error, 'Sugars, polyols and starch are part of carbohydrate: none can be more than it.')
is('more than 100 g in 100 g is refused', form({ kcal: '100', fat_g: '60', carbs_g: '50' }).error, 'Fat, carbohydrate, fibre, protein, salt and alcohol add up to more than 100 g.')
is('per 100 ml says so', form({ kcal: '100', fat_g: '120' }, { per: 'ml' }).error, 'Fat cannot be more than 100 g in 100 ml.')
is('a drink is per 100 ml', form({ kcal: '40', fat_g: '0', carbs_g: '10', protein_g: '0' }, { per: 'ml' }).values.per_ml, true)
is('shops from a list', form({ kcal: '1', fat_g: '0', carbs_g: '0', protein_g: '0' }, { stores: 'Albert Heijn, Jumbo ,, Albert Heijn' }).values.stores, ['Albert Heijn', 'Jumbo'])
is('a cook yield out of range is refused', 'error' in form({ kcal: '1' }, { cook_yield: '12' }), true)
is('a density out of range is refused', 'error' in form({ kcal: '1' }, { density: '5' }), true)
const back = draftOf({ name: 'Onions, raw', kcal: 37, kj: 155, sodium_mg: 4, per_ml: false, state: 'raw', stores: ['AH'] })
is('a food back into the form: salt from sodium, shops as text', [back.figures.salt_g, back.figures.kcal, back.stores], ['0.01', '37', 'AH'])
is('a copy can take a new name', draftOf({ name: 'Onions, raw' }, 'Onions, raw (my copy)').name, 'Onions, raw (my copy)')

console.log(fail ? `\n${fail} failed` : '\nAll EU label checks passed')
process.exit(fail ? 1 : 0)
