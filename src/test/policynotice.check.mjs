// Checks when the app says the privacy policy changed (G2 #16): a newer
// policy than the one agreed to or last read shows one line; reading it
// (on any device, or on this one while offline) makes it go away.
import { noticeDue, policyDate, noticeText } from '../legal/notice-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const now = '2026-10-10'
is('agreed to this one at sign-up: nothing to say', noticeDue(now, '2026-10-10'), false)
is('agreed to an older one: told', noticeDue(now, '2026-10-04'), true)
is('read on another device: not told again', noticeDue(now, '2026-10-04', '2026-10-10'), false)
is('read on this device while offline: not told again', noticeDue(now, '2026-10-04', null, '2026-10-10'), false)
is('read an older change only: told about the new one', noticeDue(now, '2026-09-01', '2026-10-04'), true)
is('an account from before versions were kept: told', noticeDue(now, undefined), true)
is('rubbish in the account is not a version', noticeDue(now, 'yes', 42), true)
is('a version from the future (a newer app elsewhere): not told', noticeDue(now, '2026-11-01'), false)
is('a broken current version never nags', noticeDue('soon', null), false)
is('the date in words', policyDate('2026-10-04'), '4 October 2026')
is('not a date stays as it is', policyDate('v2'), 'v2')
is('the line', noticeText('2026-10-10'), 'The privacy policy changed on 10 October 2026.')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall policy notice checks passed')
