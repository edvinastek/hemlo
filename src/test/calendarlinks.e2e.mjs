import { need, open, signIn, checks, sql, profileOf, today, REF, APP } from './e2e.mjs'

// Calendar links end to end, with no Google account: one test account's feed
// link stands in for Google's secret address.
//  1. TEST_FEAT_EMAIL makes a feed link in More → Profile → Calendar links, and
//     a plain fetch of it (as Google would) has a task as a VEVENT, no notes
//     until they are turned on, no planned meal, no profile name, and a wrong
//     token gets 404.
//  2. TEST_ONBOARD_EMAIL gets a feed link too (made in SQL as that account),
//     and TEST_FEAT_EMAIL follows it: its task shows on Today, read-only, with
//     no copy of it on the server; removing the calendar takes it away and
//     wipes its address on the server.
// Needs migrations 020 and 024 and both functions deployed (calendar-feed with
// JWT checks off, calendar-fetch with them on), and TEST_FEAT_EMAIL,
// TEST_ONBOARD_EMAIL, TEST_PASSWORD, SB.
need('TEST_FEAT_EMAIL', 'TEST_ONBOARD_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const other = process.env.TEST_ONBOARD_EMAIL
const FEED = `https://${REF}.supabase.co/functions/v1/calendar-feed`
const { is, failed } = checks()
const stamp = Date.now()
const mine = `e2e-feed-${stamp}`
const theirs = `e2e-follow-${stamp}`
const meal = `Breakfast: e2e-meal-${stamp} · 143 kcal`
const day = today()

// A task of each account's: timed, with a note that must stay out of the feed.
// Followed calendars left by an earlier run go first.
await sql(`delete from public.calendar_subscription where profile_id = ${profileOf(email)} and name = 'Other';
  delete from public.calendar_feed where profile_id = ${profileOf(email)}`)
await sql(`insert into public.task (profile_id, title, planned_date, planned_time, duration_min, notes) values
  (${profileOf(email)}, '${mine}', '${day}', '10:00', 45, 'secret note ${stamp}'),
  (${profileOf(other)}, '${theirs}', '${day}', '13:00', 30, null)`)
// A planned meal, the way meals.ts makes one: health data, never in the feed.
await sql(`insert into public.task (profile_id, title, planned_date, planned_time, duration_min, category, source, module_key) values
  (${profileOf(email)}, '${meal}', '${day}', '08:00', 20, 'Meal', 'meal', 'nutrition')`)
// The other account's feed link, made as that account.
const made = await sql(`select public.rotate_calendar_feed(${profileOf(other)}) as token
  from (select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = '${other}'),
        'role', 'authenticated')::text, true)) as claims`)
const otherLink = `${FEED}?t=${made?.[0]?.token}`
is('the other account has a feed link', /^[A-Za-z0-9_-]{43}$/.test(made?.[0]?.token ?? ''), true)

const { b, p, errors } = await open({ viewport: { width: 360, height: 740 } })
await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(APP).origin })
await signIn(p, email)

// 1. A feed link, made in the app.
await p.goto(new URL('more?section=Profile#calendar-links', APP).href, { waitUntil: 'domcontentloaded' })
const panel = p.locator('#calendar-links')
await panel.waitFor({ timeout: 15000 })
// A run that stopped half-way may have left a link on: turn it off first.
if (await panel.getByRole('button', { name: 'Turn off' }).count()) {
  await panel.getByRole('button', { name: 'Turn off' }).click()
  await panel.locator('.cl-confirm').getByRole('button', { name: 'Turn off' }).click()
}
await panel.getByRole('button', { name: 'Make link' }).click()
const field = panel.locator('#cl-feed-link')
await field.waitFor({ timeout: 15000 })
const link = await field.inputValue()
is('the link is the feed address with a token', link.startsWith(`${FEED}?t=`) && /t=[A-Za-z0-9_-]{43}$/.test(link), true)
await panel.getByRole('button', { name: 'Copy' }).click()
is('Copy puts it on the clipboard', await p.evaluate(() => navigator.clipboard.readText()), link)
is('the steps for Google Calendar are shown', await panel.getByText('From URL').count() > 0, true)
is('the panel fits 360 px', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)

let res = await fetch(link)
let ics = await res.text()
is('the feed answers 200 as a calendar', `${res.status} ${res.headers.get('content-type')}`, '200 text/calendar; charset=utf-8')
is('it may be cached for 15 minutes, privately', res.headers.get('cache-control'), 'private, max-age=900')
is('it names the calendar just Hemlo, without the profile\'s name', /X-WR-CALNAME:Hemlo\r\n/.test(ics), true)
is('a planned meal is not in the feed', [ics.includes(`e2e-meal-${stamp}`), ics.includes('kcal')], [false, false])
is('the task is a VEVENT at its time', new RegExp(`BEGIN:VEVENT[\\s\\S]*?DTSTART:${day.replace(/-/g, '')}T100000[\\s\\S]*?SUMMARY:${mine}`).test(ics), true)
is('its note is not in the feed', ics.includes(`secret note ${stamp}`), false)
is('the other account\'s task is not in it', ics.includes(theirs), false)

