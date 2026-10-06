// Checks the launcher shortcuts and the quick-add widget's list (NAV-24,
// WID-11): the + menu's first four, short names that fit, the links they
// open and the ?add= parameter the app accepts.
import { quickAddItems, shortLabel, addLink, addKeyFrom, QUICK_ADD_DEFAULT, QUICK_ADD_SIZE } from '../lib/widget-quickadd-rules.ts'
import { widgetPath } from '../lib/widget-rules.ts'
import { arrangeAdd } from '../lib/today-prefs-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

const entries = [
  { key: 'task', label: 'Task' },
  { key: 'inbox', label: 'Task to Inbox' },
  { key: 'food', label: 'Food' },
  { key: 'event', label: 'Event' },
  { key: 'm:health', label: 'Weigh-in' },
  { key: 'm:shopping', label: 'Shopping item' },
  { key: 'm:sleep', label: 'Night\'s sleep' },
]
const prefs = (p = {}) => ({ order: [], hidden: [], uses: {}, ...p })
const keys = (list) => list.map((i) => i.key)

// The same first entries as the + menu.
eq('a new profile: the + menu\'s first four', keys(quickAddItems(arrangeAdd(entries, prefs()).shown)), ['task', 'inbox', 'food', 'event'])
eq('most used first', keys(quickAddItems(arrangeAdd(entries, prefs({ uses: { 'm:shopping': 9, food: 4 } })).shown)), ['m:shopping', 'food', 'task', 'inbox'])
eq('the person\'s own order', keys(quickAddItems(arrangeAdd(entries, prefs({ order: ['m:health', 'task', 'm:shopping', 'food'] })).shown)), ['m:health', 'task', 'm:shopping', 'food'])
eq('hidden entries are left out', keys(quickAddItems(arrangeAdd(entries, prefs({ hidden: ['inbox', 'event'] })).shown)), ['task', 'food', 'm:health', 'm:shopping'])
eq('fewer entries than four: as many as there are', keys(quickAddItems(entries.slice(0, 2))), ['task', 'inbox'])
eq('at most four', quickAddItems(entries).length, QUICK_ADD_SIZE)
eq('a key twice is shown once', keys(quickAddItems([entries[0], entries[0], entries[2]])), ['task', 'food'])
eq('a broken key is skipped', keys(quickAddItems([{ key: 'Task!', label: 'x' }, { key: '', label: 'y' }, entries[2]])), ['food'])

// Short names.
eq('short: the + menu\'s own when it fits', shortLabel('task', 'Task'), 'Task')
eq('short: Task to Inbox is Inbox, not Task', shortLabel('inbox', 'Task to Inbox'), 'Inbox')
eq('short: Shopping item', shortLabel('m:shopping', 'Shopping item'), 'Shopping')
eq('short: Night\'s sleep', shortLabel('m:sleep', 'Night\'s sleep'), 'Sleep')
eq('short: Weigh-in fits', shortLabel('m:health', 'Weigh-in'), 'Weigh-in')
eq('short: a module of their own, first word', shortLabel('m:abc', 'Reading log'), 'Reading')
eq('short: one long word is cut', shortLabel('m:abc', 'Photosynthesis'), 'Photosynt…')
eq('short: spaces tidied', quickAddItems([{ key: 'm:x', label: '  Bike   ride ' }])[0], { key: 'm:x', label: 'Bike ride', short: 'Bike ride' })
eq('every short name is ten letters or fewer', quickAddItems(entries, 10).every((i) => i.short.length <= 10), true)
eq('a blank label still says something', quickAddItems([{ key: 'm:x', label: '  ' }])[0].label, 'Add')

// Links and the ?add= parameter.
eq('a shortcut\'s link', addLink('task'), 'app.hemlo.planner://open/?add=task')
eq('a module entry\'s link is encoded', addLink('m:health'), 'app.hemlo.planner://open/?add=m%3Ahealth')
eq('the app routes it to Today with ?add=', widgetPath(addLink('m:health')), '/?add=m%3Ahealth')
eq('?add= read back', addKeyFrom(new URLSearchParams('add=m%3Ahealth').get('add')), 'm:health')
eq('?add= with anything else is ignored', [addKeyFrom('<script>'), addKeyFrom(''), addKeyFrom(null), addKeyFrom('x'.repeat(61))], [null, null, null, null])

// The default list matches the Android side's.
eq('defaults', QUICK_ADD_DEFAULT.map((i) => [i.key, i.short]), [['task', 'Task'], ['inbox', 'Inbox'], ['food', 'Food'], ['event', 'Event']])

if (fail) {
  console.log(`\n${fail} failed`)
  process.exit(1)
}
console.log('\nall quick-add checks passed')
