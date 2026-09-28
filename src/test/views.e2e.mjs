import { need, sql, checks, open, signIn, profileOf, drained, APP } from './e2e.mjs'

// Board, grid and chart views, and a built-in rule's switch acted on, as a
// tester would use them at 360 px: build a module from the Expenses preset
// with Board, Grid and Chart views; move a card by holding and dragging it
// and by its Move menu; tick a grid cell (a record for that day); see the
// chart's bars and read one out; then switch Habits' "appears on every day"
// rule off and see its tab leave Today, and come back when switched on.
//
// Needs TEST_MODULES_EMAIL, TEST_PASSWORD and SB. Run after modules.e2e.mjs
// (same account). Every query is scoped to that account, because this runs
// against the live project.
need('TEST_MODULES_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_MODULES_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const { is, failed } = checks()
const settle = async (p, ms = 600) => { await p.waitForTimeout(ms); await drained(p) }
const one = async (query) => (await sql(query))[0] ?? {}
const exact = (name) => ({ name, exact: true })
const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv') })()

const A = await open({ viewport: { width: 360, height: 780 } })
const p = A.p
await signIn(p, email)

const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.right <= w + 1) continue
    let scroller = false
    for (let a = el.parentElement; a && !a.classList.contains('page'); a = a.parentElement) {
      const o = getComputedStyle(a).overflowX
      if (o === 'auto' || o === 'scroll') { scroller = true; break }
    }
    if (!scroller) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
  }
  return out.slice(0, 5)
})

// 1. Build a module with Board, Grid and Chart views.
await p.goto(`${APP}more`, { waitUntil: 'networkidle' })
await p.getByRole('button', exact('Build a module')).click()
await p.getByRole('dialog', { name: 'Build a module' }).getByLabel('Name').first().fill('E2E Views')
await p.getByRole('button', exact('Next')).click()
await p.getByRole('button', { name: /^Expenses/ }).click()
await p.getByRole('button', exact('Next')).click()
await p.getByRole('button', exact('Next')).click()
await p.getByRole('button', exact('Next')).click()
const views = p.getByRole('group', exact('Views'))
for (const v of ['Board', 'Grid', 'Chart']) await views.getByRole('button', exact(v)).click()
is('the three views are picked', await views.locator('[aria-pressed="true"]').count(), 6)
is('the board goes by the choice field', (await p.getByRole('button', exact('Columns of Board')).innerText().catch(() => '')).includes('Category'), true)
await p.getByRole('button', exact('Create')).click()
await p.waitForURL(/\/m\/u_[a-z0-9]{12}$/, { timeout: 15000 })
const key = p.url().match(/\/m\/(u_[a-z0-9]{12})$/)[1]
await drained(p)
let r = await one(`select definition->'views' v from public.module where key = '${key}'`)
const stored = (r.v ?? []).map((v) => `${v.type}${v.groupBy ? `:${v.groupBy}` : ''}${v.field ? `:${v.field}` : ''}`)
is('the views are stored with their settings', stored.filter((s) => /^(board|grid|chart)/.test(s)).join(' '), 'board:category grid:item:amount chart:amount')

// 2. Three records.
async function add(what, amount, category) {
  await p.getByRole('button', exact('Add expense')).click()
  const form = p.locator('form.bottom-sheet[role=dialog]')
  await form.getByLabel('What').fill(what)
  await form.getByLabel('Amount').fill(String(amount))
  await form.getByRole('button', exact('Category')).click()
  await p.getByRole('listbox', { name: 'Category' }).getByRole('option', exact(category)).click()
  await p.getByRole('button', exact('Save')).click()
  await settle(p, 400)
}
await add('Rent', 750, 'home')
await add('Bus', 3, 'transport')
await add('Lunch', 12, 'food')
r = await one(`select count(*) n from public.module_record where ${mine} and module_key = '${key}' and deleted_at is null`)
is('three records in Postgres', r.n, 3)

// 3. Board: drag Bus from transport to home; Rent to fun from its menu.
await p.getByRole('tab', exact('Board')).click()
await p.locator('.bd-col').first().waitFor({ timeout: 10000 })
is('a column per category', await p.locator('.bd-col').count(), 7)
is('no overflow on the board', (await overflow()).join(', '), '')
const bus = p.locator('.bd-card', { hasText: 'Bus' })
await bus.scrollIntoViewIfNeeded()
await p.locator('.bd-col[data-col="transport"]').evaluate((el) => el.scrollIntoView({ inline: 'start', block: 'nearest' }))
await p.waitForTimeout(400)
const from = await bus.boundingBox()
const home = await p.locator('.bd-col[data-col="home"]').boundingBox()
const board = await p.locator('.bd').boundingBox()
const tx = Math.min(home.x + 14, board.x + board.width - 50)
await p.mouse.move(from.x + 20, from.y + from.height / 2)
await p.mouse.down()
await p.waitForTimeout(600)
for (let i = 1; i <= 8; i++) await p.mouse.move(from.x + 20 + ((tx - from.x - 20) * i) / 8, from.y + from.height / 2 + 4 * i)
await p.waitForTimeout(150)
await p.mouse.up()
await settle(p)
r = await one(`select data->>'category' c from public.module_record where ${mine} and module_key = '${key}' and data->>'item' = 'Bus' and deleted_at is null`)
is('a held card dragged to another column changes its category', r.c, 'home')
is('no card is left floating', await p.locator('.bd-ghost').count(), 0)
await p.getByRole('button', exact('Move Rent')).click()
is('the Move menu lists the other columns and "No category"', await p.getByRole('menu', exact('Move to')).getByRole('menuitem').count(), 7)
await p.getByRole('menuitem', exact('fun')).click()
await settle(p)
r = await one(`select data->>'category' c from public.module_record where ${mine} and module_key = '${key}' and data->>'item' = 'Rent' and deleted_at is null`)
is('Move to… changes it too', r.c, 'fun')
is('and the card is in its new column', await p.locator('.bd-col[data-col="fun"] .bd-card', { hasText: 'Rent' }).count(), 1)