await panel.getByRole('switch', { name: 'Include task notes' }).click()
await p.waitForTimeout(3000)
ics = await (await fetch(link)).text()
is('with notes on, the note is in the feed', ics.includes(`secret note ${stamp}`), true)
await panel.getByRole('switch', { name: 'Include task notes' }).click()

res = await fetch(`${FEED}?t=${'x'.repeat(43)}`)
is('a wrong token gets 404, and says nothing more', `${res.status} ${(await res.text()).trim()}`, '404 Not found')
is('no token gets 404', (await fetch(FEED)).status, 404)

// 2. Follow the other account's feed as if it were Google's secret address.
await panel.getByRole('button', { name: 'Add', exact: true }).click()
await panel.locator('.cl-form label', { hasText: 'Name' }).locator('input').fill('Other')
await panel.locator('.cl-form label', { hasText: 'Secret address' }).locator('input').fill(otherLink)
await panel.getByRole('button', { name: 'Follow' }).click()
const row = panel.locator('.cs-row', { hasText: 'Other' })
await row.waitFor({ timeout: 15000 })
await row.getByText(/Fetched /).waitFor({ timeout: 30000 })
is('the followed calendar has its events', /[1-9]\d* events/.test(await row.locator('.cs-head').textContent()), true)
const server = await sql(`select count(*)::int n from public.calendar_subscription where profile_id = ${profileOf(email)} and name = 'Other' and deleted_at is null`)
is('the address reached the server, to follow the account to other devices', server?.[0]?.n, 1)

await p.goto(APP, { waitUntil: 'domcontentloaded' })
// A followed event is a read-only row on Today's rail (the day rail, v16).
const event = p.locator('.row.ir-event', { hasText: theirs })
await event.waitFor({ timeout: 15000 })
is('the followed event is on Today at its time', (await event.locator('.row-time').textContent()).trim(), '13:00')
is('it says which calendar it is from', (await event.locator('.row-meta').textContent()).includes('Other'), true)
is('and is read-only there', await event.evaluate((el) => el.classList.contains('is-readonly')), true)
await event.locator('.row-name button').click()
const sheet = p.locator('.fe-sheet')
await sheet.waitFor()
is('it opens read-only: no Save, no Delete', await sheet.getByRole('button', { name: /Save|Delete/ }).count(), 0)
// The sheet reads the calendar's name from the device after it opens ("From a
// calendar you follow" until then), so wait for the name rather than a delay.
const named = await sheet.locator('.fe-from', { hasText: 'From Other' }).waitFor({ timeout: 10000 }).then(() => true, () => false)
is('the sheet names the calendar', named, true)
is('the sheet fits 360 px', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
await sheet.getByRole('button', { name: 'Close' }).click()
await p.waitForTimeout(2000)
const copies = await sql(`select count(*)::int n from public.calendar_event where title = '${theirs}'`)
is('the followed event was never sent to the server', copies?.[0]?.n, 0)

// Remove it: the events leave this device.
await p.goto(new URL('more?section=Profile#calendar-links', APP).href, { waitUntil: 'domcontentloaded' })
await panel.locator('.cs-row', { hasText: 'Other' }).getByRole('button', { name: 'Remove Other' }).click()
await panel.locator('.cl-confirm').getByRole('button', { name: 'Remove' }).click()
await p.waitForTimeout(1500)
const left = await p.evaluate(async (title) => {
  const req = indexedDB.open('getit')
  const db = await new Promise((r) => { req.onsuccess = () => r(req.result) })
  const rows = await new Promise((r) => { const q = db.transaction('calendar_event').objectStore('calendar_event').getAll(); q.onsuccess = () => r(q.result) })
  return rows.filter((e) => e.title === title).length
}, theirs)
is('removing the calendar removes its events here', left, 0)
// The removal reaches the server, which keeps the row (so other devices learn
// of it) but not the secret address (024).
let wiped = null
for (let i = 0; i < 20 && wiped?.[0]?.gone !== true; i++) {
  if (i) await p.waitForTimeout(500)
  wiped = await sql(`select deleted_at is not null and url is null as gone from public.calendar_subscription
    where profile_id = ${profileOf(email)} and name = 'Other' order by created_at desc limit 1`)
}
is('removing the calendar wipes its address on the server', wiped?.[0]?.gone, true)

// Turn this account's link off again: the old address stops at once.
await panel.getByRole('button', { name: 'Turn off' }).click()
await panel.locator('.cl-confirm').getByRole('button', { name: 'Turn off' }).click()
await p.waitForTimeout(1500)
is('a link turned off gets 404', (await fetch(link)).status, 404)

// Leave nothing behind.
await sql(`delete from public.task where title in ('${mine}', '${theirs}', '${meal}');
  delete from public.calendar_feed where profile_id = ${profileOf(other)};
  delete from public.calendar_subscription where profile_id = ${profileOf(email)} and name = 'Other'`)

console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
