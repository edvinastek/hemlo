import { need, open, signIn, sql, profileOf, checks, drained, modulesOn, toPage } from './e2e.mjs'

// Recipe books and select mode on the Recipes tab, at 360 px: a book made,
// two own recipes put in it (one by holding the row, one by its tick box),
// the book filtering the table, their ingredients copied and read back from
// the clipboard, one own recipe deleted after the confirm sheet, and a shared
// catalogue recipe that cannot be. Needs TEST_FEAT_EMAIL, TEST_PASSWORD and SB.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const me = profileOf(email)
const user = `(select id from auth.users where email = '${email}')`
const { is, failed } = checks()

// Two recipes of the account's own, with plain-text lines so the combined
// list is known exactly: A makes 2 portions, B makes 1.
const reset = `
  delete from public.recipe where owner_id = ${user} and name like 'E2E bowl %';
  update public.profile set settings = settings - 'books' where id = ${me};`
await sql(reset)
await sql(`
  with a as (insert into public.recipe (owner_id, name, role, portions_per_batch) values (${user}, 'E2E bowl A', 'lunch', 2) returning id),
       b as (insert into public.recipe (owner_id, name, role, portions_per_batch) values (${user}, 'E2E bowl B', 'lunch', 1) returning id)
  insert into public.recipe_line (recipe_id, food_id, raw_text, grams_per_portion, state, sort_order)
    select a.id, null::uuid, 'E2E oats', 60, 'raw', 0 from a union all
    select a.id, null, 'E2E milk', 200, 'raw', 1 from a union all
    select b.id, null, 'E2E oats', 30, 'raw', 0 from b union all
    select b.id, null, 'E2E honey', 10, 'raw', 1 from b;`)
const [shared] = await sql(`select id, name from public.recipe where owner_id is null and deleted_at is null order by name limit 1`)

await modulesOn(email, ['nutrition', 'shopping'])
const { b, p, errors } = await open({ viewport: { width: 360, height: 740 }, permissions: ['clipboard-read', 'clipboard-write'] })
await signIn(p, email)

const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.sheet-wrap, .week-strip, table, .bk-bar'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})
const row = (name) => p.locator('.sheet tbody tr', { hasText: name })
const chip = (name) => p.locator('.bk-bar .bk-chip', { hasText: name })
const bar = p.locator('.sb-bar')
const status = () => bar.locator('.sb-status').textContent()
// New book and Select are in the page's ⋮ (v17); selecting also starts with a hold.
const pageMenu = async (item) => {
  await p.click('.food-menu .pm-button')
  await p.click(`.pm-menu button:has-text("${item}")`)
}

await toPage(p, '/food')
await p.click('.tabs button:has-text("Recipes")')
await row('E2E bowl A').waitFor({ timeout: 20000 })

// 1. A new book, coloured Green.
await pageMenu('New book')
await p.fill('.bk-sheet input', 'E2E lunches')
await p.click('.bk-sheet button[aria-label="Green"]')
await p.click('.bk-sheet button:has-text("Make book")')
await p.waitForTimeout(600)
is('the new book is chosen', await chip('E2E lunches').getAttribute('aria-pressed'), 'true')
is('and is empty', await p.locator('.sheet tbody tr').count(), 0)
is('nothing runs off the side with a book chosen', (await overflow()).join(', '), '')

// 2. Back to All; hold one recipe to start selecting, tick the other.
await chip('All').click()
await row('E2E bowl A').waitFor()
await p.waitForTimeout(400)
await row('E2E bowl A').scrollIntoViewIfNeeded()
const box = await row('E2E bowl A').locator('td').nth(1).boundingBox()
await p.mouse.move(box.x + 10, box.y + box.height / 2)
await p.mouse.down()
await p.waitForTimeout(800)
await p.mouse.up()
await p.waitForTimeout(300)
is('holding a row starts select mode with it ticked', await p.isChecked('input[aria-label="Select E2E bowl A"]'), true)
await p.check('input[aria-label="Select E2E bowl B"]')
is('the bar counts both', (await bar.locator('.sb-count').textContent())?.trim(), '2 recipes selected')
is('the add button is hidden while selecting', await p.evaluate(() => document.documentElement.classList.contains('is-selecting')), true)
const barBox = await bar.boundingBox()
const navBox = await p.locator('.bottom-nav').boundingBox()
is('the bar sits above the page bar', barBox.y + barBox.height <= navBox.y + 1, true)
is('nothing runs off the side in select mode', (await overflow()).join(', '), '')

await bar.locator('button:has-text("Add to book")').click()
await p.locator('.bk-option', { hasText: 'E2E lunches' }).click()
await p.waitForTimeout(600)
is('both went into the book', (await status())?.trim(), 'Added 2 recipes to E2E lunches.')
await bar.locator('button:has-text("Done")').click()
is('Done leaves select mode', await bar.count(), 0)

