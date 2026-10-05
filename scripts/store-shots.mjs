// Google Play phone screenshots (PLAT-04), with no live project: the app is
// built as it ships, except that sign-in is stood in for (an invented demo
// person) and every server request answers with nothing; an invented demo
// week is put in the browser's local copy before the app starts. Then each
// screen is shot at 1080 × 1920 (360 × 640 at 3×) into store/screenshots/.
// With --iphone, the App Store's 6.9" set instead (PLAT-10): 1320 × 2868
// (440 × 956 at 3×) into store/screenshots/iphone/, with the iPhone's
// insets (62 at the top, 34 at the bottom) and its status bar drawn in.
//
//   node scripts/store-shots.mjs [--iphone]
//
// Needs Playwright's Chromium (npx playwright install chromium) or
// CHROMIUM=<path to chrome>. Nothing is sent anywhere: requests to any other
// host than the local server are refused.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from 'playwright'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const HERE = path.join(ROOT, 'scripts', 'store-shots')
const IPHONE = process.argv.includes('--iphone')
const OUT = path.join(ROOT, 'store', 'screenshots', ...(IPHONE ? ['iphone'] : []))
const PORT = Number(process.env.STORE_SHOTS_PORT ?? 5504)
// The demo week's Monday, mid-morning: the same pictures on every run.
const DEMO_NOW = new Date(process.env.STORE_SHOTS_NOW ?? '2026-10-05T10:40:00+02:00')
const STUB = path.join(HERE, 'supabase-stub.ts')
const REAL = path.join(ROOT, 'src', 'lib', 'supabase.ts')

// 1. Build.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-store-shots-'))
await build({
  configFile: false,
  root: HERE,
  publicDir: path.join(ROOT, 'public'),
  logLevel: 'error',
  plugins: [react(), {
    name: 'demo-sign-in',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!/(^|\/)supabase$/.test(source) || !importer) return null
      const r = await this.resolve(source, importer, { ...options, skipSelf: true })
      return r && path.resolve(r.id) === REAL ? STUB : null
    },
  }],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:9'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('demo'),
    'import.meta.env.VITE_CONTROLLER_NAME': JSON.stringify(''),
    'import.meta.env.VITE_CONTACT_EMAIL': JSON.stringify(''),
  },
  build: { outDir: dist, emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 10_000 },
})

// 2. Serve it (every path that is not a file is the app).
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const server = http.createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  const file = p.startsWith(dist) && fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok))
const BASE = `http://127.0.0.1:${PORT}`

// 3. Shoot.
// Chromium's own calls home (updates, sync, field trials) off too.
const QUIET = ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings', '--disable-domain-reliability', '--metrics-recording-only']
const browser = await chromium.launch({ args: QUIET, ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
fs.mkdirSync(OUT, { recursive: true })
const problems = []

async function shoot(scheme, shots) {
  const ctx = await browser.newContext({
    viewport: IPHONE ? { width: 440, height: 956 } : { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    colorScheme: scheme, serviceWorkers: 'block', locale: 'en-GB', timezoneId: 'Europe/Amsterdam',
  })
  // Nothing leaves the machine.
  await ctx.route((url) => !url.href.startsWith(BASE), (route) => route.abort())
  const page = await ctx.newPage()
  // The clock stands still at the demo moment; timers still run.
  await page.clock.setFixedTime(DEMO_NOW)
  page.on('pageerror', (e) => problems.push(`${scheme}: ${e.message}`))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('.bottom-nav', { timeout: 120_000 })
  await page.waitForTimeout(1500)
  // The iPhone's insets go where Capacitor's own variables would be; the
  // layout falls back to env(), which a desktop browser leaves at 0.
  if (IPHONE) await page.addStyleTag({ content: ':root { --safe-area-inset-top: 62px; --safe-area-inset-bottom: 34px; --safe-area-inset-left: 0px; --safe-area-inset-right: 0px }' })
  for (const [file, go] of shots) {
    await go(page)
    await page.waitForTimeout(1200)
    if (IPHONE) await page.evaluate(statusBar)
    await page.screenshot({ path: path.join(OUT, `${file}.png`) })
    if (IPHONE) await page.evaluate(() => document.getElementById('shots-status-bar')?.remove())
    console.log('wrote', path.relative(ROOT, path.join(OUT, `${file}.png`)))
  }
  await ctx.close()
}
/** The iPhone's status bar and home indicator, drawn in the page's own ink. */
function statusBar() {
  const d = document.createElement('div')
  d.id = 'shots-status-bar'
  d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
  d.innerHTML = '<div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);width:126px;height:37px;border-radius:19px;background:#000"></div>' +
    '<div style="position:absolute;top:22px;left:52px;font:600 17px system-ui,sans-serif;color:var(--e-ink)">9:41</div>' +
    '<div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:146px;height:5px;border-radius:3px;background:var(--e-ink)"></div>'
  document.body.appendChild(d)
}
const open = (route) => async (p) => {
  await p.evaluate((r) => { history.pushState(null, '', r); dispatchEvent(new PopStateEvent('popstate')) }, route)
  await p.evaluate(() => document.querySelector('.page')?.scrollTo(0, 0))
}
const tab = (name) => async (p) => {
  const t = p.locator('.tabs button, [role=tab]', { hasText: name }).first()
  if (await t.count()) await t.click()
}
const both = (...steps) => async (p) => { for (const s of steps) await s(p) }

await shoot('light', [
  ['1-today', open('/')],
  ['2-plan-week', both(open('/plan'), tab('Week'))],
  ['3-food-day', both(open('/food'), tab('Day'))],
  ['4-shop-list', both(open('/shop'), tab('List'))],
  ['5-habits', open('/m/habits')],
  ['6-stats', open('/stats')],
])
await shoot('dark', [['7-today-dark', open('/')]])

await browser.close()
server.close()
fs.rmSync(dist, { recursive: true, force: true })
if (problems.length) { console.error(`Page errors:\n${problems.join('\n')}`); process.exitCode = 1 }
