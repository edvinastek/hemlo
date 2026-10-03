import { need, sql, checks, open, signIn, profileOf, drained, today, addTask } from './e2e.mjs'

// Plan's views, the Inbox and Copy to… (PLN-01, PLN-03, PLN-04, PLN-06,
// PLN-07, TSK-01, TSK-20 to TSK-25, GEN-54, GEN-55), at 360 px:
// - the view and day live in the address;
// - a task captured in the Inbox has no day, and "Plan for…" gives it one,
//   with Undo putting it back;
// - a task opened from the Week view copies to tomorrow with its notes'
//   ticks cleared, as a new, independent task;
// - the week can show 3 days;
// - Back closes the task sheet.
//
// Needs TEST_FEAT_EMAIL, TEST_PASSWORD and SB. Every query is scoped to that
// account, because this runs against the live project.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const { is, failed } = checks()
const settle = async (p, ms = 600) => { await p.waitForTimeout(ms); await drained(p) }
const one = async (query) => (await sql(query))[0] ?? {}
const plus = (from, n) => {
  const [y, m, d] = from.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const clean = () => sql(`delete from public.task where ${mine} and title like 'Plan e2e %'`)
await clean()

const DAY = today()
const A = await open({ viewport: { width: 360, height: 780 } })
const p = A.p
await signIn(p, email)

const offScreen = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *, .bottom-sheet *')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !el.closest('.week-strip') })
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})

// 1. The Inbox, from the address.
await p.goto(new URL(`plan?view=inbox`, p.url()).href)
await p.waitForTimeout(1200)
is('the Inbox tab is chosen', (await p.locator('.tabs [aria-selected="true"]').textContent()).startsWith('Inbox'), true)
await p.fill('.pi-capture input', 'Plan e2e inbox')
await p.click('.pi-capture button[type=submit]')
await settle(p, 1500)
let r = await one(`select planned_date from public.task where ${mine} and title = 'Plan e2e inbox' and deleted_at is null`)
is('captured with no day', r.planned_date, null)
is('nothing runs off the screen', (await offScreen()).join('; '), '')
await p.locator('.pi-row', { hasText: 'Plan e2e inbox' }).locator('.pi-plan').click()
await p.click('.dp-quick button:has-text("Tomorrow")')
await settle(p, 1500)
r = await one(`select planned_date::text d from public.task where ${mine} and title = 'Plan e2e inbox' and deleted_at is null`)
is('Plan for… gives it a day', r.d, plus(DAY, 1))
await p.click('.undo-btn')
await settle(p, 1500)
r = await one(`select planned_date from public.task where ${mine} and title = 'Plan e2e inbox' and deleted_at is null`)
is('Undo sends it back to the Inbox', r.planned_date, null)

// 2. A task on the Week view, opened and copied.
await p.goto(new URL(`plan?view=week&date=${DAY}`, p.url()).href)
await p.waitForTimeout(1200)
await addTask(p)
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Plan e2e copy me')
await p.fill('.bottom-sheet input[type=time]', '07:30')
await p.locator('.bottom-sheet textarea').fill('- [x] first\n- [ ] second')
await p.click('.bottom-sheet button[type=submit]')
await settle(p, 1500)
await p.locator('.pw-item', { hasText: 'Plan e2e copy me' }).click()
is('tapping a task opens it', await p.locator('.bottom-sheet[aria-label="Edit task"]').count(), 1)
await p.click('.ts-more button:has-text("Copy to…")')
await p.click('.cs-chip:has-text("Tomorrow"), .cs-chip:has-text("The day after")')
await p.click('.cs-choice:has-text("ticks cleared")')
is('nothing in the dialog runs off the screen', (await offScreen()).join('; '), '')
await p.click('.cs-actions .btn-primary')
await settle(p, 1500)
const rows = await sql(`select id, planned_date::text d, planned_time::text t, notes, series_id from public.task
  where ${mine} and title = 'Plan e2e copy me' and deleted_at is null order by planned_date`)
is('two tasks now', rows.length, 2)
is('the copy is the next day, same time', `${rows[1]?.d} ${rows[1]?.t?.slice(0, 5)}`, `${plus(DAY, 1)} 07:30`)
is('with ticks cleared', rows[1]?.notes, '- [ ] first\n- [ ] second')
is('the original keeps its ticks', rows[0]?.notes, '- [x] first\n- [ ] second')
is('Undo is offered', (await p.locator('.undo-label').textContent()).startsWith('Copied 1 task'), true)

// 3. Back closes the sheet; the page stays.
await p.goBack()
await p.waitForTimeout(500)
is('Back closed the sheet', await p.locator('.bottom-sheet').count(), 0)
is('and stayed on Plan', new URL(p.url()).pathname.endsWith('/plan'), true)

// 4. Three days.
await p.click('.plan-days .dd-button')
await p.click('[role=option]:has-text("3 days")')
await p.waitForTimeout(600)
is('the week shows three days', await p.locator('.pw-grid .week-col').count(), 3)
await p.click('.plan-days .dd-button')
await p.click('[role=option]:has-text("7 days")')

await clean()
console.log(A.errors.length ? 'PAGE ERRORS: ' + A.errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await A.b.close()
process.exit(failed() || A.errors.length ? 1 : 0)
