import { need, open, signIn, sql, profileOf, today, checks, drained, modulesOn } from './e2e.mjs'

// The Stats page at 360 px, light and dark. Stats and Habits on, Sleep off;
// a done task and a habit tick today show on the Day tab; the arrows stop
// three years back; the "Show switched-off modules" tick brings Sleep's card
// and reaches profile.settings in Postgres; nothing runs off the side.
// Needs TEST_EMAIL, TEST_PASSWORD and SB.
need('TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_EMAIL
const me = profileOf(email)
const { is, failed } = checks()
const day = today()

await sql(`
  update public.task set deleted_at = now() where profile_id = ${me} and deleted_at is null;
  update public.habit set active = false, deleted_at = now() where profile_id = ${me} and deleted_at is null;
  update public.profile set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('stats', jsonb_build_object('show_disabled', false))
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
const figure = async (p, cardName, label) =>
  (await card(p, cardName).locator('.st-figure', { has: p.locator('dt', { hasText: label }) }).locator('.st-value').first().textContent())?.trim()

for (const colorScheme of ['light', 'dark']) {
  const { b, p, errors } = await open({ viewport: { width: 360, height: 740 }, colorScheme })
  await signIn(p, email)
  is(`${colorScheme}: Stats is on the page bar`, await p.locator('.bottom-nav a[href="/m/stats"]').count() > 0, true)
  await p.goto(new URL('/m/stats', p.url()).toString(), { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('.st-card', { timeout: 20000 })

  await p.click('.st-periods [role=tab]:has-text("Day")')
  // Habit ticks come down after the habits themselves; wait for them.
  for (let i = 0; i < 40 && (await figure(p, 'Habits', 'Ticks').catch(() => '0')) === '0'; i++) await p.waitForTimeout(500)
  is(`${colorScheme}: tasks done today`, await figure(p, 'Tasks', 'Done'), '1')
  is(`${colorScheme}: tasks planned today`, await figure(p, 'Tasks', 'Planned'), '2')
  is(`${colorScheme}: half of them completed`, await figure(p, 'Tasks', 'Completed'), '50%')
  is(`${colorScheme}: minutes done`, await figure(p, 'Tasks', 'Minutes done'), '25 min')
  is(`${colorScheme}: the habit tick`, await figure(p, 'Habits', 'Ticks'), '1')
  is(`${colorScheme}: Sleep is off, so no card`, await card(p, 'Sleep').count(), 0)

  for (const tab of ['Week', 'Month', 'Year']) {
    await p.click(`.st-periods [role=tab]:has-text("${tab}")`)
    await p.waitForTimeout(1000)
    is(`${colorScheme} ${tab}: a chart on the Tasks card`, await card(p, 'Tasks').locator('.st-bars .st-col').count() > 0, true)
    is(`${colorScheme} ${tab}: nothing runs off a 360 px screen`, (await overflow(p)).join(', '), '')
  }

  // Year: three steps back reach the far end, and the arrow stops there.
  const back = p.locator('.st-nav button[aria-label="Previous year"]')
  for (let i = 0; i < 3; i++) { if (await back.isEnabled()) await back.click() }
  is(`${colorScheme}: the arrows stop three years back`, await back.isDisabled(), true)
  await p.click('.st-nav button:has-text("Today")')

  if (colorScheme === 'light') {
    await p.locator('.st-check input').check()
    await p.waitForTimeout(1200)
    is('the tick brings the switched-off Sleep card', await card(p, 'Sleep').count(), 1)
    is('marked as switched off', await card(p, 'Sleep').locator('.chip', { hasText: 'switched off' }).count(), 1)
    await drained(p)
    const [row] = await sql(`select settings->'stats'->>'show_disabled' as v from public.profile where id = ${me}`)
    is('the tick reached profile.settings', row?.v, 'true')
    await p.locator('.st-check input').uncheck()
    await p.waitForTimeout(900)
    await drained(p)
  }
  is(`${colorScheme}: no page errors`, errors.join(' | '), '')
  await b.close()
}

await sql(`update public.task set deleted_at = now() where profile_id = ${me} and title like 'Stats probe%';
  update public.habit set active = false, deleted_at = now() where profile_id = ${me} and name = 'Stats stretch';`)
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
process.exit(failed() ? 1 : 0)
