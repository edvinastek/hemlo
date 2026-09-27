// Checks that personal settings always come out whole and sane, whatever was stored.
import { readSettings, mergeSettings, mealTime, DEFAULT_SETTINGS } from '../lib/settings.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

is('nothing stored gives the defaults', readSettings({ settings: null }), DEFAULT_SETTINGS)
is('no profile gives the defaults', readSettings(undefined), DEFAULT_SETTINGS)
is('work hours are off and unlocked by default', [DEFAULT_SETTINGS.work.on, DEFAULT_SETTINGS.work.locked], [false, false])
is('no meal times by default', DEFAULT_SETTINGS.meal_times, {})
is('calories, not protein, by default', [DEFAULT_SETTINGS.nutrients, DEFAULT_SETTINGS.today_metric], [['kcal'], 'kcal'])

const junk = readSettings({ settings: {
  onboarded: 'yes', work: { on: true, start: '25:99', end: '18:30:00', days: [1, 9, 'x', 3] },
  commute: { on: true, before_min: -5, after_min: 45, km: 'far' },
  nutrients: ['protein_g', 'sugar', 'kcal'], today_metric: 'sugar',
  meal_times: { lunch: '12:30', dinner: 'late', brunch: '11:00' }, stock_auto: 1,
} })
is('a non-boolean flag falls back', junk.onboarded, false)
is('a bad time falls back, seconds are dropped', [junk.work.start, junk.work.end], ['09:00', '18:30'])
is('only real weekdays are kept', junk.work.days, [1, 3])
is('negative minutes fall back; good ones stay', [junk.commute.before_min, junk.commute.after_min], [30, 45])
is('a distance that is not a number is none', junk.commute.km, null)
is('unknown nutrients are dropped, order is the app’s', junk.nutrients, ['kcal', 'protein_g'])
is('an unknown Today figure falls back', junk.today_metric, 'kcal')
is('only good meal times for real meals are kept', junk.meal_times, { lunch: '12:30' })
is('none is a valid Today figure', readSettings({ settings: { today_metric: 'none' } }).today_metric, 'none')

const base = readSettings({ settings: { work: { on: true, start: '07:00', end: '15:00' } } })
const moved = mergeSettings(base, { work: { end: '16:00' } })
is('changing the end keeps the start', [moved.work.start, moved.work.end, moved.work.on], ['07:00', '16:00', true])
is('meal times are replaced as a whole, so one can be removed', mergeSettings(readSettings({ settings: { meal_times: { lunch: '12:00', dinner: '18:00' } } }), { meal_times: { lunch: '12:00' } }).meal_times, { lunch: '12:00' })

const s = readSettings({ settings: { meal_times: { dinner: '18:30' } } })
is('a meal’s own time wins', mealTime({ slot: 'dinner', slot_time: '19:15:00' }, s), '19:15')
is('then the default', mealTime({ slot: 'dinner', slot_time: null }, s), '18:30')
is('else no time at all', mealTime({ slot: 'lunch' }, s), null)

// The page bar and colours.
const nav = readSettings({ settings: { nav: { style: 'fan', order: ['plan', 'm:u_abc123', 'm:BAD', 'plan', 42], hidden: ['today', 'shop', 'more'], swipe: 'no' } } }).nav
is('a known bar style is kept', nav.style, 'fan')
is('page keys are checked and not repeated', nav.order, ['plan', 'm:u_abc123'])
is('Today, Plan and More cannot be hidden', nav.hidden, ['shop'])
is('swipe falls back to on', nav.swipe, true)
is('an unknown bar style falls back to one row', readSettings({ settings: { nav: { style: 'spiral' } } }).nav.style, 'row')
const col = readSettings({ settings: { colours: { on: false, modules: { habits: '#3F6B4A', training: 'red', 'x y': '#000000' } } } }).colours
is('colours: only #rrggbb for real keys, lower-cased', col, { on: false, modules: { habits: '#3f6b4a' } })
is('changing the bar style keeps the order', mergeSettings(readSettings({ settings: { nav: { order: ['plan'] } } }), { nav: { style: 'drawer' } }).nav, { style: 'drawer', order: ['plan'], hidden: [], swipe: true })

// Holidays and stats.
const hol = readSettings({ settings: { holidays: { countries: ['nl', 'DE', 'NL', 'xyz', 5, 'LT', 'BE', 'FR', 'PL', 'GB'], colours: { NL: '#FF6600', DE: 'red', US: '#123456' } } } })
is('country codes are upper-cased, deduplicated, checked and capped at 6', hol.holidays.countries, ['NL', 'DE', 'LT', 'BE', 'FR', 'PL'])
is('only good colours for chosen countries are kept', hol.holidays.colours, { NL: '#ff6600' })
is('no holidays by default', DEFAULT_SETTINGS.holidays, { countries: [], colours: {} })
is('stats hide switched-off modules by default', readSettings({ settings: { stats: { show_disabled: 'y' } } }).stats.show_disabled, false)
is('changing holiday colours keeps the countries', mergeSettings(hol, { holidays: { colours: { DE: '#00aa00' } } }).holidays, { countries: ['NL', 'DE', 'LT', 'BE', 'FR', 'PL'], colours: { DE: '#00aa00' } })

// Recipe and food books.
const longName = 'x'.repeat(80)
const books = readSettings({ settings: { books: [
  { id: 'b1', name: '  Quick   lunches ', kind: 'recipe', items: ['r1', 'r2', 'r1', 5, 'bad id'], colour: '#1E8347' },
  { id: 'b1', name: 'Same id again', kind: 'recipe', items: [] },
  { id: 'b2', name: longName, kind: 'food', items: 'r1', colour: '#123456' },
  { id: 'b3', name: '   ', kind: 'food', items: [] },
  { id: 'b4', name: 'Drinks', kind: 'drink', items: [] },
  { name: 'No id', kind: 'food', items: [] },
  'junk', null,
] } }).books
is('books: only whole ones are kept, names tidied, items checked and not repeated', books.map((b) => [b.id, b.name.length > 30 ? b.name.length : b.name, b.kind, b.items, b.colour ?? null]),
  [['b1', 'Quick lunches', 'recipe', ['r1', 'r2'], '#1e8347'], ['b2', 60, 'food', [], null]])
is('no books by default', DEFAULT_SETTINGS.books, [])
is('books that are not a list are none', readSettings({ settings: { books: { b1: 1 } } }).books, [])
const many = Array.from({ length: 70 }, (_, i) => ({ id: `b${i}`, name: `Book ${i}`, kind: 'food', items: Array.from({ length: 600 }, (_, j) => `f${j}`) }))
const capped = readSettings({ settings: { books: many } }).books
is('at most 50 books of at most 500 rows', [capped.length, capped[0].items.length], [50, 500])
is('a books change replaces the list and keeps the rest', (() => {
  const m = mergeSettings(readSettings({ settings: { stock_auto: true, books: [{ id: 'a', name: 'A', kind: 'food', items: [] }] } }), { books: [{ id: 'b', name: 'B', kind: 'recipe', items: ['x'] }] })
  return [m.stock_auto, m.books.map((b) => b.id)]
})(), [true, ['b']])

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
