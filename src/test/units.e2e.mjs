import { need, open, signIn, sql, profileOf, checks, drained, modulesOn } from './e2e.mjs'

// Food counted in units (migration 022), at 360 px: an own food "E2E eggs" is
// given the unit egg of 50 g on its page; a recipe written as "2 eggs" saves
// 100 g with the unit, shows 2 eggs when opened again and counts the calories
// of 100 g; stock added as "12" eggs reads "12 eggs" and holds 600 g in
// Postgres; the recipe's copied ingredient list says "E2E eggs — 2 eggs".
// Needs TEST_FEAT_EMAIL, TEST_PASSWORD and SB, and migration 022 applied.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const me = profileOf(email)
const user = `(select id from auth.users where email = '${email}')`
const household = `(select household_id from public.profile where id = ${me})`
const food = 'E2E eggs'
const recipe = 'E2E egg toast'
const { is, failed } = checks()

const reset = `
  delete from public.stock where household_id = ${household}
    and food_id in (select id from public.food where owner_id = ${user} and name = '${food}');
  delete from public.recipe where owner_id = ${user} and name = '${recipe}';
  delete from public.food where owner_id = ${user} and name = '${food}';`
await sql(reset)
// 143 kcal and 12.6 g protein per 100 g, like a chicken's egg; no units yet.
await sql(`insert into public.food (owner_id, name, kcal, protein_g, carbs_g, fat_g, fiber_g, source)
  values (${user}, '${food}', 143, 12.6, 0.7, 9.5, 0, 'import')`)

await modulesOn(email, ['nutrition', 'shopping'])
const { b, p, errors } = await open({ viewport: { width: 360, height: 740 }, permissions: ['clipboard-read', 'clipboard-write'] })
await signIn(p, email)
const one = async (query) => (await sql(query))[0] ?? {}
const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *, .bottom-sheet *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.sheet-wrap, .week-strip, table, .bk-bar'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})

// 1. The food's page: add the unit egg, 50 g.
await p.click('.bottom-nav a[href="/food"]')
await p.click('.tabs button:has-text("Foods")')
await p.fill('input[aria-label="Search foods"]', food)
await p.locator(`button[aria-label="Open ${food}: its units"]`).first().click({ timeout: 20000 })
const sheet = p.locator('.bottom-sheet')
is('its page says grams only', (await sheet.locator('.fu-facts', { hasText: 'Counted in grams only' }).count()) > 0, true)
await sheet.getByRole('textbox', { name: 'Unit', exact: true }).fill('egg')
await sheet.getByRole('textbox', { name: 'Plural, if odd' }).fill('eggs')
await sheet.getByRole('textbox', { name: 'One weighs, g' }).fill('50')
await sheet.getByRole('button', { name: 'Add unit' }).click()
await p.waitForTimeout(400)
is('the unit is listed', (await sheet.locator('.fu-list li').first().textContent())?.includes('1 egg = 50 g'), true)
is('the page fits 360 px', (await overflow()).join(', '), '')
await sheet.getByRole('button', { name: 'Close' }).click()
is('the unit reached the server', await drained(p), true)
const saved = await one(`select units from public.food where owner_id = ${user} and name = '${food}'`)
is('Postgres holds the unit', JSON.stringify(saved.units), JSON.stringify([{ name: 'egg', plural: 'eggs', g: 50 }]))

