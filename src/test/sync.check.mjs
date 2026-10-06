// Checks the sync rules: name-based ids (UUID version 5) against the
// standard's examples, a food's fixed id for a scanned product, natural keys
// (a food's barcode only while it is live), everything that pointed at a
// folded row following it to its twin, and fetching page by page with a
// cursor that neither skips nor repeats rows that share one time.
import {
  uuidV5, naturalKey, swapId, repointRow, repointPending, readCursor, cursorAfter, afterFilter, isAfter, morePages,
  NATURAL_KEYS, REFERENCES, PAGE, mergeSettings3,
} from '../lib/sync-rules.ts'
import { readFileSync } from 'node:fs'
import { readSettings, mergeSettings } from '../lib/settings.ts'
import { productFoodId, PRODUCT_NAMESPACE } from '../lib/products-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// ---- UUID version 5 --------------------------------------------------------------
// The examples every implementation agrees on (Python's uuid.uuid5 gives these).
const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const URL_NS = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
is('python.org in the DNS namespace', await uuidV5('python.org', DNS), '886313e1-3b8a-5372-9b90-0c9aee199e5d')
is('a web address in the URL namespace', await uuidV5('http://example.com/', URL_NS), '0a300ee9-f9e4-5697-a51a-efc7fafaba67')
is('www.example.com in the DNS namespace', await uuidV5('www.example.com', DNS), '2ed6657d-e927-568b-95e1-2665a8aea6a2')
const v = await uuidV5('anything', PRODUCT_NAMESPACE)
is('version 5, the standard variant', [v[14], '89ab'.includes(v[19])], ['5', true])
is('the same name, the same id', await uuidV5('anything', PRODUCT_NAMESPACE), v)
is('capitals in the namespace do not matter', await uuidV5('anything', PRODUCT_NAMESPACE.toUpperCase()), v)
let threw = false
try { await uuidV5('x', 'not-a-uuid') } catch { threw = true }
is('a namespace must be a UUID', threw, true)

// ---- a scanned product's fixed id ----------------------------------------------------
const me = '2d0a1a3e-6f7b-4a51-9d4e-0c0f1f2e3d4c'
const other = '9b1d2c3a-0000-4000-8000-000000000001'
const id = await productFoodId(me, '8710496979125')
is('a product has an id', typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id), true)
is('the same pack on another phone gets the same id', await productFoodId(me, '8710496979125'), id)
is('typed with spaces and dashes, the same', await productFoodId(me, '87 10496-979125'), id)
is('a UPC-A code and its 13-digit spelling, the same', await productFoodId(me, '036000291452'), await productFoodId(me, '0036000291452'))
is('capitals in the person’s id do not matter', await productFoodId(me.toUpperCase(), '8710496979125'), id)
is('another person’s food for it is another row', (await productFoodId(other, '8710496979125')) !== id, true)
is('another product is another row', (await productFoodId(me, '5449000000996')) !== id, true)
is('it is the name “owner:barcode” in Hemlo’s namespace', await uuidV5(`${me}:8710496979125`, PRODUCT_NAMESPACE), id)
is('not a barcode, no id', await productFoodId(me, '8710496979124'), null)
is('no owner, no id', await productFoodId('', '8710496979125'), null)

// ---- natural keys ------------------------------------------------------------------------
is('food is kept once per person and barcode', NATURAL_KEYS.food, ['owner_id', 'barcode'])
is('a live scanned food has a key', naturalKey('food', { owner_id: me, barcode: '8710496979125', deleted_at: null }), `${me}|8710496979125`)
is('a deleted one has none (the index leaves it out)', naturalKey('food', { owner_id: me, barcode: '8710496979125', deleted_at: '2026-01-01' }), null)
is('a food without a barcode has none', naturalKey('food', { owner_id: me, barcode: null }), null)
is('nor does a catalogue food', naturalKey('food', { owner_id: null, barcode: '8710496979125' }), null)
is('a weigh-in is one a day', naturalKey('body_log', { profile_id: 'p', log_date: '2026-09-28' }), 'p|2026-09-28')
is('a deleted stock row still holds its food', naturalKey('stock', { household_id: 'h', food_id: 'f', deleted_at: 'x' }), 'h|f')
is('a table without a rule has no key', naturalKey('task', { id: 'x' }), null)