// 3. The book filters the table.
await chip('E2E lunches').click()
is('the book shows its two recipes', await p.locator('.sheet tbody tr').count(), 2)
is('its chip counts them', (await chip('E2E lunches').locator('.bk-count').textContent())?.trim(), '2')

// 4. Copy the ingredients of both: summed by food, one batch each.
// On a fresh device the recipes' lines come down with the rest of the
// catalogue, after the recipes themselves: wait until all four are here.
for (let i = 0; i < 60; i++) {
  const here = await p.evaluate(async () => {
    const open = indexedDB.open('getit')
    const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
    const all = (t) => new Promise((r) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => r(q.result) })
    const ids = new Set((await all('recipe')).filter((x) => /^E2E bowl [AB]$/.test(x.name) && !x.deleted_at).map((x) => x.id))
    return (await all('recipe_line')).filter((l) => ids.has(l.recipe_id)).length
  })
  if (here >= 4) break
  await p.waitForTimeout(500)
}
await pageMenu('Select')
await bar.locator('button:has-text("Select all shown")').click()
await bar.locator('button:has-text("Copy ingredients")').click()
await p.waitForTimeout(300)
const copied = await p.evaluate(() => navigator.clipboard.readText())
is('the combined list reached the clipboard', JSON.stringify(copied), JSON.stringify('E2E oats — 150 g\nE2E milk — 400 g\nE2E honey — 10 g'))
is('and says so', (await status())?.trim(), 'Copied 3 ingredients from 2 recipes.')

// 5. Delete one own recipe, after the confirm sheet.
await bar.locator('button:has-text("Clear shown")').click()
await p.check('input[aria-label="Select E2E bowl B"]')
await bar.locator('button:has-text("Delete")').click()
is('the sheet asks first', (await p.locator('.bk-sheet h2').textContent())?.trim(), 'Delete 1 recipe?')
await p.locator('.bk-sheet button:has-text("Delete 1 recipe")').click()
await p.waitForTimeout(600)
is('the deleted recipe leaves the table', await row('E2E bowl B').count(), 0)
// Undo (v18, GEN-54) brings it back; it is then deleted again for the rest.
is('Undo is offered', ((await p.locator('.undo-bar .undo-label').textContent()) ?? '').trim(), 'Deleted 1 recipe')
await p.click('.undo-bar .undo-btn')
await row('E2E bowl B').first().waitFor({ timeout: 5000 }).catch(() => {})
is('Undo brings the recipe back', await row('E2E bowl B').count(), 1)
await p.check('input[aria-label="Select E2E bowl B"]')
await bar.locator('button:has-text("Delete")').click()
await p.locator('.bk-sheet button:has-text("Delete 1 recipe")').click()
await p.waitForTimeout(600)
await drained(p)
const [gone] = await sql(`select deleted_at is not null as gone from public.recipe where owner_id = ${user} and name = 'E2E bowl B'`)
is('it is marked deleted in Postgres', gone?.gone, true)
const [kept] = await sql(`select deleted_at is null as kept from public.recipe where owner_id = ${user} and name = 'E2E bowl A'`)
is('the other is not', kept?.kept, true)

// 6. A shared catalogue recipe cannot be deleted.
await bar.locator('button:has-text("Done")').click()
await chip('All').click()
if (shared) {
  await pageMenu('Select')
  await p.check(`input[aria-label="Select ${shared.name}"]`)
  await bar.locator('button:has-text("Delete")').click()
  is('nothing to delete', (await p.locator('.bk-sheet h2').textContent())?.trim(), 'Nothing here can be deleted')
  is('with the note', /1 shared catalogue item can't be deleted/.test((await p.locator('.bk-sheet').textContent()) ?? ''), true)
  is('and no Delete button', await p.locator('.bk-sheet .bk-danger').count(), 0)
  await p.locator('.bk-sheet button:has-text("Close")').click()
  await p.keyboard.press('Escape')
  is('Escape leaves select mode', await bar.count(), 0)
  const [still] = await sql(`select deleted_at is null as ok from public.recipe where id = '${shared.id}'`)
  is('the catalogue recipe is untouched', still?.ok, true)
} else {
  is('a catalogue recipe to try', 'none', 'one')
}

// 7. The book reached profile.settings.
await drained(p)
const [books] = await sql(`select settings->'books' as books from public.profile where id = ${me}`)
const book = (books?.books ?? []).find((x) => x.name === 'E2E lunches')
is('the book is in profile.settings', book ? `${book.kind} ${book.colour}` : 'missing', 'recipe #1e8347')

await sql(reset)
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
