// Play Store phone screenshots at 1080 x 1920, from a demo account.
// Needs DEMO_EMAIL and DEMO_PASSWORD, and a built app served on :4173.
import { chromium } from 'playwright'

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const shoot = async (scheme, shots) => {
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, colorScheme: scheme })
  const p = await ctx.newPage()
  await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await p.fill('input[type=email]', process.env.DEMO_EMAIL)
  await p.fill('input[type=password]', process.env.DEMO_PASSWORD)
  await p.click('button[type=submit]')
  await p.waitForSelector('.row', { timeout: 20000 })
  await p.waitForTimeout(3500)
  for (const [file, go] of shots) {
    await go(p)
    await p.waitForTimeout(1200)
    await p.screenshot({ path: `store/screenshots/${file}.png` })
    console.log('wrote', file)
  }
  await ctx.close()
}
const nav = (href) => (p) => p.click(`.bottom-nav a[href="${href}"]`)
const tab = (href, name) => async (p) => { await p.click(`.bottom-nav a[href="${href}"]`); await p.click(`.tabs button:has-text("${name}")`) }

await shoot('light', [
  ['1-today', nav('/')],
  ['2-meals', nav('/food')],
  ['3-shop', nav('/shop')],
  ['4-week', tab('/plan', 'Week')],
  ['5-month', tab('/plan', 'Month')],
])
await shoot('dark', [['6-today-dark', nav('/')]])
await b.close()