// ---- following a folded row to its twin --------------------------------------------------
const A = 'aaaaaaaa-0000-4000-8000-000000000001'  // the copy made on this phone
const T = 'bbbbbbbb-0000-4000-8000-000000000002'  // its twin on the server
is('a food is pointed at by stock, ingredients, the food log, the shopping list, meals, prices, records and books',
  REFERENCES.food.map((r) => r.table), ['stock', 'recipe_line', 'food_log', 'shopping_entry', 'meal_plan_slot', 'shop_price', 'module_record', 'profile'])
is('a planned item\'s tick and a price follow their food by its id (028)',
  repointRow({ food_id: null, plan_key: A, item_key: A }, ['food_id', 'plan_key', 'item_key'], A, T), { plan_key: T, item_key: T })
is('one live price per item per shop', NATURAL_KEYS.shop_price, ['household_id', 'shop', 'item_key'])
is('an id swapped', swapId(A, A, T), T)
is('inside lists and objects', swapId({ books: [{ ids: ['x', A] }], n: 3 }, A, T), { books: [{ ids: ['x', T] }], n: 3 })
const same = { books: [{ ids: ['x'] }] }
is('nothing to swap gives the same value back', swapId(same, A, T) === same, true)
is('a string that only contains the id is left', swapId(`note ${A}`, A, T), `note ${A}`)
is('a stock row follows its food', repointRow({ id: 's1', food_id: A, grams_on_hand: 5 }, ['food_id'], A, T), { food_id: T })
is('a row that pointed elsewhere is left', repointRow({ id: 's2', food_id: 'c' }, ['food_id'], A, T), null)
is('a record pointing at it inside its data', repointRow({ id: 'r', data: { food: A, g: 2 } }, ['data'], A, T), { data: { food: T, g: 2 } })

const queue = [
  { id: 1, table: 'food', row_id: A, payload: { name: 'Hagelslag', barcode: '8710496979125' } },   // the send that folded
  { id: 2, table: 'stock', row_id: 's1', payload: { household_id: 'h', food_id: A, grams_on_hand: 400 } },
  { id: 3, table: 'recipe_line', row_id: 'l1', payload: { recipe_id: 'r', food_id: A, grams_per_portion: 30 } },
  { id: 4, table: 'food', row_id: A, payload: { units: [] } },                                     // an edit made since
  { id: 5, table: 'stock', row_id: 's2', payload: { food_id: 'other' } },
  { id: 6, table: 'task', row_id: 't', payload: { title: A } },                                   // not a reference
  { id: 7, table: 'profile', row_id: 'p', payload: { settings: { books: [{ ids: [A] }] } } },
]
is('the queue follows the twin, the sent entry left alone', repointPending(queue, 'food', A, T, new Set([1])), [
  { id: 2, payload: { household_id: 'h', food_id: T, grams_on_hand: 400 } },
  { id: 3, payload: { recipe_id: 'r', food_id: T, grams_per_portion: 30 } },
  { id: 4, row_id: T },
  { id: 7, payload: { settings: { books: [{ ids: [T] }] } } },
])
is('a table nothing points at moves only its own entries',
  repointPending([{ id: 1, table: 'body_log', row_id: A, payload: {} }, { id: 2, table: 'stock', row_id: 's', payload: { food_id: A } }], 'body_log', A, T),
  [{ id: 1, row_id: T }])

// ---- page by page ------------------------------------------------------------------------
is('a page is a thousand rows (the server’s limit)', PAGE, 1000)
is('an old cursor (a time) still reads', readCursor('2026-09-28T10:00:00+00:00'), { at: '2026-09-28T10:00:00+00:00', key: null })
is('a cursor with a key', readCursor({ at: '2026-09-28T10:00:00+00:00', key: 'k' }), { at: '2026-09-28T10:00:00+00:00', key: 'k' })
is('nothing stored, no cursor', [readCursor(null), readCursor(''), readCursor({ key: 'k' })], [null, null, null])
is('the filter after a cursor', afterFilter({ at: '2026-09-28T10:00:00.5+00:00', key: 'k1' }, 'id'),
  'updated_at.gt."2026-09-28T10:00:00.5+00:00",and(updated_at.eq."2026-09-28T10:00:00.5+00:00",id.gt."k1")')
