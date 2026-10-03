// What GetIt adds to NEVO-online 2025/9.0, kept apart from NEVO's own data.
//
// NEVO's conditions of use allow additions "provided that it is clear these
// are additional to the original dataset and to what part(s) they apply", and
// no amendments. So nothing here changes a NEVO value. What is here:
//
//  * a plainer display name worked out from NEVO's English name (the
//    published Dutch and English names are kept beside it, unchanged);
//  * units (small, medium, large, slices, spoons), from RIVM Portie-online
//    2026/2.0 where it gives them (requirements Part H3), or GetIt's own
//    portion conventions from version 15;
//  * cook yields GetIt used in version 15 (migration 007);
//  * how the old shared catalogue (807 foods from a US list) meets NEVO:
//    which old foods NEVO replaces because they are clearly the same food,
//    which are hidden, and which stay (with a plainer name) because NEVO has
//    no such food.
//
// Read by scripts/import-nevo.mjs, which writes migration 027's data.

export const NEVO_VERSION = 'NEVO-online 2025/9.0'
export const NEVO_ATTRIBUTION = 'Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven'
export const PORTIE = 'Portie-online 2026/2.0'
export const GETIT = 'GetIt'
export const USDA_VERSION = 'USDA SR Legacy (GetIt version 15 catalogue)'

// ---- display names ---------------------------------------------------------------

/** NEVO's English names are short codes ("Apple wo skin av", "Yoghurt low
 *  fat w fruit"). The display name spells the short words out; nothing else
 *  about the name changes. */
const WORDS = {
  w: 'with', wo: 'without', av: 'average', prep: 'prepared', unprep: 'unprepared', unprepared: 'unprepared',
  liq: 'liquid', sol: 'solid', approx: 'approx.', brcrumbs: 'breadcrumbs', 'vit': 'vitamin', 's-sk': 'semi-skimmed',
  p: 'per', yogurt: 'yoghurt', Yogurt: 'Yoghurt', bolgonese: 'bolognese', Porrdige: 'Porridge', thickend: 'thickened',
  manderins: 'mandarins', Manderins: 'Mandarins', spead: 'spread', wholemael: 'wholemeal', onbereid: 'unprepared',
  abricots: 'apricots', Abricots: 'Apricots', vitamines: 'vitamins', sweetend: 'sweetened',
}
/** "sat fa" is "saturated fatty acids" in NEVO's names. */
const PHRASES = [[/\bsat fa\b/g, 'saturated fat'], [/\bsat fatty acids\b/g, 'saturated fat'], [/\bsat\b(?= salted| unsalted|$)/g, 'saturated fat'], [/\s+/g, ' ']]

/** NEVO writes many names the Dutch way round, the kind of food first ("Oil
 *  olive", "Cabbage red raw", "Drink soya wo sugar"). For these kinds the
 *  word after it is the sort, and goes first in English: "Olive oil", "Red
 *  cabbage", "Soya drink". */
