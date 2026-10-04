// The shared food catalogue, reviewed (FOOD-19): the data migration 027
// loads (NEVO-online 2025/9.0) and the old foods it keeps (from the US list
// in seed/catalogue.json, with migration 026's corrections). Runs with the
// app's other checks, so a new NEVO version or a new kept food that breaks a
// rule stops the build until someone has looked at it.
//
//  * required fields: name, energy in kJ and kcal, fat, carbohydrate, protein;
//  * energy agrees with the macros by the Annex XIV factors, within 15%
//    (4 kcal on foods under 20 kcal); the few that do not are listed below
//    with the reason, after being looked at;
//  * parts never exceed the whole (saturates within fat, sugars within
//    carbohydrate) and nothing passes 100 g in 100 g;
//  * units within the database's limits, as bought never under what is
//    eaten, small < medium < large, the medium unit named after the food;
//  * no plant food kept from the old list with fibre 0 that means "not
//    measured".
import { readFileSync } from 'node:fs'
import { energyCheck } from '../lib/eu-label-rules.ts'
import { readUnits } from '../lib/units-rules.ts'
import { KEEP } from '../../scripts/nevo-additions.mjs'
import { merge, plural, usdaId, byThePiece, USDA } from '../../scripts/units-usda.mjs'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const sql = readFileSync(new URL('../../supabase/migrations/027_food_catalogue.sql', import.meta.url), 'utf8')
const nevo = JSON.parse(sql.slice(sql.indexOf('$nevo$[') + 6, sql.indexOf(']$nevo$') + 1))

// Looked at and accepted: the label's energy is NEVO's (or the source's) own
// and differs from the macros for the reason given. NEVO's figures are never
// changed; a food listed here is shown with its stated energy.
const REVIEWED = {
  // NEVO: the marinade's ingredients carry energy NEVO counts and the macros
  // here do not show in full (rounded to whole grams).
  'nevo:5602': 'Prawns marinated: 184 stated, 156 from the macros',
  // Kept old foods (USDA list).
  'Lime juice': 'organic acids (3 kcal/g) are not in the old figures; stated 25, macros 35',
  'Chestnut mushrooms, raw': 'small absolute difference (22 against 27 kcal)',
  'Wakame, raw': 'small absolute difference on a seaweed (45 against 53 kcal)',
}

// ---- NEVO foods --------------------------------------------------------------------------
const missing = nevo.filter((r) => !r.name || [r.kj, r.kcal, r.fat_g, r.carbs_g, r.protein_g].some((v) => v === undefined || v === null))
is('every NEVO food has a name, energy (kJ and kcal), fat, carbohydrate and protein', missing.map((r) => r.nevo_code), [])
const flagged = nevo.filter((r) => energyCheck(r)?.flagged).map((r) => `nevo:${r.nevo_code}`)
is('NEVO energy agrees with the macros, or has been looked at', flagged.filter((k) => !REVIEWED[k]), [])
is('nothing reviewed that no longer needs it (NEVO)', Object.keys(REVIEWED).filter((k) => k.startsWith('nevo:') && !flagged.includes(k)), [])
const g = (v) => (v === undefined || v === null ? null : Number(v))
// Within half a gram: NEVO rounds each figure to a tenth on its own, so a
// part can come out a hair over its whole (starch 31.0 in carbohydrate 30.7).
const overWhole = nevo.filter((r) =>
  (g(r.sat_fat_g) ?? 0) > (g(r.fat_g) ?? 0) + 0.5 || (g(r.sugars_g) ?? 0) > (g(r.carbs_g) ?? 0) + 0.5
  || (g(r.starch_g) ?? 0) > (g(r.carbs_g) ?? 0) + 0.5)
