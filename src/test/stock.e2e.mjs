import { need, sql, checks, open, signIn, profileOf, drained, modulesOn } from './e2e.mjs'

// The household's stock, clicked through on a phone: add a food by search,
// nudge it and type a new amount, remove another with a confirm; plan a meal
// and see the trip take the cupboard off; switch on taking ingredients out
// when a meal is eaten, tick the meal and see the stock go down, untick it and
// see it come back. Every step is checked in Postgres as well as on screen.
//
// Needs TEST_EMAIL, TEST_PASSWORD and SB. Every query is scoped to that
// account's profile and household, because this runs against the live project.
need('TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_EMAIL
const profile = profileOf(email)
const household = `(select household_id from public.profile where id = ${profile})`
const { is, failed } = checks()
const settle = async (p, ms = 700) => { await p.waitForTimeout(ms); await drained(p) }
const one = async (query) => (await sql(query))[0] ?? {}
const close = (a, b, within = 0.2) => Math.abs(Number(a) - Number(b)) <= within

// A shared recipe and the first food it uses, with what one portion of it
// weighs raw: the figure the trip and the auto-deduct both work from.
const recipe = await one(`select r.id, r.name from public.recipe r
  where r.owner_id is null and r.name ilike 'Grilled chicken%'
    and exists (select 1 from public.recipe_line l where l.recipe_id = r.id and l.food_id is not null and l.grams_per_portion > 0)
  order by r.name limit 1`)
if (!recipe.id) { console.error('No shared "Grilled chicken" recipe with ingredients to plan.'); process.exit(2) }
const used = await sql(`select f.id, f.name, l.grams_per_portion::float g, l.state, f.cook_yield::float y
  from public.recipe_line l join public.food f on f.id = l.food_id
  where l.recipe_id = '${recipe.id}' and l.grams_per_portion > 0 order by l.sort_order`)
const food = { id: used[0].id, name: used[0].name }
const needG = used.filter((l) => l.id === food.id)
  .reduce((sum, l) => sum + (l.state === 'cooked' && l.y > 0 ? l.g / l.y : l.g), 0)
const other = await one(`select name from public.food where owner_id is null and id <> '${food.id}'
  and id not in (select food_id from public.recipe_line where recipe_id = '${recipe.id}' and food_id is not null)
  order by length(name), name limit 1`)
console.log(`using ${recipe.name}: ${food.name}, ${needG.toFixed(1)} g a portion; ${other.name} to remove`)

// Start clean: no stock, no meal plan, the switch off.
await sql(`delete from public.stock where household_id = ${household};
  delete from public.meal_plan_slot where profile_id = ${profile};
  delete from public.food_log where profile_id = ${profile};
  delete from public.task where profile_id = ${profile} and source = 'meal';
  update public.profile set settings = coalesce(settings, '{}'::jsonb) - 'stock_auto' where id = ${profile};`)

const { b, p, errors } = await open({ viewport: { width: 360, height: 740 } })
// This check needs these pages, whichever check used the account before it.
await modulesOn(email, ['nutrition', 'shopping'])
await signIn(p, email)
const stockRow = (name) => p.locator('.stock-row', { has: p.locator('.stock-name', { hasText: name }) })
const server = async (foodId) => one(`select grams_on_hand::float g, (deleted_at is not null) gone
  from public.stock where household_id = ${household} and food_id = '${foodId}'`)
const openStock = async () => {
  await p.click('.bottom-nav a[href="/shop"]')
  await p.click('.tabs button:has-text("Stock")')
  await p.locator('.stock-add').waitFor()
}
async function add(name, amount, unit) {
  await p.fill('input[aria-label="Food to add to stock"]', name)
  await p.locator('.sp-list li', { has: p.locator('.sp-name', { hasText: name }) }).first().click()
  await p.fill('.stock-add input[aria-label="Amount"]', amount)
  await p.locator('.stock-add .stock-units').getByRole('button', { name: unit, exact: true }).click()
  await p.click('.stock-add button[type=submit]')
  await settle(p)
}
async function setAmount(name, amount, unit) {
  await stockRow(name).locator('.stock-qty').click()
  await p.locator('.stock-edit .stock-units').getByRole('button', { name: unit, exact: true }).click()
  await p.fill('.stock-edit input[aria-label^="Amount of"]', amount)
  await p.click('.stock-edit button:has-text("Save")')
  await settle(p)
}

// 1. Add by search, adjust, type an amount.
await openStock()
is('an empty cupboard says so', await p.locator('.empty', { hasText: 'Nothing in stock yet' }).count(), 1)
await add(food.name, '2', 'kg')
is('the new item is listed in kilos', (await stockRow(food.name).locator('.stock-qty').textContent())?.trim(), '2 kg')
let r = await server(food.id)
is('and reached the server in grams', r.g, 2000)

await p.click(`button[aria-label="More ${food.name}"]`)
await settle(p)
is('+ adds a step sized to the amount', (await server(food.id)).g, 2100)
await setAmount(food.name, '1,8', 'kg')
is('a typed amount (with a comma) replaces it', (await server(food.id)).g, 1800)
is('and shows', (await stockRow(food.name).locator('.stock-qty').textContent())?.trim(), '1.8 kg')

// 2. Remove, with a confirm.
await add(other.name, '300', 'g')
is('a second item is added', (await stockRow(other.name).count()), 1)
await stockRow(other.name).locator('.stock-qty').click()
await p.click('.stock-edit button:has-text("Remove")')
is('removing asks first', await p.locator('.stock-edit .stock-hint', { hasText: 'off the list?' }).count(), 1)
await p.click('.stock-edit button.warn:has-text("Remove")')
await settle(p)
is('it leaves the list', await stockRow(other.name).count(), 0)
r = await one(`select count(*) n from public.stock s join public.food f on f.id = s.food_id
  where s.household_id = ${household} and f.name = '${other.name.replace(/'/g, "''")}' and s.deleted_at is not null`)
is('and is removed on the server (softly)', r.n, 1)

// 3. The trip takes stock off.
await p.click('.bottom-nav a[href="/food"]')
await p.waitForTimeout(1200)
await p.fill('input[aria-label="Lunch recipe"]', recipe.name)
await p.locator('.sp-list li[role=option]', { hasText: recipe.name }).first().click()
await settle(p, 900)
await p.click('.bottom-nav a[href="/shop"]')
await p.click('.tabs button:has-text("Trip")')
await p.waitForTimeout(1200)
if (needG <= 1800) {
  is('a food the cupboard covers drops off the trip', await p.locator('.totals', { hasText: 'covered by stock' }).count(), 1)
}
const half = Math.max(1, Math.floor(needG / 2))
await openStock()
await setAmount(food.name, String(half), 'g')
await p.click('.tabs button:has-text("Trip")')
await p.waitForTimeout(1200)
const cells = await p.evaluate(() => {
  const head = [...document.querySelectorAll('.sheet thead th')].map((th) => th.textContent.trim())
  return [...document.querySelectorAll('.sheet tbody tr')].map((tr) =>
    Object.fromEntries([...tr.children].map((td, i) => [head[i], td.querySelector('input')?.value ?? td.textContent.trim()])))
})
const line = cells.find((c) => Number(c['From stock g']) === half)
is('the trip shows what comes from stock', Boolean(line), true)
is('and needs only the rest', line && Number(line['Needed g']), Math.round(needG) - half)

// 4. Auto-deduct: off by default, on by choice; eating takes, unticking gives back.
await openStock()
await setAmount(food.name, '1000', 'g')
const sw = p.locator('button[aria-label="Take ingredients out of stock when a meal is eaten"]')
is('taking ingredients out is off by default', await sw.getAttribute('aria-checked'), 'false')
await sw.click()
await settle(p)
is('it switches on', await sw.getAttribute('aria-checked'), 'true')
r = await one(`select settings->>'stock_auto' v from public.profile where id = ${profile}`)
is('and the choice reached the server', r.v, 'true')

await p.click('.bottom-nav a[href="/food"]')
await p.waitForTimeout(1000)
await p.locator('input[aria-label="Lunch eaten"]').click()
await settle(p, 1200)
const left = Math.max(0, 1000 - needG)
r = await server(food.id)
is(`eating lunch takes ${needG.toFixed(1)} g out`, close(r.g, left), true)
await p.locator('input[aria-label="Lunch eaten"]').click()
await settle(p, 1200)
is('unticking it puts it back', close((await server(food.id)).g, 1000), true)
await openStock()
is('the Stock tab shows it back', (await stockRow(food.name).locator('.stock-qty').textContent())?.trim(), '1 kg')

// 5. Nothing ran off the side of a 360 px phone on the Stock tab.
const wide = await p.evaluate(() => [...document.querySelectorAll('.page *')]
  .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length)
is('nothing on the Stock tab runs off a 360 px screen', wide, 0)

// Leave the account as it was found.
await sql(`delete from public.stock where household_id = ${household};
  delete from public.meal_plan_slot where profile_id = ${profile};
  delete from public.food_log where profile_id = ${profile};
  delete from public.task where profile_id = ${profile} and source = 'meal';
  update public.profile set settings = coalesce(settings, '{}'::jsonb) - 'stock_auto' where id = ${profile};`)

console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
