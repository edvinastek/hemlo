// "Ask after done" note templates (after-done-rules.ts).
import { afterDoneMarker, pendingAfterDone, withAfterDone, resolveAfterDone, removeMarkers } from '../lib/after-done-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}
eq('marker', afterDoneMarker('reading'), '{after-done:reading}')
eq('no note, nothing pending', pendingAfterDone(null), null)
eq('a plain note, nothing pending', pendingAfterDone('Chapter 3\n- [ ] notes'), null)
const n = withAfterDone('Chapter 3', 'reading')
eq('marker added on its own line', n, 'Chapter 3\n{after-done:reading}')
eq('pending found', pendingAfterDone(n), 'reading')
eq('added once only', withAfterDone(n, 'reading'), n)
eq('a different template replaces the first', withAfterDone(n, 'study'), 'Chapter 3\n{after-done:study}')
eq('empty note gets just the marker', withAfterDone('', 'reading'), '{after-done:reading}')
eq('marker text inside a line is not a marker', pendingAfterDone('see {after-done:reading} here'), null)
eq('fill replaces the marker', resolveAfterDone(n, 'fill', '## What I remember\nA lot'), 'Chapter 3\n## What I remember\nA lot')
eq('skip removes it', resolveAfterDone(n, 'skip'), 'Chapter 3')
eq('later keeps it', resolveAfterDone(n, 'later'), n)
eq('fill with nothing written removes the marker', resolveAfterDone(n, 'fill', '  '), 'Chapter 3')
eq('fill on a note without marker appends', resolveAfterDone('Chapter 3', 'fill', 'Thoughts'), 'Chapter 3\n\nThoughts')
eq('removeMarkers tidies blank lines', removeMarkers('A\n\n{after-done:x}\n\nB'), 'A\n\nB')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall passed')