// 2. A recipe with "2 eggs" a portion.
await p.click('.tabs button:has-text("Recipes")')
await p.getByRole('button', { name: 'New recipe' }).click()
const editor = p.locator('.bottom-sheet')
await editor.getByRole('textbox', { name: 'Name', exact: true }).fill(recipe)
await editor.locator('input[aria-label="Add an ingredient"]').fill(food)
await p.locator('.sp-list li[role=option]', { hasText: food }).first().click()
is('a food with units starts in its unit', await editor.locator('.re-amount button[aria-pressed="true"]').textContent(), 'egg')
await editor.locator(`input[aria-label="${food}, eggs per portion"]`).fill('2')
is('it says what that comes to', (await editor.locator('.re-amount .amt-hint').textContent())?.trim(), '2 eggs (100 g)')
is('the portion counts 100 g of egg', (await editor.locator('.re-total').textContent())?.startsWith('One portion: 143 kcal'), true)
is('the editor fits 360 px', (await overflow()).join(', '), '')
await editor.getByRole('button', { name: 'Save' }).click()
await p.waitForTimeout(800)
is('the recipe reached the server', await drained(p), true)
const line = await one(`select l.unit, l.unit_qty::float qty, l.grams_per_portion::float g
  from public.recipe_line l join public.recipe r on r.id = l.recipe_id where r.owner_id = ${user} and r.name = '${recipe}'`)
is('Postgres holds 2 eggs as 100 g', `${line.qty} ${line.unit}, ${line.g} g`, '2 egg, 100 g')
is('the recipe counts 143 kcal a portion',
  (await p.locator('.my-recipes .setting-row', { hasText: recipe }).locator('.row-meta').textContent())?.startsWith('143 kcal a portion'), true)

// Opened again, it reads 2 eggs, not 100 g.
await p.locator(`button[aria-label="Edit ${recipe}"]`).click()
is('opened again it is 2 eggs', await p.locator(`.bottom-sheet input[aria-label="${food}, eggs per portion"]`).inputValue(), '2')
is('with its grams', (await p.locator('.bottom-sheet .re-amount .amt-hint').textContent())?.trim(), '2 eggs (100 g)')
await p.locator('.bottom-sheet').getByRole('button', { name: 'Cancel' }).click()

// 3. The combined ingredient list says eggs.
await p.click('.bk-select')
await p.locator(`input[aria-label="Select ${recipe}"]`).check()
await p.locator('.sb-bar button:has-text("Copy ingredients")').click()
await p.waitForTimeout(300)
const copied = await p.evaluate(() => navigator.clipboard.readText())
is('the ingredient list counts eggs', JSON.stringify(copied), JSON.stringify(`${food} — 2 eggs`))
await p.locator('.sb-bar button:has-text("Done")').click()

// 4. Twelve eggs in stock.
await p.click('.bottom-nav a[href="/shop"]')
await p.click('.tabs button:has-text("Stock")')
await p.fill('input[aria-label="Food to add to stock"]', food)
await p.locator('.sp-list li', { has: p.locator('.sp-name', { hasText: food }) }).first().click()
is('stock is added in eggs', await p.locator('.stock-add .stock-units button[aria-pressed="true"]').textContent(), 'egg')
await p.fill('.stock-add input[aria-label="Amount"]', '12')
await p.click('.stock-add button[type=submit]')
await p.waitForTimeout(600)
const row = p.locator('.stock-row', { has: p.locator('.stock-name', { hasText: food }) })
is('the cupboard shows 12 eggs', (await row.locator('.stock-qty').textContent())?.trim(), '12 eggs')
is('the Stock tab fits 360 px', (await overflow()).join(', '), '')
is('stock reached the server', await drained(p), true)
const stock = await one(`select unit, unit_qty::float qty, grams_on_hand::float g from public.stock
  where household_id = ${household} and food_id = (select id from public.food where owner_id = ${user} and name = '${food}')`)
is('Postgres holds 12 eggs as 600 g', `${stock.qty} ${stock.unit}, ${stock.g} g`, '12 egg, 600 g')

// + is one egg more.
await row.locator('.stock-step', { hasText: '+' }).click()
await p.waitForTimeout(400)
is('+ adds one egg', (await row.locator('.stock-qty').textContent())?.trim(), '13 eggs')
await drained(p)
const after = await one(`select unit_qty::float qty, grams_on_hand::float g from public.stock
  where household_id = ${household} and food_id = (select id from public.food where owner_id = ${user} and name = '${food}')`)
is('and 650 g in Postgres', `${after.qty}, ${after.g} g`, '13, 650 g')

await sql(reset)
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
