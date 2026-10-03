import { need, open, signIn, sql, profileOf, today, checks, drained, modulesOn, toPage } from './e2e.mjs'

// The Stats page at 360 px, light and dark. Stats and Habits on, Sleep off;
// a done task and a habit tick today show on the Day tab; the arrows stop
// three years back; the "Show switched-off modules" tick brings Sleep's card
// and reaches profile.settings in Postgres; nothing runs off the side.
// The builder (v16): a new view of tasks done is saved, reaches
// profile.settings.stats_views, pins to Today (today_cards), opens at
// /stats?view=<id>, shows as a table, and is deleted with Undo bringing it back.
// Needs TEST_EMAIL, TEST_PASSWORD and SB.
need('TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_EMAIL
const me = profileOf(email)
const { is, failed } = checks()
const day = today()

await sql(`
  update public.task set deleted_at = now() where profile_id = ${me} and deleted_at is null;
  update public.habit set active = false, deleted_at = now() where profile_id = ${me} and deleted_at is null;
  update public.profile set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('stats', jsonb_build_object('show_disabled', false), 'stats_views', '[]'::jsonb, 'today_cards', '[]'::jsonb)
    where id = ${me};`)
await modulesOn(email, ['agenda', 'habits', 'stats'], { only: true })
await sql(`
  insert into public.task (profile_id, title, planned_date, status, duration_min) values
    (${me}, 'Stats probe done', '${day}', 'done', 25), (${me}, 'Stats probe open', '${day}', 'todo', 15);
  with h as (insert into public.habit (profile_id, name, schedule, active, sort_order)
    values (${me}, 'Stats stretch', 'daily', true, 0) returning id)
  insert into public.habit_log (habit_id, log_date, done) select id, '${day}', true from h;`)

const overflow = (p) => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.tabs'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})
const card = (p, name) => p.locator('.st-card', { has: p.locator('h3', { hasText: name }) })
// v17: a card shows one figure; a tap on it shows the others.
const figure = async (p, cardName, label) => {
  const btn = card(p, cardName).locator('.st-figures-btn')
  if ((await btn.getAttribute('aria-expanded')) === 'false') await btn.click()
  // A figure keeps its number and unit together with a no-break space.
  return (await card(p, cardName).locator('.st-figure', { has: p.locator('.st-figure-k', { hasText: label }) }).locator('.st-value').first().textContent())?.replace(/\s+/g, ' ').trim()
}

for (const colorScheme of ['light', 'dark']) {
  const { b, p, errors } = await open({ viewport: { width: 360, height: 740 }, colorScheme })
  await signIn(p, email)
  // v17 (CALM-04): with more than five pages the bar is Today, Plan, two
  // pins and Modules; Stats is then on the Modules page.
  let stats = await p.locator('.bottom-nav a[href="/m/stats"]').count() > 0
  if (!stats) {
    await toPage(p, '/modules')
    stats = await p.locator('.hub-open', { hasText: 'Stats' }).first().waitFor({ timeout: 10000 }).then(() => true, () => false)
  }
  is(`${colorScheme}: Stats is on the page bar or the Modules page`, stats, true)
  await p.goto(new URL('/m/stats', p.url()).toString(), { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('.st-card', { timeout: 20000 })

  await p.click('.st-periods [role=tab]:has-text("Day")')
  // Habit ticks come down after the habits themselves; wait for them.
  for (let i = 0; i < 40 && (await figure(p, 'Habits', 'Habit ticks').catch(() => '0')) === '0'; i++) await p.waitForTimeout(500)
  is(`${colorScheme}: tasks done today`, await figure(p, 'Tasks', 'Tasks done'), '1')
  is(`${colorScheme}: tasks planned today`, await figure(p, 'Tasks', 'Tasks planned'), '2')
  is(`${colorScheme}: half of them completed`, await figure(p, 'Tasks', 'Tasks completed'), '50%')
  is(`${colorScheme}: minutes done`, await figure(p, 'Tasks', 'Minutes done'), '25 min')
  is(`${colorScheme}: the habit tick`, await figure(p, 'Habits', 'Habit ticks'), '1')
  is(`${colorScheme}: Sleep is off, so no card`, await card(p, 'Sleep').count(), 0)

  for (const tab of ['Week', 'Month', 'Year']) {
    await p.click(`.st-periods [role=tab]:has-text("${tab}")`)
    await p.waitForTimeout(1000)
    is(`${colorScheme} ${tab}: a chart on the Tasks card`, await card(p, 'Tasks').locator('svg.ch-svg path').count() > 0, true)
    is(`${colorScheme} ${tab}: nothing runs off a 360 px screen`, (await overflow(p)).join(', '), '')
  }

  // Year: three steps back reach the far end, and the arrow stops there.
  const back = p.locator('.st-nav button[aria-label="Previous year"]')
  for (let i = 0; i < 3; i++) { if (await back.isEnabled()) await back.click() }
  is(`${colorScheme}: the arrows stop three years back`, await back.isDisabled(), true)
  await p.click('.st-nav button:has-text("Today")')

  if (colorScheme === 'light') {
    // v17: the switch is under the page's ⋮.
    await p.locator('.page-menu .pm-button').click()
    await p.getByRole('menuitem', { name: 'Show switched-off modules' }).click()
    await p.waitForTimeout(1200)
    is('the tick brings the switched-off Sleep card', await card(p, 'Sleep').count(), 1)
    is('marked as switched off', await card(p, 'Sleep').locator('.chip', { hasText: 'switched off' }).count(), 1)
    await drained(p)
    const [row] = await sql(`select settings->'stats'->>'show_disabled' as v from public.profile where id = ${me}`)
    is('the tick reached profile.settings', row?.v, 'true')
    await p.locator('.page-menu .pm-button').click()
    await p.getByRole('menuitem', { name: 'Hide switched-off modules' }).click()
    await p.waitForTimeout(900)
    await drained(p)

    // Every measure a module keeps, one tap away.
    await card(p, 'Tasks').getByRole('button', { name: 'More for Tasks' }).click()
    await p.getByRole('menuitem', { name: /^Every measure/ }).click()
    is('the Tasks card lists every measure', await card(p, 'Tasks').locator('.st-measures li').count() >= 6, true)

    // The builder: one screen, a measure, saved as a view.
    await p.click('.st-empty-views button:has-text("Build a view")')
    await p.fill('.sb-search', 'tasks done')
    await p.locator('.sb-pick', { hasText: 'Tasks done' }).first().click()
    await p.waitForSelector('.sb-preview svg, .sb-preview .ch-number', { timeout: 15000 })
    is('the builder fits 360 px', (await overflow(p)).join(', '), '')
    await p.locator('.sb-check', { hasText: 'As a card on Today' }).locator('input').check()
    await p.click('.sb-foot button:has-text("Save as a view")')
    await p.waitForSelector('article.sv', { timeout: 15000 })
    await drained(p)
    const [saved] = await sql(`select settings->'stats_views'->0->>'id' as id, settings->'stats_views'->0->>'name' as name,
      settings->'today_cards'->0->>'key' as card from public.profile where id = ${me}`)
    is('the view reached profile.settings', saved?.name, 'Tasks done')
    is('and its card is on Today', saved?.card, saved?.id)
    await p.goto(new URL(`/stats?view=${saved?.id}`, p.url()).toString(), { waitUntil: 'domcontentloaded' })
    await p.waitForSelector(`#view-${saved?.id}`, { timeout: 20000 })
    is('/stats?view=<id> opens the Stats page at the view', new URL(p.url()).pathname, '/m/stats')
    await p.locator(`#view-${saved?.id} .sv-toggle`).click()
    is('the view shows as a table', await p.locator(`#view-${saved?.id} .pt-table`).count(), 1)
    await p.locator(`#view-${saved?.id} .mm-button`).click()
    await p.click('.mm-list button:has-text("Delete")')
    await p.waitForTimeout(600)
    is('deleted', await p.locator(`#view-${saved?.id}`).count(), 0)
    await p.click('.undo-bar .undo-btn')
    await p.waitForSelector(`#view-${saved?.id}`, { timeout: 10000 })
    is('Undo brings it back', await p.locator(`#view-${saved?.id}`).count(), 1)
  }
  is(`${colorScheme}: no page errors`, errors.join(' | '), '')
  await b.close()
}

await sql(`update public.task set deleted_at = now() where profile_id = ${me} and title like 'Stats probe%';
  update public.habit set active = false, deleted_at = now() where profile_id = ${me} and name = 'Stats stretch';`)
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
process.exit(failed() ? 1 : 0)
