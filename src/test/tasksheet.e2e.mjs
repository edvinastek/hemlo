import { need, sql, checks, open, signIn, profileOf, drained, todayPart } from './e2e.mjs'

// The task sheet after the phone feedback, at 360 px as on the owner's phone:
// a task given a time range instead of minutes (across midnight), the compact
// Section list, a checklist note written with the toolbar, ticked on its own
// page, and the progress shown on Today.
//
// Needs TEST_FEAT_EMAIL, TEST_PASSWORD and SB. Every query is scoped to that
// account, because this runs against the live project.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const { is, failed } = checks()
const settle = async (p, ms = 600) => { await p.waitForTimeout(ms); await drained(p) }
const one = async (query) => (await sql(query))[0] ?? {}

// Rows from an earlier run go first, before any device holds them.
await sql(`delete from public.task where ${mine} and title like 'Sheet %'`)

const A = await open({ viewport: { width: 360, height: 640 } })
const p = A.p
await signIn(p, email)
// Today shows its tabs only while there are three or fewer (v17).
await p.waitForTimeout(1500)
if (await p.getByRole('tab', { name: 'Today', exact: true }).or(p.getByRole('button', { name: 'Show part of today' })).count()) await todayPart(p, 'Today')

/** Anything inside the open sheet that runs past the right edge of the screen. */
const offScreen = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.bottom-sheet *, .np *')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 })
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})
const sheetHeight = () => p.locator('.bottom-sheet .form-grid').evaluate((el) => Math.round(el.getBoundingClientRect().height))
/** The height once the sheet has settled: More options adds Project and Goal
 *  a moment after it opens when those modules are on. */
const settledHeight = async () => {
  let last = await sheetHeight()
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(250)
    const now = await sheetHeight()
    if (now === last) return now
    last = now
  }
  return last
}
// v17: "Until" is "End time instead of minutes", inside More options.
const UNTIL = '.bottom-sheet .ts-check:has-text("End time instead") input'
const moreOptions = async () => {
  if ((await p.locator('.bottom-sheet .mo-toggle').getAttribute('aria-expanded')) !== 'true') await p.click('.bottom-sheet .mo-toggle')
}

// The round + opens a short menu (GEN-50); "Task" adds a task on the day.
const addTask = async () => {
  await p.click('.fab')
  await p.locator('.add-pick', { has: p.locator('.add-label', { hasText: /^Task$/ }) }).click()
}

// 1. A time range: half ten at night until quarter past midnight.
await addTask()
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Sheet late shift')
await p.fill('.bottom-sheet input[type=time]', '22:30')
await moreOptions()
const before = await settledHeight()
await p.click(UNTIL)
is('ticking Until swaps Minutes for an end time', await p.locator('.bottom-sheet input[aria-label="End time"]').count(), 1)
is('and the Minutes field is gone', await p.locator('.bottom-sheet label', { hasText: /^Minutes/ }).count(), 0)
await p.fill('.bottom-sheet input[aria-label="End time"]', '00:15')
is('the length is shown beside the end', (await p.locator('.bottom-sheet .ts-dur-name').textContent()).includes('1 h 45'), true)
is('the sheet did not grow', Math.abs((await sheetHeight()) - before) <= 2, true)
is('nothing runs off a 360 px screen with Until on', (await offScreen()).join('; '), '')

// The section is a compact list, not the phone's full-screen picker.
is('no native pickers left in the sheet', await p.locator('.bottom-sheet select').count(), 0)
await p.click('.bottom-sheet button[aria-label="Section"]')
is('the section list opens in place', await p.locator('.bottom-sheet [role=listbox]').count(), 1)
is('and stays on the screen', (await offScreen()).join('; '), '')
await p.click('.bottom-sheet [role=option]:has-text("Work")')
await p.click('.bottom-sheet button:has-text("Save")')
await settle(p, 1500)

let r = await one(`select duration_min, planned_time::text t, category from public.task where ${mine} and title = 'Sheet late shift' and deleted_at is null`)
is('the range was saved as minutes, past midnight', r.duration_min, 105)
is('from the start time', r.t, '22:30:00')
is('in the section picked from the list', r.category, 'Work')

