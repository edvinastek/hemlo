import { chromium } from 'playwright'

// Credentials come from the environment and are never committed: an account
// whose password sits in the repository is an account anyone can sign in to.
if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD for a throwaway test account.')
  process.exit(2)
}
const SB = process.env.SB
const REF = 'lphysuemxnmcuukzsoya'

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return r.json()
}

let fail = 0
const is = (label, got, want) => {
  const ok = String(got) === String(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (wanted ${want})`}`)
}

// Reset both rows the run touches, so the check gives the same answer every
// time rather than drifting with each push it makes.
await sql(`update task set status='todo', push_count=0, needs_review=false, planned_time='12:00'
           where title='Lunch: chicken mayo pasta'`)
await sql(`update task set status='todo', push_count=0, needs_review=false, planned_time='16:30'
           where title='Calisthenics A'`)

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => navigator.serviceWorker?.controller != null, { timeout: 15000 })
  .catch(() => console.log('note: service worker did not take control in time'))
await p.fill('input[type=email]', process.env.TEST_EMAIL)
await p.fill('input[type=password]', process.env.TEST_PASSWORD)
await p.click('button[type=submit]')
await p.waitForSelector('.row', { timeout: 20000 })
await p.waitForTimeout(3000)

// 1. Pull the plug.
await ctx.setOffline(true)
console.log('--- offline ---')

// 2. Work anyway: tick a meal and push a session.
const lunch = p.locator('.row', { hasText: 'Lunch: chicken mayo pasta' })
await lunch.locator('.tick').click()
await p.waitForTimeout(400)
is('ticked while offline shows at once', await lunch.locator('.tick').textContent(), '✓')

const cal = p.locator('.row', { hasText: 'Calisthenics A' })
await cal.locator('.push button', { hasText: '30' }).click()
await p.waitForTimeout(400)
is('pushed 30 minutes while offline', await cal.locator('.row-time').textContent(), '17:00')

const queued = await p.evaluate(async () => {
  const open = indexedDB.open('getit')
  const db = await new Promise(r => { open.onsuccess = () => r(open.result) })
  return new Promise(r => { const q = db.transaction('pending').objectStore('pending').count(); q.onsuccess = () => r(q.result) })
})
is('changes are queued, not lost', queued >= 2, true)

// 3. A survivable reload: the local copy is the app's truth, not a cache.
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForSelector('.row', { timeout: 20000 })
await p.waitForTimeout(1500)
is('still ticked after a reload with no connection',
   await p.locator('.row', { hasText: 'Lunch: chicken mayo pasta' }).locator('.tick').textContent(), '✓')

// 4. Meanwhile the server was changed by "another device".
await sql(`update task set title='Learning, 1 h', notes='changed elsewhere' where title='Learning, 1 h'`)

// 5. Reconnect.
await ctx.setOffline(false)
console.log('--- back online ---')
await p.evaluate(() => window.dispatchEvent(new Event('online')))
await p.waitForTimeout(6000)

const server = await sql(`select title, status, planned_time::text, push_count from task
                          where title in ('Lunch: chicken mayo pasta','Calisthenics A') order by title`)
const cals = server.find(r => r.title === 'Calisthenics A')
const lun = server.find(r => r.title === 'Lunch: chicken mayo pasta')
is('the tick reached the server', lun?.status, 'done')
is('the push reached the server', cals?.planned_time?.slice(0,5), '17:00')
is('the push count went with it', cals?.push_count, 1)

const left = await p.evaluate(async () => {
  const open = indexedDB.open('getit')
  const db = await new Promise(r => { open.onsuccess = () => r(open.result) })
  return new Promise(r => { const q = db.transaction('pending').objectStore('pending').count(); q.onsuccess = () => r(q.result) })
})
is('the queue drained', left, 0)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(fail ? 1 : 0)
