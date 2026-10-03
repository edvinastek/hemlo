import { need, open, signIn, modulesOn, ALL_MODULES, APP, addTask } from './e2e.mjs'

// A phone turned sideways, and a wide screen. At 844 × 390 and 740 × 360
// (phones on their side) and 1280 × 800 (a desktop window), every screen and
// tab is opened, as in layout.e2e.mjs, and each is checked for:
// - nothing running off the side of the screen;
// - the page bar standing as a column at the left (the rail on a phone, the
//   sidebar on a desktop), not along the bottom;
// - nothing tappable under the round add button, in the page or the bar;
// - the new task sheet and the "go to a day" calendar fitting on the
//   screen, with Save (or Close) in view without scrolling anything.
// On the 740 × 360 phone the drawer style is tried too: its other pages
// open in a box beside the rail that fits on the screen. The style is put
// back afterwards. Needs TEST_EMAIL and TEST_PASSWORD.
need('TEST_EMAIL', 'TEST_PASSWORD')
await modulesOn(process.env.TEST_EMAIL, ALL_MODULES)

const SCREENS = [
  { width: 844, height: 390, phone: true },
  { width: 740, height: 360, phone: true },
  { width: 1280, height: 800, phone: false },
]
const routes = ['/', '/plan', '/food', '/shop', '/more',
  ...ALL_MODULES.filter((k) => k !== 'nutrition' && k !== 'shopping').map((k) => `/m/${k}`)]

let bad = 0
const report = (label, found) => {
  if (found.length) bad++
  console.log(`${found.length ? 'FAIL' : 'ok  '}  ${label}${found.length ? ': ' + found.join('; ') : ''}`)
}

