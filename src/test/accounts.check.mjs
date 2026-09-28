// Checks the rules for several accounts on one device: the saved list (add,
// update, remove, masking, order, the limit of five, what storage gives back)
// and what switching or adding an account needs first.
import {
  MAX_ACCOUNTS, maskEmail, displayName, ordered, toView, cleanList, remember, withToken, rename, forget,
  shouldRemember, alreadyHere, canSwitch, canAdd, waitingText, tokenIsDead, OFFLINE_TEXT, FULL_TEXT,
} from '../lib/accounts-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const T1 = '2026-09-20T10:00:00.000Z'
const T2 = '2026-09-21T10:00:00.000Z'
const T3 = '2026-09-22T10:00:00.000Z'
const acc = (userId, over = {}) => ({ userId, name: userId, email: `${userId}@example.com`, token: `tok-${userId}`, lastUsed: T1, ...over })

// Masking.
is('an address keeps its first letter and its domain', maskEmail('edvinas@gmail.com'), 'e•••@gmail.com')
is('a one-letter name still masks', maskEmail('e@x.io'), 'e•••@x.io')
is('spaces around are ignored', maskEmail('  anna@work.nl '), 'a•••@work.nl')
is('no @ at all keeps only the first letter', maskEmail('someone'), 's•••')
is('an empty address is empty', maskEmail(''), '')
is('the last @ is the domain', maskEmail('a@b@c.com'), 'a•••@c.com')

// Names.
is('the profile name when there is one', displayName('  Edvinas  ', 'e@x.io'), 'Edvinas')
is('otherwise the start of the address', displayName('', 'anna@work.nl'), 'anna')
is('null name, same', displayName(null, 'anna@work.nl'), 'anna')
is('nothing at all reads Account', displayName('', ''), 'Account')
is('a long name is clipped', displayName('x'.repeat(100), 'a@b.c').length, 60)

// Order.
is('most recently used first', ordered([acc('a', { lastUsed: T1 }), acc('b', { lastUsed: T3 }), acc('c', { lastUsed: T2 })]).map((a) => a.userId), ['b', 'c', 'a'])
is('the same time goes by name', ordered([acc('b'), acc('a')]).map((a) => a.userId), ['a', 'b'])

// What the screens get never carries a token.
const view = toView([acc('a')])[0]
is('the view has no token', 'token' in view, false)
is('the view says a token is there', view.hasToken, true)
is('the view carries the masked address', view.masked, 'a•••@example.com')
is('no token, no hasToken', toView([acc('a', { token: null })])[0].hasToken, false)

