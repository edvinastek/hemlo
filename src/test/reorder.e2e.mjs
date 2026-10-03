import { need, sql, checks, open, signIn, profileOf, drained, today } from './e2e.mjs'

// Moving tasks by hand, at 360 px as on the owner's phone: on Today, hold a
// row and drag it (a timed task swaps times with the one it lands on, an
// untimed one slides into place); the ⋮ menu's Move up and Move down; the
// sheet that asks before a clash; taps still tick and open; a held drag never
// swipes to the next page. On Plan's week: hold a day, tap another, and the
// two swap their movable tasks (locked ones stay); hold a task and drag it
// onto another day.
//
// Needs TEST_FEAT_EMAIL, TEST_PASSWORD and SB. Every query is scoped to that
// account, because this runs against the live project.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const { is, failed } = checks()
const settle = async (p, ms = 600) => { await p.waitForTimeout(ms); await drained(p) }
const one = async (query) => (await sql(query))[0] ?? {}
const got = (title) => one(`select planned_date::text d, to_char(planned_time, 'HH24:MI') t, sort_order s
  from public.task where ${mine} and title = '${title}' and deleted_at is null`)

// Two days of this week that are not today, for the week view.
const day = today()
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv') }
const monday = addDays(day, -((new Date(`${day}T12:00:00`).getDay() + 6) % 7))
const [dayA, dayB] = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(monday, n)).filter((d) => d !== day)

// Rows from an earlier run go first, before any device holds them.
await sql(`delete from public.task where ${mine} and title like 'Reorder %'`)
// Other checks' tasks on these days would sit between the ones moved here
// and clash with them, so they are put away (this is a throwaway account).
await sql(`update public.task set deleted_at = now() where ${mine} and deleted_at is null
  and planned_date in ('${day}', '${dayA}', '${dayB}')`)
await sql(`insert into public.task (profile_id, title, planned_date, planned_time, duration_min, sort_order, locked) values
  (${profileOf(email)}, 'Reorder gym', '${day}', '06:00', 60, 0, false),
  (${profileOf(email)}, 'Reorder email', '${day}', '07:15', 15, 0, false),
  (${profileOf(email)}, 'Reorder meet', '${day}', '07:40', 30, 0, false),
  (${profileOf(email)}, 'Reorder call', '${day}', '21:00', 30, 0, false),
  (${profileOf(email)}, 'Reorder x', '${day}', null, null, 0, false),
  (${profileOf(email)}, 'Reorder y', '${day}', null, null, 1, false),
  (${profileOf(email)}, 'Reorder z', '${day}', null, null, 2, false),
  (${profileOf(email)}, 'Reorder a1', '${dayA}', '10:00', null, 0, false),
  (${profileOf(email)}, 'Reorder a2', '${dayA}', '12:00', null, 0, true),
  (${profileOf(email)}, 'Reorder b1', '${dayB}', '15:00', null, 0, false)`)

const A = await open({ viewport: { width: 360, height: 640 }, hasTouch: true })
const p = A.p
const cdp = await A.ctx.newCDPSession(p)
await signIn(p, email)
await p.reload({ waitUntil: 'domcontentloaded' })
await p.locator('.bottom-nav').waitFor()
await p.click('.tabs button:has-text("Today")').catch(() => {})
await p.locator('.drag-item', { hasText: 'Reorder gym' }).waitFor({ timeout: 20000 })

const item = (t) => p.locator('.drag-item', { hasText: t })
const order = async () => (await p.$$eval('.drag-item .row-name button', (els) => els.map((e) => e.textContent)))
  .filter((t) => t.startsWith('Reorder '))
const path = () => new URL(p.url()).pathname

/** Hold a thing with the mouse, then drag it by (dx, dy) and let go. */
async function hold(loc, dy, dx = 0) {
  await loc.scrollIntoViewIfNeeded()
  const box = await loc.boundingBox()
  const x = box.x + Math.min(120, box.width / 2)
  const y = box.y + box.height / 2
  await p.mouse.move(x, y)
  await p.mouse.down()
  await p.waitForTimeout(500)
  await p.mouse.move(x + dx / 2, y + dy / 2, { steps: 8 })
  await p.mouse.move(x + dx, y + dy, { steps: 8 })
  await p.waitForTimeout(150)
  await p.mouse.up()
  await p.waitForTimeout(500)
}
const rowH = async () => (await item('Reorder gym').boundingBox()).height
/** Hold a thing and drop it on the middle of another (other tasks the
 *  account has today may sit between them). */
