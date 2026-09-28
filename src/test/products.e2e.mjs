import { need, open, signIn, sql, checks, drained, modulesOn } from './e2e.mjs'

// Supermarket products from Open Food Facts, at 360 px: "hagelslag" searched
// from Foods → Find in stores, a result sold in a Dutch shop added to the
// account's foods (in Postgres with its barcode and source 'off'); the same
// barcode typed in the scan sheet opening the food already kept instead of
// adding a second; the product page's shared prices (or "No shared prices
// yet") with both attribution lines; nothing running off the side.
//
// This asks Open Food Facts for real, so it keeps to a handful of calls (at
// most three searches, three lookups, three price lists) against its limits
// of 10 searches and 15 lookups a minute. Its older search, the one a browser
// may use, is sometimes too busy to answer: then the search step is reported
// as skipped and the food is added by barcode instead, so the rest still runs.
//
// Needs TEST_FEAT_EMAIL, TEST_PASSWORD, SB, and migration 021 applied.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const user = `(select id from auth.users where email = '${email}')`
const { is, failed } = checks()
// De Ruijter chocolate sprinkles: in Open Food Facts, sold at Albert Heijn,
// with a price shared on Open Prices (checked September 2026).
const KNOWN = '8710496979125'
const DUTCH = /Albert Heijn|Jumbo|Lidl|Aldi|Plus|Dirk|Coop|Spar|DekaMarkt|Hoogvliet|Vomar|Poiesz|Jan Linders|Picnic|Ekoplaza/

const [col] = await sql(`select count(*)::int n from information_schema.columns
  where table_schema = 'public' and table_name = 'food' and column_name = 'barcode'`)
if (!col?.n) { console.error('Apply supabase/migrations/021_food_products.sql first.'); process.exit(2) }

const reset = `delete from public.food where owner_id = ${user} and source = 'off';`
await sql(reset)
await modulesOn(email, ['nutrition', 'shopping'])

const { b, p, errors } = await open({ viewport: { width: 360, height: 740 } })
await signIn(p, email)
const sheet = p.locator('.pf-sheet')
const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.pf-sheet *, .pf-bar *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1)
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})
const offFoods = async () => sql(`select name, barcode, source, brand, pack_size_g::float pack from public.food
  where owner_id = ${user} and source = 'off' and deleted_at is null`)

await p.click('.bottom-nav a[href="/food"]')
await p.click('.tabs button:has-text("Foods")')
await p.click('.pf-bar button:has-text("Find in stores")')
await sheet.waitFor()

// 1. Typing sends nothing; Search does.
const asked = []
p.on('request', (r) => { if (/openfoodfacts\.org\/(cgi|search)/.test(r.url())) asked.push(r.url()) })
await p.fill('input[aria-label="Search Open Food Facts"]', 'hagelsla')
await p.waitForTimeout(1000)
is('typing alone asks Open Food Facts nothing', asked.length, 0)
await p.fill('input[aria-label="Search Open Food Facts"]', 'hagelslag')

let answered = false
for (let tries = 0; tries < 3 && !answered; tries++) {
  if (tries) await p.waitForTimeout(20000)
  await p.click('.pf-search button:has-text("Search")')
  await p.locator('.pf-results, .pf-sheet .pf-note.is-bad, .pf-sheet .pf-note:has-text("Nothing found")').first().waitFor({ timeout: 45000 })
  answered = (await p.locator('.pf-results').count()) > 0
  if (!answered) console.log(`search try ${tries + 1}: ${await p.locator('.pf-sheet .pf-note').first().textContent()}`)
}

