import { need, open, signIn } from './e2e.mjs'

// Nothing on any screen runs off a small phone. At 360 px wide (the most
// common Android width) every screen and tab is opened, and anything whose
// right edge passes the screen is reported. Needs TEST_EMAIL and TEST_PASSWORD.
need('TEST_EMAIL', 'TEST_PASSWORD')
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

let bad = 0
const screens = [['/', ['Today', 'Body', 'Work', 'Night']], ['/plan', ['Week', 'Month', 'Year']], ['/food', ['Day', 'Recipes', 'Foods']],
  ['/shop', ['Trip', 'Stock', 'Stores']], ['/more', ['Modules', 'Profile', 'Assistant', 'Data']]]
for (const [href, tabs] of screens) {
  await p.click(`.bottom-nav a[href="${href}"]`)
  for (const t of tabs) {
    await p.click(`.tabs button:has-text("${t}")`)
    await p.waitForTimeout(700)
    const found = await overflow()
    if (found.length) bad++
    console.log(`${found.length ? 'FAIL' : 'ok  '}  ${href} ${t}${found.length ? ': ' + found.join('; ') : ''}`)
  }
}
await p.click('.bottom-nav a[href="/"]')
await p.click('.fab')
await p.waitForTimeout(500)
const sheet = await overflow()
if (sheet.length) bad++
console.log(`${sheet.length ? 'FAIL' : 'ok  '}  new task sheet${sheet.length ? ': ' + sheet.join('; ') : ''}`)
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(bad ? `\n${bad} screen(s) run off a 360 px phone` : '\nall checks passed')
await b.close()
process.exit(bad || errors.length ? 1 : 0)
