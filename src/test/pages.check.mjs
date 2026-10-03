// Checks the page list: which pages exist for which modules, their order, the
// ones kept off the bar, where a swipe lands, which paths redirect, and how
// the bar styles share the pages out.
import {
  availablePages, orderPages, pageList, pageForPath, pageAllowed, neighbour,
  rowLayout, gridLayout, drawerLayout, fanLayout, fanRows, isFixed,
  hubBar, pinPage, unpinPage, orderByUse, countUse, effectiveStyle, fitBar, holderOf, BAR_MAX,
} from '../lib/pages-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const on = (...keys) => keys.map((k, i) => ({ module_key: k, enabled: true, sort_order: i }))
const keys = (pages) => pages.map((p) => p.key)
const nav = (order = [], hidden = []) => ({ order, hidden, style: 'row', chosen: true })
/** Nobody has picked a style: the app picks (CALM-04). */
const auto = (order = [], hidden = []) => ({ order, hidden, style: 'row', chosen: false })

/* ---------- which pages exist ---------- */
is('no modules: Today, Plan, Settings', keys(availablePages([], [])), ['today', 'plan', 'more'])
is('Settings is one name, on the bar too', availablePages([], []).find((p) => p.key === 'more').label, 'Settings')
is('nutrition gives Food, shopping gives Shop', keys(availablePages(on('shopping', 'nutrition'), [])), ['today', 'plan', 'food', 'shop', 'more'])
is('a switched-off module has no page',
  keys(availablePages([{ module_key: 'nutrition', enabled: false }, ...on('habits')], [])), ['today', 'plan', 'm:habits', 'more'])
is('core and custom never get a page', keys(availablePages(on('core', 'custom', 'sleep'), [])), ['today', 'plan', 'm:sleep', 'more'])
is('built-in modules follow the app order, not the row order',
  keys(availablePages(on('sleep', 'agenda', 'training'), [])), ['today', 'plan', 'm:training', 'm:agenda', 'm:sleep', 'more'])
const statsPage = availablePages(on('stats', 'household'), []).find((p) => p.key === 'm:stats')
is('Stats has a page of its own, after the other built-in modules',
  keys(availablePages(on('stats', 'household'), [])), ['today', 'plan', 'm:household', 'm:stats', 'more'])
is('called Stats, with its own glyph, at /m/stats', [statsPage.label, statsPage.glyph, statsPage.route], ['Stats', '◔', '/m/stats'])

const built = [
  { key: 'u_aaaa', name: 'reading log', builtin: false, deleted_at: null, definition: {} },
  { key: 'u_bbbb', name: 'Garden', builtin: false, deleted_at: null, definition: { glyph: '✿' } },
  { key: 'u_cccc', name: 'Gone', builtin: false, deleted_at: '2026-01-01', definition: {} },
  { key: 'u_dddd', name: 'Off', builtin: false, deleted_at: null, definition: {} },
  { key: 'u_eeee', name: 'Word glyph', builtin: false, deleted_at: null, definition: { glyph: 'Garden' } },
]
const withBuilt = availablePages([...on('u_bbbb', 'u_aaaa', 'u_cccc', 'u_eeee'), { module_key: 'u_dddd', enabled: false }], built)
is('built modules: switched on and not deleted, by their place in the list',
  keys(withBuilt), ['today', 'plan', 'm:u_bbbb', 'm:u_aaaa', 'm:u_eeee', 'more'])
is('a built module keeps its own glyph', withBuilt.find((p) => p.key === 'm:u_bbbb').glyph, '✿')
is('else the first letter of its name, capitalised', withBuilt.find((p) => p.key === 'm:u_aaaa').glyph, 'R')
is('a whole word is not a glyph', withBuilt.find((p) => p.key === 'm:u_eeee').glyph, 'W')
is('a built module opens at /m/<key>', withBuilt.find((p) => p.key === 'm:u_aaaa').route, '/m/u_aaaa')
is('an instance with no module row gets no page', keys(availablePages(on('u_zzzz'), [])), ['today', 'plan', 'more'])
is('only Today and Plan are primary', availablePages(on('nutrition', 'habits'), []).filter((p) => p.primary).map((p) => p.key), ['today', 'plan'])

/* ---------- order and hidden ---------- */
const all5 = availablePages(on('nutrition', 'shopping', 'habits', 'sleep'), [])
is('the person’s order first, then the default', keys(orderPages(all5, ['m:sleep', 'shop'])),
  ['today', 'plan', 'm:sleep', 'shop', 'food', 'm:habits', 'more'])
is('Today and Plan lead and More closes, whatever the order says', keys(orderPages(all5, ['more', 'food', 'plan', 'today'])),
  ['plan', 'today', 'food', 'shop', 'm:habits', 'm:sleep', 'more'])
is('keys for pages that are gone are ignored', keys(orderPages(all5, ['m:finance', 'm:habits'])),
  ['today', 'plan', 'm:habits', 'food', 'shop', 'm:sleep', 'more'])
