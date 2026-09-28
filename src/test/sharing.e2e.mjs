import { need, open, signIn, sql, checks, drained, modulesOn, localCount } from './e2e.mjs'

// A recipe proposed to everyone, end to end, at 360 px. The author (the NEW
// account) writes one in the recipe editor and proposes it; the other account
// cannot read it; that account is then made a reviewer for this run, finds it
// in More → Data → Recipes to review (never among its own recipes) and
// approves it; now it can read it, and the author sees "Shared with
// everyone". Needs TEST_FEAT_EMAIL, TEST_ONBOARD_EMAIL, TEST_PASSWORD and SB
// (migration 019 applied). The reviewer row and the recipe are removed at
// the end, whatever happens.
need('TEST_FEAT_EMAIL', 'TEST_ONBOARD_EMAIL', 'TEST_PASSWORD', 'SB')
const author = process.env.TEST_ONBOARD_EMAIL
const reviewer = process.env.TEST_FEAT_EMAIL
const name = `e2e shared rice ${Date.now()}`
const uid = (email) => `(select id from auth.users where email = '${email}')`
const { is, failed } = checks()

/** What the other account can read, asked as that account (row-level
 *  security applies), not as the SQL user. */
// The same shape as supabase/tests/security.sql: a transaction that ends in a
// rollback, its last select being the answer.
const readsAs = async (email) => (await sql(`
  begin;
  select set_config('request.jwt.claims', json_build_object('sub', ${uid(email)}, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*)::int as n from public.recipe where name = '${name}';
  rollback;
`))?.[0]?.n ?? null
const sharingOf = async () => (await sql(`select sharing from public.recipe where name = '${name}'`))?.[0]?.sharing ?? 'none'

await sql(`delete from public.app_admin where user_id = ${uid(reviewer)}`)
await modulesOn(author, ['nutrition'])
await modulesOn(reviewer, ['nutrition'])

const one = await open({ viewport: { width: 360, height: 740 } })
const two = await open({ viewport: { width: 360, height: 740 } })
const errors = () => [...one.errors, ...two.errors]
const overflow = (p) => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *, .bottom-sheet *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.sheet-wrap, table'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})
const recipesTab = async (p) => {
  await p.click('.bottom-nav a[href="/food"]'); await p.waitForTimeout(800)
  await p.click('.tabs button:has-text("Recipes")'); await p.waitForTimeout(1200)
}
const localRecipe = (p) => p.evaluate(async (n) => {
  const req = indexedDB.open('getit')
  const db = await new Promise((r) => { req.onsuccess = () => r(req.result) })
  const rows = await new Promise((r) => { const q = db.transaction('recipe').objectStore('recipe').getAll(); q.onsuccess = () => r(q.result) })
  return rows.filter((x) => x.name === n).length
}, name)

try {
  // 1. The author writes a recipe and proposes it.
  await signIn(one.p, author)
  await recipesTab(one.p)
  await one.p.getByRole('button', { name: 'New recipe' }).click()
  const sheet = one.p.locator('.bottom-sheet')
  await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await sheet.locator('input[aria-label="Add an ingredient"]').fill('Brown Rice')
  await one.p.locator('.sp-list li[role=option]', { hasText: 'Brown Rice' }).first().click()
  await sheet.locator('input[aria-label="Brown Rice, grams per portion"]').fill('75')
  is('"Only me" is the default', await sheet.locator('input[name=sharing][value=private]').isChecked(), true)
  await sheet.locator('.sh-option', { hasText: 'Propose to everyone' }).click()
  is('it says what saving does', await sheet.locator('.sh-effect').textContent(),
    'Saving sends it for review. No one else sees it until it is approved.')
  is('the editor fits 360 px', JSON.stringify(await overflow(one.p)), '[]')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await one.p.waitForTimeout(800)
  is('the author sees it waiting', await one.p.locator('.my-recipes .setting-row', { hasText: name }).locator('.sh-chip').textContent(),
    'Waiting for review')
  is('it reached the server', await drained(one.p), true)
  is('Postgres holds it as proposed', await sharingOf(), 'proposed')

  // 2. The other account, not a reviewer yet, cannot read it.
  is('the other account cannot read a proposal', await readsAs(reviewer), 0)

  // 3. Made a reviewer: the proposal is in the review queue, not in its recipes.
  await sql(`insert into public.app_admin (user_id) select ${uid(reviewer)} on conflict do nothing`)
  is('a reviewer can read it on the server', await readsAs(reviewer), 1)
  await signIn(two.p, reviewer)
  await recipesTab(two.p)
  is('it is not among the reviewer’s recipes', await localRecipe(two.p), 0)
  await two.p.click('.bottom-nav a[href="/more"]'); await two.p.waitForTimeout(600)
  await two.p.locator('.page [role=tab]', { hasText: 'Data' }).click()
  await two.p.getByText(/^Recipes to review \(\d+\)$/).waitFor({ timeout: 10000 })
  const card = two.p.locator('.rv-card', { hasText: name })
  is('the queue shows it', await card.count(), 1)
  await card.locator('.rv-lines', { hasText: 'Brown Rice' }).waitFor({ timeout: 15000 }).catch(() => {})
  is('with its ingredient and grams', (await card.locator('.rv-lines').textContent()).includes('Brown Rice · 75 g'), true)
  is('never with an email address', (await card.textContent()).includes('@'), false)
  is('the queue fits 360 px', JSON.stringify(await overflow(two.p)), '[]')
  await card.locator('.rv-note').fill('Thanks, looks good')
  await card.getByRole('button', { name: 'Approve' }).click()
  await card.waitFor({ state: 'detached', timeout: 10000 })
  is('Postgres holds it as shared', await sharingOf(), 'public')

  // 4. Now everyone signed in can read it: the reviewer's copy gets it too.
  await sql(`delete from public.app_admin where user_id = ${uid(reviewer)}`)
  is('the other account reads it once approved', await readsAs(reviewer), 1)
  await two.p.reload({ waitUntil: 'domcontentloaded' }); await two.p.waitForTimeout(4000)
  await recipesTab(two.p)
  for (let i = 0; i < 40 && (await localRecipe(two.p)) === 0; i++) await two.p.waitForTimeout(500)
  is('it arrives in the other account’s recipes', await localRecipe(two.p), 1)
  is('the review section is gone for a non-reviewer', await two.p.getByText(/^Recipes to review/).count(), 0)

  // 5. The author sees it shared.
  await one.p.reload({ waitUntil: 'domcontentloaded' }); await one.p.waitForTimeout(4000)
  await recipesTab(one.p)
  await one.p.locator('.my-recipes .setting-row', { hasText: name }).locator('.sh-chip', { hasText: 'Shared with everyone' })
    .waitFor({ timeout: 20000 }).catch(() => {})
  is('the author sees it shared', await one.p.locator('.my-recipes .setting-row', { hasText: name }).locator('.sh-chip').textContent(),
    'Shared with everyone')
  is('the author still has one copy', await localRecipe(one.p), 1)
  is('nothing left waiting to send', await localCount(one.p, 'pending'), 0)
} finally {
  await sql(`delete from public.app_admin where user_id = ${uid(reviewer)};
    delete from public.recipe where name = '${name}' and owner_id = ${uid(author)};`)
  await one.b.close()
  await two.b.close()
}

console.log(errors().length ? 'PAGE ERRORS: ' + errors().join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} failed` : '\nall checks passed')
process.exit(failed() || errors().length ? 1 : 0)
