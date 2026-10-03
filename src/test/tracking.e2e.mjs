import * as XLSX from 'xlsx'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { need, sql, checks, open, signIn, profileOf, today, localCount, drained, modulesOn, APP, openSettings, todayPart, moduleHere, addTask } from './e2e.mjs'

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
await signIn(p, email, undefined, { template: 'Fitness & nutrition', targets: true })

// 1. Weigh-in: the wizard logged today's; updating it changes the same row.
await todayPart(p, 'Body')
await p.locator('.weighin-form button:has-text("Update")').waitFor()
await p.locator('.weighin-form input').first().fill('81.2')
await p.click('.weighin-form button[type=submit]')
await settle(p)
let r = await one(`select count(*) n, max(weight_kg)::text w from public.body_log where ${mine} and log_date = '${day}' and deleted_at is null`)
is('the weigh-in updates today’s row rather than adding one', r.n, 1)
is('with the new weight', Number(r.w), 81.2)
await p.locator('.weighin-list li.is-day').waitFor({ timeout: 5000 }).catch(() => {})
is('it shows in the list', await p.locator('.weighin-list li.is-day').count(), 1)

// 2. A habit and a supplement, added on their module pages (Today only shows
//    a Habits part once there is a habit due), then ticked.
const goPage = async (path) => {
  await p.goto(new URL(path, APP).href, { waitUntil: 'domcontentloaded' })
  await p.locator('.bottom-nav').waitFor({ timeout: 20000 })
  await p.waitForTimeout(1200)
}
await goPage('m/habits')
const addHabit = async (name) => {
  await p.click('.fab[aria-label="Add a habit"]')
  await p.fill('.track-sheet input[placeholder="Mobility"]', name)
  await p.click('.track-sheet button[type=submit]')
  await p.locator(`button[aria-label="${name}, not done"]`).waitFor()
}
await addHabit('Stretch')
await addHabit('Water')
await p.click('button[aria-label="Stretch, not done"]')
// The next step reloads the page; let the tick reach the server first.
await settle(p)
await goPage('m/supplements')
await p.click('.fab[aria-label="Add a supplement"]')
await p.fill('.track-sheet input[placeholder="Vitamin D"]', 'Vitamin D')
await p.fill('.track-sheet input[placeholder="25 µg"]', '25 µg')
await p.click('.track-sheet button[type=submit]')
await p.click('button[aria-label="Vitamin D, not taken"]')
await settle(p)
await goPage('')
await todayPart(p, 'Body')
await p.waitForTimeout(600)
is('the habit shows ticked', await p.locator('button[aria-label="Stretch, done"]').getAttribute('aria-pressed'), 'true')
r = await one(`select
  (select count(*) from public.habit where ${mine} and deleted_at is null) habits,
  (select count(*) from public.habit_log l join public.habit h on h.id = l.habit_id where h.${mine} and h.name = 'Stretch' and l.log_date = '${day}' and l.done) ticks,
  (select count(*) from public.supplement_log l join public.supplement s on s.id = l.supplement_id where s.${mine} and s.name = 'Vitamin D' and l.done) taken`)
is('both habits reached the server', r.habits, 2)
is('the habit tick reached the server', r.ticks, 1)
is('the supplement tick reached the server', r.taken, 1)

// 2b. Version 16: a habit on chosen days with a pinned checklist (HAB-01,
//     HAB-10), edited after it was made (HAB-02); a supplement's schedule
//     (SUP-03); a household chore from a starter pack, ticked (HSE-03, HSE-10).
await goPage('m/habits')
await p.click('.fab[aria-label="Add a habit"]')
await p.fill('.track-sheet input[placeholder="Mobility"]', 'Mobility')
await p.click('.track-sheet button[aria-label="Repeat"]')
await p.click('.track-sheet [role=option]:has-text("Weekly on chosen days")')
for (const d of ['Mon', 'Wed', 'Fri']) {
  const b = p.locator('.track-sheet .ts-day', { hasText: d })
  if (await b.getAttribute('aria-pressed') !== 'true') await b.click()
}
for (const d of ['Tue', 'Thu', 'Sat', 'Sun']) {
  const b = p.locator('.track-sheet .ts-day', { hasText: d })
  if (await b.getAttribute('aria-pressed') === 'true') await b.click()
}
await p.fill('.track-sheet textarea[aria-label="Pinned note"]', '- [ ] Hips\n- [ ] Shoulders')
await p.click('.track-sheet button[type=submit]')
await settle(p)
r = await one(`select rule, rule_config::text cfg, note from public.habit where ${mine} and name = 'Mobility' and deleted_at is null`)
is('a habit on chosen days', [r.rule, r.cfg], ['weekly', '{"weekdays": [1, 3, 5]}'])
is('with its pinned note', r.note, '- [ ] Hips\n- [ ] Shoulders')
// Its schedule changed after it was made: weekends.
if (await p.locator('.track-fold:has-text("Not due")').count()) await p.click('.track-fold:has-text("Not due")')
await p.click('button[aria-label="More for Mobility"]')
await p.click('.track-open button:has-text("Edit")')
await p.click('.track-sheet button[aria-label="Repeat"]')
await p.click('.track-sheet [role=option]:has-text("Weekends")')
await p.click('.track-sheet button[type=submit]')
await settle(p)
is('the schedule can be changed later', (await one(`select rule from public.habit where ${mine} and name = 'Mobility'`)).rule, 'weekends')
// The row may still be open from Edit (on a weekend day it is now due and
// in sight); open it only if it is not.
if (!(await p.locator('.track-open button:has-text("Archive")').count())) await p.click('button[aria-label="More for Mobility"]')
await p.click('.track-open button:has-text("Archive")')
await settle(p)