const list = pageList(on('nutrition', 'shopping', 'habits', 'sleep'), [], nav(['m:sleep'], ['shop', 'today', 'more']))
is('hidden pages leave the bar', keys(list.bar), ['today', 'plan', 'm:sleep', 'food', 'm:habits', 'more'])
is('but stay in the full list', keys(list.all), ['today', 'plan', 'm:sleep', 'food', 'shop', 'm:habits', 'more'])
is('Today, Plan and More are fixed', ['today', 'plan', 'more', 'food'].map(isFixed), [true, true, true, false])

/* ---------- paths and redirects ---------- */
is('paths to page keys', ['/', '/plan', '/food', '/shop', '/more', '/m/habits', '/m/u_ab12', '/plan/'].map(pageForPath),
  ['today', 'plan', 'food', 'shop', 'more', 'm:habits', 'm:u_ab12', 'plan'])
is('unknown paths are no page', ['/nope', '/m/', '/m/Bad-Key', '/m/a/b'].map(pageForPath), [null, null, null, null])
is('a page whose module is on opens', pageAllowed('food', list.all), true)
is('a hidden page still opens', pageAllowed('shop', list.all), true)
is('a switched-off module redirects', pageAllowed('m:training', list.all), false)
is('an unknown key redirects', [pageAllowed(pageForPath('/m/u_nothing'), list.all), pageAllowed(null, list.all)], [false, false])

/* ---------- swiping ---------- */
is('from Today a swipe reaches Plan', neighbour(list, 'today', 1)?.key, 'plan')
is('and back', neighbour(list, 'plan', -1)?.key, 'today')
is('a hidden page is stepped over', neighbour(list, 'food', 1)?.key, 'm:habits')
is('from a hidden page, the next one on the bar', neighbour(list, 'shop', -1)?.key, 'food')
is('no wrapping at either end', [neighbour(list, 'today', -1), neighbour(list, 'more', 1)], [null, null])
is('no swipe from a page that is not there', neighbour(list, 'm:training', 1), null)

/* ---------- layouts ---------- */
const chosenRow = { order: [], hidden: [], style: 'row', chosen: true }
const many = pageList(on('nutrition', 'shopping', 'habits', 'sleep', 'finance', 'agenda'), [], chosenRow)
const few = pageList(on('nutrition', 'shopping'), [], auto())
is('five or fewer share one row as they are', keys(rowLayout(few.bar)), ['today', 'plan', 'food', 'shop', 'more'])
const row = rowLayout(many.bar)
is('more than five on a chosen row: Today, Plan, the first two, and Modules; nothing scrolls',
  keys(row), ['today', 'plan', 'food', 'shop', 'modules'])
is('a fitted bar never passes five', [3, 6, 9, 14].every((n) => fitBar(availablePages(on(...['nutrition', 'shopping', 'training', 'habits', 'supplements', 'health', 'learning', 'agenda', 'sleep', 'projects', 'finance', 'household', 'stats'].slice(0, n)), [])).length <= BAR_MAX), true)
is('the Modules link marks a page that is not on the bar', holderOf(row, 'm:finance'), 'modules')
is('…but not one that is', holderOf(row, 'food'), null)
is('…nor a bar without the Modules link', holderOf(few.bar, 'm:finance'), null)
const g2 = gridLayout(many.bar, 2)
is('two rows: seven others in four columns', [keys(g2.primary), g2.rest.length, g2.rows, g2.cols], [['today', 'plan'], 7, 2, 4])
const lots = pageList(on('nutrition', 'shopping', 'training', 'habits', 'supplements', 'health', 'learning', 'agenda', 'sleep', 'projects', 'finance', 'household', 'stats'), [], { ...chosenRow, style: 'two_rows' })
const g2b = gridLayout(lots.bar, 2)
is('two rows with too many: eight tiles, the last the Modules page, never wider than four',
  [g2b.rest.length, g2b.cols, g2b.rest[g2b.rest.length - 1].key], [8, 4, 'modules'])
const g3 = gridLayout(pageList(on('habits'), [], nav()).bar, 3)
is('three rows with two others uses two rows', [g3.rows, g3.cols], [2, 1])
const d1 = drawerLayout(many.bar, 'today')
is('drawer on Today: Today and Plan on the bar, the rest in the sheet', [keys(d1.onBar), d1.inSheet.length], [['today', 'plan'], 7])
is('drawer on another page: that page joins the bar', keys(drawerLayout(many.bar, 'm:sleep').onBar), ['today', 'plan', 'm:sleep'])
const f = fanLayout(many.bar)
is('fan: Today, Plan and More on the bar, the rest in the fan', [keys(f.left), keys(f.right), f.fan.length], [['today', 'plan'], ['more'], 6])
is('fan rows widen upwards', [fanRows(1, 4), fanRows(2, 4), fanRows(3, 4), fanRows(5, 4), fanRows(10, 4)], [[1], [2], [1, 2], [2, 3], [1, 2, 3, 4]])
is('fan rows never pass what fits', fanRows(14, 4).every((c) => c <= 4) && fanRows(14, 4).reduce((a, b) => a + b, 0) === 14, true)
is('fan rows never shrink upwards', [3, 6, 7, 9, 12, 20].every((n) => fanRows(n, 5).every((c, i, a) => i === 0 || c >= a[i - 1])), true)
is('nothing to fan, no rows', fanRows(0, 4), [])