// 4. Grid: tap Lunch yesterday.
await p.getByRole('tab', exact('Grid')).click()
await p.locator('table.gd').waitFor({ timeout: 10000 })
is('a row per name', await p.locator('table.gd tbody tr').count(), 3)
is('today is ticked for Lunch', await p.locator('tr', { hasText: 'Lunch' }).locator('.gd-cell').nth(6).getAttribute('aria-pressed'), 'true')
await p.locator('tr', { hasText: 'Lunch' }).locator('.gd-cell').nth(5).click()
await settle(p)
r = await one(`select count(*) n, max(data->>'amount') a from public.module_record where ${mine} and module_key = '${key}'
  and data->>'item' = 'Lunch' and record_date = '${yesterday}' and deleted_at is null`)
is('a tap on an empty day adds a record for it', `${r.n} ${r.a}`, '1 1')
is('and the cell is ticked', await p.locator('tr', { hasText: 'Lunch' }).locator('.gd-cell').nth(5).getAttribute('aria-pressed'), 'true')
await p.getByRole('button', exact('30 days')).click()
is('thirty days', await p.locator('tr', { hasText: 'Lunch' }).locator('.gd-cell').count(), 30)
is('no overflow on the grid', (await overflow()).join(', '), '')

// 5. Chart: bars, and a value read out on tap.
await p.getByRole('tab', exact('Chart')).click()
await p.locator('svg.ch-svg').waitFor({ timeout: 10000 })
is('bars are drawn', (await p.locator('svg.ch-svg rect.ch-bar').count()) >= 1, true)
await p.locator('.ch-hit').last().click()
is('a tap reads the week out', /^Week of .+: [\d.]+/.test(await p.locator('.ch-readout').innerText()), true)
await p.getByRole('tab', exact('Day')).click()
is('per day: fourteen days', await p.locator('.ch-hit').count(), 14)
is('no overflow on the chart', (await overflow()).join(', '), '')
is('the bars take the page’s accent, not a fixed colour', await p.locator('svg.ch-svg rect.ch-bar').first()
  .evaluate((el) => !['none', 'rgb(0, 0, 0)'].includes(getComputedStyle(el).fill)), true)

// 6. A built-in rule switched off stops what it does.
await p.goto(`${APP}more`, { waitUntil: 'networkidle' })
const habitsSwitch = p.getByRole('switch', { name: /Turn Habits (on|off)/ })
if ((await habitsSwitch.getAttribute('aria-checked')) !== 'true') await habitsSwitch.click()
await settle(p)
await p.goto(`${APP}m/habits`, { waitUntil: 'networkidle' })
if (!(await p.getByText('E2E Stretch').count())) {
  await p.getByRole('button', { name: /Add a habit/ }).click()
  await p.getByLabel('Habit name').fill('E2E Stretch')
  await p.getByRole('button', exact('Add')).click()
  await settle(p)
}
await p.goto(APP, { waitUntil: 'networkidle' })
await p.getByRole('tab', exact('Habits')).waitFor({ timeout: 10000 }).catch(() => {})
is('with the rule on, Today has a Habits tab', await p.getByRole('tab', exact('Habits')).count(), 1)

const rule = 'A daily habit appears on every day until it is turned off.'
async function setRule(on) {
  await p.goto(`${APP}m/habits`, { waitUntil: 'networkidle' })
  await p.getByRole('button', exact('Edit module')).click()
  await p.getByRole('tab', exact('Rules')).click()
  const sw = p.getByRole('switch', exact(rule))
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click()
  await p.getByRole('button', exact('Save')).click()
  await settle(p)
}
await setRule(false)
r = await one(`select settings->'overlay'->'rulesOff' o from public.module_instance where ${mine} and module_key = 'habits'`)
is('the switch is kept in the module’s settings', JSON.stringify(r.o), '["daily"]')
await p.goto(APP, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
is('with the rule off, the Habits tab leaves Today', await p.getByRole('tab', exact('Habits')).count(), 0)
await setRule(true)
await p.goto(APP, { waitUntil: 'networkidle' })
await p.getByRole('tab', exact('Habits')).waitFor({ timeout: 10000 }).catch(() => {})
is('switched back on, it comes back', await p.getByRole('tab', exact('Habits')).count(), 1)

// Sleep's bedtime rule is not acted on yet, so it has no switch.
await p.goto(`${APP}m/sleep`, { waitUntil: 'networkidle' })
await p.getByRole('button', exact('Edit module')).click()
await p.getByRole('tab', exact('Rules')).click()
is('Sleep’s bedtime rule shows no switch', await p.getByRole('switch', { name: /Bedtime is locked/ }).count(), 0)
await p.getByRole('button', exact('Back')).click()

// Tidy up: the module goes (its records stay until the account is deleted).
await p.goto(`${APP}m/${key}`, { waitUntil: 'networkidle' })
await p.getByRole('button', exact('Edit module')).click()
await p.getByRole('tab', exact('Settings')).click()
await p.getByRole('button', exact('Delete module')).click()
await p.getByRole('button', exact('Delete E2E Views')).click()
await settle(p)

is('no page errors', A.errors.length, 0)
if (A.errors.length) console.log(A.errors.join('\n'))
await A.b.close()
console.log(failed() ? `\n${failed()} failed` : '\nall checks passed')
process.exit(failed() ? 1 : 0)
