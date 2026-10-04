// Google Play phone screenshots (PLAT-04), with no live project: the app is
// built as it ships, except that sign-in is stood in for (an invented demo
// person) and every server request answers with nothing; an invented demo
// week is put in the browser's local copy before the app starts. Then each
// screen is shot at 1080 × 1920 (360 × 640 at 3×) into store/screenshots/.
//
//   node scripts/store-shots.mjs
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
const OUT = path.join(ROOT, 'store', 'screenshots')
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
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
fs.mkdirSync(OUT, { recursive: true })
const problems = []

async function shoot(scheme, shots) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    colorScheme: scheme, serviceWorkers: 'block', locale: 'en-GB', timezoneId: 'Europe/Amsterdam',
  })
  // Nothing leaves the machine.
  await ctx.route((url) => !url.href.startsWith(BASE), (route) => route.abort())
  const page = await ctx.newPage()
  // The clock stands still at the demo moment; timers still run.
  await page.clock.setFixedTime(DEMO_NOW)
  page.on('pageerror', (e) => problems.push(`${scheme}: ${e.message}`))
  await page.goto(`${BASE}/`)
  await page.waitForSelector('.bottom-nav', { timeout: 30_000 })
  await page.waitForTimeout(1500)
  for (const [file, go] of shots) {
    await go(page)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(OUT, `${file}.png`) })
    console.log('wrote', `store/screenshots/${file}.png`)
  }
  await ctx.close()
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
