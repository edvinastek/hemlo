import { need, checks, open, signIn, APP, openSettings } from './e2e.mjs'

// The page bar and swiping, clicked and swiped through on a 360 px phone:
// a module switched off leaves the bar and its address goes to Today; one
// switched on opens at /m/<key>; each style (drawer, fan, two rows) opens a
// page; a swipe from Today reaches Plan; a swipe on the week strip changes
// the week and not the page; nothing runs off the screen. v17 (CALM-04):
// the bar never scrolls and holds at most five, and until a style is
// picked the app picks one.
//
// Needs TEST_EMAIL and TEST_PASSWORD. Everything it changes (Sleep on or
// off, the bar's style) is put back at the end.
need('TEST_EMAIL', 'TEST_PASSWORD')
const { is, failed } = checks()
const { b, ctx, p, errors } = await open({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })
await signIn(p, process.env.TEST_EMAIL)
const cdp = await ctx.newCDPSession(p)

const path = () => new URL(p.url()).pathname
const go = async (href) => { await p.click(`.bottom-nav a[href="${href}"]`); await p.waitForTimeout(800) }
// Settings is not always on the bar (the hub holds it): open its pages in place.
const toMore = () => openSettings(p, 'modules')
const toBar = () => openSettings(p, 'bar')
const sleepOn = async () => (await p.locator('button[role=switch][aria-label="Turn Sleep off"]').count()) > 0
const setSleep = async (on) => {
  await toMore()
  if ((await sleepOn()) !== on) {
    await p.click(`button[role=switch][aria-label="Turn Sleep ${on ? 'on' : 'off'}"]`)
    await p.waitForTimeout(800)
  }
}
const setStyle = async (label) => {
  await toBar()
  await p.click(`.nv-style:has-text("${label}")`)
  await p.waitForTimeout(600)
}

/** A finger drag, through the DevTools protocol so the page gets real touch events. */
async function drag(x0, y0, x1, y1, ms = 160, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] })
  for (let i = 1; i <= steps; i++) {
    await p.waitForTimeout(ms / steps)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await p.waitForTimeout(700)
}

/** Anything in the bar, the drawer or the fan that ends past the screen edge,
 *  leaving out what sits inside a sideways-scrolling strip. */
const offScreen = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  const out = []
  for (const el of document.querySelectorAll('.bottom-nav, .bottom-nav *, .nav-sheet *, .fan-layer *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    let inStrip = false
    for (let a = el.parentElement; a; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX
      if (o === 'auto' || o === 'scroll') { inStrip = true; break }
    }
    if (!inStrip && (r.right > w + 1 || r.left < -1)) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
  }
  return out.slice(0, 5)
})

await toMore()
const hadSleep = await sleepOn()
await toBar()
is('the page bar settings are in Settings → Page bar, six styles', await p.locator('.nv-styles .nv-style').count(), 6)
const hadChosen = (await p.locator('button:has-text("Let GetIt pick")').count()) > 0
const hadStyle = (await p.locator('.nv-style[aria-checked="true"] span').last().textContent())?.trim()
/** Anything in the bar that scrolls sideways: none, ever (CALM-04). */
const scrolls = () => p.evaluate(() => [...document.querySelectorAll('.bottom-nav, .bottom-nav *')]
  .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).length)

