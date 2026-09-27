import { chromium } from 'playwright'
import { signIn } from './e2e.mjs'

// What a closed-test tester will do in the first ten minutes, end to end:
// add, edit and delete a task; plan meals and size the main one; eat one;
// shop from the plan; switch reminders on; find the privacy policy; meet the
// consent box at sign-up. Needs TEST_EMAIL, TEST_PASSWORD and SB.
for (const k of ['TEST_EMAIL', 'TEST_PASSWORD', 'SB']) {
  if (!process.env[k]) { console.error(`Set ${k}.`); process.exit(2) }
}
const REF = 'lphysuemxnmcuukzsoya'
const sql = async (query) => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.SB}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})).json()

let fail = 0
const is = (label, got, want) => {
  const ok = String(got) === String(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (wanted ${want})`}`)
}
const email = process.env.TEST_EMAIL

// Start from a clean day, so the check gives the same answer every run.
await sql(`delete from public.meal_plan_slot where profile_id in (select pr.id from public.profile pr join auth.users u on u.id = pr.user_id where u.email = '${email}');
           delete from public.food_log where profile_id in (select pr.id from public.profile pr join auth.users u on u.id = pr.user_id where u.email = '${email}');
           delete from public.task where profile_id in (select pr.id from public.profile pr join auth.users u on u.id = pr.user_id where u.email = '${email}');`)

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['notifications'] })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

// Sign-up asks for consent to health data before anything else.
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.click('text=No account yet? Create one')
const create = p.locator('button[type=submit]')
is('sign-up waits for consent to health data', await create.isDisabled(), true)
await p.click('text=Read the privacy policy')
is('the privacy policy opens from sign-up', await p.locator('h1', { hasText: 'Privacy' }).count(), 1)
await p.click('button:has-text("Back")')
await p.click('text=Back to sign in')
await p.click('text=Forgot your password?')
is('password reset is offered', await p.locator('button:has-text("Send reset link")').count(), 1)
await p.click('text=Back to sign in')

await signIn(p, email)

// Tasks: add, edit, delete.
await p.click('.fab')
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Mobility')
await p.fill('.bottom-sheet input[type=time]', '07:30')
await p.locator('.bottom-sheet label', { hasText: 'Minutes' }).locator('input').fill('15')
await p.click('.bottom-sheet button:has-text("Save")')
await p.waitForTimeout(800)
is('a new task appears on Today', await p.locator('.row', { hasText: 'Mobility' }).count(), 1)
is('at its time', (await p.locator('.row', { hasText: 'Mobility' }).locator('.row-time').textContent())?.trim(), '07:30')

await p.locator('.row', { hasText: 'Mobility' }).locator('.row-name button').click()
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Mobility and stretch')
await p.click('.bottom-sheet button:has-text("Save")')
await p.waitForTimeout(800)
is('editing renames it', await p.locator('.row', { hasText: 'Mobility and stretch' }).count(), 1)

await p.locator('.row', { hasText: 'Mobility and stretch' }).locator('.row-name button').click()
await p.click('.bottom-sheet button:has-text("Delete")')
await p.click('.bottom-sheet button:has-text("Delete for good")')
await p.waitForTimeout(800)
is('deleting removes it', await p.locator('.row', { hasText: 'Mobility' }).count(), 0)

// Meals: plan lunch and dinner, size dinner to the target, eat lunch.
await p.click('.bottom-nav a[href="/food"]')
await p.waitForTimeout(1200)
// Recipes are picked by typing, the same search as the Foods page.
const pick = async (slot, name) => {
  await p.fill(`input[aria-label="${slot} recipe"]`, name)
  await p.locator('.sp-list li[role=option]', { hasText: name }).first().click()
  await p.waitForTimeout(900)
}
await pick('Lunch', 'Grilled chicken')
await pick('Dinner', 'Salmon with sweet')
const suggest = p.locator('button.suggest')
is('the main meal is offered a size that reaches the target', await suggest.count(), 1)
const suggestion = (await suggest.textContent()) ?? ''
await suggest.click()
await p.waitForTimeout(900)
const dinnerPortions = await p.locator('input[aria-label="Dinner portions"]').inputValue()
is('using it sets dinner to that size', suggestion.startsWith(dinnerPortions + '×'), true)

await p.locator('input[aria-label="Lunch eaten"]').click()
await p.waitForTimeout(1200)
const eatenText = await p.locator('.totals').textContent()
is('eating lunch moves the eaten total', /Eaten\s*[1-9]\d*/.test(eatenText ?? ''), true)

await p.click('.bottom-nav a[href="/"]')
await p.waitForTimeout(1000)
is('planned meals appear on Today', await p.locator('.row', { hasText: /Lunch:|Dinner:/ }).count(), 2)
is('the eaten meal is ticked on Today', await p.locator('.row.is-done', { hasText: 'Lunch:' }).count(), 1)
// Today shows the one figure chosen in settings; calories unless changed.
const figure = await p.locator('.page-sub').first().textContent()
is('the calorie figure moved', /^[1-9]\d* (\/ \d+ )?kcal$/.test(figure ?? ''), true)

// Shopping from the plan.
await p.click('.bottom-nav a[href="/shop"]')
await p.waitForTimeout(1500)
const items = await p.locator('.sheet tbody tr').count()
is('the shopping list fills from the plan', items > 0, true)
await p.locator('.sheet tbody tr').first().locator('input[type=checkbox]').click()
await p.waitForTimeout(700)
const left = await p.locator('.totals').textContent()
is('ticking an item counts it off', (left ?? '').includes(`${items - 1} of ${items} left`), true)

// Reminders on this device.
await p.click('.bottom-nav a[href="/more"]')
await p.click('.tabs button:has-text("Assistant")')
const sw = p.locator('button[aria-label="Reminders"]')
await sw.click()
await p.waitForTimeout(800)
is('reminders switch on', await sw.getAttribute('aria-checked'), 'true')
await p.click('.tabs button:has-text("Data")')
await p.click('.setting-row:has-text("Privacy policy") button:has-text("Read")')
is('the privacy policy is in the app', await p.locator('h2', { hasText: 'Your rights' }).count(), 1)

// And it all reached the server.
await p.waitForTimeout(3000)
const server = await sql(`
  select (select count(*) from public.meal_plan_slot s join public.profile pr on pr.id = s.profile_id join auth.users u on u.id = pr.user_id where u.email = '${email}' and s.deleted_at is null) as slots,
         (select count(*) from public.food_log f join public.profile pr on pr.id = f.profile_id join auth.users u on u.id = pr.user_id where u.email = '${email}' and f.deleted_at is null) as logs,
         (select count(*) from public.task t join public.profile pr on pr.id = t.profile_id join auth.users u on u.id = pr.user_id where u.email = '${email}' and t.source = 'meal' and t.deleted_at is null) as meal_tasks,
         (select count(*) from public.task t join public.profile pr on pr.id = t.profile_id join auth.users u on u.id = pr.user_id where u.email = '${email}' and t.title like 'Mobility%' and t.deleted_at is not null) as deleted_tasks`)
is('meal plan reached the server', server[0]?.slots, 2)
is('the eaten meal reached the server', server[0]?.logs, 1)
is('meal tasks reached the server', server[0]?.meal_tasks, 2)
is('the deleted task is deleted on the server too', server[0]?.deleted_tasks, 1)

console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(fail || errors.length ? 1 : 0)