for (const screen of SCREENS) {
  const size = `${screen.width}×${screen.height}`
  console.log(`\n${size}`)
  const { b, p, errors } = await open({
    viewport: { width: screen.width, height: screen.height },
    ...(screen.phone ? { hasTouch: true, isMobile: true } : {}),
  })
  await signIn(p, process.env.TEST_EMAIL)

  // Anything whose right edge passes the screen, outside a sideways-scrolling box.
  const overflow = () => p.evaluate(() => {
    const w = document.documentElement.clientWidth
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= w + 1) continue
      let scroller = false
      for (let a = el.parentElement; a && !a.classList.contains('page'); a = a.parentElement) {
        const o = getComputedStyle(a).overflowX
        if (o === 'auto' || o === 'scroll') { scroller = true; break }
      }
      if (!scroller) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ends at ${Math.round(r.right)}`)
    }
    return out.slice(0, 5)
  })

  // The bar is a column at the left edge, as tall as the screen, and on a
  // phone it is the rail (data-layout="rail" on <html>).
  const rail = (phone) => p.evaluate((phone) => {
    const nav = document.querySelector('.bottom-nav')
    if (!nav) return ['no page bar']
    const r = nav.getBoundingClientRect()
    const out = []
    if (r.left > 60) out.push(`the bar starts ${Math.round(r.left)} px from the left`)
    if (r.width > 260) out.push(`the bar is ${Math.round(r.width)} px wide`)
    if (r.height < window.innerHeight - 2) out.push(`the bar is ${Math.round(r.height)} px tall, not the screen's height`)
    const layout = document.documentElement.dataset.layout
    if (phone && (layout !== 'rail' || !nav.classList.contains('nav-rail'))) out.push(`layout is ${layout}, not the rail`)
    if (!phone && layout !== 'wide') out.push(`layout is ${layout}, not wide`)
    return out
  }, phone)

  // With the page scrolled to its end, nothing tappable in the page or the
  // bar under the add button.
  const underFab = () => p.evaluate(() => {
    const page = document.querySelector('.page')
    if (page) page.scrollTop = page.scrollHeight
    const fab = document.querySelector('.fab')
    if (!fab) return []
    const f = fab.getBoundingClientRect()
    const out = []
    for (const el of document.querySelectorAll('.page button, .page input, .page select, .page a, .bottom-nav a, .bottom-nav button')) {
      const r = el.getBoundingClientRect()
      if (el === fab || r.width === 0 || r.height === 0) continue
      // Clipped away inside a scrolling part of the rail: not tappable there.
      const box = el.closest('.nav-scroll')?.getBoundingClientRect()
      if (box && (r.bottom <= box.top || r.top >= box.bottom)) continue
      if (r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" is under the add button`)
    }
    return out
  })

  // A sheet fits: inside the screen, and its Save (or Close) button in view.
  const sheetFits = (button) => p.evaluate((button) => {
    const s = document.querySelector('.bottom-sheet')
    if (!s) return ['no sheet opened']
    const out = []
    const r = s.getBoundingClientRect()
    if (r.top < -1 || r.bottom > window.innerHeight + 1) out.push(`the sheet runs from ${Math.round(r.top)} to ${Math.round(r.bottom)}`)
    if (r.left < -1 || r.right > document.documentElement.clientWidth + 1) out.push('the sheet is wider than the screen')
    if (r.width > 600) out.push(`the sheet is ${Math.round(r.width)} px wide, not centred at 560`)
    const btn = [...s.querySelectorAll('button')].find((x) => x.textContent.trim() === button)
    if (!btn) return [...out, `no ${button} button`]
    const q = btn.getBoundingClientRect()
    if (q.top < Math.max(0, r.top) || q.bottom > Math.min(window.innerHeight, r.bottom)) out.push(`${button} is out of view (${Math.round(q.top)}–${Math.round(q.bottom)})`)
    return out
  }, button)

  for (const route of routes) {
    await p.goto(new URL(route.slice(1), APP).href, { waitUntil: 'domcontentloaded' })
    await p.locator('.bottom-nav').waitFor({ timeout: 20000 })
    await p.waitForTimeout(1200)
    const tabs = await p.locator('.page [role=tab]').allTextContents()
    for (const t of tabs.length ? tabs : ['(no tabs)']) {
      if (tabs.length) await p.locator('.page [role=tab]', { hasText: t }).first().click()
      await p.waitForTimeout(700)
      report(`${size} ${route} ${t}`, [...await overflow(), ...await rail(screen.phone), ...await underFab()])
    }
  }

  // The new task sheet and the header's calendar.
  await p.click('.bottom-nav a[href="/"]')
  await p.waitForTimeout(600)
  await addTask(p)
  await p.waitForTimeout(500)
  report(`${size} new task sheet`, [...await overflow(), ...await sheetFits('Save')])
  await p.click('.bottom-sheet button:has-text("Cancel")')
  await p.waitForTimeout(300)
  // The header's calendar is on Plan's Day view (v17: Today shows today only).
  await p.click('.bottom-nav a[href="/plan"]')
  await p.locator('.page [role=tab]', { hasText: 'Day' }).first().click()
  await p.waitForTimeout(500)
  await p.click('.page-date-pick')
  await p.waitForTimeout(500)
  report(`${size} go to a day`, [...await overflow(), ...await sheetFits('Close')])
  await p.click('.bottom-sheet button:has-text("Close")')

  // The drawer on its side: its pages open in a box beside the rail.
  if (screen.width === 740) {
    // Settings → Page bar (v17), opened by address.
    const toModules = async () => {
      await p.goto(`${APP}more?page=bar`, { waitUntil: 'domcontentloaded' })
      await p.locator('.bottom-nav').waitFor({ timeout: 20000 })
      await p.waitForTimeout(400)
    }
    await toModules()
    const was = (await p.locator('.nv-style[aria-checked="true"] span').last().textContent())?.trim()
    const picked = (await p.locator('button:has-text("Let GetIt pick")').count()) === 0
    await p.click('.nv-style:has-text("Drawer")')
    await p.waitForTimeout(800)
    await p.click('.nav-rail .nav-handle')
    await p.waitForTimeout(400)
    const pop = await p.evaluate(() => {
      const el = document.querySelector('.nav-pop')
      if (!el) return ['the drawer opened nothing']
      const r = el.getBoundingClientRect()
      const out = []
      if (r.top < -1 || r.bottom > window.innerHeight + 1) out.push(`the box runs from ${Math.round(r.top)} to ${Math.round(r.bottom)}`)
      if (r.right > document.documentElement.clientWidth + 1) out.push('the box runs off the right')
      const railRight = document.querySelector('.nav-rail').getBoundingClientRect().right
      if (r.left < railRight) out.push('the box covers the rail')
      if (!el.querySelector('a[href]')) out.push('no pages in the box')
      return out
    })
    report(`${size} drawer: its pages beside the rail`, pop)
    await p.keyboard.press('Escape')
    await p.waitForTimeout(200)
    // Put the style back.
    await toModules()
    if (picked) await p.click('button:has-text("Let GetIt pick")')
    else if (was) await p.click(`.nv-style:has-text("${was}")`)
    await p.waitForTimeout(800)
  }

  if (errors.length) { bad++; console.log('PAGE ERRORS: ' + errors.join(' | ')) }
  await b.close()
}

console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed')
process.exit(bad ? 1 : 0)