// 1. Off: the page leaves the bar, and its address leads to Today.
await setSleep(false)
is('Sleep off: no Sleep page on the bar', await p.locator('.bottom-nav a[href="/m/sleep"]').count(), 0)
await p.goto(`${APP}m/sleep`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
is('Sleep off: its address goes to Today', path(), '/')

// 2. On: the page joins the bar and opens at /m/sleep.
await setSleep(true)
await p.goto(`${APP}m/sleep`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
is('Sleep opens at /m/sleep', path(), '/m/sleep')
is('one row: nothing off screen', JSON.stringify(await offScreen()), '[]')

// 3. Each style opens a page.
await setStyle('Drawer')
is('drawer: the bar is a drawer', await p.locator('.bottom-nav.nav-drawer').count(), 1)
is('drawer: nothing off screen', JSON.stringify(await offScreen()), '[]')
await p.click('.nav-handle')
await p.locator('.nav-sheet[role=dialog]').waitFor()
is('drawer: the sheet fits', JSON.stringify(await offScreen()), '[]')
await p.click('.nav-sheet a[href="/m/sleep"]')
await p.waitForTimeout(600)
is('drawer: Sleep opens from the sheet', path(), '/m/sleep')
is('drawer: the sheet closes', await p.locator('.nav-sheet').count(), 0)
await p.click('.nav-handle')
await p.keyboard.press('Escape')
await p.waitForTimeout(200)
is('drawer: Escape closes the sheet', await p.locator('.nav-sheet').count(), 0)

await setStyle('Fan')
is('fan: the bar is a fan', await p.locator('.bottom-nav.nav-fan').count(), 1)
await p.click('.nav-fan-btn')
await p.waitForTimeout(500)
is('fan: the pages fan out', (await p.locator('.fan-layer .fan-item').count()) > 0, true)
is('fan: nothing off screen', JSON.stringify(await offScreen()), '[]')
await p.click('.fan-layer a[href="/m/sleep"]')
await p.waitForTimeout(600)
is('fan: Sleep opens from the fan', path(), '/m/sleep')
is('fan: the centre button says where you are', (await p.locator('.nav-fan-btn .nav-label').textContent())?.trim(), 'Sleep')

await setStyle('Two rows')
is('two rows: the bar is a grid', await p.locator('.bottom-nav.nav-grid').count(), 1)
is('two rows: nothing off screen', JSON.stringify(await offScreen()), '[]')
// Eight tiles at most; past that the last is the Modules page.
is('two rows: at most four across', await p.evaluate(() => getComputedStyle(document.querySelector('.nav-grid-rest')).gridTemplateColumns.split(' ').length <= 4), true)
is('two rows: nothing scrolls', await scrolls(), 0)
if (await p.locator('.bottom-nav a[href="/m/sleep"]').count()) await go('/m/sleep')
else { await go('/modules'); await p.click('.hub-open:has-text("Sleep")'); await p.waitForTimeout(600) }
is('two rows: Sleep opens', path(), '/m/sleep')
await go('/')
const fabGap = await p.evaluate(() => {
  const fab = document.querySelector('.fab')
  if (!fab) return -1
  return document.querySelector('.bottom-nav').getBoundingClientRect().top - fab.getBoundingClientRect().bottom
})
is('two rows: the add button still clears the bar', fabGap >= 8, true)

// 4. Swiping: from Today to Plan; on the week strip, the week moves instead.
//    v17: Today shows today only; the week strip is on Plan's Day view.
await setStyle('One row')
await go('/plan')
await p.getByRole('tab', { name: 'Day', exact: true }).click()
await p.evaluate(() => document.querySelector('.page').scrollTo(0, 0))
const strip = await p.locator('.week-strip').boundingBox()
const dateBefore = await p.locator('.page-date').textContent()
await drag(300, strip.y + strip.height / 2, 70, strip.y + strip.height / 2 + 3)
is('a swipe on the week strip keeps the page', path(), '/plan')
is('and shows another week', (await p.locator('.page-date').textContent()) !== dateBefore, true)
await drag(70, strip.y + strip.height / 2, 300, strip.y + strip.height / 2 + 3)
is('swiping back returns to the first week', await p.locator('.page-date').textContent(), dateBefore)
await go('/')
await drag(180, 560, 190, 300, 250)
is('a vertical scroll keeps the page', path(), '/')
// Back to the top and still, so the swipe starts on a row's name rather than
// on its time buttons (which keep a swipe to themselves).
await p.evaluate(() => document.querySelector('.page').scrollTo(0, 0))
await p.waitForTimeout(500)
await drag(250, 520, 20, 530)
is('a swipe left on Today reaches Plan', path(), '/plan')
await drag(60, 520, 300, 530)
is('a swipe right goes back to Today', path(), '/')

// 5. Nobody's choice: the app picks; with many pages the hub, five at most.
await toBar()
await p.click('button:has-text("Let GetIt pick")')
await p.waitForTimeout(800)
is('picked by the app: at most five on the bar', (await p.locator('.bottom-nav .nav-item').count()) <= 5, true)
is('picked by the app: nothing scrolls', await scrolls(), 0)
is('only the open page (or the Modules page holding it) is marked',
  await p.locator('.bottom-nav .nav-item:is([aria-current="page"], .is-holder)').count(), 1)

// Put things back.
if (hadChosen && hadStyle) await setStyle(hadStyle)
if (!hadSleep) await setSleep(false)
is('no page errors', JSON.stringify(errors), '[]')
await b.close()
process.exit(failed() ? 1 : 0)