// Opened again, the task shows minutes; unticking Until brings them back too.
await p.locator('.row', { hasText: 'Sheet late shift' }).locator('.row-name button').click()
is('a task opens showing its minutes', await p.locator('.bottom-sheet label', { hasText: /^Minutes/ }).locator('input').inputValue(), '105')
await moreOptions()
await p.click(UNTIL)
is('ticking shows the end the minutes give', await p.locator('.bottom-sheet input[aria-label="End time"]').inputValue(), '00:15')
await p.click(UNTIL)
is('unticking gives the minutes back to edit', await p.locator('.bottom-sheet label', { hasText: /^Minutes/ }).locator('input').isEditable(), true)
await p.click('.bottom-sheet button:has-text("Cancel")')

// 2. A checklist note, written with the toolbar and Enter.
await addTask()
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Sheet trip')
await p.fill('.bottom-sheet input[type=time]', '09:00')
await p.click('.bottom-sheet textarea[aria-label="Note"]')
await p.click('.bottom-sheet button[aria-label="Checklist item"]')
await p.keyboard.type('Pack the bag')
await p.keyboard.press('Enter')
await p.keyboard.type('Charge the phone')
await p.keyboard.press('Enter')
await p.keyboard.type('Print the tickets')
const written = '- [ ] Pack the bag\n- [ ] Charge the phone\n- [ ] Print the tickets'
is('the toolbar and Enter wrote a checklist', JSON.stringify(await p.locator('.bottom-sheet textarea[aria-label="Note"]').inputValue()), JSON.stringify(written))
await p.click('.bottom-sheet button:has-text("Save")')
await settle(p, 1500)
r = await one(`select notes from public.task where ${mine} and title = 'Sheet trip' and deleted_at is null`)
is('the note reached the server', JSON.stringify(r.notes), JSON.stringify(written))
const row = p.locator('.row', { hasText: 'Sheet trip' })
is('Today shows the checklist’s progress', (await row.locator('.row-chip').textContent())?.trim(), '0/3')

// 3. Its page: tick one item, go back, cancel the sheet. The tick stays.
await row.locator('.row-name button').click()
await p.click('.bottom-sheet button:has-text("Open as page")')
await p.locator('.np').waitFor()
is('the page draws three checklist items', await p.locator('.np input[type=checkbox]').count(), 3)
is('and says how far along it is', (await p.locator('.np-progress').textContent())?.trim(), '0 of 3 done')
is('nothing on the page runs off the screen', (await offScreen()).join('; '), '')
await p.click('.np-check:has-text("Charge the phone")')
is('the tick shows at once', (await p.locator('.np-progress').textContent())?.trim(), '1 of 3 done')
await p.click('.np-back')
await p.click('.bottom-sheet button:has-text("Cancel")')
await settle(p, 1500)
r = await one(`select notes from public.task where ${mine} and title = 'Sheet trip' and deleted_at is null`)
is('the tick was saved to the note on the server', JSON.stringify(r.notes), JSON.stringify(written.replace('- [ ] Charge', '- [x] Charge')))
is('Today’s chip moved on', (await row.locator('.row-chip').textContent())?.trim(), '1/3')

// 4. A note with no checklist shows only a small mark, and rows keep their height.
await addTask()
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Sheet plain')
await p.fill('.bottom-sheet input[type=time]', '09:05')
await p.fill('.bottom-sheet textarea[aria-label="Note"]', 'Ring before leaving.')
await p.click('.bottom-sheet button:has-text("Save")')
await settle(p)
const plain = p.locator('.row', { hasText: 'Sheet plain' })
is('a plain note shows a note mark', await plain.locator('.row-notemark').count(), 1)
is('and no progress chip', await plain.locator('.row-chip').count(), 0)
// The plain row to measure against: a task with a time and nothing else.
await addTask()
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Sheet bare')
await p.fill('.bottom-sheet input[type=time]', '09:10')
await p.click('.bottom-sheet button:has-text("Save")')
await settle(p)
const heightOf = (title) => p.locator('.row', { hasText: title }).evaluate((el) => Math.round(el.getBoundingClientRect().height))
const bare = await heightOf('Sheet bare')
const heights = [await heightOf('Sheet trip'), await heightOf('Sheet plain')]
is(`rows with a chip or a mark are the plain row height (${heights.join(', ')} px, plain ${bare} px)`, heights.every((h) => h <= bare), true)

await sql(`delete from public.task where ${mine} and title like 'Sheet %'`)
console.log(A.errors.length ? 'PAGE ERRORS: ' + A.errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await A.b.close()
process.exit(failed() || A.errors.length ? 1 : 0)
