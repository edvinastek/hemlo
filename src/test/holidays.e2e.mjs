import Holidays from 'date-holidays'
import { need, open, signIn, sql, profileOf, today, checks, drained, openSettings, toPage } from './e2e.mjs'

// Public holidays, at 360 px, light theme. With the profile's country set to
// the Netherlands and no holidays chosen, Settings → Calendars offers the
// Netherlands with one tap; Germany is added by search; both reach
// profile.settings in Postgres in different colours. Plan's Month view then
// marks the next Dutch or German holiday in the right colours with the names
// in the cell's title, Week marks its header, the legend names both
// countries, and Today shows a chip only on a holiday. Removing Germany
// takes it off again.
// Needs TEST_EMAIL, TEST_PASSWORD and SB. Puts the account back at the end.
need('TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_EMAIL
const me = profileOf(email)
const { is, failed } = checks()
const day = today()

const reset = `
  update public.profile set country = 'NL', settings = coalesce(settings, '{}'::jsonb)
    || jsonb_build_object('holidays', jsonb_build_object('countries', '[]'::jsonb, 'colours', '{}'::jsonb))
    where id = ${me};`
await sql(reset)

// The next public holiday in NL or DE from the start of this month, worked
// out here with the same library and settings the app uses.
const list = (code) => [new Date().getFullYear(), new Date().getFullYear() + 1].flatMap((y) =>
  new Holidays(code, { languages: ['en'], types: ['public'] }).getHolidays(y, 'en')
    .filter((h) => h.type === 'public').map((h) => ({ date: h.date.slice(0, 10), name: h.name, code })))
const all = [...list('NL'), ...list('DE')]
const monthStart = `${day.slice(0, 7)}-01`
const target = all.filter((h) => h.date >= monthStart).sort((a, b) => a.date.localeCompare(b.date))[0]
const onTarget = all.filter((h) => h.date === target.date)
console.log(`target: ${target.date} ${onTarget.map((h) => `${h.name} (${h.code})`).join(', ')}`)
const todays = all.filter((h) => h.date === day)

const { b, p, errors } = await open({ viewport: { width: 360, height: 740 }, colorScheme: 'light' })
await signIn(p, email)

const go = async (href) => { await toPage(p, href); await p.waitForTimeout(1200) }
// Public holidays live in Settings → Calendars (v17).
const toProfile = async () => { await openSettings(p, 'calendars') }
const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.sheet-wrap, .week-strip, .tabs, table, .week-grid'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})

// 1. Nothing chosen: the profile's own country is offered.
await toProfile()
const offer = p.locator('.setting-row', { hasText: 'Your country, from your profile.' })
is('the Netherlands is offered', (await offer.locator('.row-name').textContent())?.trim(), 'Netherlands')
await offer.locator('button:has-text("Add")').click()
await p.waitForTimeout(900)
is('one tap adds it', await p.locator('.hs-list .cs-row').count(), 1)
is('and the offer goes', await offer.count(), 0)

// 2. Germany by search.
const search = p.locator('input[aria-label="Add a country\'s holidays"]')
await search.fill('Germany')
await search.press('Enter')
await p.waitForTimeout(900)
is('two countries listed', await p.locator('.hs-list .cs-row .row-name').allTextContents().then((t) => t.join(',')), 'Netherlands,Germany')
is('nothing runs off a 360 px screen in settings', (await overflow()).join(', '), '')
await p.locator('.hs-list .cs-head[aria-label^="Germany"]').click()
is('its palette has 16 swatches', await p.locator('.hs-list .cs-grid .cs-pick').count(), 16)
is('nothing runs off with the palette open', (await overflow()).join(', '), '')

await drained(p)
const [row] = await sql(`select settings->'holidays' as h from public.profile where id = ${me}`)
const saved = typeof row?.h === 'string' ? JSON.parse(row.h) : row?.h
is('both reached profile.settings in order', JSON.stringify(saved?.countries), '["NL","DE"]')
is('each with its own colour', saved && saved.colours.NL && saved.colours.DE && saved.colours.NL !== saved.colours.DE, true)

// 3. Plan, moved on week by week to the holiday, then Month.
await go('/plan')
const strip = p.locator('.week-strip')
const weekOf = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d }
const weeks = Math.round((weekOf(target.date) - weekOf(day)) / (7 * 864e5))
for (let i = 0; i < weeks; i++) {
  const box = await strip.boundingBox()
  await p.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2)
  await p.mouse.down()
  await p.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 })
  await p.mouse.up()
  await p.waitForTimeout(350)
}
await p.click('.page-head [role=tab]:has-text("Month")')
await p.waitForTimeout(1500)
// One entry per country, NL first (the order chosen); two holidays of one
// country on one day share it.
const codesOn = ['NL', 'DE'].filter((c) => onTarget.some((h) => h.code === c))
const label = codesOn
  .map((c) => `${[...new Set(onTarget.filter((h) => h.code === c).map((h) => h.name))].join(' / ')} (${c})`).join(', ')
const cell = p.locator(`.month-cell[title="${label}"]`)
is(`the ${target.date} cell names the holiday`, await cell.count() >= 1, true)
const marks = await cell.first().locator('.hol-mark.is-top i').evaluateAll((els) => els.map((el) => el.style.getPropertyValue('--hol')))
is('with one mark per country, in its colour', marks.join(','), codesOn.map((c) => saved.colours[c]).join(','))
const legend = await p.locator('.hol-legend').textContent().catch(() => '')
is('the legend names the country', onTarget.every((h) => legend.includes(h.code === 'NL' ? 'Netherlands' : 'Germany')), true)
is('an ordinary cell has no mark', await p.locator('.month-cell:not([title]) .hol-mark').count(), 0)
// The mark stands out from the cell at 3:1 or more.
const ratio = await cell.first().evaluate((el) => {
  const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number)
  const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
  const a = lum(rgb(getComputedStyle(el.querySelector('.hol-mark i')).backgroundColor))
  const b = lum(rgb(getComputedStyle(el).backgroundColor))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
})
is('the mark is at 3:1 or more against the cell', ratio >= 3, true)
is('nothing runs off a 360 px screen in Month', (await overflow()).join(', '), '')

// 4. Week: the holiday's header is underlined and titled.
await cell.first().click()
await p.waitForTimeout(900)
const head = p.locator(`.week-col h3[title^="${label}"]`)
is('the Week header names the holiday', await head.count(), 1)
is('and carries the mark', await head.locator('.hol-mark.is-bar i').count(), codesOn.length)

// 5. Today: a chip only on a holiday.
await go('/')
await p.locator('.week-strip button.today').click()
await p.waitForTimeout(900)
is(todays.length ? 'today is a holiday: a chip' : 'today is no holiday: no chip',
  (await p.locator('.page-head .hol-chip').count()) > 0, todays.length > 0)

// 6. Removing Germany.
await toProfile()
await p.click('button[aria-label="Remove Germany"]')
await p.waitForTimeout(900)
is('one country left', await p.locator('.hs-list .cs-row').count(), 1)
await drained(p)
const [after] = await sql(`select settings->'holidays'->'countries' as c from public.profile where id = ${me}`)
is('and in Postgres', JSON.stringify(typeof after?.c === 'string' ? JSON.parse(after.c) : after?.c), '["NL"]')

is('no page errors', errors.join(' | '), '')
await b.close()

await sql(reset)
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
process.exit(failed() ? 1 : 0)