// What storage gives back.
is('not a list reads as empty', cleanList({ a: 1 }, true), [])
is('null reads as empty', cleanList(null, true), [])
is('entries without an id or address are dropped', cleanList([{ userId: 'a' }, { email: 'x@y.z' }, 5, null], true), [])
is('a browser keeps no tokens', cleanList([acc('a')], false)[0].token, null)
is('a phone keeps them', cleanList([acc('a')], true)[0].token, 'tok-a')
is('the same account twice keeps the newer', cleanList([acc('a', { name: 'Old', lastUsed: T1 }), acc('a', { name: 'New', lastUsed: T2 })], true).map((a) => a.name), ['New'])
is('more than five keeps the five most recent',
  cleanList(['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => acc(id, { lastUsed: `2026-09-2${i}T00:00:00.000Z` })), true).map((a) => a.userId),
  ['f', 'e', 'd', 'c', 'b'])
is('a missing time sorts last', cleanList([{ userId: 'a', email: 'a@x.y' }, acc('b')], true).map((a) => a.userId), ['b', 'a'])

// Adding and updating.
let list = []
list = remember(list, { userId: 'a', email: 'a@example.com', name: 'Anna', token: 'ta1' }, T1)
is('the first account is added', list.map((a) => [a.userId, a.name, a.token, a.lastUsed]), [['a', 'Anna', 'ta1', T1]])
list = remember(list, { userId: 'b', email: 'b@example.com', name: '', token: null }, T2)
is('a second without a name takes the address', list.find((a) => a.userId === 'b').name, 'b')
list = remember(list, { userId: 'a', email: 'a@example.com', name: 'Anna' }, T3)
is('opening one again moves its time, keeps its token', list.find((a) => a.userId === 'a'), { userId: 'a', email: 'a@example.com', name: 'Anna', token: 'ta1', lastUsed: T3 })
is('still two accounts', list.length, 2)
is('null forgets the token', remember(list, { userId: 'a', email: 'a@example.com', name: 'Anna', token: null }, T3).find((a) => a.userId === 'a').token, null)
const five = ['a', 'b', 'c', 'd', 'e'].map((id) => acc(id))
is('a sixth account is refused', remember(five, { userId: 'f', email: 'f@x.y', name: 'F' }, T2), 'full')
is('one already there still updates when full', Array.isArray(remember(five, { userId: 'c', email: 'c@x.y', name: 'C' }, T2)), true)
is('the limit is five', MAX_ACCOUNTS, 5)

// Tokens that change.
const two = [acc('a'), acc('b')]
is('a new token for a saved account', withToken(two, 'a', 'new').find((a) => a.userId === 'a').token, 'new')
is('the other account is untouched', withToken(two, 'a', 'new').find((a) => a.userId === 'b').token, 'tok-b')
is('an account not on the list stays off it', withToken(two, 'z', 'new') === two, true)
is('the same token changes nothing', withToken(two, 'a', 'tok-a') === two, true)

// Renaming.
is('a renamed profile renames the account', rename(two, 'a', 'Annie').find((a) => a.userId === 'a').name, 'Annie')
is('the same name changes nothing', rename(two, 'a', 'a') === two, true)
is('an unknown account changes nothing', rename(two, 'z', 'Zed') === two, true)

// Removing.
is('forget removes that account', forget(two, 'a').map((a) => a.userId), ['b'])
is('forgetting one not there changes nothing', forget(two, 'z') === two, true)

// Who joins the list.
is('one account on its own is not saved', shouldRemember([], false), false)
is('adding one saves it', shouldRemember([], true), true)
is('once there is a list, any sign-in joins it', shouldRemember([acc('a')], false), true)

// Already on this device.
is('the open account is already here', alreadyHere([], 'A@Example.com', 'a@example.com'), true)
is('a saved one is already here', alreadyHere([acc('b')], ' b@example.com ', null), true)
is('a new one is not', alreadyHere([acc('b')], 'c@example.com', 'a@example.com'), false)
is('an empty address is not', alreadyHere([acc('b')], '', null), false)

// Switching.
const base = { targetId: 'b', currentId: 'a', online: true, pending: 0, native: true, deviceSecure: true, hasToken: true }
is('a phone with a lock and a token asks for the unlock', canSwitch(base), { ok: true, ask: 'unlock' })
is('a browser asks for the password', canSwitch({ ...base, native: false }), { ok: true, ask: 'password' })
is('a phone without a screen lock asks for the password', canSwitch({ ...base, deviceSecure: false }), { ok: true, ask: 'password' })
is('no saved token asks for the password', canSwitch({ ...base, hasToken: false }), { ok: true, ask: 'password' })
is('the open account cannot be switched to', canSwitch({ ...base, targetId: 'a' }), { ok: false, reason: 'That account is already open.' })
is('offline is refused', canSwitch({ ...base, online: false }), { ok: false, reason: OFFLINE_TEXT })
is('changes waiting are refused', canSwitch({ ...base, pending: 3 }), { ok: false, reason: waitingText(3) })
is('with no account open, nothing waits', canSwitch({ ...base, currentId: null, pending: 2 }), { ok: true, ask: 'unlock' })
is('with no account open, still needs a connection', canSwitch({ ...base, currentId: null, online: false }).ok, false)
is('one change reads as one', waitingText(1), '1 change is still waiting to be sent. Switching waits until it has gone up, so nothing is lost.')

// Adding.
is('adding with room, online, nothing waiting', canAdd({ list: [acc('a')], currentId: 'a', online: true, pending: 0 }), { ok: true })
is('the open account counts towards five', canAdd({ list: ['b', 'c', 'd', 'e'].map((id) => acc(id)), currentId: 'a', online: true, pending: 0 }), { ok: false, reason: FULL_TEXT })
is('but not twice', canAdd({ list: ['a', 'b', 'c', 'd'].map((id) => acc(id)), currentId: 'a', online: true, pending: 0 }), { ok: true })
is('adding offline is refused', canAdd({ list: [], currentId: 'a', online: false, pending: 0 }).ok, false)
is('adding with changes waiting is refused', canAdd({ list: [], currentId: 'a', online: true, pending: 1 }), { ok: false, reason: waitingText(1) })

// A token the sign-in service refuses.
is('an unknown token is dead', tokenIsDead({ status: 400, code: 'refresh_token_not_found' }), true)
is('an already used one is dead', tokenIsDead({ code: 'refresh_token_already_used' }), true)
is('a 400 without a code is dead', tokenIsDead({ status: 400 }), true)
is('no connection is not', tokenIsDead({ status: 0, message: 'Failed to fetch' }), false)
is('a server error is not', tokenIsDead({ status: 503 }), false)
is('no error is not', tokenIsDead(null), false)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