async function holdOnto(loc, target) {
  await loc.scrollIntoViewIfNeeded()
  const a = await loc.boundingBox()
  const b = await target.boundingBox()
  await hold(loc, (b.y + b.height / 2) - (a.y + a.height / 2))
}

// 1. A timed task dropped one place up swaps times with the one it lands on.
is('the timed tasks start in time order', (await order()).slice(0, 4).join(', '),
  'Reorder gym, Reorder email, Reorder meet, Reorder call')
await holdOnto(item('Reorder call'), item('Reorder meet'))
is('no sheet for a swap with no clash', await p.locator('.move-sheet').count(), 0)
await settle(p, 1200)
is('the call took the meeting’s time', (await got('Reorder call')).t, '07:40')
is('and the meeting the call’s', (await got('Reorder meet')).t, '21:00')

// 2. Taps still do what they did.
const ticks = async () => (await one(`select status from public.task where ${mine} and title = 'Reorder email'`)).status
await item('Reorder email').locator('.tick').click()
await settle(p)
is('a tap on the tick still ticks', await ticks(), 'done')
await item('Reorder email').locator('.tick').click()
await settle(p)
await item('Reorder email').locator('.row-name button').click()
is('a tap on the name still opens the task', await p.locator('.bottom-sheet[aria-label="Edit task"]').count(), 1)
await p.click('.bottom-sheet button:has-text("Cancel")')

// 3. A swap that would clash asks first. The gym hour (06:00, 60 min) onto
//    the email (07:15) would run from 07:15 into the call at 07:40.
await holdOnto(item('Reorder gym'), item('Reorder email'))
is('the sheet asks before a clash', await p.locator('.move-sheet').count(), 1)
is('and names it', (await p.locator('.move-warnings').textContent()).includes('would overlap'), true)
is('the button says anyway', (await p.locator('.move-sheet .btn-primary').textContent()), 'Move anyway')
await p.click('.move-sheet .btn:has-text("Cancel")')
await settle(p)
is('Cancel leaves it', (await got('Reorder gym')).t, '06:00')
await holdOnto(item('Reorder gym'), item('Reorder email'))
await p.click('.move-sheet .btn-primary')
await settle(p, 1200)
is('Move anyway moves it', `${(await got('Reorder gym')).t} ${(await got('Reorder email')).t}`, '07:15 06:00')

// 4. Untimed: z held and dragged to the top of the untimed ones.
await holdOnto(item('Reorder z'), item('Reorder x'))
await settle(p, 1200)
is('the untimed list reads z, x, y', (await order()).filter((t) => /Reorder [xyz]$/.test(t)).join(', '),
  'Reorder z, Reorder x, Reorder y')
const s = await one(`select (select sort_order from public.task where ${mine} and title = 'Reorder z') z,
  (select sort_order from public.task where ${mine} and title = 'Reorder x') x`)
is('and the order reached the server', s.z < s.x, true)
is('an untimed task never gains a time by dragging', (await got('Reorder z')).t, null)

// 5. The ⋮ menu, for anyone who does not drag.
await item('Reorder x').locator('.row-more').click()
is('the menu has Move up and Move down', await p.locator('.move-menu [role=menuitem]', { hasText: /^Move (up|down)$/ }).count(), 2)
is('and the row\'s other actions', await p.locator('.move-menu [role=menuitem]', { hasText: /^(Open here|Edit|Copy to…|Duplicate|Move to…|Skip|Open note as page|Delete)$/ }).count(), 8)
await p.click('.move-menu button:has-text("Move down")')
await settle(p, 1200)
is('Move down moved it down one', (await order()).filter((t) => /Reorder [xyz]$/.test(t)).join(', '),
  'Reorder z, Reorder y, Reorder x')
const off = await p.evaluate(() => [...document.querySelectorAll('.drag-item *')]
  .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length)
is('nothing on the rows runs off a 360 px screen', off, 0)

