import { need, sql, checks, open, signIn, profileOf, drained, today } from './e2e.mjs'

// Repeating on days picked by hand, and the scrolling month calendar: a task
// set to repeat on three picked days (one of them months ahead, past the eight
// weeks the series fills with real tasks), what reaches Postgres, the planned
// repeat on Plan's Year and Week, "every few days", and the header's calendar
// reaching three years back and five ahead. At 360 px, as on the owner's phone.
//
// Needs TEST_FEAT_EMAIL, TEST_PASSWORD and SB. Every query is scoped to that
// account, because this runs against the live project.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const { is, failed } = checks()
const settle = async (p, ms = 600) => { await p.waitForTimeout(ms); await drained(p) }
const one = async (query) => (await sql(query))[0] ?? {}

/** A day as 'yyyy-MM-dd', n days from `from`, counted on the calendar. */
const plus = (from, n) => {
  const [y, m, d] = from.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const monthName = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const addMonths = (day, n) => {
  const [y, m] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10)
}

const clean = async () => {
  await sql(`delete from public.task where ${mine} and title like 'Repeat %'`)
  await sql(`delete from public.series_exception where series_id in (select id from public.series where ${mine} and title like 'Repeat %')`)
  await sql(`delete from public.series where ${mine} and title like 'Repeat %'`)
}
await clean()

const DAY = today()
const SOON = plus(DAY, 3)
const FAR = plus(DAY, 100) // past the 56 days the series fills

const A = await open({ viewport: { width: 360, height: 780 } })
const p = A.p
await signIn(p, email)
await p.click('.bottom-nav a[href="/"]')

/** Anything that runs past the right edge of the screen. */
const offScreen = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *, .bottom-sheet *')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !el.closest('.week-strip') })
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})

/** Scroll a month calendar until a day is drawn (months are drawn only near
 *  the screen), then return that day's button. */
async function findDay(scroller, day) {
  const button = p.locator(`${scroller} [data-day="${day}"]`)
  const drawn = await p.locator(`${scroller} .ms-day`).first().getAttribute('data-day')
  const step = day < drawn ? -180 : 180
  for (let i = 0; i < 200 && (await button.count()) === 0; i++) {
    await p.locator(`${scroller} .ms-scroll`).evaluate((el, by) => { el.scrollTop += by }, step)
    await p.waitForTimeout(40)
  }
  await button.scrollIntoViewIfNeeded()
  return button
}

// 1. Pick dates: today starts picked; two more are tapped, one far ahead.
await p.click('.fab')
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Repeat picked days')
await p.fill('.bottom-sheet input[type=time]', '08:00')
await p.click('.bottom-sheet button[aria-label="Repeat"]')
await p.click('.bottom-sheet [role=option]:has-text("Pick dates")')
is('the calendar opens in the sheet', await p.locator('.bottom-sheet .ts-dates .ms').count(), 1)
is('the task day starts picked', (await p.locator('.ts-dates-head span').textContent()).trim(), '1 day picked')
is('it is a pressed button', await p.locator(`.ts-dates [data-day="${DAY}"]`).getAttribute('aria-pressed'), 'true')
is('yesterday cannot be picked', await p.locator(`.ts-dates [data-day="${plus(DAY, -1)}"]`).count() === 0
  || await p.locator(`.ts-dates [data-day="${plus(DAY, -1)}"]`).isDisabled(), true)
await (await findDay('.ts-dates', SOON)).click()
await (await findDay('.ts-dates', FAR)).click()
is('the count follows the taps', (await p.locator('.ts-dates-head span').textContent()).trim(), '3 days picked')
is('nothing runs off a 360 px screen', (await offScreen()).join('; '), '')
// Clear empties the list and Save waits for a day.
await p.click('.ts-dates-clear')
is('Clear leaves none picked', await p.locator('.ts-dates .ms-day[aria-pressed="true"]').count(), 0)
is('and Save waits for a day', await p.locator('.bottom-sheet button[type=submit]').isDisabled(), true)
await (await findDay('.ts-dates', FAR)).click()
await (await findDay('.ts-dates', SOON)).click()
await (await findDay('.ts-dates', DAY)).click()
is('picked again', (await p.locator('.ts-dates-head span').textContent()).trim(), '3 days picked')
await p.click('.bottom-sheet button:has-text("Save")')
await settle(p, 2000)

