import { need, open, signIn, sql, profileOf, checks, drained, modulesOn, toPage } from './e2e.mjs'

// A shared NEVO food's page (migration 027), at 360 px: found by its Dutch
// name, it shows the EU label per 100 g, %RI on request, its Portie-online
// units with the as-bought weight, NEVO's attribution and Visuma's additions
// marked as such; it cannot be edited, but a unit of one's own can be laid
// over it (kept with Nutrition, not on the shared row), and "Make my own
// copy" saves an own food that says it came from NEVO. A new own food with
// only macros gets its energy from the EU factors.
// Needs TEST_FEAT_EMAIL, TEST_PASSWORD and SB, and migration 027 applied.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const me = profileOf(email)
const user = `(select id from auth.users where email = '${email}')`
const onion = 'Onions, raw'
const copy = 'E2E my onions'
const own = 'E2E macro bar'
const { is, failed } = checks()

const reset = `
  delete from public.food where owner_id = ${user} and name in ('${copy}', '${own}');
  update public.module_instance set settings = settings - 'unit_overlay' - 'label'
    where profile_id = ${me} and module_key = 'nutrition';`
await sql(reset)
await modulesOn(email, ['nutrition'])
const [shared] = await sql(`select id, units from public.food where nevo_code = 63`)
is('the catalogue has NEVO 63', !!shared, true)

const { b, p, errors } = await open({ viewport: { width: 360, height: 740 } })
await signIn(p, email)
const one = async (query) => (await sql(query))[0] ?? {}
const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *, .bottom-sheet *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.sheet-wrap, .week-strip, table, .bk-bar'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})

// 1. Found by its Dutch name.
await toPage(p, '/food')
await p.click('.tabs button:has-text("Foods")')
await p.fill('input[aria-label="Search foods, in English or Dutch"]', 'ui rauw')
await p.locator(`button[aria-label="Open ${onion}"]`).first().click({ timeout: 20000 })
const sheet = p.locator('.bottom-sheet.fs-sheet')
is('the page is the onion', (await sheet.locator('h2').textContent())?.trim(), onion)
is('with NEVO’s Dutch name under it', /Ui rauw/.test((await sheet.locator('.fs-sub').textContent()) ?? ''), true)
is('the label is per 100 g', (await sheet.locator('.fs-table caption').textContent())?.trim(), 'Per 100 g, as on an EU label')
is('energy as NEVO gives it', /37 kcal/.test((await sheet.locator('.fs-table').textContent()) ?? ''), true)
is('the units say what one weighs as bought', (await sheet.locator('.fu-list li').first().textContent())?.includes('1 onion = 95 g (100 g as bought)'), true)
const source = (await sheet.locator('.fs-source').textContent()) ?? ''
is('NEVO is credited', source.includes('Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven'), true)
is('the units are credited to Portie-online', /Portie-online/.test(source), true)
is('Visuma’s additions are marked', /Added by Visuma, not part of NEVO/.test(source), true)
is('the page fits 360 px', (await overflow()).join(', '), '')
// The page's actions are in the ⋮ by its name (v17); its main one at the foot.
const menu = async (item) => {
  await sheet.locator('.fs-more .pm-button').click()
  await sheet.locator(`.pm-menu button:has-text("${item}")`).click()
}
is('Add to a meal is the main action', await sheet.locator('.fs-actions .btn-primary').textContent(), 'Add to a meal')
await sheet.locator('.fs-more .pm-button').click()
is('a shared food has no Edit', await sheet.locator('.pm-menu button:has-text("Edit")').count(), 0)
await p.keyboard.press('Escape')
is('Escape closes the ⋮, not the page', await sheet.count(), 1)

// 2. %RI on request, remembered with Nutrition.
await menu('Show % of reference intake')
is('energy as a share of 2,000 kcal', (await sheet.locator('.fs-table tbody tr').first().locator('.fs-ri').textContent())?.trim(), '2%')
await menu('Hide % of reference intake')
// The choice is saved with Nutrition and the page follows it a moment later.
await sheet.locator('.fs-ri').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
is('and off again', await sheet.locator('.fs-ri').count(), 0)

// 3. A unit of one's own over the shared food.
await sheet.getByRole('button', { name: '+ Add a unit' }).click()
await sheet.getByRole('textbox', { name: 'Unit', exact: true }).fill('ring')
// The plural waits under More options (v18, CALM-08).
await sheet.getByRole('button', { name: /More options/ }).click()
await sheet.getByRole('textbox', { name: 'Plural, if odd' }).fill('rings')
await sheet.getByRole('textbox', { name: 'One weighs, g' }).fill('10')
await sheet.getByRole('button', { name: 'Add unit' }).click()
await sheet.locator('.fu-list', { hasText: '1 ring = 10 g' }).waitFor({ timeout: 5000 }).catch(() => {})
is('my unit is listed with the shared ones', /1 ring = 10 g/.test((await sheet.locator('.fu-list').textContent()) ?? ''), true)
is('it reached the server', await drained(p), true)
const overlay = await one(`select settings->'unit_overlay'->'${shared.id}' as units from public.module_instance
  where profile_id = ${me} and module_key = 'nutrition'`)
// Postgres keeps a JSON object's keys in its own order, so compare them sorted.
const sorted = (list) => JSON.stringify((list ?? []).map((u) => Object.fromEntries(Object.entries(u).sort())))
is('kept with Nutrition, not on the shared row', sorted(overlay.units), sorted([{ name: 'ring', plural: 'rings', g: 10 }]))
const after = await one(`select units from public.food where id = '${shared.id}'`)
is('the shared food is unchanged', JSON.stringify(after.units), JSON.stringify(shared.units))

// 4. Make my own copy.
await menu('Make my own copy')
const editor = p.locator('.bottom-sheet.fe-sheet')
is('the copy starts from the onion', (await editor.locator('h2').textContent())?.trim(), 'Your own copy')
await editor.getByRole('textbox', { name: 'Name', exact: true }).fill(copy)
is('the editor fits 360 px', (await overflow()).join(', '), '')
await editor.getByRole('button', { name: 'Save food' }).click()
await p.waitForTimeout(800)
is('the copy reached the server', await drained(p), true)
const saved = await one(`select kcal::float kcal, source, source_ref, nevo_code from public.food where owner_id = ${user} and name = '${copy}'`)
is('the copy is mine, from NEVO 63, with its figures', `${saved.source} ${saved.source_ref} ${saved.nevo_code} ${saved.kcal}`, 'own nevo:63 null 37')

// 5. A new food with only macros: energy from the EU factors (FOOD-04).
await p.fill('input[aria-label="Search foods, in English or Dutch"]', own)
await p.locator('.ft-more button', { hasText: `Add “${own}” as a new food` }).click()
const fresh = p.locator('.bottom-sheet.fe-sheet')
const figure = (label) => fresh.locator('.fe-figure', { hasText: label }).first().locator('input')
await figure('Fat').fill('10')
await figure('Carbohydrate').fill('50')
await figure('Protein').fill('20')
// 10 × 9 + 50 × 4 + 20 × 4 = 370 kcal; 10 × 37 + 50 × 17 + 20 × 17 = 1,560 kJ.
is('energy is worked out as it is typed', /370 kcal \(1560 kJ\)/.test((await fresh.locator('.fe-label').textContent()) ?? ''), true)
await fresh.getByRole('button', { name: 'Save food' }).click()
await p.waitForTimeout(800)
await drained(p)
const bar = await one(`select kcal::float kcal from public.food where owner_id = ${user} and name = '${own}'`)
is('Postgres holds the worked-out energy', bar.kcal, 370)

await sql(reset)
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
