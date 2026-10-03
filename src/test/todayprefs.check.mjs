// Checks Today's own choices (kept in the core module's settings) and the
// round + menu (GEN-50): at most six entries, most used first, the person's
// own order and hidden entries, nothing ever lost (hidden ones stay under
// "More"), stored values cleaned.
import {
  readTodayPrefs, arrangeAdd, countUse, moveEntry, toggleHidden, byUse, MENU_SIZE, DEFAULT_TODAY_PREFS, MODULE_ADD,
} from '../lib/today-prefs-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

is('nothing stored: the defaults', readTodayPrefs(undefined), DEFAULT_TODAY_PREFS)
is('parts of the day is kept', readTodayPrefs({ layout: 'parts' }).layout, 'parts')
is('an unknown layout is the timeline', readTodayPrefs({ layout: 'spiral' }).layout, 'time')
is('stored counts and lists are cleaned',
  readTodayPrefs({ add: { uses: { task: 3, food: -1, 'bad key!': 4, inbox: 'x', event: 2.6 }, hidden: ['food', 'food', 7], order: 'no' } }).add,
  { uses: { task: 3, event: 3 }, hidden: ['food'], order: [] })
is('a broken value never throws', readTodayPrefs([1, 2]), DEFAULT_TODAY_PREFS)

const E = (key) => ({ key, label: key, hint: '' })
const all = ['task', 'inbox', 'food', 'event', 'habits', 'learning', 'finance', 'sleep'].map(E)
const keys = (list) => list.map((e) => e.key)
const none = DEFAULT_TODAY_PREFS.add

is('six at most, in the default order', keys(arrangeAdd(all, none).shown), ['task', 'inbox', 'food', 'event', 'habits', 'learning'])
is('the rest are under More', keys(arrangeAdd(all, none).more), ['finance', 'sleep'])
is('the menu size', MENU_SIZE, 6)
let p = none
for (let i = 0; i < 3; i++) p = countUse(p, 'sleep')
p = countUse(p, 'food')
is('most used first', keys(arrangeAdd(all, p).shown), ['sleep', 'food', 'task', 'inbox', 'event', 'habits'])
is('…and what dropped off is still there', keys(arrangeAdd(all, p).more), ['learning', 'finance'])
const big = { ...none, uses: { task: 200, food: 9 } }
is('counts are halved now and then, keeping their order', countUse(big, 'task').uses, { task: 101, food: 5 })

const hid = toggleHidden(none, 'inbox')
is('hidden: off the short menu', keys(arrangeAdd(all, hid).shown).includes('inbox'), false)
is('hidden: listed apart, never lost', keys(arrangeAdd(all, hid).hidden), ['inbox'])
is('hidden twice is shown again', toggleHidden(hid, 'inbox').hidden, [])

const moved = moveEntry(all, p, 'event', -1)
is('moving takes the order as shown, then swaps', moved.order.slice(0, 5), ['sleep', 'food', 'task', 'event', 'inbox'])
is('own order wins over use', keys(arrangeAdd(all, countUse(countUse(moved, 'finance'), 'finance')).shown), ['sleep', 'food', 'task', 'event', 'inbox', 'habits'])
is('the first cannot go up', moveEntry(all, none, 'task', -1), none)
is('an entry not on the menu does nothing', moveEntry(all, none, 'nope', 1), none)
is('back to "by use"', byUse(moved).order, [])
is('a module that is new since the order was set goes after the ordered ones',
  keys(arrangeAdd([...all, E('u_mod')], moveEntry(all, none, 'sleep', -1), 100).shown).slice(-2), ['finance', 'u_mod'])

is('stats and the planner add nothing of their own', [MODULE_ADD.stats, MODULE_ADD.core], [null, null])
is('food and events have their words', [MODULE_ADD.nutrition.label, MODULE_ADD.agenda.label], ['Food', 'Event'])

if (fail) { console.error(`\n${fail} failed`); process.exit(1) }
console.log('\ntodayprefs: all good')
