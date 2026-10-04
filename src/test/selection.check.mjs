// Checks selecting several rows (GEN-52, GEN-53): ticking one, "Select all
// shown" and clearing, the ticked rows in the list's order, rows that have
// gone dropped, the count in words and when a bulk delete asks once more.
import {
  toggleOne, allTicked, toggleShown, pickedRows, pruneGone, countWords, singular, deleteNeedsAsk, repeatManyWords,
} from '../lib/selection-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const ids = (s) => [...s].sort()
const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

is('a tap ticks a row', ids(toggleOne(new Set(), 'a')), ['a'])
is('a second tap unticks it', ids(toggleOne(new Set(['a']), 'a')), [])
is('on: true keeps a ticked row ticked', ids(toggleOne(new Set(['a']), 'a', true)), ['a'])
is('on: false unticks', ids(toggleOne(new Set(['a', 'b']), 'a', false)), ['b'])
const before = new Set(['a'])
toggleOne(before, 'b')
is('the old set is never changed', ids(before), ['a'])

is('nothing shown is never "all ticked"', allTicked(new Set(['a']), []), false)
is('all shown ticked', allTicked(new Set(['a', 'b', 'z']), rows.slice(0, 2)), true)
is('one shown not ticked', allTicked(new Set(['a']), rows.slice(0, 2)), false)
is('"Select all shown" ticks the shown rows and keeps the others',
  ids(toggleShown(new Set(['z']), rows.slice(0, 2))), ['a', 'b', 'z'])
is('"Clear shown" unticks only the shown rows',
  ids(toggleShown(new Set(['a', 'b', 'z']), rows.slice(0, 2))), ['z'])

is('picked rows come in the list order, not the tick order',
  pickedRows(rows, new Set(['d', 'a', 'c'])).map((r) => r.id), ['a', 'c', 'd'])
is('an id whose row has gone is not picked', pickedRows(rows, new Set(['a', 'gone'])).map((r) => r.id), ['a'])

const same = new Set(['a', 'b'])
is('nothing gone: the same set comes back', pruneGone(same, rows) === same, true)
is('a gone row is dropped', ids(pruneGone(new Set(['a', 'x']), rows)), ['a'])
const empty = new Set()
is('an empty set stays the same set', pruneGone(empty, []) === empty, true)

is('one task', countWords(1, 'tasks'), '1 task selected')
is('several tasks', countWords(3, 'tasks'), '3 tasks selected')
is('none', countWords(0, 'records'), '0 records selected')
is('entries → entry', singular('entries'), 'entry')
is('boxes → box', singular('boxes'), 'box')
is('payments → payment', singular('payments'), 'payment')
is('one delete goes at once (Undo is there)', deleteNeedsAsk(1), false)
is('several ask once more', deleteNeedsAsk(2), true)

is('repeat words, several', repeatManyWords({ changed: 3, noDay: 0 }, 'Weekly on Mon'), '3 tasks now repeat: weekly on Mon.')
is('repeat words, one', repeatManyWords({ changed: 1, noDay: 0 }, 'About every 7 days'), '1 task now repeats: about every 7 days.')
is('repeat words, stopped', repeatManyWords({ changed: 2, noDay: 0 }, null), '2 tasks stopped repeating.')
is('repeat words, some without a day', repeatManyWords({ changed: 1, noDay: 2 }, 'Every day'), '1 task now repeats: every day. 2 tasks without a day were left as they were.')
is('repeat words, nothing', repeatManyWords({ changed: 0, noDay: 0 }, null), 'Nothing to change.')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nselection: all passed')