is('an old cursor has no key to add', afterFilter({ at: 't', key: null }, 'id'), null)
is('the cursor moves to the last row', cursorAfter([{ id: 'a', updated_at: 't1' }, { id: 'b', updated_at: 't2' }], 'id', null), { at: 't2', key: 'b' })
is('a module keeps its key', cursorAfter([{ key: 'u_x', updated_at: 't1' }], 'key', null), { at: 't1', key: 'u_x' })
is('an empty page leaves it', cursorAfter([], 'id', { at: 't', key: 'k' }), { at: 't', key: 'k' })
is('a full page asks for more, a short one ends', [morePages(1000), morePages(999), morePages(0)], [true, false, false])

// A server that sends pages of three, in updated_at then id order, with most
// rows sharing one time: one statement touched them all at once.
const T0 = '2026-09-28T10:00:00+00:00'
const T1 = '2026-09-28T10:00:00.25+00:00'
const T2 = '2026-09-28T10:00:01+00:00'
const table = [
  { id: 'a1', updated_at: T0 }, { id: 'b2', updated_at: T1 }, { id: 'b3', updated_at: T1 }, { id: 'b4', updated_at: T1 },
  { id: 'b5', updated_at: T1 }, { id: 'b6', updated_at: T1 }, { id: 'b7', updated_at: T1 }, { id: 'c8', updated_at: T2 },
]
const order = (a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const serve = (rows, cursor, size) => rows.filter((r) => isAfter(r, cursor, 'id')).sort(order).slice(0, size)
function fetchAll(rows, cursor, size) {
  const got = []
  let pages = 0
  for (;;) {
    const page = serve(rows, cursor, size)
    pages++
    got.push(...page)
    cursor = cursorAfter(page, 'id', cursor)
    if (!morePages(page.length, size)) return { ids: got.map((r) => r.id), cursor, pages }
  }
}
const whole = fetchAll(table, null, 3)
is('every row once, across pages that split rows of one time', whole.ids, table.map((r) => r.id))
is('pages until a short one', whole.pages, 3)
is('the cursor ends on the last row', whole.cursor, { at: T2, key: 'c8' })
const nothing = fetchAll(table, whole.cursor, 3)
is('the next pull fetches nothing new', nothing.ids, [])
is('and keeps the cursor', nothing.cursor, whole.cursor)
const exact = fetchAll(table.slice(0, 6), null, 3)
is('a table of exactly two pages ends on an empty third', [exact.ids.length, exact.pages], [6, 3])
// A row changed since, and one added at the very time the cursor stopped at
// but after it in key order: both come; nothing before the cursor repeats.
const later = [...table.map((r) => (r.id === 'b3' ? { ...r, updated_at: '2026-09-28T10:00:02+00:00' } : r)), { id: 'c9', updated_at: T2 }]
is('only what changed, and a row sharing the cursor’s time', fetchAll(later, whole.cursor, 3).ids, ['c9', 'b3'])
// The old way (a time alone, "later than") loses rows at a page's edge.
const byTime = (rows, size) => {
  const got = []
  let at = null
  for (;;) {
    const page = rows.filter((r) => !at || r.updated_at > at).sort(order).slice(0, size)
    got.push(...page)
    if (page.length) at = page[page.length - 1].updated_at
    if (page.length < size) return got.map((r) => r.id)
  }
}
is('(a time alone would have skipped b5, b6 and b7)', byTime(table, 3), ['a1', 'b2', 'b3', 'c8'])
is('times compare as the server writes them (fewer decimals first)', [isAfter({ updated_at: T1, id: 'x' }, { at: T0, key: 'z' }, 'id'),
  isAfter({ updated_at: T0, id: 'z' }, { at: T1, key: 'a' }, 'id')], [true, false])

// ---------- settings, key by key (SYNC-03) -------------------------------------------
const base = { looks: { theme: 'notebook', mode: 'system' }, note_templates: [{ id: 'a' }], nav: { style: 'row', order: [] }, books: [] }
const mineS = { ...base, looks: { theme: 'sage', mode: 'system' } }
const theirsS = { ...base, note_templates: [{ id: 'a' }, { id: 'b' }], nav: { style: 'row', order: ['m:sleep'] } }
const merged = mergeSettings3(base, mineS, theirsS)
is('my theme and their new note template both stay', [merged.looks.theme, merged.note_templates.length], ['sage', 2])
is('their page order stays where I changed nothing', merged.nav.order, ['m:sleep'])
const mine2 = { ...base, nav: { style: 'hub', order: [] } }
is('one device’s bar style and the other’s order merge inside the bar', mergeSettings3(base, mine2, theirsS).nav, { style: 'hub', order: ['m:sleep'] })
is('a list is whole: my list wins if I changed it', mergeSettings3(base, { ...base, books: [{ id: 'x' }] }, { ...base, books: [{ id: 'y' }] }).books, [{ id: 'x' }])
is('with no base, this device wins, as before', mergeSettings3(null, mineS, theirsS), mineS)
is('a key only the server has is kept', mergeSettings3(base, base, { ...base, stats_views: [{ id: 's' }] }).stats_views, [{ id: 's' }])
is('a key I added is kept', mergeSettings3(base, { ...base, today_cards: [{ kind: 'module', key: 'habits' }] }, base).today_cards.length, 1)
const mv = mergeSettings3({ module_views: { habits: { plan: true } } }, { module_views: { habits: { plan: false } } }, { module_views: { habits: { plan: true }, sleep: { widget: false } } })
is('module switches merge per module', mv.module_views, { habits: { plan: false }, sleep: { widget: false } })
is('the merge reads back as valid settings', readSettings({ settings: merged }).looks.theme, 'sage')

// ---------- what 026 added is synced with the same guarantees (SYNC-03) ---------------
const syncSrc = readFileSync(new URL('../lib/sync.ts', import.meta.url), 'utf8')
const writeSrc = readFileSync(new URL('../lib/write.ts', import.meta.url), 'utf8')
const dbSrc = readFileSync(new URL('../lib/db.ts', import.meta.url), 'utf8')
const children = /const CHILDREN = \[([^\]]*)\]/.exec(syncSrc)?.[1] ?? ''
for (const t of ['shopping_entry', 'chore', 'chore_log']) {
  is(`${t} is pulled and pushed (sync.ts)`, children.includes(`'${t}'`), true)
  is(`${t} is written through edit() (write.ts)`, writeSrc.includes(`'${t}'`), true)
  is(`${t} has a table on the device (db.ts)`, new RegExp(`${t}: '`).test(dbSrc), true)
}
is('a tick on the shopping list folds into its twin', NATURAL_KEYS.shopping_entry, ['household_id', 'plan_key'])
is('a chore done twice the same day folds into one', NATURAL_KEYS.chore_log, ['chore_id', 'done_on'])
is('a food folded into its twin takes the shopping list with it', REFERENCES.food.some((r) => r.table === 'shopping_entry'), true)
is('settings sent are merged with the server’s first', /withServerSettings\(entry\.id/.test(syncSrc), true)
is('a waiting settings change is merged on pull', /mergeSettings3\(await getMeta/.test(syncSrc), true)
// Settings that 026 added travel in the profile row, so they sync with it.
const s1 = mergeSettings(readSettings({}), { note_templates: readSettings({}).note_templates, stats_views: [], today_cards: [{ kind: 'module', key: 'habits', size: 'small', show: 'always' }] })
is('new settings keys survive the round trip a sync makes', readSettings(JSON.parse(JSON.stringify({ settings: s1 }))).today_cards.length, 1)

// ---------- the light pull (SYNC-02) ----------------------------------------------------------
is('a light pull every two minutes while open', /PERIODIC_MS = 2 \* 60_000/.test(syncSrc), true)
is('it leaves the catalogue out', /opts\.light \? \[\] : CATALOGUE/.test(syncSrc), true)
is('it also runs on coming back into view', /visibilitychange', onFocus/.test(syncSrc), true)

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall sync checks passed')
