import { need, open, signIn, sql, profileOf, today, checks, drained } from './e2e.mjs'

// Today's tabs follow the day, and module colours. At 360 px, light theme.
// A Minimal planner shows no tab row; turning Habits on and having a habit
// due brings a Habits tab; a day without work has no Work tab and a chosen
// tab falls back to Today; colours on and off change the rail's marker; a
// colour chosen in More reaches profile.settings in Postgres.
// Needs TEST_EMAIL, TEST_PASSWORD and SB.
need('TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_EMAIL
const me = profileOf(email)
const { is, failed } = checks()
const day = today()
const weekdayToday = new Date().getDay()

// Only Agenda on (the Minimal planner), no habits, nothing planned or logged
// today, work off, colours on with no choices, and nothing left to review.
const reset = `
  update public.module_instance set enabled = (module_key = 'agenda') where profile_id = ${me};
  update public.habit set active = false, deleted_at = now() where profile_id = ${me} and deleted_at is null;
  update public.task set deleted_at = now() where profile_id = ${me} and deleted_at is null;
  delete from public.body_log where profile_id = ${me} and log_date = '${day}';
  update public.profile set settings = coalesce(settings, '{}'::jsonb)
    || jsonb_build_object('work', jsonb_build_object('on', false, 'start', '09:00', 'end', '17:00', 'locked', false, 'days', jsonb_build_array(1,2,3,4,5)))
    || jsonb_build_object('colours', jsonb_build_object('on', true, 'modules', '{}'::jsonb))
    where id = ${me};`
await sql(reset)

const { b, p, errors } = await open({ viewport: { width: 360, height: 740 }, colorScheme: 'light' })
await signIn(p, email)

const go = async (href) => { await p.click(`.bottom-nav a[href="${href}"]`); await p.waitForTimeout(1200) }
const tabs = async () => (await p.locator('.page-head [role=tab]').allTextContents()).map((s) => s.trim())
const selected = async () => (await p.locator('.page-head [role=tab][aria-selected=true]').textContent().catch(() => null))?.trim() ?? null
const reload = async () => { await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.bottom-nav', { timeout: 20000 }); await p.waitForTimeout(3000) }
const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.sheet-wrap, .week-strip, .tabs, table'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})

// 1. A Minimal planner with an empty day: no tab row at all.
await go('/')
is('a Minimal planner shows no tab row', (await tabs()).length, 0)
is('and the row itself is not drawn', await p.locator('.page-head .tabs').isVisible(), false)

// 2. Habits on, but no habit yet: still nothing to show.
await go('/more')
await p.click('[role=tab]:has-text("Modules")')
await p.click('button[role=switch][aria-label="Turn Habits on"]')
await p.waitForTimeout(900)
await go('/')
is('habits on with no habit: still no tab row', (await tabs()).length, 0)

// 3. A daily habit (added on another device) makes a Habits tab.
await drained(p)
await sql(`insert into public.habit (profile_id, name, schedule, active, sort_order)
  values (${me}, 'Stretch', 'daily', true, 0)`)
await reload()
is('a habit due today brings the Habits tab', (await tabs()).join(','), 'Today,Habits')
await p.click('[role=tab]:has-text("Habits")')
await p.locator('.page', { hasText: 'Stretch' }).first().waitFor({ timeout: 8000 }).catch(() => undefined)
is('the Habits tab lists it', await p.locator('.page', { hasText: 'Stretch' }).count() > 0, true)

// 4. Work only on today's weekday: Work today, none on another day, and a
//    chosen Work tab falls back to Today there.
await sql(`update public.profile set settings = jsonb_set(settings, '{work}',
  jsonb_build_object('on', true, 'start', '09:00', 'end', '17:00', 'locked', false, 'days', jsonb_build_array(${weekdayToday})))
  where id = ${me}`)
await reload()
is('a work day has a Work tab', (await tabs()).includes('Work'), true)
await p.click('[role=tab]:has-text("Work")')
is('Work is chosen', await selected(), 'Work')
const other = p.locator('.week-strip button:not([aria-current="date"])').first()
await other.click()
await p.waitForTimeout(1200)
is('a day without work shows no Work tab', (await tabs()).includes('Work'), false)
is('and the chosen tab falls back to Today', await selected(), 'Today')
await p.locator('.week-strip button.today').click()
await p.waitForTimeout(1200)
is('back on today, Today stays chosen', await selected(), 'Today')

// 5. Colours: a Work task carries the Work colour on the rail; off removes it.
await sql(`insert into public.task (profile_id, title, planned_date, planned_time, category)
  values (${me}, 'Colour probe', '${day}', '10:00', 'Work')`)
await reload()
const probe = p.locator('.row', { hasText: 'Colour probe' })
is('with colours on the row has a marker', await probe.evaluate((el) => el.classList.contains('has-mod')), true)
is('in the Work colour', await probe.evaluate((el) => el.style.getPropertyValue('--row-mod')), '#0a7ca6')
is('nothing runs off a 360 px screen on Today', (await overflow()).join(', '), '')

await go('/more')
await p.click('[role=tab]:has-text("Profile")')
await p.click('button[role=switch][aria-label="Colour by module"]')
await p.waitForTimeout(900)
await go('/')
is('with colours off the marker goes', await probe.evaluate((el) => el.classList.contains('has-mod')), false)

// 6. Colours back on, and Work changed to Brick in More → Profile.
await go('/more')
await p.click('[role=tab]:has-text("Profile")')
await p.click('button[role=switch][aria-label="Colour by module"]')
await p.locator('.cs-head[aria-label^="Work:"]').click()
is('the palette opens with 16 swatches', await p.locator('.cs-grid .cs-pick').count(), 16)
is('nothing runs off a 360 px screen with the palette open', (await overflow()).join(', '), '')
await p.click('.cs-grid .cs-pick[aria-label="Brick"]')
await p.waitForTimeout(900)
is('the row shows the new colour', (await p.locator('.cs-head[aria-label^="Work:"] .row-meta').textContent())?.trim(), 'Brick')
await go('/')
is('the rail follows', await probe.evaluate((el) => el.style.getPropertyValue('--row-mod')), '#c43f3e')

await drained(p)
const [row] = await sql(`select settings->'colours'->>'on' as on, settings->'colours'->'modules'->>'work' as work
  from public.profile where id = ${me}`)
is('the colour reached profile.settings', row ? `${row.on} ${row.work}` : 'missing', 'true #c43f3e')

// 7. Reset in More puts the default back, in Postgres too.
await go('/more')
await p.click('[role=tab]:has-text("Profile")')
await p.locator('.cs-head[aria-label^="Work:"]').click()
await p.click('.cs-custom button:has-text("Reset")')
await p.waitForTimeout(900)
await drained(p)
const [after] = await sql(`select settings->'colours'->'modules' ? 'work' as has from public.profile where id = ${me}`)
is('reset removes the choice', after?.has, false)

is('no page errors', errors.join(' | '), '')
await b.close()

// Leave the account as the other checks expect it.
await sql(reset)
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
process.exit(failed() ? 1 : 0)