// 5b. The two-stage hold (TOD-10): held still for the long time, the row
//     opens in place instead of dragging; a tap on its name closes it.
{
  const loc = item('Reorder y')
  await loc.scrollIntoViewIfNeeded()
  const box = await loc.boundingBox()
  await p.mouse.move(box.x + 120, box.y + box.height / 2)
  await p.mouse.down()
  await p.waitForTimeout(1000)
  await p.mouse.up()
  await p.waitForTimeout(300)
  is('a long still hold opens the row in place', await loc.locator('.ir.is-open').count(), 1)
  is('with its quick actions', await loc.locator('.ir-actions button').count() >= 7, true)
  is('and nothing moved', (await order()).filter((t) => /Reorder [xyz]$/.test(t)).join(', '), 'Reorder z, Reorder y, Reorder x')
  await loc.locator('.row-name button').click()
  is('a tap on the name closes it', await p.locator('.ir.is-open').count(), 0)
  // Held between the two times and let go: nothing at all, not even the sheet.
  await p.mouse.move(box.x + 120, box.y + box.height / 2)
  await p.mouse.down()
  await p.waitForTimeout(500)
  await p.mouse.up()
  await p.waitForTimeout(300)
  is('let go between the stages: nothing opens', await p.locator('.bottom-sheet, .ir.is-open').count(), 0)
}

// 5c. A drag offers Undo, which puts the order back.
await holdOnto(item('Reorder x'), item('Reorder z'))
await settle(p, 1200)
is('the drag moved x to the top', (await order()).filter((t) => /Reorder [xyz]$/.test(t))[0], 'Reorder x')
await p.click('.undo-bar .undo-btn')
await settle(p, 1200)
is('Undo puts it back', (await order()).filter((t) => /Reorder [xyz]$/.test(t)).join(', '), 'Reorder z, Reorder y, Reorder x')

// 6. A finger: hold, then drag sideways and down. The page must not swipe.
{
  const box = await item('Reorder y').boundingBox()
  const x0 = 200
  const y0 = box.y + box.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] })
  await p.waitForTimeout(500)
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 20, y: y0 + i * 2 }] })
    await p.waitForTimeout(20)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await p.waitForTimeout(800)
  is('a held drag sideways does not swipe to the next page', path(), '/')
}

// 7. Plan's week: hold a day, tap another. Locked tasks stay.
await p.click('.bottom-nav a[href="/plan"]')
await p.waitForTimeout(800)
await p.click('.tabs button:has-text("Week")').catch(() => {})
const head = (d) => p.locator(`.week-col[data-week-day="${d}"] h3`)
await head(dayA).waitFor()
await hold(head(dayA), 0)
is('the day is picked', await p.locator(`.week-col.is-picked[data-week-day="${dayA}"]`).count(), 1)
await p.locator(`.week-col[data-week-day="${dayB}"]`).click()
is('the swap sheet opens', await p.locator('.move-sheet').count(), 1)
const lines = await p.locator('.move-sheet').textContent()
is('it says the locked task stays', lines.includes('“Reorder a2” is locked and stays where it is.'), true)
is('the page says how many move each way', /1 task moves to/.test(lines), true)
await p.click('.move-sheet .btn-primary')
await settle(p, 1500)
is('a1 went to the second day, same time', `${(await got('Reorder a1')).d} ${(await got('Reorder a1')).t}`, `${dayB} 10:00`)
is('b1 came to the first', (await got('Reorder b1')).d, dayA)
is('the locked a2 stayed', (await got('Reorder a2')).d, dayA)

// 8. One task dragged onto another day.
{
  const it = p.locator('.week-item', { hasText: 'Reorder b1' })
  const from = await it.boundingBox()
  const to = await p.locator(`.week-col[data-week-day="${dayB}"]`).boundingBox()
  await hold(it, to.y + to.height / 2 - (from.y + from.height / 2), to.x + 40 - (from.x + Math.min(120, from.width / 2)))
  await settle(p, 1500)
  is('the task moved to the day it was dropped on', (await got('Reorder b1')).d, dayB)
}

await sql(`delete from public.task where ${mine} and title like 'Reorder %'`)
console.log(A.errors.length ? 'PAGE ERRORS: ' + A.errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await A.b.close()
process.exit(failed() || A.errors.length ? 1 : 0)
