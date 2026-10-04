#!/usr/bin/env node
// Unit weights and a few staples from USDA FoodData Central, added to the
// shared catalogue (UNIT-10, UNIT-13, UNIT-14, FOOD-10, FOOD-11).
//
//   node scripts/units-usda.mjs <SR Legacy CSV folder> <SR28 ASCII folder>           report only
//   node scripts/units-usda.mjs <SR Legacy CSV folder> <SR28 ASCII folder> --write   rewrite migration 035's data
//
// Where the data comes from: USDA FoodData Central, "SR Legacy" (April 2018),
// downloaded as CSV from https://fdc.nal.usda.gov/download-datasets. USDA's
// data is in the public domain (CC0 1.0), so it may be used and changed
// freely; GetIt still says where every figure came from. The CSV release has
// no refuse figures (the share of a food as bought that is not eaten: peel,
// core, stone, shell), so those are read from the same data in its SR28 ASCII
// form (FOOD_DES.txt, https://www.ars.usda.gov/ARSUserFiles/80400535/DATA/SR/sr28/dnload/sr28asc.zip).
//
// What USDA's weights mean (SR28 documentation, "Weights and Measures"):
// every household measure ("1 medium", "1 head", "10 sprigs") is given for
// the edible part, without refuse; refuse is a percentage of the item as
// purchased. So a unit's `g` is USDA's gram weight (divided by the number in
// the measure: "10 sprigs = 10 g" is a sprig of 1 g), and what one weighs as
// bought is that weight ÷ (1 − refuse), for a whole piece only (a pineapple,
// not a slice of one). Nothing is estimated: a food USDA gives no piece
// weight for gets no unit.
//
// How they meet NEVO: NEVO's conditions allow additions that are clearly
// marked as additions, and no amendments. So no NEVO value changes here: each
// unit is added to the NEVO food it fits, keyed by NEVO's code, and carries
// source "USDA FoodData Central". A NEVO food and a USDA food are matched by
// hand, only where they are clearly the same food in the same state (NEVO's
// "Cauliflower, raw" and USDA's "Cauliflower, raw"); NEVO's tinned foods are
// drained (NEVO background information 2025, 5.2), so a tin is USDA's
// drained weight, and the whole tin as bought. RIVM Portie-online weights
// win: where a food already has Portie-online units for a piece (its sizes),
// USDA adds only parts of it (a slice, a leaf). GetIt's own piece weights
// from version 15 are replaced by USDA's where USDA measured that piece.
//
// The raw USDA files are not kept in the repository; the generated migration
// is.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseDelimited, compact } from './import-nevo.mjs'
import { KEEP } from './nevo-additions.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const MIGRATION = join(HERE, '..', 'supabase', 'migrations', '035_food_units_usda.sql')
const CATALOGUE = join(HERE, '..', 'supabase', 'migrations', '027_food_catalogue.sql')
export const BEGIN = '-- BEGIN GENERATED USDA DATA'
export const END = '-- END GENERATED USDA DATA'

/** What every unit and food from here says it came from. */
export const USDA = 'USDA FoodData Central'
export const USDA_VERSION = 'USDA FoodData Central, SR Legacy (April 2018)'
/** The extra-large egg is worked out, not measured: see EGG_XL. */
export const EGG_SOURCE = 'GetIt: EU grade × USDA shell share'
const MAX_UNITS = 8

// ---- the matches ------------------------------------------------------------------------

/** A unit to take from a USDA food's portions: `re` picks the portion by its
 *  description (exactly one must match), `name` is what the person sees.
 *  `whole` marks a piece that is bought whole, so it gets an as-bought
 *  weight from the refuse. */
const u = (re, name, opts = {}) => ({ re, name, ...opts })
const whole = { whole: true }
/** Small, medium and large of one piece: the medium one carries the food's
 *  own word, so "1 radish" is a medium radish. */
const sml = (word, m, s, l, opts = whole) => [
  u(m, word, { size: 'M', ...opts }),
  ...(s ? [u(s, `small ${word}`, { size: 'S', ...opts })] : []),
  ...(l ? [u(l, `large ${word}`, { size: 'L', ...opts })] : []),
]

/** NEVO foods (by code) and the USDA food (by NDB number) whose portions they
 *  take. `replace` names GetIt's own version-15 units this replaces. */