is('saturates within fat, sugars and starch within carbohydrate', overWhole.map((r) => r.nevo_code), [])
const over100 = nevo.filter((r) => ['protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'alcohol_g'].some((k) => (g(r[k]) ?? 0) > 100))
is('no figure past 100 g in 100 g', over100.map((r) => r.nevo_code), [])
is('energy within what the database holds (kJ to 4,000, kcal to 900)', nevo.filter((r) => r.kj > 4000 || r.kcal > 900).map((r) => r.nevo_code), [])
is('carbohydrate is on the EU basis (NEVO publishes available carbohydrate)', sql.includes(`'nevo', 'NEVO-online 2025/9.0', 'eu'`), true)

// ---- units ----------------------------------------------------------------------------------
const withUnits = nevo.filter((r) => r.units?.length)
const badUnits = []
for (const r of withUnits) {
  const read = readUnits(r.units)
  if (read.length !== r.units.length) badUnits.push(`${r.nevo_code}: a unit the app would drop`)
  if (r.units.length > 8) badUnits.push(`${r.nevo_code}: more than 8 units`)
  for (const u of r.units) {
    if (!(u.g >= 0.1 && u.g <= 5000)) badUnits.push(`${r.nevo_code} ${u.name}: weight ${u.g}`)
    if (u.bought_g !== undefined && !(u.bought_g >= u.g && u.bought_g <= 5000)) badUnits.push(`${r.nevo_code} ${u.name}: as bought ${u.bought_g} under ${u.g}`)
  }
  const size = (s) => r.units.find((u) => u.size === s)
  const [S, M, L] = [size('S'), size('M'), size('L')]
  if (S && M && !(S.g < M.g)) badUnits.push(`${r.nevo_code}: small not under medium`)
  if (M && L && !(M.g < L.g)) badUnits.push(`${r.nevo_code}: medium not under large`)
  if (M && /^(small|large) /.test(M.name)) badUnits.push(`${r.nevo_code}: the medium one is not named after the food`)
}
is('units within limits, sizes in order, as bought never under eaten', badUnits, [])
const unitFor = (code, name) => nevo.find((r) => r.nevo_code === code)?.units?.find((u) => u.name === name)
is('an onion is 95 g eaten, 100 g as bought (Portie-online)', [unitFor(63, 'onion')?.g, unitFor(63, 'onion')?.bought_g], [95, 100])
is('a garlic clove is 3 g', unitFor(830, 'clove')?.g, 3)
is('eggs: small 40, medium 50, large 60 g', ['small egg', 'egg', 'large egg'].map((n) => unitFor(83, n)?.g), [40, 50, 60])
is('a banana is 130 g eaten, 186 g as bought', [unitFor(151, 'banana')?.g, unitFor(151, 'banana')?.bought_g], [130, 186])
is('a carrot (winter carrot) is 243 g', unitFor(2728, 'carrot')?.g, 243)
is('a potato is 70 g', unitFor(1, 'potato')?.g, 70)
is('a tomato is 89 g', unitFor(2734, 'tomato')?.g, 89)
is('an apple is 135 g', unitFor(875, 'apple')?.g, 135)

// ---- old foods kept --------------------------------------------------------------------------
const seed = JSON.parse(readFileSync(new URL('../../seed/catalogue.json', import.meta.url), 'utf8')).foods
// Migration 026's corrections, as the database holds the rows now: a fat
// value put right, and fibre recorded as 0 that meant "not measured" made
// unknown (the list is read from 026 itself).
const m026 = readFileSync(new URL('../../supabase/migrations/026_v16_planner.sql', import.meta.url), 'utf8')
const fibreList = /set fiber_g = null[\s\S]*?name in \(([\s\S]*?)\);/.exec(m026)[1]
const FIXES_026 = { 'Grapeseed Oil': { fat_g: 100 } }
for (const n of fibreList.match(/'[^']+'/g)) FIXES_026[n.slice(1, -1)] = { fiber_g: null }
const kept = seed.filter((f) => KEEP[f.name]).map((f) => ({
  ...f, ...(FIXES_026[f.name] ?? {}), name: KEEP[f.name],
  carbs_g: f.carbs_g == null ? null : Math.max(0, f.carbs_g - (f.fiber_g ?? 0)), // 026: the EU basis
}))
is('every kept food is in the old list', kept.length, Object.keys(KEEP).length)
const keptFlagged = kept.filter((f) => energyCheck(f)?.flagged).map((f) => f.name)
is('kept foods: energy agrees with the macros, or has been looked at', keptFlagged.filter((n) => !REVIEWED[n]), [])
is('nothing reviewed that no longer needs it (kept foods)', Object.keys(REVIEWED).filter((k) => !k.startsWith('nevo:') && !keptFlagged.includes(k)), [])
is('kept foods have the old required figures', kept.filter((f) => f.kcal == null || f.protein_g == null || f.carbs_g == null).map((f) => f.name), [])
const FATS = /oil|fat|butter|ghee|whey|egg|cheese|milk|salmon|bass|carp|flounder|haddock|halibut|ling|monkfish|redfish|pike|swordfish|trout|turbot|whiting|clams|octopus|shrimp|boar|goose|pork|turkey|kefir/i
const plantZeroFibre = kept.filter((f) => f.fiber_g === 0 && !FATS.test(f.name)).map((f) => f.name)
is('no kept plant food with fibre 0 meaning "not measured"', plantZeroFibre.filter((n) => !['Coconut water', 'Lime juice', 'Water chestnuts'].includes(n)), [])

// ---- migration 035: USDA units and staples ---------------------------------------------------
const m035 = readFileSync(new URL('../../supabase/migrations/035_food_units_usda.sql', import.meta.url), 'utf8')
const blocks = [...m035.matchAll(/\$usda\$(\[[\s\S]*?\])\$usda\$/g)].map((m) => JSON.parse(m[1]))
const [onNevo, onKept, newFoods] = blocks
is('035 has its three data blocks', blocks.length, 3)
const sizeOrder = ['S', 'M', 'L', 'XL']
const bad035 = []
for (const [key, units] of [...onNevo.map((r) => [`nevo:${r.nevo_code}`, r.units]), ...onKept.map((r) => [r.name, r.units]), ...newFoods.map((f) => [f.name, f.units])]) {
  if (readUnits(units).length !== units.length) bad035.push(`${key}: a unit the app would drop`)
  if (units.length > 8) bad035.push(`${key}: more than 8 units`)
  for (const x of units) {
    if (!x.source) bad035.push(`${key} ${x.name}: no source`)
    if (x.bought_g !== undefined && !(x.bought_g >= x.g && x.bought_g <= 5000)) bad035.push(`${key} ${x.name}: as bought ${x.bought_g}`)
  }
  const sized = sizeOrder.map((z) => units.find((x) => x.size === z)).filter(Boolean)
  for (let i = 1; i < sized.length; i++) if (!(sized[i - 1].g < sized[i].g)) bad035.push(`${key}: ${sized[i - 1].name} not under ${sized[i].name}`)
  const M = units.find((x) => x.size === 'M')
  if (M && /^(small|large|extra large) /.test(M.name)) bad035.push(`${key}: the medium one is not named after the food`)
}
is('035: units within limits, every one with its source, sizes in order', bad035, [])
// Additions only: every unit a NEVO food had stays, unchanged, except
// GetIt's own version-15 piece weights where USDA measured that piece.
const was = new Map(nevo.map((r) => [r.nevo_code, r.units ?? []]))
const lost = onNevo.flatMap((r) => was.get(r.nevo_code).filter((x) =>
  !r.units.some((y) => JSON.stringify(y) === JSON.stringify(x)) && x.source !== 'GetIt').map((x) => `${r.nevo_code} ${x.name}`))
is('035 adds to NEVO foods\' units and keeps every Portie-online unit as it was', lost, [])
is('035 only touches foods that are in NEVO', onNevo.filter((r) => !was.has(r.nevo_code)).map((r) => r.nevo_code), [])
const u035 = (code, name) => onNevo.find((r) => r.nevo_code === code)?.units.find((x) => x.name === name)
is('a medium cauliflower is 588 g eaten (USDA), 1507.7 g as bought (61% refuse)', [u035(14, 'cauliflower')?.g, u035(14, 'cauliflower')?.bought_g], [588, 1507.7])
is('a floret is 13 g', u035(14, 'floret')?.g, 13)
is('a sprig of parsley is 1 g (10 sprigs weigh 10 g)', u035(128, 'sprig')?.g, 1)
is('a tin of chickpeas: 253 g drained, 448 g as bought', [u035(3185, 'tin')?.g, u035(3185, 'tin')?.bought_g], [253, 448])
is('Portie-online still gives the onion; USDA adds a slice', [u035(63, 'onion')?.source, u035(63, 'slice')?.source], ['Portie-online 2026/2.0', 'USDA FoodData Central'])
is('eggs: S 40, M 50, L 60 and XL 68.6 g', ['small egg', 'egg', 'large egg', 'extra large egg'].map((n) => u035(83, n)?.g), [40, 50, 60, 68.6])
is('the peach is USDA\'s now, in three sizes', ['small peach', 'peach', 'large peach'].map((n) => u035(5079, n)?.g), [130, 150, 175])
const names035 = new Set(newFoods.map((f) => f.name))
is('the new staples are a bagel and chicken thighs', [...names035], ['Bagel, plain', 'Chicken thigh fillet, raw', 'Chicken thigh with skin, raw'])
is('new staples have the required figures', newFoods.filter((f) => [f.kj, f.kcal, f.fat_g, f.carbs_g, f.protein_g].some((v) => v === undefined)).map((f) => f.name), [])
is('new staples: energy agrees with the macros', newFoods.filter((f) => energyCheck(f)?.flagged).map((f) => f.name), [])
is('new staples are marked as USDA\'s, with the food they came from', newFoods.every((f) => /^fdc:\d+$/.test(f.source_ref)) && m035.includes(`'usda', 'USDA FoodData Central, SR Legacy (April 2018)', 'eu'`), true)
is('Human milk is hidden', /where nevo_code in \(297\)/.test(m035), true)

// The rules scripts/units-usda.mjs adds by.
const P = { source: 'Portie-online 2026/2.0' }
const portie = [{ name: 'pear', g: 214, size: 'M', ...P }]
is('Portie-online wins: USDA sizes of a piece it gives are not added', merge(portie, [{ name: 'small pear', g: 148, size: 'S', source: USDA }]).map((x) => x.name), ['pear'])
is('USDA adds a part Portie-online does not give', merge(portie, [{ name: 'slice', g: 20, source: USDA }]).map((x) => x.name), ['pear', 'slice'])
is('a name the food has is never added again', merge([{ name: 'Slice', g: 35, source: 'GetIt' }], [{ name: 'slice', g: 20, source: USDA }]).length, 1)
is('GetIt\'s own piece weight gives way where USDA measured it', merge([{ name: 'plum', g: 65, source: 'GetIt' }], [{ name: 'plum', g: 66, source: USDA }], ['plum']).map((x) => x.g), [66])
is('never more than eight units', merge(Array.from({ length: 8 }, (_, i) => ({ name: `u${i}`, g: 1 })), [{ name: 'x', g: 1, source: USDA }]).length, 8)
is('plurals: leaf, cherry, radish, tbsp chopped', ['leaf', 'outer leaf', 'cherry', 'radish', 'tbsp chopped'].map(plural), ['leaves', 'outer leaves', 'cherries', 'radishes', undefined])
is('a USDA food\'s id is the same every run and a version 5 UUID', [usdaId('18408') === usdaId('18408'), /^[0-9a-f]{8}-[0-9a-f]{4}-5/.test(usdaId('18408'))], [true, true])
is('bought by the piece: a cauliflower yes, blueberries and a soup mix no', [
  byThePiece({ name: 'Cauliflower, raw', food_group: 'Vegetables', state: 'raw' }),
  byThePiece({ name: 'Blueberries', food_group: 'Fruits', state: 'raw' }),
  byThePiece({ name: 'Vegetable mix for soup, raw', food_group: 'Vegetables', state: 'raw' }),
], [true, false, false])

console.log(fail ? `\n${fail} failed` : '\nAll food data checks passed')
process.exit(fail ? 1 : 0)
