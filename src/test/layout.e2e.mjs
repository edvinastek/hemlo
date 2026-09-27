import { need, open, signIn, modulesOn, ALL_MODULES, APP } from './e2e.mjs'

// Nothing on any screen runs off a small phone or hides under the add button. At 360 px wide (the most
// common Android width) every screen and tab is opened, and anything whose
// right edge passes the screen is reported. Needs TEST_EMAIL and TEST_PASSWORD.
need('TEST_EMAIL', 'TEST_PASSWORD')
// This check needs these pages, whichever check used the account before it.
await modulesOn(process.env.TEST_EMAIL, ALL_MODULES)
const { b, p, errors } = await open({ viewport: { width: 360, height: 640 } })
await signIn(p, process.env.TEST_EMAIL)

const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.right <= w + 1) continue
    // Scrolling tables and strips are allowed to be wider than the screen.
    let scroller = false
    // The page itself scrolls vertically, so it does not count.
    for (let a = el.parentElement; a && !a.classList.contains('page'); a = a.parentElement) {
      const o = getComputedStyle(a).overflowX
      if (o === 'auto' || o === 'scroll') { scroller = true; break }
    }
    if (!scroller) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ends at ${Math.round(r.right)}`)
  }
  return out.slice(0, 5)
})

// With the page scrolled to its end, nothing tappable may sit under the
// floating add button.
const underFab = () => p.evaluate(() => {
  const page = document.querySelector('.page')
  if (page) page.scrollTop = page.scrollHeight
  const fab = document.querySelector('.fab')
  if (!fab) return []
  const f = fab.getBoundingClientRect()
  const out = []
  for (const el of document.querySelectorAll('.page button, .page input, .page select, .page a')) {
    const r = el.getBoundingClientRect()
    if (el === fab || r.width === 0 || r.height === 0) continue
    if (r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`)
  }
  return out
})

let bad = 0
// Every page the bar can have, and every tab each one shows today (Today's
// tabs follow the day, so they are read off the page, not listed here).
const routes = ['/', '/plan', '/food', '/shop', '/more',
  ...ALL_MODULES.filter((k) => k !== 'nutrition' && k !== 'shopping').map((k) => `/m/${k}`)]
for (const route of routes) {
  await p.goto(new URL(route.slice(1), APP).href, { waitUntil: 'domcontentloaded' })
  await p.locator('.bottom-nav').waitFor({ timeout: 20000 })
  await p.waitForTimeout(1200)
  const tabs = await p.locator('.page [role=tab]').allTextContents()
  for (const t of tabs.length ? tabs : ['(no tabs)']) {
    if (tabs.length) await p.locator('.page [role=tab]', { hasText: t }).first().click()
    await p.waitForTimeout(700)
    const found = [...await overflow(), ...(await underFab()).map((x) => `${x} is under the add button`)]
    if (found.length) bad++
    console.log(`${found.length ? 'FAIL' : 'ok  '}  ${route} ${t}${found.length ? ': ' + found.join('; ') : ''}`)
  }
}
await p.click('.bottom-nav a[href="/"]')
await p.click('.fab')
await p.waitForTimeout(500)
const sheet = await overflow()
if (sheet.length) bad++
console.log(`${sheet.length ? 'FAIL' : 'ok  '}  new task sheet${sheet.length ? ': ' + sheet.join('; ') : ''}`)
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(bad ? `\n${bad} screen(s) do not fit a 360 px phone` : '\nall checks passed')
await b.close()
process.exit(bad || errors.length ? 1 : 0)
