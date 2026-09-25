import { chromium } from 'playwright'
import { signIn } from './e2e.mjs'

// Credentials come from the environment and are never committed: an account
// whose password sits in the repository is an account anyone can sign in to.
if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD for a throwaway test account.')
  process.exit(2)
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(String(e).slice(0, 160)))
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 160)) })
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await signIn(p, process.env.TEST_EMAIL)
for (const [label, href] of [['today','/'],['plan','/plan'],['food','/food'],['shop','/shop'],['more','/more']]) {
  await p.click(`.bottom-nav a[href="${href}"]`)
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
await p.click('.bottom-nav a[href="/food"]'); await p.waitForTimeout(400)
await p.click('.tabs button:has-text("Recipes")'); await p.waitForTimeout(1500)
await p.screenshot({ path: '/tmp/t-recipes.png', fullPage: true })
console.log('recipe rows:', await p.locator('.sheet tbody tr').count())
await p.click('.tabs button:has-text("Foods")'); await p.waitForTimeout(1500)
console.log('food rows:', await p.locator('.sheet tbody tr').count())
await p.screenshot({ path: '/tmp/t-foods.png', fullPage: true })
await p.click('.bottom-nav a[href="/more"]'); await p.waitForTimeout(800)
await p.screenshot({ path: '/tmp/t-modules.png', fullPage: true })
console.log('module switches:', await p.locator('.switch').count())
await p.locator('button.btn:has-text("Edit")').first().click()
await p.waitForTimeout(700)
await p.fill('input[placeholder="grams * kcal / 100"]', 'kcal * 2 + gramz')
await p.waitForTimeout(500)
await p.screenshot({ path: '/tmp/t-editor.png', fullPage: true })
const notes = await p.locator('.row-meta').allTextContents()
console.log('formula check:', notes.find(n => n.includes('field called') || n.includes('parses')) ?? '(none)')
console.log(errors.length ? 'ERRORS: ' + errors.slice(0,3).join(' | ') : 'no page errors')
await b.close()
