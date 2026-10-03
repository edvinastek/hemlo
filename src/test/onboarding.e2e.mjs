import { need, sql, checks, open, profileOf, today, drained, APP } from './e2e.mjs'

// The first-run wizard as a planner, not a body tracker: a name, where you
// are, work hours with a commute, a template suggested from a few words, and
// no body targets. Then work hours changed and turned off again from More.
//
// Needs TEST_ONBOARD_EMAIL (a new account, never signed in), TEST_PASSWORD and
// SB. Every query is scoped to that account, because this runs against the
// live project.
need('TEST_ONBOARD_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_ONBOARD_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const { is, failed } = checks()
const day = today()
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv')
const one = async (query) => (await sql(query))[0] ?? {}

const { b, p, errors } = await open()
await p.goto(APP, { waitUntil: 'networkidle' })
await p.fill('input[type=email]', email)
await p.fill('input[type=password]', process.env.TEST_PASSWORD)
await p.click('button[type=submit]')

// 1. Who is planning: only the name is needed.
await p.getByText('Step 1 of 4').waitFor({ timeout: 20000 })
const next = p.locator('.ob-actions button:has-text("Next")')
await p.locator('.ob-field', { hasText: 'Name' }).locator('input').fill('')
is('no name, no next step', await next.isDisabled(), true)
await p.locator('.ob-field', { hasText: 'Name' }).locator('input').fill('Robin')
const country = p.locator('.ob-field', { hasText: 'Country' }).locator('input')
await country.fill('nether')
is('the country list filters as you type', await p.locator('.sp-list li').first().innerText().then((t) => t.startsWith('Netherlands')), true)
await country.press('Enter')
is('the chosen country shows in the field', await country.getAttribute('placeholder'), 'Netherlands')
await p.locator('.ob-field', { hasText: 'City' }).locator('input').fill('Reuver')
await next.click()

// 2. Your day: nothing is assumed until the box is ticked.
await p.getByText('Step 2 of 4').waitFor()
is('no work hours unless ticked', await p.locator('.wf-grid').count(), 0)
await p.locator('.wf-check', { hasText: 'I have work or school hours' }).locator('input').check()
is('Mon to Fri are picked to start with', await p.locator('.wf-day[aria-pressed="true"]').allInnerTexts().then((d) => d.join(' ')), 'Mon Tue Wed Thu Fri')
is('hours are not locked to start with', await p.locator('.wf-check', { hasText: 'Keep these hours free' }).locator('input').isChecked(), false)
await p.locator('.wf-grid label', { hasText: 'Start' }).locator('input').fill('08:00')
await p.locator('.wf-grid label', { hasText: 'End' }).locator('input').fill('16:30')
await p.locator('.wf-day', { hasText: 'Fri' }).click()
is('8 h 30 min is worked out', await p.locator('.wf-note').innerText(), '8 h 30 min.')
await p.locator('.wf-check', { hasText: 'Keep these hours free' }).locator('input').check()
await p.locator('.wf-check', { hasText: 'Plan my commute too' }).locator('input').check()
await p.locator('.wf-grid label', { hasText: 'Before' }).locator('input').fill('25')
await p.locator('.wf-grid label', { hasText: 'After' }).locator('input').fill('35')
await p.locator('.wf-grid label', { hasText: 'One way' }).locator('input').fill('12,5')
await next.click()

// 3. Start from: a few words suggest a template; a card tapped by hand wins.
await p.getByText('Step 3 of 4').waitFor()
is('the minimal planner is chosen to start with', await p.locator('.ob-card[aria-checked="true"]').innerText().then((t) => t.startsWith('Minimal planner')), true)
await p.locator('.ob-field', { hasText: 'Describe your days' }).locator('input').fill('student with exams and lectures')
is('the words suggest Student', await p.locator('.ob-card.is-suggested').innerText().then((t) => t.startsWith('Student')), true)
is('and choose it while nothing was tapped', await p.locator('.ob-card[aria-checked="true"]').innerText().then((t) => t.startsWith('Student')), true)
await p.locator('.ob-card', { hasText: 'Office worker' }).click()
await p.locator('.ob-field', { hasText: 'Describe your days' }).locator('input').fill('student with exams, lectures and a thesis')
is('after a tap the pick stands', await p.locator('.ob-card[aria-checked="true"]').innerText().then((t) => t.startsWith('Office worker')), true)
await p.click('.ob-expander')
is('the module list follows the template', await p.locator('button[role=switch][aria-label="Projects"]').getAttribute('aria-checked'), 'true')
await p.click('button[role=switch][aria-label="Sleep"]')
await next.click()

// 4. Body targets: off for a template that is not about the body.
await p.getByText('Step 4 of 4').waitFor()
is('targets are off for an office worker', await p.locator('button[role=switch][aria-label="Set calorie and body targets"]').getAttribute('aria-checked'), 'false')
is('no body fields while off', await p.locator('.ob-field', { hasText: 'Height' }).count(), 0)
await p.click('button[role=switch][aria-label="Set calorie and body targets"]')
// Activity: two questions lead to a preset (BODY-10 to BODY-16).
is('a desk job is the starting factor, never 1.2', (await p.locator('.ap-factor').textContent())?.trim(), '1.4')
await p.locator('.ap-option[role=radio]', { hasText: 'Mostly sitting' }).click()
await p.locator('.ap-option[role=radio]', { hasText: '3–4 times a week' }).click()
is('a desk job and 3–4 workouts is 1.6', (await p.locator('.ap-factor').textContent())?.trim(), '1.6')
is('with its example day', /Desk job and 2–3 workouts a week/.test((await p.locator('.ap-result').textContent()) ?? ''), true)
await p.locator('.ap-option[role=radio]', { hasText: 'Logged separately and added' }).click()
is('training added: the factor is for the work alone', (await p.locator('.ap-factor').textContent())?.trim(), '1.4')
await p.locator('.ap-more summary').click()
const levels = await p.locator('.ap-preset').allInnerTexts()
is('nine levels to pick from, each with its number', levels.length === 9 && levels.every((l) => /^\d\.\d+/.test(l)), true)
await p.locator('.ap-typed input').fill('1.1')
await p.locator('.ap-typed button:has-text("Use")').click()
is('a factor below 1.2 is refused', await p.locator('.ap-typed + .ap-warn, .ap-more .ap-warn[role=alert]').count() > 0, true)
is('no targets without sex, height, date of birth and weight', /Still needed for the targets: sex, height, date of birth, weight today/.test(
  (await p.locator('.ob-form').textContent()) ?? ''), true)
// Changed their mind: nothing about the body is to be saved.
await p.click('button[role=switch][aria-label="Set calorie and body targets"]')
await p.click('.ob-actions button:has-text("Start planning")')
await p.waitForSelector('.bottom-nav', { timeout: 20000 })
await p.waitForTimeout(1500)
await drained(p)

// The answers are saved as the app opens; give the send a moment to start.
let r = {}
for (let i = 0; i < 40; i++) {
  r = await one(`select name, country, city, height_cm, settings from public.profile where id = ${profileOf(email)}`)
  if (r.settings?.onboarded) break
  await p.waitForTimeout(500)
  await drained(p)
}
is('name saved', r.name, 'Robin')
is('country saved as its code', r.country, 'NL')
is('city saved', r.city, 'Reuver')
is('onboarded', r.settings?.onboarded, true)
is('template kept', r.settings?.template, 'office')
is('work hours saved, Mon to Thu, locked', JSON.stringify([r.settings?.work?.on, r.settings?.work?.start, r.settings?.work?.end, r.settings?.work?.days, r.settings?.work?.locked]),
  JSON.stringify([true, '08:00', '16:30', [1, 2, 3, 4], true]))
is('commute saved, with the comma read as a decimal point', JSON.stringify([r.settings?.commute?.on, r.settings?.commute?.before_min, r.settings?.commute?.after_min, r.settings?.commute?.km]),
  JSON.stringify([true, 25, 35, 12.5]))
is('an office worker’s Today shows no calorie figure', r.settings?.today_metric, 'none')
is('no height saved', r.height_cm, null)
r = await one(`select
  (select count(*) from public.target where ${mine}) targets,
  (select count(*) from public.body_log where ${mine}) weighins,
  (select string_agg(module_key, ',' order by module_key) from public.module_instance where ${mine} and enabled and module_key <> 'core') modules`)
is('no targets saved', r.targets, 0)
is('no weigh-in saved', r.weighins, 0)
is('modules from the template, Sleep added by hand', r.modules, 'agenda,projects,shopping,sleep,habits'.split(',').sort().join(','))

const series = await sql(`select title, time_of_day::text t, start_date::text s, end_date::text e, rule_config, task_template
  from public.series where ${mine} and deleted_at is null order by time_of_day`)
is('three series: commute, work, commute', series.map((s) => s.title).join(', '), 'Commute, Work, Commute')
is('commute there ends when work starts', `${series[0]?.t} ${series[0]?.task_template?.duration_min}`, '07:35:00 25')
is('work 08:00 for 510 minutes, locked', `${series[1]?.t} ${series[1]?.task_template?.duration_min} ${series[1]?.task_template?.locked}`, '08:00:00 510 true')
is('commute home at 16:30 with the distance', `${series[2]?.t} ${series[2]?.task_template?.notes}`, '16:30:00 12.5 km each way')
is('on the days chosen', JSON.stringify(series[1]?.rule_config?.weekdays), JSON.stringify([1, 2, 3, 4]))
is('each marked as the app’s own', series.map((s) => s.task_template?.managed).join(','), 'work:commute-to,work:hours,work:commute-from')
r = await one(`select count(*) n from public.task where ${mine} and title = 'Work' and deleted_at is null and planned_date >= '${day}'`)
is('work laid out on the weeks ahead', Number(r.n) >= 30, true)

// More → Profile: later hours replace the series from tomorrow.
await p.click('.bottom-nav a[href="/more"]')
await p.click('.tabs button:has-text("Profile")')
is('where you are shows the country', await p.locator('.pl-field', { hasText: 'Country' }).locator('input').getAttribute('placeholder'), 'Netherlands')
await p.locator('.wf-grid label', { hasText: 'End' }).locator('input').fill('17:00')
await p.click('button:has-text("Save work hours")')
await p.getByText('The new hours start tomorrow').waitFor()
await p.waitForTimeout(1000)
await drained(p)
const after = await sql(`select title, end_date::text e, start_date::text s, task_template from public.series where ${mine} and title = 'Work' and deleted_at is null order by start_date`)
is('the old work series ends today', after[0]?.e, day)
is('the new one starts tomorrow and runs 9 hours', `${after[1]?.s} ${after[1]?.task_template?.duration_min}`, `${tomorrow} 540`)
r = await one(`select count(*) n from public.task t join public.series s on s.id = t.series_id
  where t.${mine} and s.title = 'Work' and t.planned_date = '${tomorrow}' and t.deleted_at is null`)
is('tomorrow has one Work, not two', Number(r.n) <= 1, true)

// And off again: nothing added after today.
await p.locator('.wf-check', { hasText: 'I have work or school hours' }).locator('input').uncheck()
await p.click('button:has-text("Save work hours")')
await p.getByText('no longer added').waitFor()
await p.waitForTimeout(1000)
await drained(p)
r = await one(`select count(*) n from public.series where ${mine} and deleted_at is null and (end_date is null or end_date > '${day}')`)
is('no work or commute series running after today', r.n, 0)
r = await one(`select count(*) n from public.task where ${mine} and planned_date > '${day}' and deleted_at is null and title in ('Work', 'Commute')`)
is('and no work or commute tasks after today', r.n, 0)

is('no page errors', errors.join(' | '), '')
await b.close()
process.exit(failed() ? 1 : 0)