/* ---------- the hub style and the Modules page (NAV-20 to NAV-22) ---------- */
const hubMods = on('nutrition', 'shopping', 'training', 'habits', 'sleep', 'stats')
const hub = (pinned = [], hidden = []) => pageList(hubMods, [], { order: [], hidden, style: 'hub', pinned, chosen: true })
is('hub: Today, Plan, Stats and Modules', keys(hub().bar), ['today', 'plan', 'm:stats', 'modules'])
is('hub: two pins take the places, Stats gives way: five at most', keys(hub(['m:sleep', 'food']).bar), ['today', 'plan', 'm:sleep', 'food', 'modules'])
is('hub: one pin and Stats', keys(hub(['m:sleep']).bar), ['today', 'plan', 'm:sleep', 'm:stats', 'modules'])
is('hub: a pin of a page that has gone is passed over', keys(hub(['m:finance']).bar), ['today', 'plan', 'm:stats', 'modules'])
is('hub: a pin wins over hiding', keys(hub(['food'], ['food']).bar), ['today', 'plan', 'food', 'm:stats', 'modules'])
is('hub: never more than five', keys(hubBar(hub().all, ['food', 'shop', 'm:sleep'])).length, 5)

/* ---------- which style, when nobody chose (CALM-04) ---------- */
is('not chosen, five pages or fewer: the row', effectiveStyle({ style: 'row', chosen: false }, 5), 'row')
is('not chosen, more than five: the hub', effectiveStyle({ style: 'row', chosen: false }, 6), 'hub')
is('chosen: kept, however many', [effectiveStyle({ style: 'row', chosen: true }, 14), effectiveStyle({ style: 'fan', chosen: true }, 3)], ['row', 'fan'])
is('a new profile with many modules gets the hub bar',
  [pageList(hubMods, [], auto()).style, keys(pageList(hubMods, [], auto()).bar)], ['hub', ['today', 'plan', 'm:stats', 'modules']])
is('a few modules keep the row', [few.style, keys(few.bar)], ['row', ['today', 'plan', 'food', 'shop', 'more']])
is('hidden pages count out: hiding enough keeps the row',
  pageList(hubMods, [], auto([], ['food', 'shop', 'm:training', 'm:habits'])).style, 'row')
is('hub: without Stats on, no Stats', keys(hubBar(availablePages(on('habits'), []), [])), ['today', 'plan', 'modules'])
is('hub: every page still opens', pageAllowed('m:training', hub().all), true)
is('the Modules page has an address', pageForPath('/modules'), 'modules')
is('the Modules page is fixed', isFixed('modules'), true)
is('other styles keep the bar as it was', keys(pageList(hubMods, [], { order: [], hidden: [], style: 'row', pinned: ['m:sleep'], chosen: true }).bar).includes('modules'), false)
is('a swipe walks the hub’s bar, Modules last', neighbour(hub(['food']), 'm:stats', 1)?.key, 'modules')
is('…and back from Modules', neighbour(hub(['food']), 'modules', -1)?.key, 'm:stats')
is('…and no further', neighbour(hub(), 'modules', 1), null)
const hubAll = hub().all
const pinned1 = pinPage({ order: [], hidden: ['m:sleep'], pinned: [] }, 'm:sleep', hubAll)
is('pin: joins the pins, leaves the hidden list, goes after Plan', [pinned1.pinned, pinned1.hidden, pinned1.order.slice(0, 3)], [['m:sleep'], [], ['today', 'plan', 'm:sleep']])
is('pin: at most two, the oldest makes room', pinPage({ order: [], hidden: [], pinned: ['food', 'shop'] }, 'm:sleep', hubAll).pinned, ['shop', 'm:sleep'])
is('pin: Today cannot be pinned', pinPage({ order: [], hidden: [], pinned: [] }, 'today', hubAll).pinned, [])
is('unpin', unpinPage({ pinned: ['food', 'm:sleep'] }, 'food').pinned, ['m:sleep'])
const usePages = availablePages(on('training', 'habits', 'sleep'), []).filter((p) => p.module)
is('most used first, then the app’s order', keys(orderByUse(usePages, { 'm:sleep': 5, 'm:habits': 2 })), ['m:sleep', 'm:habits', 'm:training'])
is('never used: the app’s order', keys(orderByUse(usePages, {})), ['m:training', 'm:habits', 'm:sleep'])
is('a use counted', countUse({ a: 2 }, 'a'), { a: 3 })
is('counts are halved past a thousand, so now outranks long ago', countUse({ a: 1000, b: 9 }, 'a'), { a: 500, b: 4 })

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall page checks passed')
