// Checks the calculation engine against figures worked out by hand.
import { calorieBudget, bmr, macroSplit, shoppingQuantity, mealMultiplier, readPlan, DEFAULT_PLAN, targetsFor, missingForCalc } from '../lib/calc.ts'

let fail = 0
const is = (label, got, want, tol = 0) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${got}, expected ${want}`)
}

// A made-up person, worked by hand with Mifflin-St Jeor:
// 10 x 80 + 6.25 x 180 - 5 x 30 + 5 = 1,780 kcal
is('BMR 80 kg 180 cm 30 y male', Math.round(bmr(80, 180, 30, 'male')), 1780)
// Same person as a woman: the constant is -161 instead of +5, so 166 less.
is('BMR 80 kg 180 cm 30 y female', Math.round(bmr(80, 180, 30, 'female')), 1614)

// Activity 1.5: 1,780 x 1.5 = 2,670. Recomp holds maintenance; a cut takes 500 off.
const b = calorieBudget({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 1.5, goal: 'recomp' })
is('maintenance at 1.5', b.maintenance, 2670)
is('recomp target', b.target, 2670)
is('cut target', calorieBudget({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 1.5, goal: 'cut' }).target, 2170)

// Protein at recomp is 1.9 g per kg: 80 x 1.9 = 152 g.
const m = macroSplit(b.target, 80, 'recomp')
is('protein g', m.protein_g, 152)
is('macros add up to the budget', m.protein_g * 4 + m.fat_g * 9 + m.carbs_g * 4, b.target, 4)

// Shopping: 450 g needed, 200 g in stock, 500 g packs -> one pack.
const s = shoppingQuantity(450, 200, 500)
is('to buy after stock', s.toBuyG, 250)
is('packs', s.packs, 1)

// Sizing: 2,670 target, 1,620 already fixed, main meal 350 kcal a portion -> 3 portions.
is('main meal multiplier', Number(mealMultiplier({ kcal: 2670, protein_g: 152 }, { kcal: 1620, carbs_g: 0, fiber_g: 0, fat_g: 0, protein_g: 0 }, { kcal: 350, carbs_g: 0, fiber_g: 0, fat_g: 0, protein_g: 0 }).toFixed(2)), 3.0, 0.01)

// The plan's numbers (BODY-03): a changed adjustment and protein change the budget.
is('own cut of 300', calorieBudget({ weightKg: 80, heightCm: 180, age: 30, sex: 'male', activity: 1.5, goal: 'cut', adjust: -300 }).target, 2370)
is('own protein 2.0 g per kg', macroSplit(2670, 80, 'recomp', { protein: { cut: 2.2, recomp: 2.0, bulk: 1.7 }, fat_share: 0.3 }).protein_g, 160)
is('own fat share 30%', macroSplit(2670, 80, 'recomp', { protein: { cut: 2.2, recomp: 2.0, bulk: 1.7 }, fat_share: 0.3 }).fat_g, 89)
const same = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`) }
same('nothing stored is the default plan', readPlan(null), DEFAULT_PLAN)
same('a cut that adds is refused', readPlan({ adjust: { cut: 200 } }).adjust.cut, -500)
same('a bulk inside limits stays', readPlan({ adjust: { bulk: '250' } }).adjust.bulk, 250)
same('protein over 3 g refused', readPlan({ protein: { cut: 4 } }).protein.cut, 2.2)
same('fat share 0.5 refused', readPlan({ fat_share: 0.5 }).fat_share, 0.27)
same('fat share 0.3 kept', readPlan({ fat_share: 0.3 }).fat_share, 0.3)

// No fallbacks (BODY-05): without sex, height or date of birth there are no targets.
const person = { sex: 'male', height_cm: 180, birth_date: '1996-01-01', activity_level: 1.5, goal: 'recomp' }
const on = new Date('2026-06-01T12:00:00')
same('a whole profile gives targets', targetsFor(person, 80, on)?.kcal, 2670)
same('no sex, no targets', targetsFor({ ...person, sex: null }, 80, on), null)
same('no height, no targets', targetsFor({ ...person, height_cm: null }, 80, on), null)
same('no birth date, no targets', targetsFor({ ...person, birth_date: null }, 80, on), null)
same('what is missing, in order', missingForCalc({ sex: null, height_cm: 0, birth_date: null }), ['sex', 'height', 'birth_date'])
same('the explanation shows the sum', targetsFor(person, 80, on)?.explain, 'from 80 kg · plan recomp · BMR 1780 × 1.5 = 2670')
same('training added is said', targetsFor(person, 80, on, { trainingAdded: true })?.explain.includes('training not included'), true)
same('the plan is used', targetsFor({ ...person, goal: 'cut' }, 80, on, { plan: readPlan({ adjust: { cut: -250 } }) })?.kcal, 2420)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