let code = KNOWN
if (answered) {
  const hits = p.locator('.pf-hit')
  is('results appear', (await hits.count()) > 0, true)
  const dutch = hits.filter({ has: p.locator('.pf-stores', { hasText: DUTCH }) })
  is('a result is sold in a Dutch shop', (await dutch.count()) > 0, true)
  is('results show kcal per 100 g', (await hits.first().locator('.pf-hit-kcal small').textContent())?.includes('kcal/100'), true)
  is('nothing in the results runs off a 360 px screen', (await overflow()).join(' '), '')
  await (await dutch.count() ? dutch.first() : hits.first()).click()
  code = (await p.locator('.pf-page .row-meta', { hasText: 'Barcode' }).textContent()).replace(/\D/g, '')
} else {
  console.log('SKIP  the search step: Open Food Facts’ search did not answer three times; adding by barcode instead')
  await p.click('.pf-head button:has-text("Close")')
  await p.click('.pf-bar button:has-text("Scan barcode")')
  await p.fill('input[aria-label="Barcode digits"]', KNOWN)
  await p.click('button:has-text("Look up")')
}

// 2. The product page, then added to the account's foods.
await p.locator('.pf-page').waitFor({ timeout: 30000 })
await p.locator('.pf-prices ul, .pf-prices p.row-meta:not([role=status])').first().waitFor({ timeout: 30000 })
is('the page shows the figures per 100 g (or ml)', (await p.locator('.pf-facts caption').textContent())?.startsWith('Per 100'), true)
is('the product data is credited', (await p.locator('.pf-page .pf-credit').textContent())?.includes('Product data: Open Food Facts (ODbL)'), true)
is('the prices are credited', (await p.locator('.pf-page .pf-credit').textContent())?.includes('Prices: Open Prices (ODbL)'), true)
is('the credit links to the product on openfoodfacts.org', await p.locator('.pf-credit a', { hasText: 'Open Food Facts' }).getAttribute('href'), `https://world.openfoodfacts.org/product/${code}`)
await p.click('button:has-text("Add to my foods")')
await p.locator('.pf-page .pf-note', { hasText: 'Added to your foods.' }).waitFor()
await drained(p)
let rows = await offFoods()
is('one food from Open Food Facts in Postgres', rows.length, 1)
is('with its barcode', rows[0]?.barcode, code)
is('and source off', rows[0]?.source, 'off')
const name = rows[0]?.name

// 3. The same barcode again opens that food rather than adding a second.
await p.click('.pf-head button:has-text("Close")')
await p.click('.pf-bar button:has-text("Scan barcode")')
await p.fill('input[aria-label="Barcode digits"]', code)
await p.click('button:has-text("Look up")')
await p.locator('.pf-page').waitFor({ timeout: 30000 })
is('the barcode finds the food already kept', await p.locator('.pf-page .pf-note', { hasText: 'Already in your foods.' }).count(), 1)
is('and offers no second add', await p.locator('button:has-text("Add to my foods")').count(), 0)
await p.click('button:has-text("Show in Foods")')
is('Show in Foods closes the sheet', await sheet.count(), 0)
is('and narrows the table to it', await p.inputValue('input[aria-label="Search foods"]'), name)
is('the food is in the table', await p.locator('.sheet tbody tr', { hasText: name }).count() > 0, true)
await drained(p)
rows = await offFoods()
is('still one food in Postgres', rows.length, 1)

// 4. Shared prices for a product that has some, or "none yet".
await p.fill('input[aria-label="Search foods"]', '')
await p.click('.pf-bar button:has-text("Scan barcode")')
await p.fill('input[aria-label="Barcode digits"]', KNOWN)
await p.click('button:has-text("Look up")')
await p.locator('.pf-prices ul, .pf-prices p.row-meta:not([role=status])').first().waitFor({ timeout: 30000 })
const prices = await p.locator('.pf-prices li').count()
const none = await p.locator('.pf-prices', { hasText: 'No shared prices yet.' }).count()
is('the prices section shows prices or says there are none yet', prices > 0 || none === 1, true)
if (prices) console.log(`      first price: ${(await p.locator('.pf-prices li').first().innerText()).replace(/\n/g, ' ')}`)
is('nothing on the product page runs off a 360 px screen', (await overflow()).join(' '), '')

await sql(reset)
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