export const MATCHES = [
  // Vegetables
  { codes: [7], ndb: '11213', why: 'Endive, raw', units: [u(/^head$/, 'head', whole)] },
  { codes: [3220], ndb: '11011', why: 'Asparagus, raw (green)', units: sml('spear', /^spear, medium/, /^spear, small/, /^spear, large/) },
  { codes: [12], ndb: '11080', why: 'Beets, raw', units: [u(/^beet \(2" dia\)$/, 'beetroot', whole)] },
  { codes: [14], ndb: '11135', why: 'Cauliflower, raw', units: [...sml('cauliflower', /^head medium/, /^head small/, /^head large/), u(/^floweret$/, 'floret')] },
  { codes: [17], ndb: '11239', why: 'Mushrooms, Chanterelle, raw', units: [u(/^piece$/, 'chanterelle', whole)] },
  { codes: [19], ndb: '11260', why: 'Mushrooms, white, raw', units: [u(/^slice$/, 'slice')] },
  { codes: [1892], ndb: '11116', why: 'Cabbage, chinese (pak-choi), raw', units: [u(/^leaf$/, 'leaf')] },
  { codes: [69], ndb: '11109', why: 'Cabbage, raw (white head cabbage)', units: [...sml('cabbage', /^head, medium/, /^head, small/, /^head, large/), u(/^leaf, medium$/, 'leaf')] },
  { codes: [41], ndb: '11112', why: 'Cabbage, red, raw', units: [...sml('cabbage', /^head, medium/, /^head, small/, /^head, large/), u(/^leaf$/, 'leaf')] },
  { codes: [27], ndb: '11206', why: 'Cucumber, peeled, raw', units: [...sml('cucumber', /^medium$/, /^small/, /^large/), u(/^slice$/, 'slice'), u(/^stick/, 'stick')] },
  { codes: [31], ndb: '11333', why: 'Peppers, sweet, green, raw', units: [u(/^ring/, 'ring')] },
  { codes: [884], ndb: '11821', why: 'Peppers, sweet, red, raw', units: [u(/^ring/, 'ring')] },
  { codes: [35], ndb: '11300', why: 'Peas, edible-podded, raw', units: [u(/^pea pods$/, 'pod')] },
  { codes: [40], ndb: '09307', why: 'Rhubarb, raw', units: [u(/^stalk$/, 'stalk', whole)] },
  { codes: [46], ndb: '11250', why: 'Lettuce, butterhead, raw', units: [u(/^head/, 'head', whole), u(/^leaf, medium$/, 'leaf')] },
  { codes: [51], ndb: '11457', why: 'Spinach, raw', units: [u(/^bunch$/, 'bunch', whole), u(/^leaf$/, 'leaf')] },
  { codes: [557], ndb: '11143', why: 'Celery, raw', units: sml('stalk', /^stalk, medium/, /^stalk, small/, /^stalk, large/, {}) },
  { codes: [559], ndb: '11435', why: 'Rutabagas, raw', units: sml('swede', /^medium$/, /^small$/, /^large$/) },
  { codes: [560], ndb: '11241', why: 'Kohlrabi, raw', units: [u(/^slice$/, 'slice')] },
  { codes: [563], ndb: '11147', why: 'Chard, swiss, raw', units: [u(/^leaf$/, 'leaf')] },
  { codes: [564], ndb: '11098', why: 'Brussels sprouts, raw', units: [u(/^sprout$/, 'sprout', whole)] },
  { codes: [671], ndb: '11507', why: 'Sweet potato, raw', units: [u(/^sweetpotato, 5" long$/, 'sweet potato', whole)] },
  { codes: [667], ndb: '11134', why: 'Cassava, raw', units: [u(/^root$/, 'root', whole)] },
  { codes: [680], ndb: '11278', why: 'Okra, raw', units: [u(/^pods/, 'pod', whole)] },
  { codes: [849], ndb: '11957', why: 'Fennel, bulb, raw', units: [u(/^bulb$/, 'bulb', whole)] },
  { codes: [1021], ndb: '11007', why: 'Artichokes, (globe or french), raw', units: [u(/^artichoke, medium$/, 'artichoke', { size: 'M', whole: true }), u(/^artichoke, large$/, 'large artichoke', { size: 'L', whole: true })] },
  { codes: [832], ndb: '11216', why: 'Ginger root, raw', units: [u(/^slices \(1" dia\)$/, 'slice'), u(/^tsp$/, 'tsp')] },
  { codes: [829], ndb: '11156', why: 'Chives, raw', units: [u(/^tbsp chopped$/, 'tbsp chopped')] },
  { codes: [2177], ndb: '02044', why: 'Basil, fresh', units: [u(/^leaves$/, 'leaf'), u(/^tbsp, chopped$/, 'tbsp chopped')] },
  { codes: [128], ndb: '11297', why: 'Parsley, fresh', units: [u(/^sprigs$/, 'sprig'), u(/^tbsp$/, 'tbsp')] },
  { codes: [2737], ndb: '11291', why: 'Onions, spring or scallions, raw', units: [...sml('spring onion', /^medium/, /^small/, /^large$/), u(/^tbsp chopped$/, 'tbsp chopped')] },
  { codes: [63], ndb: '11282', why: 'Onions, raw', units: [u(/^slice, medium/, 'slice')] },
  // USDA's raw onion is the dry bulb onion, sized by its width, whatever its
  // colour; NEVO's red onion has no Portie-online sizes.
  { codes: [5459], ndb: '11282', why: 'Onions, raw (dry bulb onion, sized by width)', units: [...sml('onion', /^medium/, /^small$/, /^large$/), u(/^slice, medium/, 'slice')] },
  { codes: [5522], ndb: '11564', why: 'Turnips, raw', units: [...sml('turnip', /^medium$/, /^small$/, /^large$/), u(/^slice$/, 'slice')] },
  { codes: [124], ndb: '11429', why: 'Radishes, raw', units: [...sml('radish', /^medium/, /^small$/, /^large/), u(/^slice$/, 'slice')] },
  { codes: [67], ndb: '11151', why: 'Chicory, witloof, raw', units: [u(/^head$/, 'head', whole)] },
  { codes: [1399], ndb: '11252', why: 'Lettuce, iceberg, raw', units: [...sml('head', /^head, medium/, /^head, small$/, /^head, large$/), u(/^leaf, medium$/, 'leaf')] },
  { codes: [3332], ndb: '11251', why: 'Lettuce, cos or romaine, raw', units: [u(/^head$/, 'head', whole), u(/^leaf outer$/, 'outer leaf'), u(/^leaf inner$/, 'inner leaf')] },
  { codes: [2708], ndb: '11257', why: 'Lettuce, red leaf, raw', units: [u(/^head$/, 'head', whole), u(/^leaf outer$/, 'outer leaf'), u(/^leaf inner$/, 'inner leaf')] },
  { codes: [2736], ndb: '11959', why: 'Arugula, raw', units: [u(/^leaf$/, 'leaf')] },
  { codes: [922], ndb: '11477', why: 'Squash, summer, zucchini, includes skin, raw', units: [u(/^slice$/, 'slice')] },
  { codes: [562], ndb: '11246', why: 'Leeks, raw', units: [u(/^slice$/, 'slice')] },
  { codes: [71, 2728], ndb: '11124', why: 'Carrots, raw', units: [u(/^slice$/, 'slice')] },
  { codes: [60, 2730, 2734], ndb: '11529', why: 'Tomatoes, red, ripe, raw', units: [u(/^wedge/, 'wedge')] },
  { codes: [921], ndb: '11090', why: 'Broccoli, raw', units: [u(/^spear/, 'spear')] },
  { codes: [132], ndb: '11940', why: 'Pickles, cucumber, sweet (gherkins)', units: [u(/^Gherkin \(2-3\/4" long\)$/, 'gherkin', { size: 'M' }), u(/^small Gherkin/, 'small gherkin', { size: 'S' }), u(/^large Gherkin/, 'large gherkin', { size: 'L' })] },
  // Tins: NEVO's figures are for the drained food; USDA weighed the same
  // 425 ml tin drained and whole.
  { codes: [3185, 5430], ndb: '16358', why: 'Chickpeas, canned, drained solids', units: [u(/^can drained$/, 'tin', { bought: { ndb: '16058', re: /^can \(total can contents\)$/ } })] },
  { codes: [3184, 5431], ndb: '16145', why: 'Beans, kidney, red, canned, drained solids', units: [u(/^can drained solids$/, 'tin', { bought: { ndb: '16034', re: /^can$/ } })] },

  // Fruit
  { codes: [147, 2752, 2754], ndb: '09004', why: 'Apples, raw, without skin (as Portie-online gives the apple sizes to Elstar and Jonagold)', units: sml('apple', /^medium/, /^small/, /^large/) },
  { codes: [148], ndb: '09316', why: 'Strawberries, raw', units: sml('strawberry', /^medium/, /^small/, /^large/) },
  { codes: [150], ndb: '09266', why: 'Pineapple, raw, all varieties', units: [u(/^fruit$/, 'pineapple', whole), u(/^slice \(3-1\/2" dia x 3\/4" thick\)$/, 'slice')] },
  { codes: [160, 2749, 2750], ndb: '09132', why: 'Grapes, red or green (European type), raw', units: [u(/^grapes$/, 'grape')] },
  { codes: [161], ndb: '09302', why: 'Raspberries, raw', units: [u(/^raspberries$/, 'raspberry')] },
  { codes: [162], ndb: '09111', why: 'Grapefruit, raw, pink and red and white', units: sml('grapefruit', /^medium/, /^small/, /^large/) },
  { codes: [163], ndb: '09070', why: 'Cherries, sweet, raw', units: [u(/^cherry$/, 'cherry', whole)] },
  // USDA's cantaloupe is the North American netted muskmelon: NEVO's netted
  // melon as much as its cantaloupe.
  { codes: [3341, 166], ndb: '09181', why: 'Melons, cantaloupe (netted muskmelon), raw', units: [...sml('melon', /^melon, medium/, /^melon, small/, /^melon, large/), u(/^wedge, medium/, 'wedge')] },
  { codes: [1106], ndb: '09184', why: 'Melons, honeydew, raw', units: [u(/^melon \(5-1\/4" dia\)$/, 'melon', { size: 'M', whole: true }), u(/^melon \(6" - 7" dia\)$/, 'large melon', { size: 'L', whole: true }), u(/^wedge \(1\/8 of 5-1\/4" dia melon\)$/, 'wedge')] },
  { codes: [1105], ndb: '09326', why: 'Watermelon, raw', units: [u(/^melon/, 'watermelon', whole), u(/^wedge/, 'wedge')] },
  { codes: [690], ndb: '09139', why: 'Guavas, common, raw', units: [u(/^fruit, without refuse$/, 'guava', whole)] },
  { codes: [692], ndb: '09176', why: 'Mangos, raw', units: [u(/^fruit without refuse$/, 'mango', whole)] },
  { codes: [693], ndb: '09226', why: 'Papayas, raw', units: [u(/^fruit, small$/, 'small papaya', { size: 'S', whole: true }), u(/^fruit, large$/, 'large papaya', { size: 'L', whole: true })] },
  { codes: [1007], ndb: '09286', why: 'Pomegranates, raw', units: [u(/^pomegranate/, 'pomegranate', whole)] },
  { codes: [1010], ndb: '09089', why: 'Figs, raw', units: sml('fig', /^medium/, /^small/, /^large/) },
  { codes: [3219], ndb: '09520', why: 'Kiwifruit, ZESPRI SunGold (yellow), raw', units: [u(/^fruit$/, 'kiwi', whole)] },
  { codes: [1057], ndb: '09263', why: 'Persimmons, japanese, raw', units: [u(/^fruit/, 'sharon fruit', whole)] },
  { codes: [1074], ndb: '09231', why: 'Passion-fruit, purple, raw', units: [u(/^fruit without refuse$/, 'passion fruit', whole)] },
  { codes: [1090], ndb: '09164', why: 'Litchis, raw', units: [u(/^fruit without refuse$/, 'lychee', whole)] },
  { codes: [1099], ndb: '09149', why: 'Kumquats, raw', units: [u(/^fruit without refuse$/, 'kumquat', whole)] },
  { codes: [202], ndb: '12104', why: 'Nuts, coconut meat, raw', units: [u(/^medium$/, 'coconut', whole), u(/^piece/, 'piece')] },
  { codes: [665], ndb: '09277', why: 'Plantains, yellow, raw', units: [u(/^plantain$/, 'plantain', whole)] },
  { codes: [1888], ndb: '09060', why: 'Carambola, raw', units: sml('carambola', /^medium/, /^small/, /^large/) },
  { codes: [149], ndb: '09021', why: 'Apricots, raw', replace: ['apricot'], units: [u(/^apricot$/, 'apricot', whole)] },
  { codes: [5079], ndb: '09236', why: 'Peaches, yellow, raw', replace: ['peach'], units: sml('peach', /^medium/, /^small/, /^large/) },
  { codes: [1812], ndb: '09191', why: 'Nectarines, raw', replace: ['nectarine'], units: sml('nectarine', /^medium/, /^small/, /^large/) },
  { codes: [170], ndb: '09279', why: 'Plums, raw', replace: ['plum'], units: [u(/^fruit/, 'plum', whole)] },
  { codes: [181], ndb: '09087', why: 'Dates, deglet noor (dried)', replace: ['date'], units: [u(/^date, pitted$/, 'date')] },

  // Bread
  // A croissant weighs the same whatever its fat: the sizes go on each kind.
  { codes: [2801, 2802, 2818], ndb: '18239', why: 'Croissants, butter', units: [...sml('croissant', /^croissant, medium$/, /^croissant, small$/, /^croissant, large$/, {}), u(/^croissant, mini$/, 'mini croissant')] },
  { codes: [2795], ndb: '18353', why: 'Rolls, hard (includes kaiser)', units: [u(/^roll \(3-1\/2" dia\)$/, 'roll')] },
  { codes: [230], ndb: '18342', why: 'Rolls, dinner, plain', units: [u(/^roll \(1 oz\)$/, 'roll'), u(/^roll \(hamburger/, 'large roll')] },
  { codes: [2797], ndb: '18347', why: 'Rolls, dinner, wheat', units: [u(/^roll \(1 oz\)$/, 'roll')] },
  { codes: [2798], ndb: '18348', why: 'Rolls, dinner, whole-wheat', units: [u(/^medium \(2-1\/2" dia\)$/, 'roll'), u(/^roll \(hamburger/, 'large roll')] },
  { codes: [2790], ndb: '18041', why: 'Bread, pita, white', units: [u(/^pita, small/, 'small pita', { size: 'S' }), u(/^pita, large/, 'large pita', { size: 'L' })] },
]

/** Foods kept from GetIt's first (US) catalogue, by the name they have now:
 *  they came from the same USDA list, so the match is the food itself. */
export const KEPT_MATCHES = [
  { names: ['Sweetcorn, raw'], ndb: '11167', why: 'Corn, sweet, yellow, raw', units: sml('cob', /^ear, medium/, /^ear, small/, /^ear, large/) },
  { names: ['Coriander leaves, fresh'], ndb: '11165', why: 'Coriander (cilantro) leaves, raw', units: [u(/^sprigs$/, 'sprig')] },
  { names: ['Dill, fresh'], ndb: '02045', why: 'Dill weed, fresh', units: [u(/^sprigs$/, 'sprig')] },
  { names: ['Watercress, raw'], ndb: '11591', why: 'Watercress, raw', units: [u(/^sprig$/, 'sprig')] },
  { names: ['Thyme, fresh'], ndb: '02049', why: 'Thyme, fresh', units: [u(/^tsp$/, 'tsp')] },
  { names: ['Shallot, raw'], ndb: '11677', why: 'Shallots, raw', units: [u(/^tbsp chopped$/, 'tbsp chopped')] },
  { names: ['Portobello mushroom, raw'], ndb: '11265', why: 'Mushrooms, portabella, raw', units: [u(/^piece whole$/, 'mushroom', whole)] },
  { names: ['Shiitake mushrooms, raw'], ndb: '11238', why: 'Mushrooms, shiitake, raw', units: [u(/^piece whole$/, 'mushroom', whole)] },
  { names: ['Chestnut mushrooms, raw'], ndb: '11266', why: 'Mushrooms, brown, italian, or crimini, raw', units: [u(/^piece whole$/, 'mushroom', whole)] },
  { names: ['Jalapeño pepper, raw'], ndb: '11979', why: 'Peppers, jalapeno, raw', units: [u(/^pepper$/, 'pepper', whole)] },
  { names: ['Daikon (white radish), raw'], ndb: '11430', why: 'Radishes, oriental, raw', units: [u(/^radish/, 'daikon', whole)] },
  { names: ['Nashi pear'], ndb: '09340', why: 'Pears, asian, raw', units: [u(/^fruit 2-1\/4"/, 'small pear', { size: 'S', whole: true }), u(/^fruit 3-3\/8"/, 'large pear', { size: 'L', whole: true })] },
  { names: ['Quince'], ndb: '09296', why: 'Quinces, raw', units: [u(/^fruit without refuse$/, 'quince', whole)] },
  { names: ['Pomelo'], ndb: '09295', why: 'Pummelo, raw', units: [u(/^fruit without refuse$/, 'pomelo', whole)] },
  { names: ['Baby carrots, raw'], ndb: '11960', why: 'Carrots, baby, raw', units: [u(/^medium$/, 'carrot', { size: 'M' }), u(/^large$/, 'large carrot', { size: 'L' })] },
  { names: ['Acorn squash, raw'], ndb: '11482', why: 'Squash, winter, acorn, raw', units: [u(/^squash/, 'squash', whole)] },
  { names: ['Medjool dates'], ndb: '09421', why: 'Dates, medjool', units: [u(/^date, pitted$/, 'date', whole)] },
  { names: ['Duck egg'], ndb: '01138', why: 'Egg, duck, whole, fresh, raw', units: [u(/^egg$/, 'egg', whole)] },
  { names: ['Quail egg'], ndb: '01140', why: 'Egg, quail, whole, fresh, raw', units: [u(/^egg$/, 'egg', whole)] },
  { names: ['Sweet onion, raw'], ndb: '11294', why: 'Onions, sweet, raw', units: [u(/^onion$/, 'onion', whole)] },
  { names: ['Green leaf lettuce'], ndb: '11253', why: 'Lettuce, green leaf, raw', units: [u(/^head$/, 'head', whole), u(/^leaf outer$/, 'outer leaf'), u(/^leaf inner$/, 'inner leaf')] },
]

/** EU egg sizes (UNIT-14). Portie-online gives S 40, M 50 and L 60 g eaten;
 *  it has no XL. EU marketing standards (Regulation (EC) No 589/2008,
 *  article 4) grade an XL egg as 73 g or more in the shell, and the S, M and
 *  L bands are 10 g wide (under 53, 53–63, 63–73). Taken at the middle of a
 *  band of the same width, 78 g in the shell, with USDA's share of a whole
 *  raw egg that is shell (12% refuse, "Egg, whole, raw, fresh", NDB 01123),
 *  an XL egg is 78 × 0.88 = 68.6 g eaten. The same reckoning gives L 59.8,
 *  M 51.0: Portie-online's 60 and 50 within a gram. */
export const EGG_XL = { name: 'extra large egg', plural: 'extra large eggs', g: 68.6, bought_g: 78, size: 'XL', source: EGG_SOURCE }
/** The NEVO eggs that carry Portie-online's egg sizes. */
export const EGG_CODES = [83, 84, 2769, 2770, 2771, 2772, 2773, 2774]

/** Staples the catalogue lacked (FOOD-10), as shared foods from USDA. NEVO
 *  has no bagel and no chicken thigh (version 15's thighs were US retail cuts
 *  and are hidden). */
export const NEW_FOODS = [
  {
    ndb: '18408', name: 'Bagel, plain', group: 'Bread', synonyms: 'Bagel naturel',
    // Unenriched and without calcium propionate: closest to a European bagel.
    units: sml('bagel', /^medium bagel/, /^small bagel/, /^large bagel/, {}).concat([u(/^mini bagel/, 'mini bagel')]),
  },
  {
    ndb: '05096', name: 'Chicken thigh fillet, raw', group: 'Meat and poultry',
    synonyms: 'Kippendijfilet/chicken thigh without skin, boneless',
    units: [u(/^thigh without skin$/, 'thigh fillet')],
  },
  {
    ndb: '05091', name: 'Chicken thigh with skin, raw', group: 'Meat and poultry',
    synonyms: 'Kippendij met vel/chicken thigh with skin, boneless',
    units: [u(/^thigh with skin$/, 'thigh')],
  },
]

/** Display names (GetIt's additions; NEVO's own names stay beside them) that
 *  make a staple findable by the word people use: granola is NEVO's
 *  "crunchy muesli", chicken breast its "chicken fillet". */
export const NAMES = {
  2675: 'Granola (crunchy muesli) with nuts', 2676: 'Granola (crunchy muesli) with chocolate',
  2677: 'Granola (crunchy muesli) with nuts and chocolate', 5491: 'Granola (crunchy muesli) with fruit fortified with fibre',
  5495: 'Granola (crunchy muesli) with nuts fortified with fibre', 5496: 'Granola (crunchy muesli) with chocolate fortified with fibre',
  5593: 'Granola (crunchy muesli), plain', 5594: 'Granola (crunchy muesli) with fruit',
  1634: 'Chicken breast fillet, raw', 1392: 'Chicken breast fillet, prepared',
}

/** NEVO foods hidden from the shared list (FOOD-11). Hiding is not an
 *  amendment: the row and its figures stay, and whatever used it adds up. */
export const HIDDEN = { 297: 'Human milk' }

// ---- reading USDA's files ------------------------------------------------------------------

const csv = (dir, file) => {
  const [head, ...rows] = parseDelimited(readFileSync(join(dir, file), 'utf8'), ',')
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}
const ndbKey = (n) => String(n).padStart(5, '0')

/** USDA's SR Legacy foods: description, portions and the nutrients the
 *  catalogue keeps, by NDB number; refuse from SR28's FOOD_DES. Only the
 *  foods asked for are kept in full. */
export function readUsda(csvDir, sr28Dir, wanted) {
  const want = new Set(wanted)
  const fdcOf = new Map()
  for (const r of csv(csvDir, 'sr_legacy_food.csv')) if (want.has(ndbKey(r.NDB_number))) fdcOf.set(r.fdc_id, ndbKey(r.NDB_number))
  const foods = new Map()
  for (const r of csv(csvDir, 'food.csv')) if (fdcOf.has(r.fdc_id)) foods.set(fdcOf.get(r.fdc_id), { ndb: fdcOf.get(r.fdc_id), fdc: r.fdc_id, desc: r.description, portions: [], nutrients: {} })
  for (const r of csv(csvDir, 'food_portion.csv')) {
    const f = foods.get(fdcOf.get(r.fdc_id))
    if (f) f.portions.push({ amount: Number(r.amount), text: [r.portion_description, r.modifier].filter(Boolean).join(' ').trim(), g: Number(r.gram_weight) })
  }
  const nbr = new Map(csv(csvDir, 'nutrient.csv').map((r) => [r.id, r.nutrient_nbr]))
  // food_nutrient.csv is large; read line by line without building rows.
  const text = readFileSync(join(csvDir, 'food_nutrient.csv'), 'utf8')
  for (const line of text.split('\n').slice(1)) {
    const m = /^"[^"]*","([^"]*)","([^"]*)","([^"]*)"/.exec(line)
    if (!m) continue
    const f = foods.get(fdcOf.get(m[1]))
    if (f) f.nutrients[nbr.get(m[2])] = Number(m[3])
  }
  for (const line of readFileSync(join(sr28Dir, 'FOOD_DES.txt'), 'latin1').split(/\r?\n/)) {
    const c = line.split('^').map((x) => x.replace(/^~|~$/g, ''))
    const f = foods.get(c[0])
    if (f) { f.refuse = c[8] === '' ? 0 : Number(c[8]); f.refuseText = c[7] }
  }
  return foods
}

// ---- building the units -------------------------------------------------------------------

const r1 = (n) => Math.round(n * 10) / 10
/** The plural a unit is written with ("leaf" → "leaves", "cherry" →
 *  "cherries"); measures like "tbsp chopped" stay as they are. */
export function plural(name) {
  if (/^(tbsp|tsp)\b/.test(name)) return undefined
  if (/leaf$/.test(name)) return name.replace(/leaf$/, 'leaves')
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`
  if (/(ch|sh|s|x)$/.test(name)) return `${name}es`
  if (/(potato|tomato|mango)$/.test(name)) return `${name}es`
  return `${name}s`
}

/** The one portion a pattern picks, or a problem. */
function portion(food, re, problems, where) {
  const hits = food.portions.filter((p) => re.test(p.text))
  // "1 tsp" and "0.5 tsp" are one measure written twice: the same weight each.
  const one = new Set(hits.map((p) => r1(p.g / p.amount)))
  if (hits.length !== 1 && !(hits.length > 1 && one.size === 1)) {
    problems.push(`${where}: ${re} matches ${hits.length} of ${food.ndb} "${food.desc}" (${food.portions.map((p) => `${p.amount} ${p.text}`).join('; ')})`)
    return null
  }
  return hits[0]
}

/** The units one USDA food gives, measured, with their as-bought weights. */
export function usdaUnits(spec, usda, problems, where) {
  const food = usda.get(spec.ndb)
  if (!food) { problems.push(`${where}: no USDA food ${spec.ndb}`); return [] }
  const out = []
  for (const s of spec.units) {
    const p = portion(food, s.re, problems, where)
    if (!p) continue
    const g = r1(p.g / p.amount)
    const unit = { name: s.name, ...(plural(s.name) ? { plural: plural(s.name) } : {}), g }
    if (s.whole && food.refuse > 0) {
      const bought = r1(g / (1 - food.refuse / 100))
      if (bought <= 5000) unit.bought_g = bought
    }
    if (s.bought) {
      const other = usda.get(s.bought.ndb)
      const q = other && portion(other, s.bought.re, problems, `${where} (as bought)`)
      if (q) unit.bought_g = r1(q.g / q.amount)
    }
    if (s.size) unit.size = s.size
    unit.source = USDA
    out.push(unit)
  }
  return out
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase()
const isPiece = (u) => !!u.size || /^(small|large) /.test(u.name)

/** A food's units with USDA's added: Portie-online's stay first and win (a
 *  name it has, or the sizes of a piece it gives, are not added again);
 *  GetIt's own version-15 piece weights named in `replace` give way to
 *  USDA's; at most eight in all. */
export function merge(existing, added, replace = []) {
  const kept = existing.filter((x) => !(x.source === 'GetIt' && replace.some((n) => same(n, x.name))))
  const portieSizes = kept.some((x) => x.source?.startsWith('Portie') && isPiece(x))
  const out = [...kept]
  for (const a of added) {
    if (out.length >= MAX_UNITS) break
    if (out.some((x) => same(x.name, a.name))) continue
    if (portieSizes && a.size && a.source === USDA) continue
    out.push(a)
  }
  return out
}

/** A deterministic id for a USDA food (UUID version 5 of "usda:<NDB>"), in
 *  the same namespace as NEVO's foods, so running this again finds the same
 *  rows. */
const NAMESPACE = '3f6c1a52-9d0e-4b7a-8c21-6e5a0b2d2025'
export function usdaId(ndb) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
  const b = createHash('sha1').update(Buffer.concat([ns, Buffer.from(`usda:${ndb}`, 'utf8')])).digest().subarray(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** A shared food row from a USDA food. Carbohydrate is put on the EU basis
 *  (USDA's is "by difference", fibre included; the EU label's is available
 *  carbohydrate), as the foods kept from the US list were (026). */
export function usdaFood(spec, usda, problems) {
  const f = usda.get(spec.ndb)
  if (!f) { problems.push(`NEW_FOODS: no USDA food ${spec.ndb}`); return null }
  const n = (k) => (f.nutrients[k] === undefined ? null : f.nutrients[k])
  const carbs = n('205') === null ? null : r1(Math.max(0, n('205') - (n('291') ?? 0)))
  return {
    id: usdaId(spec.ndb), name: spec.name, name_en: f.desc, synonyms: spec.synonyms ?? null, food_group: spec.group,
    source_note: `FoodData Central ${f.fdc}, SR Legacy NDB ${spec.ndb}`, state: 'raw',
    units: usdaUnits(spec, usda, problems, spec.name),
    kj: n('268'), kcal: n('208'), protein_g: n('203'), fat_g: n('204'), sat_fat_g: n('606'), mufa_g: n('645'), pufa_g: n('646'),
    carbs_g: carbs, sugars_g: n('269'), starch_g: n('209'), fiber_g: n('291'), alcohol_g: n('221'), sodium_mg: n('307'),
    source_ref: `fdc:${f.fdc}`,
  }
}

// ---- the plan -------------------------------------------------------------------------------

/** The NEVO rows as migration 027 loads them. */
export function catalogue(sql = readFileSync(CATALOGUE, 'utf8')) {
  return JSON.parse(sql.slice(sql.indexOf('$nevo$[') + 6, sql.indexOf(']$nevo$') + 1))
}

/** Foods bought or used by the piece, for the coverage count: single raw
 *  fruit, vegetables, tubers and whole eggs (not mixes, averages, juices,
 *  purées, infant food, dried, pickled or powdered), fresh herbs, and the
 *  breads sold as one (rolls, pitta, croissants, bagels). */
export function byThePiece(r) {
  const n = `${r.name} ${r.name_en ?? ''}`.toLowerCase()
  if (r.food_group === 'Herbs and spices') return /\bfresh\b/.test(n) && !/average/.test(n)
  if (r.food_group === 'Bread') return /\b(roll|pita|croissant|bagel)\b/.test(n) && !/(chocolate|ham|cheese|canned)/.test(n)
  if (!['Fruits', 'Vegetables', 'Potatoes and tubers', 'Eggs'].includes(r.food_group)) return false
  if (r.state !== 'raw') return false
  // Berries, pods, sprouts and loose leaves are bought by the punnet, the
  // bag or the weight, never counted.
  return !/(average|\bav\b|mix|mixture|juice|puree|purée|infant|dried|soaked|pickled|powder|sauce|compote|snack|mashed|soup|stir-fry|for stir|sun-dried|yolk|white chicken|paste|precooked|unprepared|forest|rosti|sauerkraut|capers|gnocchi|with apple|bami|tursu|vegetables|prunes|berries|currants|cowberr|bilberr|cranberr|\bpeas\b|beans|bean sprouts|cress|purslane|leaves|tops|lambs lettuce|glasswort|seaweed|sieved|mulberr)/.test(n)
}

export function plan(nevo, usda) {
  const problems = []
  const byCode = new Map(nevo.map((r) => [r.nevo_code, r]))
  const units = new Map() // code → final units
  const touch = (code, added, replace) => {
    const r = byCode.get(code)
    if (!r) { problems.push(`no NEVO food ${code}`); return }
    units.set(code, merge(units.get(code) ?? r.units ?? [], added, replace))
  }
  for (const m of MATCHES) {
    const added = usdaUnits(m, usda, problems, `NEVO ${m.codes.join('/')}`)
    for (const c of m.codes) touch(c, added, m.replace)
  }
  for (const c of EGG_CODES) touch(c, [EGG_XL])
  // Only what changed is written.
  const changed = [...units].filter(([c, list]) => JSON.stringify(list) !== JSON.stringify(byCode.get(c).units ?? []))
    .map(([nevo_code, list]) => ({ nevo_code, units: list }))
  const kept = KEPT_MATCHES.flatMap((m) => {
    for (const n of m.names) if (!Object.values(KEEP).includes(n)) problems.push(`KEPT_MATCHES: no kept food "${n}"`)
    const added = usdaUnits(m, usda, problems, m.names.join('/'))
    return m.names.map((name) => ({ name, units: added.slice(0, MAX_UNITS) }))
  })
  const foods = NEW_FOODS.map((s) => usdaFood(s, usda, problems)).filter(Boolean)
  for (const code of [...Object.keys(NAMES), ...Object.keys(HIDDEN)]) if (!byCode.has(Number(code))) problems.push(`no NEVO food ${code}`)
  for (const [code, name] of Object.entries(HIDDEN)) if (byCode.get(Number(code))?.name !== name) problems.push(`HIDDEN ${code} is not "${name}"`)
  // Names stay unique among the shared foods people see.
  const shown = new Map()
  for (const r of nevo) if (!HIDDEN[r.nevo_code]) shown.set(r.nevo_code, NAMES[r.nevo_code] ?? r.name)
  const all = [...shown.values(), ...Object.values(KEEP), ...foods.map((f) => f.name)].map((n) => n.toLowerCase())
  for (const n of new Set(all)) if (all.indexOf(n) !== all.lastIndexOf(n)) problems.push(`two shared foods called "${n}"`)
  for (const list of [...changed.map((c) => c.units), ...kept.map((k) => k.units), ...foods.map((f) => f.units)]) {
    if (list.length > MAX_UNITS) problems.push(`more than ${MAX_UNITS} units: ${list.map((x) => x.name).join(', ')}`)
  }
  return { changed, kept, foods, problems }
}

/** Coverage: how many foods bought by the piece have units, before (027)
 *  and after (035). */
export function coverage(nevo, p) {
  const after = new Map(p.changed.map((c) => [c.nevo_code, c.units]))
  const piece = nevo.filter(byThePiece)
  const has = (r, list) => (list ?? []).length > 0
  return {
    piece: piece.length,
    before: piece.filter((r) => has(r, r.units)).length,
    after: piece.filter((r) => has(r, after.get(r.nevo_code) ?? r.units)).length,
    missing: piece.filter((r) => !has(r, after.get(r.nevo_code) ?? r.units)).map((r) => `${r.nevo_code} ${r.name}`),
    sharedBefore: nevo.filter((r) => r.units?.length).length,
    sharedAfter: nevo.filter((r) => (after.get(r.nevo_code) ?? r.units ?? []).length).length,
  }
}

// ---- SQL ----------------------------------------------------------------------------------

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const FOOD_TYPES = {
  id: 'uuid', name: 'text', name_en: 'text', synonyms: 'text', food_group: 'text', source_note: 'text', state: 'text', units: 'jsonb',
  kj: 'numeric', kcal: 'numeric', protein_g: 'numeric', fat_g: 'numeric', sat_fat_g: 'numeric', mufa_g: 'numeric',
  pufa_g: 'numeric', carbs_g: 'numeric', sugars_g: 'numeric', starch_g: 'numeric', fiber_g: 'numeric', alcohol_g: 'numeric',
  sodium_mg: 'numeric', source_ref: 'text',
}

/** The generated part of migration 035. Every statement writes a row only
 *  when something in it changes, so running it again leaves every device's
 *  copy alone. */
export function generatedSql(p) {
  const out = [BEGIN]
  out.push(`-- Generated by scripts/units-usda.mjs from ${USDA_VERSION}; do not edit by hand.`)
  out.push('')
  out.push(`-- Units on NEVO foods: the food's units as they were, with USDA's added (${p.changed.length} foods).`)
  out.push(`update public.food f set units = r.units`)
  out.push(`from jsonb_to_recordset($usda$[`)
  p.changed.forEach((c, i) => out.push(JSON.stringify(c) + (i < p.changed.length - 1 ? ',' : '')))
  out.push(`]$usda$::jsonb) as r(nevo_code int, units jsonb)`)
  out.push(`where f.nevo_code = r.nevo_code and f.owner_id is null and f.units is distinct from r.units;`)
  out.push('')
  out.push(`-- Units on foods kept from the first (US) catalogue, by the name they have now (${p.kept.length} foods).`)
  out.push(`update public.food f set units = r.units`)
  out.push(`from jsonb_to_recordset($usda$[`)
  p.kept.forEach((c, i) => out.push(JSON.stringify(c) + (i < p.kept.length - 1 ? ',' : '')))
  out.push(`]$usda$::jsonb) as r(name text, units jsonb)`)
  out.push(`where f.name = r.name and f.owner_id is null and f.nevo_code is null and f.source = 'usda'`)
  out.push(`  and f.deleted_at is null and f.units is distinct from r.units;`)
  out.push('')
  const cols = Object.keys(FOOD_TYPES)
  const changing = cols.filter((c) => c !== 'id')
  out.push(`-- Staples the catalogue lacked, from USDA (${p.foods.length} foods).`)
  out.push(`insert into public.food (${cols.join(', ')}, owner_id, source, source_version, carb_basis)`)
  out.push(`select ${cols.map((c) => (c === 'units' ? `coalesce(r.units, '[]'::jsonb)` : `r.${c}`)).join(', ')}, null, 'usda', ${lit(USDA_VERSION)}, 'eu'`)
  out.push(`from jsonb_to_recordset($usda$[`)
  p.foods.forEach((f, i) => out.push(JSON.stringify(compact(f)) + (i < p.foods.length - 1 ? ',' : '')))
  out.push(`]$usda$::jsonb) as r(${cols.map((c) => `${c} ${FOOD_TYPES[c]}`).join(', ')})`)
  out.push(`on conflict (id) do update set ${changing.map((c) => `${c} = excluded.${c}`).join(', ')}, deleted_at = null,`)
  out.push(`  source = 'usda', source_version = excluded.source_version, carb_basis = 'eu'`)
  out.push(`where (${changing.map((c) => `food.${c}`).join(', ')}, food.deleted_at, food.source_version)`)
  out.push(`  is distinct from (${changing.map((c) => `excluded.${c}`).join(', ')}, null, excluded.source_version);`)
  out.push('')
  out.push(`-- Display names that say what people call the food (GetIt's additions; NEVO's names stay).`)
  out.push(`update public.food f set name = x.name`)
  out.push(`from (values ${Object.entries(NAMES).map(([c, n]) => `(${c}, ${lit(n)})`).join(', ')}) as x(code, name)`)
  out.push(`where f.nevo_code = x.code and f.owner_id is null and f.name is distinct from x.name;`)
  out.push('')
  out.push(`-- Hidden from the shared list, not deleted: whatever used one still adds up.`)
  out.push(`update public.food set deleted_at = now()`)
  out.push(`where nevo_code in (${Object.keys(HIDDEN).join(', ')}) and owner_id is null and deleted_at is null;`)
  out.push(END)
  return out.join('\n')
}

/** The migration with its generated part replaced. */
export function withGenerated(migration, sql) {
  const a = migration.indexOf(BEGIN)
  const b = migration.indexOf(END)
  if (a < 0 || b < 0 || b < a) throw new Error(`${MIGRATION} has no generated part (${BEGIN} … ${END}).`)
  return migration.slice(0, a) + sql + migration.slice(b + END.length)
}

/** Every USDA food the matches name. */
export const wantedNdbs = () => [...new Set([
  ...MATCHES.flatMap((m) => [m.ndb, ...m.units.filter((x) => x.bought).map((x) => x.bought.ndb)]),
  ...KEPT_MATCHES.map((m) => m.ndb), ...NEW_FOODS.map((f) => f.ndb),
])]

// ---- command line ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [csvDir, sr28Dir, flag] = process.argv.slice(2)
  if (!csvDir || !sr28Dir) {
    console.error('Usage: node scripts/units-usda.mjs <FoodData_Central_sr_legacy_food_csv_2018-04 folder> <sr28 ASCII folder> [--write]')
    process.exit(2)
  }
  const usda = readUsda(csvDir, sr28Dir, wantedNdbs())
  const nevo = catalogue()
  const p = plan(nevo, usda)
  const c = coverage(nevo, p)
  console.log(`USDA units on ${p.changed.length} NEVO foods and ${p.kept.length} kept foods; ${p.foods.length} new foods.`)
  console.log(`Shared NEVO foods with units: ${c.sharedBefore} before, ${c.sharedAfter} after.`)
  console.log(`Foods bought by the piece with units: ${c.before} of ${c.piece} before, ${c.after} of ${c.piece} after.`)
  if (flag === '--missing') console.log(c.missing.join('\n'))
  if (p.problems.length) {
    console.error(p.problems.join('\n'))
    process.exit(1)
  }
  if (flag === '--write') {
    writeFileSync(MIGRATION, withGenerated(readFileSync(MIGRATION, 'utf8'), generatedSql(p)))
    console.log(`Wrote ${MIGRATION}.`)
  }
}