await modulesOn(email, ['household'])
await goPage('')
await moduleHere(p, 'household')
await goPage('m/household')
await p.click('.chore-pack:has-text("Studio flat")')
await p.click('button:has-text("Add 9 chores")')
await settle(p, 1500)
r = await one(`select count(*) n from public.chore c join public.profile pr on pr.household_id = c.household_id where pr.${mine.replace('profile_id', 'id')} and c.deleted_at is null`)
is('a starter pack adds its chores to the household', Number(r.n), 9)
await p.click('button[aria-label="Wash up, not done"]')
await settle(p)
r = await one(`select count(*) n from public.chore_log l join public.chore c on c.id = l.chore_id where c.name = 'Wash up' and l.done_on = '${day}' and l.deleted_at is null and l.done_by is not null`)
is('ticking a chore records who did it', Number(r.n), 1)

// 3. Two phones, both offline, both tick Water. One tick survives, nothing refused.
await goPage('')
await todayPart(p, 'Body')
await p.locator('button[aria-label="Water, not done"]').waitFor({ timeout: 15000 })
const B = await open()
await signIn(B.p, email)
await todayPart(B.p, 'Body')
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
await todayPart(p, 'Today')
await addTask(p)
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
await todayPart(p, 'Evening')
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

await openSettings(p, 'data')
await p.setInputFiles('input[type=file]', xlsx)
await p.locator('text=Preview · mine.xlsx').waitFor({ timeout: 15000 })
is('the preview counts what is new', (await p.locator('.setting-row .row-name', { hasText: 'new foods' }).textContent())?.trim(), '1 new foods · 1 new recipes')
is('and the duplicate row it skipped', await p.locator('text=1 duplicate rows skipped').count(), 1)
r = await one(`select count(*) n from public.food f join auth.users u on u.id = f.owner_id where f.name = 'E2E test oats' and u.email = '${email}'`)
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
// This account may hold these habits from an earlier run: what the import
// adds is counted on top of what was there.
const before = await one(`select
  (select count(*) from public.habit where ${theirs} and name in ('Stretch','Water')) habits,
  (select count(*) from public.habit_log l join public.habit h on h.id = l.habit_id where h.${theirs} and l.done) ticks,
  (select count(*) from public.recipe rc join auth.users u on u.id = rc.owner_id where rc.name = 'E2E porridge' and u.email = '${other}') recipes`)
await openSettings(p, 'data')
await p.setInputFiles('input[type=file]', exported)
await p.locator('text=/records from export.getit.json added/').waitFor({ timeout: 15000 })
// A whole export goes up row by row, parents first: wait until all of it has
// been sent (it can take longer than the usual half minute) before counting.
await p.waitForTimeout(600)
await drained(p, 120000)
r = await one(`select
  (select count(*) from public.habit where ${theirs} and name in ('Stretch','Water')) habits,
  (select count(*) from public.habit_log l join public.habit h on h.id = l.habit_id where h.${theirs} and l.done) ticks,
  (select count(*) from public.body_log where ${theirs} and log_date = '${day}' and deleted_at is null) weighins,
  (select max(weight_kg)::text from public.body_log where ${theirs} and log_date = '${day}') weight,
  (select count(*) from public.module_instance where ${theirs}) modules,
  (select count(*) from public.recipe rc join auth.users u on u.id = rc.owner_id where rc.name = 'E2E porridge' and u.email = '${other}') recipes`)
is('the habits came across', r.habits - before.habits, 2)
is('with their ticks', r.ticks - before.ticks, 2)
is('today’s weigh-in replaced this account’s own, not doubled it', r.weighins, 1)
is('with the exported weight', Number(r.weight), 81.2)
is('the modules merged by name, not duplicated', r.modules, modulesBefore)
is('the recipe now belongs to this account', r.recipes - before.recipes, 1)
// Sent in the end: the queue empties (a write may still be on its way).
is('everything was sent', await drained(p), true)

console.log(A.errors.length ? 'PAGE ERRORS: ' + A.errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await A.b.close()
process.exit(failed() || A.errors.length ? 1 : 0)
