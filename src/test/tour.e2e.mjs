import { open, signIn, modulesOn, ALL_MODULES, toPage } from './e2e.mjs'

// Credentials come from the environment and are never committed: an account
// whose password sits in the repository is an account anyone can sign in to.
if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD for a throwaway test account.')
  process.exit(2)
}
// The shared open(): the sandbox's Chromium here, Playwright's own on GitHub.
const { b, p, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 160)) })
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
// This check needs these pages, whichever check used the account before it.
await modulesOn(process.env.TEST_EMAIL, ALL_MODULES)
await signIn(p, process.env.TEST_EMAIL)
// By address: with every module on, the bar is the hub (v17) and holds
// only Today, Plan, two pins and Modules.
for (const [label, href] of [['today','/'],['plan','/plan'],['food','/food'],['shop','/shop'],['more','/more']]) {
  await p.goto(new URL(href.slice(1), 'http://127.0.0.1:4173/').href, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  await p.screenshot({ path: `/tmp/t-${label}.png`, fullPage: true })
  const text = (await p.textContent('.page-inner') ?? '').replace(/\s+/g,' ').trim()
  console.log(`${label}: ${text.slice(0, 100)}`)
}
await p.click('.bottom-nav a[href="/plan"]'); await p.waitForTimeout(500)
for (const tab of ['Month','Year']) {
  await p.click(`.tabs button:has-text("${tab}")`); await p.waitForTimeout(900)
  await p.screenshot({ path: `/tmp/t-plan-${tab.toLowerCase()}.png`, fullPage: true })
}
await toPage(p, '/food'); await p.waitForTimeout(400)
await p.click('.tabs button:has-text("Recipes")'); await p.waitForTimeout(1500)
await p.screenshot({ path: '/tmp/t-recipes.png', fullPage: true })
console.log('recipe rows:', await p.locator('.sheet tbody tr').count())
await p.click('.tabs button:has-text("Foods")'); await p.waitForTimeout(1500)
console.log('food rows:', await p.locator('.sheet tbody tr').count())
await p.screenshot({ path: '/tmp/t-foods.png', fullPage: true })
await p.goto('http://127.0.0.1:4173/more?page=modules', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
await p.screenshot({ path: '/tmp/t-modules.png', fullPage: true })
console.log('module switches:', await p.locator('.switch').count())
await p.locator('button:has-text("Edit")').first().click()
await p.waitForTimeout(900)
await p.screenshot({ path: '/tmp/t-editor.png', fullPage: true })
console.log('editor tabs:', (await p.locator('[role=tab]').allTextContents()).join(', '))
console.log(errors.length ? 'ERRORS: ' + errors.slice(0,3).join(' | ') : 'no page errors')
await b.close()
