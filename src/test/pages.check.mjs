// Checks the page list: which pages exist for which modules, their order, the
// ones kept off the bar, where a swipe lands, which paths redirect, and how
// the bar styles share the pages out.
import {
  availablePages, orderPages, pageList, pageForPath, pageAllowed, neighbour,
  rowLayout, gridLayout, drawerLayout, fanLayout, fanRows, isFixed,
} from '../lib/pages-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const on = (...keys) => keys.map((k, i) => ({ module_key: k, enabled: true, sort_order: i }))
const keys = (pages) => pages.map((p) => p.key)
const nav = (order = [], hidden = []) => ({ order, hidden })

/* ---------- which pages exist ---------- */
is('no modules: Today, Plan, More', keys(availablePages([], [])), ['today', 'plan', 'more'])
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
const many = pageList(on('nutrition', 'shopping', 'habits', 'sleep', 'finance', 'agenda'), [], nav())
is('five or fewer share one row', rowLayout(pageList(on('nutrition', 'shopping'), [], nav()).bar), null)
const row = rowLayout(many.bar)
is('more than five: Today and Plan left, More right, the rest scroll',
  [keys(row.fixedLeft), keys(row.scroll), keys(row.fixedRight)],
  [['today', 'plan'], ['food', 'shop', 'm:habits', 'm:agenda', 'm:sleep', 'm:finance'], ['more']])
const g2 = gridLayout(many.bar, 2)
is('two rows: seven others in four columns', [keys(g2.primary), g2.rest.length, g2.rows, g2.cols], [['today', 'plan'], 7, 2, 4])
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

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall page checks passed')
