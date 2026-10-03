import { need, open, signIn, completeWizard, sql, profileOf, today, checks, drained, localCount, openSettings } from './e2e.mjs'

// Several accounts in one browser (Settings → Data and account → Account). In a browser,
// switching asks for the other account's password; on the phone it asks for
// the phone's unlock instead, which this check cannot reach.
//  1. Sign in to TEST_EMAIL, add TEST_ONBOARD_EMAIL from More: the second opens,
//     the first stays on the list.
//  2. Switch back and forth; each time nothing is waiting to be sent first,
//     and the page shows that account's own task and never the other's.
//  3. Offline, switching is refused. A wrong password changes nothing.
//  4. Remove the second account: the list is down to one, and no token was
//     ever written to the browser's storage.
// Needs TEST_EMAIL, TEST_ONBOARD_EMAIL, TEST_PASSWORD and SB.
need('TEST_EMAIL', 'TEST_ONBOARD_EMAIL', 'TEST_PASSWORD', 'SB')
const A = process.env.TEST_EMAIL
const B = process.env.TEST_ONBOARD_EMAIL
const { is, failed } = checks()
const day = today()
const TASK_A = 'Accounts probe A'
const TASK_B = 'Accounts probe B'

const { b, ctx, p, errors } = await open({ viewport: { width: 360, height: 740 }, colorScheme: 'light' })

const saved = () => p.evaluate(() => JSON.parse(localStorage.getItem('getit-accounts') ?? '[]'))
const toAccount = async () => {
  await openSettings(p, 'data')
  await p.locator('.section-title', { hasText: 'Account' }).scrollIntoViewIfNeeded()
}
/** Waits for the switching screen to go and the app (or a first run) to show. */
const landed = async () => {
  await p.getByText(/Switching to/).waitFor({ state: 'detached', timeout: 30000 }).catch(() => undefined)
  const first = p.getByText('Step 1 of 4')
  await p.locator('.bottom-nav').or(first).first().waitFor({ timeout: 30000 })
  if (await first.count()) await completeWizard(p)
  await p.waitForTimeout(2500)
}
const onToday = async (title) => {
  await p.click('.bottom-nav a[href="/"]')
  await p.waitForTimeout(1500)
  return (await p.getByText(title, { exact: false }).count()) > 0
}
const switchTo = async (name, password = process.env.TEST_PASSWORD) => {
  await toAccount()
  is(`nothing waiting to be sent before switching to ${name}`, await drained(p), true)
  await p.click(`button[aria-label="Switch to ${name}"]`)
  const field = p.locator('.acc-field input')
  await field.waitFor({ timeout: 15000 })
  await field.fill(password)
  await p.click('.acc-extra button[type=submit]')
}

// 1. The first account, then a second added from More.
await signIn(p, A)
await drained(p)
await toAccount()
is('before a second account, no list is kept', (await saved()).length, 0)
await p.click('.setting-row:has-text("Add another account") button')
await p.getByText('Add another account. The one open now').waitFor({ timeout: 15000 })
is('adding keeps the first account on the list', (await saved()).length, 1)
await p.fill('input[type=email]', B)
await p.fill('input[type=password]', process.env.TEST_PASSWORD)
await p.click('button[type=submit]')
await landed()
const list = await saved()
is('both accounts are on the list', list.length, 2)
is('the second is the one open', await p.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  return key ? JSON.parse(localStorage.getItem(key)).user.email : null
}), B)

// Each account gets a task of its own on the server.
await sql(`insert into public.task (profile_id, title, planned_date) values
  (${profileOf(A)}, '${TASK_A}', '${day}'), (${profileOf(B)}, '${TASK_B}', '${day}')`)
const nameOf = (email) => list.find((a) => a.email === email)?.name

// 2. Back and forth.
await switchTo(nameOf(A))
await landed()
is('after switching to the first, its task shows', await onToday(TASK_A), true)
is('and the second account’s does not', await onToday(TASK_B), false)
is('the device holds only the first account’s tasks', await p.evaluate(async (title) => {
  const open = indexedDB.open('getit')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const all = await new Promise((r) => { const q = db.transaction('task').objectStore('task').getAll(); q.onsuccess = () => r(q.result) })
  return all.some((t) => t.title === title)
}, TASK_B), false)

await switchTo(nameOf(B))
await landed()
is('switched again, the second account’s task shows', await onToday(TASK_B), true)
is('and the first account’s does not', await onToday(TASK_A), false)

// 3. A wrong password changes nothing; offline, switching is refused.
await switchTo(nameOf(A), 'not-the-password-123')
await p.getByText('That password is not right').waitFor({ timeout: 15000 }).catch(() => undefined)
is('a wrong password says so', await p.getByText('That password is not right').count() > 0, true)
is('and the second account is still open', await onToday(TASK_B), true)
await ctx.setOffline(true)
await p.waitForTimeout(500)
await toAccount()
is('offline, the switch button is off', await p.locator(`button[aria-label="Switch to ${nameOf(A)}"]`).isDisabled(), true)
await ctx.setOffline(false)
await p.waitForTimeout(1500)

await switchTo(nameOf(A))
await landed()
is('back on the first account', await onToday(TASK_A), true)
is('nothing is waiting to be sent after a switch', await localCount(p, 'pending'), 0)

// 4. Remove the second account from this browser.
await toAccount()
await p.click(`button[aria-label="Remove ${nameOf(B)} from this device"]`)
await p.click('.acc-extra button:has-text("Remove")')
await p.waitForTimeout(1000)
const after = await saved()
is('the second account is gone from the list', after.map((a) => a.email).join(','), A)
is('no token is kept in the browser', after.every((a) => a.token === null), true)
is('no page errors', errors.join(' | '), '')

await sql(`delete from public.task where title in ('${TASK_A}', '${TASK_B}')`)
await b.close()
process.exit(failed() ? 1 : 0)