const HEADS = new Set([
  'Oil', 'Cheese', 'Juice', 'Drink', 'Flour', 'Beans', 'Peas', 'Nuts', 'Sauce', 'Soup', 'Milk', 'Yoghurt', 'Quark',
  'Cabbage', 'Lettuce', 'Onion', 'Onions', 'Potatoes', 'Potato', 'Tomato', 'Tomatoes', 'Rice', 'Pasta', 'Carrot',
  'Mushrooms', 'Asparagus', 'Cream', 'Sugar', 'Apple', 'Grapes', 'Melon', 'Cherries', 'Biscuits', 'Biscuit', 'Syrup',
  'Vinegar', 'Ketchup', 'Mustard', 'Mayonnaise', 'Tea', 'Coffee', 'Chocolate', 'Sweets', 'Liver', 'Kidney',
])
/** Words that say how or how much, never the sort: no swap before them. */
const NOT_SORT = new Set([
  'raw', 'boiled', 'cooked', 'fried', 'prepared', 'unprepared', 'average', 'with', 'without', 'and', 'in', 'on', 'fresh',
  'dried', 'tinned', 'canned', 'frozen', 'glass', 'light', 'low', 'full', 'half', 'for', 'of', 'based', 'spread',
  'product', 'type', 'paste', 'powder', 'instant', 'ready', 'ready-to-eat', 'from', 'made', 'filled', 'coated',
  'per', 'salted', 'unsalted', 'sweetened', 'unsweetened', 'w', 'wo', 'av', 'flavoured', 'hot', 'cold',
  // The second word is a kind of food itself: "Rice drink", "Rice cakes", "Coffee creamer".
  'drink', 'bread', 'cake', 'cakes', 'crackers', 'sauce', 'flakes', 'bran', 'flour', 'sprinkles', 'bar', 'creamer',
  'latte', 'cappuccino', 'pudding', 'porridge', 'salad', 'soup', 'juice', 'chips', 'crisps', 'sticks', 'balls', 'pie',
  // Names that read right already, or that a swap would garble ("Potato starch", "Apple strudel", "Liver pate").
  'starch', 'strudel', 'turnover', 'chip', 'eclair', 'pate', 'sausage', 'saint', 'old', 'bel', 'puree', 'croquettes',
  'ball', 'leaves', 'slice', 'gluten', 'medium', 'super', 'extra', 'main', 'mix', 'custard', 'classic', 'veg',
  'aardappel', 'cafe', 'jaffa', 'liga', 'snack', 'butter', 'sauerkraut', 'split', 'dish', 'schnitzel', 'fondue', 'vending',
  'milkbiscuit', 'portion', 'wiener',
])
/** Whole names said another way in English. */
const SAID = [
  [/^Peas chick\b/, 'Chickpeas'], [/^Melon water\b/, 'Watermelon'], [/^Beans soya\b/, 'Soya beans'],
  [/^Potato sweet\b/, 'Sweet potato'], [/^Nuts macadamia\b/, 'Macadamia nuts'], [/^Peas split\b/, 'Split peas'],
  [/^Beans black eyed\b/, 'Black-eyed beans'], [/^Beans long yard\b/, 'Yard-long beans'],
  [/^Tomatoes classic round\b/, 'Classic round tomatoes'], [/^Cheese Danish Blue\b/, 'Danish Blue cheese'],
  [/^Oil rice bran\b/, 'Rice bran oil'], [/^Egg whole chicken\b/, 'Egg'], [/^Oil sunflower seed\b/, 'Sunflower oil'], [/^Beans kidney red\b/, 'Red kidney beans'],
]
/** Where a state starts ("Red cabbage, raw"). */
const STATE_WORDS = /\s(raw|boiled|cooked|fried|prepared|unprepared|tinned|canned|frozen|grilled|steamed|stewed|baked|roasted|dried)\b/

