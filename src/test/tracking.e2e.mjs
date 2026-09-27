import * as XLSX from 'xlsx'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { need, sql, checks, open, signIn, profileOf, today, localCount, drained } from './e2e.mjs'

// The features added for the closed test, clicked through as a tester would:
// a weigh-in, habits and supplements, the same habit ticked offline on two
// phones, a repeating task (edit one day, then stop it), the evening review,
// the Excel import, and an export read back into a different account.
//
// Needs TEST_FEAT_EMAIL (a new account), TEST_EMAIL (a second account the
// export is read into), TEST_PASSWORD and SB. Every query is scoped to those
// accounts, because this runs against the live project.
need('TEST_FEAT_EMAIL', 'TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const other = process.env.TEST_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const { is, failed } = checks()
const day = today()
const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv')
const settle = async (p, ms = 600) => { await p.waitForTimeout(ms); await drained(p) }
const one = async (query) => (await sql(query))[0] ?? {}

const A = await open({ acceptDownloads: true })
const p = A.p
await signIn(p, email)

// 1. Weigh-in: the wizard logged today's; updating it changes the same row.
await p.click('.tabs button:has-text("Body")')
await p.locator('.weighin-form button:has-text("Update")').waitFor()
await p.locator('.weighin-form input').first().fill('81.2')
await p.click('.weighin-form button[type=submit]')
await settle(p)
let r = await one(`select count(*) n, max(weight_kg)::text w from public.body_log where ${mine} and log_date = '${day}' and deleted_at is null`)
is('the weigh-in updates today’s row rather than adding one', r.n, 1)
is('with the new weight', Number(r.w), 81.2)
is('it shows in the list', await p.locator('.weighin-list li.is-day').count(), 1)

// 2. A habit and a supplement, ticked.
await p.click('button:has-text("Add a habit")')
await p.fill('input[aria-label="Habit name"]', 'Stretch')
await p.click('.track-form button:has-text("Add")')
await p.locator('button[aria-label="Stretch, not done"]').waitFor()
await p.fill('input[aria-label="Habit name"]', 'Water')
await p.click('.track-form button:has-text("Add")')
await p.click('.track-form button:has-text("Done")')
await p.click('button[aria-label="Stretch, not done"]')
await p.click('button:has-text("Add a supplement")')
await p.fill('input[aria-label="Supplement name"]', 'Vitamin D')
await p.fill('input[aria-label="Dose"]', '25 µg')
await p.click('.track-form button:has-text("Add")')
await p.click('.track-form button:has-text("Done")')
await p.click('button[aria-label="Vitamin D, not taken"]')
await settle(p)
is('the habit shows ticked', await p.locator('button[aria-label="Stretch, done"]').getAttribute('aria-pressed'), 'true')
r = await one(`select
  (select count(*) from public.habit where ${mine} and deleted_at is null) habits,
  (select count(*) from public.habit_log l join public.habit h on h.id = l.habit_id where h.${mine} and h.name = 'Stretch' and l.log_date = '${day}' and l.done) ticks,
  (select count(*) from public.supplement_log l join public.supplement s on s.id = l.supplement_id where s.${mine} and s.name = 'Vitamin D' and l.done) taken`)
is('both habits reached the server', r.habits, 2)
is('the habit tick reached the server', r.ticks, 1)
is('the supplement tick reached the server', r.taken, 1)

// 3. Two phones, both offline, both tick Water. One tick survives, nothing refused.
const B = await open()
await signIn(B.p, email)
await B.p.click('.tabs button:has-text("Body")')
await B.p.locator('button[aria-label="Water, not done"]').waitFor({ timeout: 15000 })
await A.ctx.setOffline(true)
await B.ctx.setOffline(true)
await p.click('button[aria-label="Water, not done"]')
await B.p.click('button[aria-label="Water, not done"]')
await settle(p, 800)
await A.ctx.setOffline(false)
await p.evaluate(() => window.dispatchEvent(new Event('online')))
await settle(p, 4000)
await B.ctx.setOffline(false)
await B.p.evaluate(() => window.dispatchEvent(new Event('online')))
await settle(B.p, 5000)
r = await one(`select count(*) n, bool_and(l.done) done from public.habit_log l join public.habit h on h.id = l.habit_id
  where h.${mine} and h.name = 'Water' and l.log_date = '${day}'`)
is('the same tick from two phones is one row on the server', r.n, 1)
is('and it is ticked', r.done, true)
is('the second phone sent everything', await localCount(B.p, 'pending'), 0)
const refused = await B.p.evaluate(async () => {
  const open = indexedDB.open('getit')
  const db = await new Promise((res) => { open.onsuccess = () => res(open.result) })
  return new Promise((res) => { const q = db.transaction('conflicts').objectStore('conflicts').getAll(); q.onsuccess = () => res(q.result.filter((c) => c.kept === 'rejected').length) })
})
is('and nothing was refused', refused, 0)
is('the second phone still shows it ticked', await B.p.locator('button[aria-label="Water, done"]').count(), 1)
await B.b.close()

// 4. A repeating task: make it, change one day, stop it.
await p.click('.tabs button:has-text("Today")')
await p.click('.fab')
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Standup')
await p.fill('.bottom-sheet input[type=time]', '09:00')
await p.click('.bottom-sheet button[aria-label="Repeat"]')
await p.click('.bottom-sheet [role=option]:has-text("Every day")')
await p.click('.bottom-sheet button:has-text("Save")')
await settle(p, 3500)
r = await one(`select (select count(*) from public.series where ${mine} and title = 'Standup' and deleted_at is null) series,
  (select count(*) from public.task where ${mine} and title = 'Standup' and series_id is not null and deleted_at is null) days`)
is('the series reached the server', r.series, 1)
is('its days were laid out ahead', Number(r.days) >= 2, true)
is('today’s one is on Today', await p.locator('.row', { hasText: 'Standup' }).count(), 1)

await p.locator('.row', { hasText: 'Standup' }).locator('.row-name button').click()
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Standup, longer')
await p.click('.bottom-sheet button:has-text("Save")')
await p.click('.ts-offer:has-text("Only this one")')
await settle(p)
r = await one(`select (select count(*) from public.task where ${mine} and title = 'Standup, longer' and deleted_at is null) changed,
  (select count(*) from public.task where ${mine} and title = 'Standup' and planned_date > '${day}' and deleted_at is null) rest`)
is('“only this one” changes one day', r.changed, 1)
is('and leaves the others', Number(r.rest) >= 1, true)

await p.locator('.row', { hasText: 'Standup, longer' }).locator('.row-name button').click()
await p.click('.bottom-sheet .ts-stop')
await p.click('.ts-question button:has-text("Stop repeating")')
await settle(p)
r = await one(`select (select end_date::text from public.series where ${mine} and title = 'Standup') ends,
  (select count(*) from public.task where ${mine} and series_id is not null and planned_date > '${day}' and status = 'todo' and deleted_at is null) later`)
is('stopping ends the series today', r.ends, day)
is('and removes the later days', r.later, 0)
is('today’s one stays', await p.locator('.row', { hasText: 'Standup, longer' }).count(), 1)

// 5. The evening review: yesterday's leftovers, done and moved.
await sql(`insert into public.task (profile_id, title, planned_date, planned_time) values
  (${profileOf(email)}, 'Old errand', '${yesterday}', '10:00'),
  (${profileOf(email)}, 'Old call', '${yesterday}', '11:00')`)
await p.reload({ waitUntil: 'domcontentloaded' })
await p.locator('.bottom-nav').waitFor()
await settle(p)
await p.click('.tabs button:has-text("Night")')
const item = (t) => p.locator('.review-full .review-item', { hasText: t })
await item('Old errand').waitFor({ timeout: 15000 })
is('the review lists what was left yesterday', await p.locator('.review-full .review-item').count() >= 2, true)
await item('Old errand').locator('button.chip:has-text("Done")').click()
await settle(p, 800)
await item('Old call').locator('button.chip:has-text("Tomorrow")').click()
await settle(p)
r = await one(`select (select status from public.task where ${mine} and title = 'Old errand') errand,
  (select planned_date::text from public.task where ${mine} and title = 'Old call') call_day`)
is('“Done” from the review reached the server', r.errand, 'done')
is('“Tomorrow” moved it on', r.call_day > yesterday, true)

// 6. The Excel import: preview first, then saved to this account only.
const dir = mkdtempSync(join(tmpdir(), 'getit-'))
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['id', 'name', 'kcal', 'carbs', 'fiber', 'fat', 'protein'],
  [1, 'E2E test oats', 380, 60, 10, 7, 13],
  [2, 'E2E test oats', 380, 60, 10, 7, 13],
]), 'D_Food')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['id', 'name', 'kcal', 'carbs', 'fiber', 'fat', 'protein', 'ingredients'],
  [1, 'E2E porridge', 400, 60, 8, 9, 20, 'E2E test oats – 80g\nSomething unknown – 50g'],
]), 'D_Meals')
const xlsx = join(dir, 'mine.xlsx')
writeFileSync(xlsx, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

await p.click('.bottom-nav a[href="/more"]')
await p.click('.tabs button:has-text("Data")')
await p.setInputFiles('input[type=file]', xlsx)
await p.locator('text=Preview · mine.xlsx').waitFor({ timeout: 15000 })
is('the preview counts what is new', (await p.locator('.setting-row .row-name', { hasText: 'new foods' }).textContent())?.trim(), '1 new foods · 1 new recipes')
is('and the duplicate row it skipped', await p.locator('text=1 duplicate rows skipped').count(), 1)
r = await one(`select count(*) n from public.food where name = 'E2E test oats'`)
is('nothing is saved before Import is tapped', r.n, 0)
await p.click('button.btn-primary:has-text("Import")')
await p.locator('text=Imported · mine.xlsx').waitFor({ timeout: 20000 })
await settle(p)
r = await one(`select
  (select count(*) from public.food f join auth.users u on u.id = f.owner_id where f.name = 'E2E test oats' and u.email = '${email}') foods,
  (select count(*) from public.recipe_line l join public.recipe rc on rc.id = l.recipe_id join auth.users u on u.id = rc.owner_id where rc.name = 'E2E porridge' and u.email = '${email}') lines,
  (select count(*) from public.recipe_line l join public.recipe rc on rc.id = l.recipe_id join auth.users u on u.id = rc.owner_id where rc.name = 'E2E porridge' and u.email = '${email}' and l.food_id is not null) matched`)
is('the food is saved to this account', r.foods, 1)
is('the recipe keeps both lines', r.lines, 2)
is('the line naming the new food is linked to it', r.matched, 1)

// 7. Export, then read the file into a different account.
const [download] = await Promise.all([p.waitForEvent('download'), p.click('.setting-row:has-text("Export") button:has-text("Export")')])
const exported = join(dir, 'export.getit.json')
await download.saveAs(exported)
await p.click('button:has-text("Sign out")')
await p.locator('input[type=email]').waitFor({ timeout: 15000 })
await signIn(p, other)
const theirs = `profile_id = ${profileOf(other)}`
const modulesBefore = (await one(`select count(*) n from public.module_instance where ${theirs}`)).n
await p.click('.bottom-nav a[href="/more"]')
await p.click('.tabs button:has-text("Data")')
await p.setInputFiles('input[type=file]', exported)
await p.locator('text=/records from export.getit.json added/').waitFor({ timeout: 15000 })
await settle(p)
r = await one(`select
  (select count(*) from public.habit where ${theirs} and name in ('Stretch','Water')) habits,
  (select count(*) from public.habit_log l join public.habit h on h.id = l.habit_id where h.${theirs} and l.done) ticks,
  (select count(*) from public.body_log where ${theirs} and log_date = '${day}' and deleted_at is null) weighins,
  (select max(weight_kg)::text from public.body_log where ${theirs} and log_date = '${day}') weight,
  (select count(*) from public.module_instance where ${theirs}) modules,
  (select count(*) from public.recipe rc join auth.users u on u.id = rc.owner_id where rc.name = 'E2E porridge' and u.email = '${other}') recipes`)
is('the habits came across', r.habits, 2)
is('with their ticks', r.ticks, 2)
is('today’s weigh-in replaced this account’s own, not doubled it', r.weighins, 1)
is('with the exported weight', Number(r.weight), 81.2)
is('the modules merged by name, not duplicated', r.modules, modulesBefore)
is('the recipe now belongs to this account', r.recipes, 1)
is('everything was sent', await localCount(p, 'pending'), 0)

console.log(A.errors.length ? 'PAGE ERRORS: ' + A.errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await A.b.close()
process.exit(failed() || A.errors.length ? 1 : 0)