let r = await one(`select rule, rule_config->'dates' dates, start_date::text s, end_date::text e from public.series
  where ${mine} and title = 'Repeat picked days' and deleted_at is null`)
is('the series is stored as picked dates', r.rule, 'dates')
is('the days, in order', JSON.stringify(r.dates), JSON.stringify([DAY, SOON, FAR]))
is('it starts on the first', r.s, DAY)
is('and ends on the last', r.e, FAR)
r = await one(`select string_agg(planned_date::text, ',' order by planned_date) days from public.task
  where ${mine} and title = 'Repeat picked days' and deleted_at is null`)
is('tasks for the days within eight weeks, none for the far one', r.days, `${DAY},${SOON}`)

// 2. Every few days.
await p.click('.fab')
await p.fill('.bottom-sheet input[placeholder="Mobility"]', 'Repeat every few')
await p.click('.bottom-sheet button[aria-label="Repeat"]')
await p.click('.bottom-sheet [role=option]:has-text("Every few days")')
await p.fill('.bottom-sheet .ts-every input', '3')
is('the rule reads back', (await p.locator('.bottom-sheet .ts-repeat-rule').textContent()).startsWith('Every 3 days'), true)
await p.click('.bottom-sheet button:has-text("Save")')
await settle(p, 2000)
r = await one(`select rule, rule_config->>'n' n from public.series where ${mine} and title = 'Repeat every few' and deleted_at is null`)
is('stored as daily with n', `${r.rule} ${r.n}`, 'daily 3')

// 3. Plan's Year: the scrolling months, at the size of the owner's phone.
await p.setViewportSize({ width: 390, height: 844 })
await p.click('.bottom-nav a[href="/plan"]')
await p.click('.tabs button:has-text("Year")')
await p.waitForTimeout(600)
is('the year is the month calendar', await p.locator('.plan-year .ms-scroll').count(), 1)
is('no grid of squares left over', await p.locator('.year-grid').count(), 0)
const view = await p.locator('.plan-year .ms-scroll').evaluate((el) => {
  const box = el.getBoundingClientRect()
  const months = [...el.querySelectorAll('.ms-month')].map((m) => m.getBoundingClientRect())
  const seen = months.reduce((sum, m) => sum + Math.max(0, Math.min(m.bottom, box.bottom) - Math.max(m.top, box.top)) / m.height, 0)
  return { seen, drawn: months.length, top: el.querySelector('.ms-month h3')?.textContent }
})
is('about two months are in view', view.seen >= 1.5 && view.seen <= 2.6, true)
is('only months near the screen are drawn', view.drawn <= 10, true)
const firstShown = await p.locator('.plan-year .ms-scroll').evaluate((el) => {
  const top = el.getBoundingClientRect().top
  return [...el.querySelectorAll('.ms-month')].find((m) => m.getBoundingClientRect().bottom > top + 40)?.querySelector('h3')?.textContent
})
is('it opens on this month', firstShown, monthName(DAY))
is('nothing runs off the screen', (await offScreen()).join('; '), '')
const far = await findDay('.plan-year', FAR)
is('the far day says it has a planned repeat', (await far.getAttribute('aria-label')).includes('planned repeat'), true)
await far.click()
await p.waitForTimeout(400)
is('a day opens its week', await p.locator('.tabs [aria-selected="true"]').textContent(), 'Week')
is('with the planned repeat in it, marked', await p.locator('.week-item.is-planned', { hasText: 'Repeat picked days' }).count(), 1)

// 4. The header's calendar: three years back to five ahead, whole months.
await p.click('.page-date-pick')
const pick = '.ph-pick .ms-scroll'
await p.locator(pick).evaluate((el) => { el.scrollTop = 0 })
await p.waitForTimeout(300)
is('it reaches three years back', await p.locator('.ph-pick .ms-month h3').first().textContent(), monthName(addMonths(DAY, -36)))
await p.locator(pick).evaluate((el) => { el.scrollTop = el.scrollHeight })
await p.waitForTimeout(300)
is('and five years ahead', await p.locator('.ph-pick .ms-month h3').last().textContent(), monthName(addMonths(DAY, 60)))
await p.click('.ph-pick button:has-text("Today")')
await p.waitForTimeout(300)
is('Today brings the week back', await p.locator('.week-strip button[aria-current="date"].today').count(), 1)

await clean()
console.log(A.errors.length ? 'PAGE ERRORS: ' + A.errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await A.b.close()
process.exit(failed() || A.errors.length ? 1 : 0)