export function displayName(en) {
  let s = String(en).trim()
  s = s.split(' ').map((w) => (Object.prototype.hasOwnProperty.call(WORDS, w) ? WORDS[w] : w)).join(' ')
  for (const [re, to] of PHRASES) s = s.replace(re, to)
  s = s.trim()
  let said = false
  for (const [re, to] of SAID) if (re.test(s)) { s = s.replace(re, to); said = true }
  const words = s.split(' ')
  if (!said && words.length >= 2 && HEADS.has(words[0])) {
    const sort = words[1]
    if (!NOT_SORT.has(sort.toLowerCase()) && /^[A-Za-z][a-z]*(-[a-z]+)*$/.test(sort)) {
      // "Cheese Gouda" keeps Gouda's capital; "Oil olive" becomes "Olive oil".
      const first = sort.charAt(0).toUpperCase() + sort.slice(1)
      words.splice(0, 2, first, words[0].toLowerCase())
      s = words.join(' ')
    }
  }
  // The state reads as a note after the name: "Red cabbage, raw".
  const m = STATE_WORDS.exec(s)
  if (m && m.index > 0 && s[m.index - 1] !== ',') s = `${s.slice(0, m.index)},${s.slice(m.index)}`
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The state a NEVO food is in, from its English name. */
export function stateOf(en) {
  const n = ` ${String(en).toLowerCase()} `
  if (/ frozen /.test(n) && !/ prepared| boiled| fried| baked/.test(n)) return 'frozen'
  if (/ (tinned|canned|glass|tin\/glass|canned\/glass) /.test(n) || / in brine /.test(n)) return 'canned'
  if (/ (boiled|cooked|prepared|fried|baked|grilled|steamed|stewed|roasted|microwave|simmered|deep-fried) /.test(n)) return 'cooked'
  if (/ dried /.test(n) && !/ soaked /.test(n)) return 'dried'
  return 'raw'
}

// ---- units (additions) ------------------------------------------------------------

/** A unit on a NEVO food: `g` is the edible weight (NEVO's figures are per
 *  100 g edible part), `bought_g` the weight as bought (peel, core, stone),
 *  for shopping and stock. `size` marks small, medium and large; the medium
 *  one carries the food's own word, so "1 onion" is a medium onion. */
const u = (name, g, extra = {}) => ({ name, g, ...extra })
const P = { source: PORTIE }
const G = { source: GETIT }
const sml = (word, plural, s, m, l) => [
  u(word, m[0], { plural, size: 'M', ...(m[1] ? { bought_g: m[1] } : {}), ...P }),
  ...(s ? [u(`small ${word}`, s[0], { plural: `small ${plural}`, size: 'S', ...(s[1] ? { bought_g: s[1] } : {}), ...P })] : []),
  ...(l ? [u(`large ${word}`, l[0], { plural: `large ${plural}`, size: 'L', ...(l[1] ? { bought_g: l[1] } : {}), ...P })] : []),
]
/** Portie-online gives some weights as bought only, with the share that is
 *  eaten; the edible weight is that share of it, to a tenth of a gram. */
const eaten = (bought, share) => [Math.round(bought * share * 10) / 10, bought]

const ONION = [...sml('onion', 'onions', [57, 60], [95, 100], [142, 150]),
  u('stuffing onion', 238, { plural: 'stuffing onions', bought_g: 260, ...P }), u('tbsp chopped', 20, P)]
const EGG = [...sml('egg', 'eggs', [40], [50], [60])]
const APPLE = sml('apple', 'apples', [76, 85], [135, 150], [162, 180])
const TOMATO = [...sml('tomato', 'tomatoes', [66, 70], [89, 94], [138, 145]), u('slice', 15, { plural: 'slices', ...P })]
const POTATO = [...sml('potato', 'potatoes', [50, 63], [70, 88], [100, 125]), u('baby potato', 25, { plural: 'baby potatoes', ...P })]
const CARROT = [...sml('carrot', 'carrots', [144, 160], [243, 270], [338, 375]), u('bunch carrot', 20, { plural: 'bunch carrots', ...P })]
const PEPPER = [u('pepper', 136, { plural: 'peppers', size: 'M', bought_g: 170, ...P }), u('strip', 3, { plural: 'strips', ...P })]
const KIWI = [u('kiwi', 75, { plural: 'kiwis', size: 'M', bought_g: 90, ...P })]
const MILK = [u('glass', 250, { plural: 'glasses', ...G })]
const SLICE = (g) => [u('slice', g, { plural: 'slices', ...G })]
const OIL = [u('tbsp', 13.5, G), u('tsp', 4.5, G)]

export const UNITS = {
  63: ONION, // Onions raw
  830: [...sml('clove', 'cloves', [2], [3], [6]), u('bulb', eaten(50, 0.85)[0], { plural: 'bulbs', bought_g: 50, ...P })], // Garlic raw
  83: EGG, 84: EGG, 2769: EGG, 2770: EGG, 2771: EGG, 2772: EGG, 2773: EGG, 2774: EGG,
  151: sml('banana', 'bananas', [100, 143], [130, 186], [165, 236]),
  875: APPLE, 2751: APPLE, 2753: APPLE,
  2734: TOMATO, 60: TOMATO, 2730: TOMATO,
  2731: [u('cherry tomato', 10, { plural: 'cherry tomatoes', ...P })],
  2732: [u('beef tomato', 142, { plural: 'beef tomatoes', bought_g: 150, ...P })],
  1: POTATO, 2: POTATO, 3: POTATO,
  2728: sml('carrot', 'carrots', [144, 160], [243, 270], [338, 375]),
  71: CARROT,
  2726: [u('carrot', 20, { plural: 'carrots', ...P })],
  2742: PEPPER, 884: PEPPER, 31: PEPPER, 2740: PEPPER, 3048: PEPPER,
  2739: [...sml('cucumber', 'cucumbers', [304, 320], [399, 420], [522, 550]), u('cm', 10, P)],
  689: sml('avocado', 'avocados', [80], [180], [300]),
  158: [u('lemon', 67, { plural: 'lemons', size: 'M', bought_g: 128, ...P }), u('slice', 6, { plural: 'slices', bought_g: 12, ...P })],
  691: [u('small lime', 24, { plural: 'small limes', size: 'S', bought_g: 35, ...P }), u('large lime', 62, { plural: 'large limes', size: 'L', bought_g: 88, ...P })],
  922: [...sml('courgette', 'courgettes', eaten(250, 0.9), eaten(400, 0.9), eaten(550, 0.9)), u('tbsp', 30, P)],
  562: sml('leek', 'leeks', [80, 100], [128, 160], [220, 275]),
  171: [...sml('orange', 'oranges', [70, 100], [130, 186], [170, 243]), u('segment', 10, { plural: 'segments', ...P })],
  165: sml('mandarin', 'mandarins', [30, 40], [60, 80], [80, 107]),
  2748: [u('pear', 214, { plural: 'pears', size: 'M', bought_g: 225, ...P })],
  1056: KIWI, 5120: KIWI,
  19: [...sml('mushroom', 'mushrooms', [9], [14], [22]), u('punnet', 230, { plural: 'punnets', bought_g: 250, ...P })],
  921: sml('head', 'heads', [198, 360], [236, 430], [275, 500]),
  10: sml('aubergine', 'aubergines', eaten(250, 0.8), eaten(400, 0.8), eaten(600, 0.8)),
  // GetIt's own portion conventions from version 15 (migration 022), carried
  // over to the NEVO food that replaces each old one.
  2351: SLICE(35), 248: SLICE(35), 246: SLICE(35),
  279: MILK, 286: MILK, 294: MILK, 5306: MILK, 2240: MILK, 289: MILK, 1076: MILK, 870: MILK, 5464: MILK, 5101: MILK,
  513: SLICE(20), 511: SLICE(20), 725: SLICE(20), 724: SLICE(20),
  310: [u('tbsp', 14, G), u('tsp', 5, G)], 879: [u('tbsp', 14, G), u('tsp', 5, G)],
  455: [u('tbsp', 16, G), u('tsp', 5, G)], 5275: [u('tbsp', 16, G), u('tsp', 5, G)],
  1461: [u('tbsp', 15, G)], 3207: [u('tbsp', 15, G)],
  377: [u('tsp', 4, G), u('tbsp', 12.5, G)], 375: [u('tsp', 4, G), u('tbsp', 12.5, G)],
  1127: [u('tbsp', 15, G), u('tsp', 5, G)],
  3447: [u('tbsp', 12, G)], 867: [u('tbsp', 10, G)],
  207: [u('handful', 30, { plural: 'handfuls', ...G })],
  3221: [u('olive', 4, { plural: 'olives', ...G })], 137: [u('olive', 4, { plural: 'olives', ...G })],
  181: [u('date', 7, { plural: 'dates', ...G })],
  5079: [u('peach', 150, { plural: 'peaches', ...G })], 1812: [u('nectarine', 140, { plural: 'nectarines', ...G })],
  170: [u('plum', 65, { plural: 'plums', ...G })], 149: [u('apricot', 35, { plural: 'apricots', ...G })],
}
/** Every NEVO oil gets a tablespoon and a teaspoon, as every catalogue oil did. */
export const OIL_UNITS = OIL

// ---- cook yields (additions) ------------------------------------------------------

/** Cooked weight ÷ raw weight, as GetIt used them in version 15 (007), on
 *  the NEVO food that replaces each old one. */
export const YIELDS = {
  5: 2.9, 712: 3.0, 3153: 2.8, 213: 2.5, 120: 2.4, 820: 0.75, 1587: 0.78, 2297: 0.75, 1634: 0.75, 1936: 0.75,
  1400: 0.73, 5519: 0.95, 921: 0.9, 14: 0.9, 922: 0.8, 83: 1.0,
}

// ---- the old catalogue ---------------------------------------------------------------

/** Old catalogue foods NEVO replaces, because they are clearly the same food
 *  in the same state. Their references (ingredients, meals, logs, stock, the
 *  shopping list, books) are moved to the NEVO food and the old row is hidden. */
export const REPLACES = {
  'Almond': 5049, 'Amaranth Leaves': 677, 'Apple': 875, 'Apple Granny Smith': 875, 'Apricot': 149, 'Apricot Dried': 175,
  'Artichoke': 1021, 'Arugula': 2736, 'Asparagus': 3220, 'Avocado': 689, 'Banana': 151, 'Basil': 2177,
  'Beef Ground Grass-fed': 1405, 'Beef Kidney': 1902, 'Beef Liver': 1407, 'Beef Short Loin, T-Bone Steak': 3033,
  'Beef Tallow Fat': 315, 'Beef Tongue': 1416, 'Beets': 12, 'Bell Peppers': 2742, 'Bitter Gourd Pod': 683,
  'Blackberry': 157, 'Blueberry': 152, 'Bottle Gourd': 681, 'Brazil Nut Dried': 203, 'Broccoli': 921,
  'Brown Rice': 1014, 'Brussels Sprouts': 564, 'Butter': 310, 'Butter Peanut Smooth': 455, 'Butter Sesame Paste': 1461,
  'Butter Sesame Tahini': 1461, 'Buttermilk': 289, 'Cabbage': 69, 'Cabbage Bok Choy': 1892, 'Cabbage Napa': 21,
  'Cabbage Red': 41, 'Canola Oil': 3449, 'Capsicum Green': 31, 'Capsicum Red': 884, 'Capsicum Yellow': 2740,
  'Carambola': 1888, 'Carrot': 71, 'Cashew': 199, 'Cauliflower': 14, 'Celery': 557, 'Chard Swiss': 563,
  'Cheese Blue': 5234, 'Cheese Brie': 593, 'Cheese Camembert': 556, 'Cheese Cheddar': 725, 'Cheese Cottage Creamed': 654,
  'Cheese Edam': 511, 'Cheese Feta': 3362, 'Cheese Goat Hard': 2518, 'Cheese Goat Soft': 1650, 'Cheese Gouda': 513,
  'Cheese Gruyere': 722, 'Cheese Limburger': 721, 'Cheese Mozzarella': 1955, 'Cheese Parmesan Hard': 718,
  'Cheese Port Salut': 716, 'Cheese Ricotta': 3377, 'Cheese Roquefort': 714, 'Cheese Swiss': 724,
  'Cherry Sour': 167, 'Cherry Sweet': 163, 'Chestnut European (without peel)': 201, 'Chia Seed': 3447,
  'Chicken Broiler/Fryer Breast Meat': 1634, 'Chicken Broiler/Fryer Drumstick Meat+Skin': 2090,
  'Chicken Broiler/Fryer Meat': 1305, 'Chicken Broiler/Fryer Meat+Skin': 108, 'Chicken Fat': 5195, 'Chicken Ground': 3139,
  'Chicken Liver': 475, 'Chickpeas': 1095, 'Chilli Green': 2524, 'Chilli Red': 2524, 'Chives': 829, 'Clementine': 165,
  'Coconut Meat': 202, 'Coconut Meat Dried': 5497, 'Coconut Oil': 3243, 'Corn Oil': 608, 'Cottage Cheese': 654,
  'Cranberry': 159, 'Cream Heavy Whipping': 299, 'Cream Sour': 812, 'Cucumber (with peel)': 2739,
  'Cucumber (without peel)': 27, 'Currant Black': 154, 'Currant Red, White': 153, 'Dandelion Greens': 1087,
  'Dates Deglet Noor': 181, 'Duck Domesticated Meat+Skin': 106, 'Egg Chicken': 83, 'Eggplant': 10, 'Endive': 7,
  'Fig': 1010, 'Fish Anchovy European': 3199, 'Fish Cod Atlantic': 820, 'Fish Eel Mixed': 112, 'Fish Herring Atlantic': 113,
  'Fish Mackerel Atlantic': 353, 'Fish Pollock Alaska': 3318, 'Fish Pollock Atlantic': 2296,
  'Fish Salmon Atlantic Farmed': 1587, 'Fish Tilapia': 2299, 'Fish Tuna Skipjack': 2297, 'Fish Tuna Yellowfin': 2297,
  'Flaxseed': 867, 'Flaxseed Oil': 3051, 'French Beans Green': 50, 'Game Meat Deer': 339, 'Game Meat Goat': 1900,
  'Game Meat Horse': 95, 'Game Meat Rabbit Domesticated': 109, 'Game Meat Rabbit Wild': 110, 'Garlic': 830, 'Ginger': 832,
  'Gooseberry': 164, 'Grapefruit Pink, Red, White': 162, 'Grapes European Type': 160, 'Guava': 690, 'Hazelnut Filbert': 200,
  'Hempseed': 3446, 'Kale': 959, 'Kiwifruit': 1056, 'Kohlrabi': 560, 'Kumquat': 1099, 'Lamb Ground': 1444,
  'Lamb Kidney': 1903, 'Lamb Leg Whole': 1443, 'Lamb Shoulder Whole': 1447, 'Lard': 314, 'Leeks': 562, 'Lemon Juice': 1127,
  'Lentils': 120, 'Lettuce Butterhead': 46, 'Lettuce Cos/Romaine': 3332, 'Lettuce Iceberg': 1399, 'Lettuce Red Leaf': 2708,
  'Lime': 691, 'Litchi': 1090, 'Macadamia Nut': 2844, 'Mango': 692, 'Melon Cantaloupe': 3341, 'Melon Honeydew': 1106,
  'Milk Almond': 5464, 'Milk Coconut': 2290, 'Milk Cow': 279, 'Milk Cow Lactose Free': 5306, 'Milk Goat': 2240,
  'Milk Rice': 5101, 'Milk Soy': 870, 'Mollusk Mussel Blue': 5326, 'Mollusk Oyster Pacific': 354,
  'Mollusk Scallop Mixed': 1899, 'Mollusk Snail': 1101, 'Mollusk Squid Mixed': 1098, 'Mulberry': 3448,
  'Mushroom Chanterelle': 17, 'Mushroom White': 19, 'Mustard Greens': 673, 'Oats': 213, 'Okra': 680, 'Olive Black': 3221,
  'Olive Green': 137, 'Olive Oil': 601, 'Onion': 63, 'Onion Spring': 2737, 'Onion Welsh': 2737, 'Orange': 171,
  'Orange Navel': 171, 'Orange Tangerine': 165, 'Palm Kernel Oil': 5196, 'Palm Oil': 3451, 'Papaya': 693, 'Parsley': 128,
  'Parsnip': 3127, 'Passion Fruit Purple': 1074, 'Pea': 23, 'Pea Edible-Podded': 35, 'Peach Nectarine': 1812,
  'Peach Yellow': 5079, 'Peanut': 204, 'Peanut Oil': 308, 'Pear': 2748, 'Pear Bartlett': 2748, 'Pear Bosc': 2748,
  'Pear Green Anjou': 2748, 'Pear Red Anjou': 2748, 'Pecan': 1895, 'Persimmon': 1057, 'Pheasant Meat+Skin': 320,
  'Pine Nut': 2176, 'Pineapple': 150, 'Pineapple Extra Sweet': 150, 'Pistachio Nut': 5112, 'Plantain Yellow': 665,
  'Plum': 170, 'Pomegranate': 1007, 'Pork Cured Bacon': 1432, 'Pork Fresh Ground': 1421, 'Pork Fresh Kidneys': 1901,
  'Pork Fresh Liver': 1426, 'Pork Fresh Loin Tenderloin': 1422, 'Pork Fresh Loin Top Boneless Chops': 1420,
  'Pork Fresh Shoulder Whole': 1430, 'Pork Fresh Spareribs': 1427, 'Potato': 1, 'Pumpkin Seed Kernel': 2806,
  'Quinoa': 3153, 'Radish': 124, 'Raisin Dark Seedless': 33, 'Raisin Golden Seedless': 33, 'Raspberry': 161,
  'Rhubarb': 40, 'Rice Bran Oil': 3334, 'Safflower Oil Linoleic 70%+': 607, 'Safflower Oil Oleic 70%+': 607,
  'Seaweed Agar': 1898, 'Seaweed Kelp': 1897, 'Sesame Oil': 3376, 'Sesame Seed Kernel': 838, 'Soybean Oil': 313,
  'Spinach': 51, 'Squash Winter Pumpkin': 682, 'Squash Winter Zucchini (with skin)': 922, 'Strawberry': 148,
  'Sugar': 377, 'Sunflower High Oleic 70%+': 317, 'Sunflower Linoleic 60%-': 317, 'Sunflower Linoleic 65%': 317,
  'Sunflower Seed Kernel': 872, 'Sweet Potato': 671, 'Tamarind': 694, 'Taro Roots': 668, 'Tofu Firm': 5519,
  'Tofu Regular': 5519, 'Tomato Red': 2734, 'Turkey Whole Meat': 330, 'Turnip': 5522, 'Turnip Greens': 38,
  'Veal Brain': 105, 'Veal Ground': 3017, 'Veal Liver': 1439, 'Veal Shank': 1440, 'Veal Thymus': 1442, 'Veal Tongue': 1441,
  'Walnut': 206, 'Watermelon': 1105, 'White Rice': 658, 'Yam': 669, 'Yardlong Beans': 679, 'Yogurt': 278,
  'Yogurt Greek': 2503, 'Kidney Beans': 1894, 'White Bread': 2351, 'Whole Wheat Bread': 246, 'Whole-wheat bread': 246,
  'Whole-wheat pasta (cooked)': 2157, 'Hummus': 3207, 'Mixed nuts': 207, 'Kefir': 1076,
}

/** Old foods NEVO has no match for that stay in the shared list, with a
 *  plain British name. Their figures are the old ones (a US list, marked
 *  as such). */
export const KEEP = {
  'Almond Oil': 'Almond oil', 'Avocado Oil': 'Avocado oil', 'Bamboo Shoots': 'Bamboo shoots, raw', 'Breadfruit': 'Breadfruit',
  'Butter Almond': 'Almond butter', 'Butter Cashew': 'Cashew butter', 'Butter Clarified': 'Ghee (clarified butter)',
  'Butter Cocoa': 'Cocoa butter', 'Butter Sunflower': 'Sunflower seed butter', 'Cabbage Savoy': 'Savoy cabbage, raw',
  'Carrot Baby': 'Baby carrots, raw', 'Cheese Cheshire': 'Cheshire cheese', 'Cheese Cream': 'Cream cheese',
  'Cheese Fontina': 'Fontina cheese', 'Cheese Goat Semisoft': 'Goat cheese, semi-soft', 'Cheese Provolone': 'Provolone cheese',
  'Cheese Romano': 'Romano cheese', 'Cheese Tilsit': 'Tilsit cheese', 'Coconut Water': 'Coconut water',
  'Coriander': 'Coriander leaves, fresh', 'Corn Yellow': 'Sweetcorn, raw', 'Dates Medjool': 'Medjool dates',
  'Dill Leaves': 'Dill, fresh', 'Duck Fat': 'Duck fat', 'Edamame': 'Edamame', 'Egg Duck': 'Duck egg',
  'Egg Quail': 'Quail egg', 'Elderberry': 'Elderberries', 'Fish Bass Sea Mixed': 'Sea bass, raw', 'Fish Carp': 'Carp, raw',
  'Fish Flatfish Flounder/Sole': 'Flounder, raw', 'Fish Haddock': 'Haddock, raw', 'Fish Halibut Atlantic/Pacific': 'Halibut, raw',
  'Fish Ling': 'Ling, raw', 'Fish Monkfish': 'Monkfish, raw', 'Fish Ocean Perch Atlantic': 'Redfish (ocean perch), raw',
  'Fish Oil Cod Liver': 'Cod liver oil', 'Fish Pike Northern': 'Pike, raw', 'Fish Salmon Atlantic Wild': 'Wild Atlantic salmon, raw',
  'Fish Swordfish': 'Swordfish, raw', 'Fish Trout Rainbow Farmed': 'Rainbow trout, raw', 'Fish Turbot European': 'Turbot, raw',
  'Fish Whiting Mixed': 'Whiting, raw', 'French Beans Yellow': 'Yellow wax beans, raw', 'Game Meat Boar': 'Wild boar, raw',
  'Goose Domesticated Meat+Skin': 'Goose with skin, raw', 'Goose Fat': 'Goose fat', 'Grapeseed Oil': 'Grapeseed oil',
  'Hazelnut Oil': 'Hazelnut oil', 'Jackfruit': 'Jackfruit', 'Jalapeno': 'Jalapeño pepper, raw',
  'Lemon Grass': 'Lemongrass', 'Lettuce Green Leaf': 'Green leaf lettuce', 'Lime Juice': 'Lime juice',
  'Milk Sheep': "Sheep's milk", 'Mollusk Clam Mixed': 'Clams, raw', 'Mollusk Octopus': 'Octopus, raw',
  'Mushroom Cremini/Italian': 'Chestnut mushrooms, raw', 'Mushroom Enoki': 'Enoki mushrooms, raw',
  'Mushroom Oyster': 'Oyster mushrooms, raw', 'Mushroom Portobello': 'Portobello mushroom, raw',
  'Mushroom Shiitake': 'Shiitake mushrooms, raw', 'Onion Shallot': 'Shallot, raw', 'Onion Sweet': 'Sweet onion, raw',
  'Pear Asian': 'Nashi pear', 'Physalis': 'Physalis', 'Plantain Green': 'Green plantain, raw', 'Pork Fresh Belly': 'Pork belly, raw',
  'Pummelo': 'Pomelo', 'Quince': 'Quince', 'Radish Oriental': 'Daikon (white radish), raw', 'Seaweed Wakame': 'Wakame, raw',
  'Sesame Seed Whole': 'Sesame seeds, whole', 'Shrimp': 'Shrimp, raw', 'Squash Winter Acorn': 'Acorn squash, raw',
  'Squash Winter Butternut': 'Butternut squash, raw', 'Squash Winter Spaghetti': 'Spaghetti squash, raw', 'Thyme': 'Thyme, fresh',
  'Tofu Soft (nigari)': 'Silken tofu', 'Turkey Ground': 'Turkey mince, raw', 'Walnut Oil': 'Walnut oil',
  'Waterchestnut': 'Water chestnuts', 'Watercress': 'Watercress, raw', 'Whole-wheat pita': 'Wholemeal pitta bread',
  'Sour Dough Bread': 'Sourdough bread', 'Whey protein powder': 'Whey protein powder',
}

/** Everything else in the old list is hidden, without a replacement: US
 *  retail cuts that a European shop does not sell under those names, game a
 *  shop does not stock, inappropriate items ("Milk Human", turtle, emu,
 *  mechanically separated meat), and rare plants from a US list. Their rows
 *  stay, so a recipe or a log that used one still adds up. Worked out by
 *  the generator as "not replaced and not kept". */

/** GetIt's own shared recipes (not anyone's data): their lines are pointed at
 *  the NEVO food that fits what the recipe says, where the old food was hidden
 *  or was a poor fit. Keyed by the old food's name; `state` is the line's. */
export const RECIPE_LINES = {
  'Beef Sirloin Top': { code: 1400 },
  'Turkey Breast Meat+Skin': { code: 1936 },
  'Fish Tuna Skipjack': { code: 1590, state: 'raw' },
  'Lettuce Green Leaf': { code: 2346 },
}
