import { need, sql, checks, open, signIn, profileOf, today, localCount } from './e2e.mjs'

// Works with the network cut: ticks and pushes offline, survives a reload with
// no connection, then reconnects and checks the changes reached Postgres and
// the queue drained. Needs TEST_EMAIL, TEST_PASSWORD and SB. Every query is
// scoped to the test account, because this runs against the live project.
need('TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const { is, failed } = checks()

const { b, ctx, p } = await open()
await signIn(p, email)

// The three rows the run touches, made fresh for today so every run starts the same.
await sql(`delete from public.task where ${mine} and title in ('Lunch: chicken mayo pasta','Calisthenics A','Learning, 1 h');
  insert into public.task (profile_id, title, category, planned_date, planned_time, duration_min) values
    (${profileOf(email)}, 'Lunch: chicken mayo pasta', 'Food', '${today()}', '12:00', 30),
    (${profileOf(email)}, 'Calisthenics A', 'Training', '${today()}', '16:30', 45),
    (${profileOf(email)}, 'Learning, 1 h', 'Work', '${today()}', '19:00', 60);`)
await p.waitForFunction(() => navigator.serviceWorker?.controller != null, { timeout: 15000 })
  .catch(() => console.log('note: service worker did not take control in time'))
await p.reload({ waitUntil: 'networkidle' })
await p.locator('.row', { hasText: 'Calisthenics A' }).waitFor({ timeout: 20000 })
await p.waitForTimeout(2000)

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

const queued = await localCount(p, 'pending')
is('changes are queued, not lost', queued >= 2, true)

// 3. A survivable reload: the local copy is the app's truth, not a cache.
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForSelector('.row', { timeout: 20000 })
await p.waitForTimeout(1500)
is('still ticked after a reload with no connection',
   await p.locator('.row', { hasText: 'Lunch: chicken mayo pasta' }).locator('.tick').textContent(), '✓')

// 4. Meanwhile the server was changed by "another device".
await sql(`update public.task set notes='changed elsewhere' where ${mine} and title='Learning, 1 h'`)

// 5. Reconnect.
await ctx.setOffline(false)
console.log('--- back online ---')
await p.evaluate(() => window.dispatchEvent(new Event('online')))
await p.waitForTimeout(6000)

const server = await sql(`select title, status, planned_time::text, push_count from public.task
                          where ${mine} and title in ('Lunch: chicken mayo pasta','Calisthenics A') order by title`)
const cals = server.find(r => r.title === 'Calisthenics A')
const lun = server.find(r => r.title === 'Lunch: chicken mayo pasta')
is('the tick reached the server', lun?.status, 'done')
is('the push reached the server', cals?.planned_time?.slice(0,5), '17:00')
is('the push count went with it', cals?.push_count, 1)

const left = await localCount(p, 'pending')
is('the queue drained', left, 0)

const note = await p.evaluate(async () => {
  const open = indexedDB.open('getit')
  const db = await new Promise(r => { open.onsuccess = () => r(open.result) })
  return new Promise(r => { const q = db.transaction('task').objectStore('task').getAll(); q.onsuccess = () => r(q.result.find(t => t.title === 'Learning, 1 h')?.notes) })
})
is('the change made elsewhere came down', note, 'changed elsewhere')

console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(failed() ? 1 : 0)
