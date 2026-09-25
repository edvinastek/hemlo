import { chromium } from 'playwright'

// Shared by the browser checks. Accounts are throwaway ones given in the
// environment and never committed; every query that touches data is scoped to
// that account's email, because these checks run against the live project.

export const REF = 'lphysuemxnmcuukzsoya'
export const APP = 'http://127.0.0.1:4173/'

export function need(...keys) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) { console.error(`Set ${missing.join(', ')}.`); process.exit(2) }
}

export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return r.json()
}

/** SQL for the id of the default profile of the account with this email. */
export const profileOf = (email) =>
  `(select pr.id from public.profile pr join auth.users u on u.id = pr.user_id where u.email = '${email}' order by pr.is_default desc limit 1)`

/** Today as the browser sees it (same clock and zone as this process). */
export const today = () => new Date().toLocaleDateString('sv')

export function checks() {
  let fail = 0
  const is = (label, got, want) => {
    const ok = String(got) === String(want)
    if (!ok) fail++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (wanted ${want})`}`)
  }
  return { is, failed: () => fail }
}

export async function open(options = {}) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, ...options })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  return { b, ctx, p, errors }
}

/** Signs in; a new account goes through the first-run wizard first. */
export async function signIn(p, email, password = process.env.TEST_PASSWORD) {
  if (!p.url().startsWith(APP)) await p.goto(APP, { waitUntil: 'networkidle' })
  await p.fill('input[type=email]', email)
  await p.fill('input[type=password]', password)
  await p.click('button[type=submit]')
  const wizard = p.getByText('Step 1 of 4')
  await p.locator('.bottom-nav').or(wizard).first().waitFor({ timeout: 20000 })
  if (await wizard.count()) {
    const field = (label) => p.locator('.setting-row', { hasText: label }).locator('input')
    await field('Height').fill('180')
    await field('Date of birth').fill('1996-01-01')
    await p.click('button:has-text("Next")')
    await p.click('button:has-text("Next")')
    await field('Weight today').fill('80')
    await p.click('button:has-text("Next")')
    await p.click('button:has-text("Start planning")')
    await p.waitForSelector('.bottom-nav', { timeout: 20000 })
  }
  await p.waitForTimeout(3000)
}

export async function localCount(p, table) {
  return p.evaluate(async (name) => {
    const open = indexedDB.open('getit')
    const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
    return new Promise((r) => { const q = db.transaction(name).objectStore(name).count(); q.onsuccess = () => r(q.result) })
  }, table)
}

/** Waits until this page has sent everything it queued. */
export async function drained(p, timeout = 30000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if ((await localCount(p, 'pending')) === 0) return true
    await p.waitForTimeout(300)
  }
  return false
}
