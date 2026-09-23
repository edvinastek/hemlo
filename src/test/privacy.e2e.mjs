import { chromium } from 'playwright'

// Three things the security review fixed, checked in a real browser:
//  1. A row created on the device (the wizard's targets and weigh-in) reaches
//     the server. Before, it was sent as an update of nothing and dropped.
//  2. Signing out leaves nothing of the account on the device.
//  3. Deleting an account from the app removes it from the server.
// Uses a fresh throwaway account in TEST_NEW_EMAIL, deleted by the test itself.
if (!process.env.TEST_NEW_EMAIL || !process.env.TEST_PASSWORD || !process.env.SB) {
  console.error('Set TEST_NEW_EMAIL, TEST_PASSWORD and SB.')
  process.exit(2)
}
const REF = 'lphysuemxnmcuukzsoya'
const sql = async (query) => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SB}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})).json()

let fail = 0
const is = (label, got, want) => {
  const ok = String(got) === String(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (wanted ${want})`}`)
}
const email = process.env.TEST_NEW_EMAIL

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
const localCount = () => p.evaluate(async () => {
  const open = indexedDB.open('getit')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  let n = 0
  for (const name of ['profile', 'task', 'target', 'body_log', 'module_instance', 'pending']) {
    n += await new Promise((r) => { const q = db.transaction(name).objectStore(name).count(); q.onsuccess = () => r(q.result) })
  }
  return n
})

await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.fill('input[type=email]', email)
await p.fill('input[type=password]', process.env.TEST_PASSWORD)
await p.click('button[type=submit]')

// 1. The first-run wizard: its targets and weigh-in are rows made on the device.
await p.waitForSelector('text=Step 1 of 4', { timeout: 20000 })
const field = (label) => p.locator('.setting-row', { hasText: label }).locator('input')
await field('Height').fill('180')
await field('Date of birth').fill('1996-01-01')
await p.click('button:has-text("Next")')
await p.click('button:has-text("Next")')
await field('Weight today').fill('80')
await p.click('button:has-text("Next")')
await p.click('button:has-text("Start planning")')
await p.waitForSelector('.bottom-nav', { timeout: 20000 })
await p.waitForTimeout(5000)

const server = await sql(`select
  (select count(*) from public.target t join public.profile pr on pr.id = t.profile_id join auth.users u on u.id = pr.user_id where u.email = '${email}') as targets,
  (select count(*) from public.body_log b join public.profile pr on pr.id = b.profile_id join auth.users u on u.id = pr.user_id where u.email = '${email}') as weighins,
  (select height_cm from public.profile pr join auth.users u on u.id = pr.user_id where u.email = '${email}') as height`)
is('targets made on the device reached the server', server[0]?.targets, 1)
is('the weigh-in made on the device reached the server', server[0]?.weighins, 1)
is('an edit to an existing row reached the server', Number(server[0]?.height), 180)

// 2. Sign out: the device forgets the account.
is('the device holds the account while signed in', (await localCount()) > 0, true)
await p.click('.bottom-nav a[href="/more"]')
await p.click('.tabs button:has-text("Data")')
await p.click('button:has-text("Sign out")')
await p.waitForSelector('input[type=email]', { timeout: 15000 })
await p.waitForTimeout(1000)
is('after sign-out nothing of the account is left on the device', await localCount(), 0)

// 3. Delete the account from the app.
await p.fill('input[type=email]', email)
await p.fill('input[type=password]', process.env.TEST_PASSWORD)
await p.click('button[type=submit]')
await p.waitForSelector('.bottom-nav', { timeout: 20000 })
await p.waitForTimeout(2000)
await p.click('.bottom-nav a[href="/more"]')
await p.click('.tabs button:has-text("Data")')
await p.click('.setting-row:has-text("Delete account") button:has-text("Delete")')
const confirm = p.locator('button:has-text("Delete for good")')
is('the delete button waits for the word', await confirm.isDisabled(), true)
await p.locator('.setting-row:has-text("Delete account") input').fill('delete')
await confirm.click()
await p.waitForSelector('input[type=email]', { timeout: 20000 })
await p.waitForTimeout(1000)

const gone = await sql(`select
  (select count(*) from auth.users where email = '${email}') as users,
  (select count(*) from public.target t where not exists (select 1 from public.profile pr where pr.id = t.profile_id)) as orphans`)
is('the account is gone from the server', gone[0]?.users, 0)
is('nothing it owned is left behind', gone[0]?.orphans, 0)
is('and nothing is left on the device', await localCount(), 0)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(fail ? 1 : 0)
