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

/** Signs in; a new account goes through the first-run wizard first, with the
 *  answers given (by default the minimal ones: a name, the Minimal planner,
 *  no targets). A check that needs meals sized to a target or the Body tab
 *  asks for { template: 'Fitness & nutrition', targets: true }. */
export async function signIn(p, email, password = process.env.TEST_PASSWORD, wizard = {}) {
  if (!p.url().startsWith(APP)) await p.goto(APP, { waitUntil: 'networkidle' })
  await p.fill('input[type=email]', email)
  await p.fill('input[type=password]', password)
  await p.click('button[type=submit]')
  const first = p.getByText('Step 1 of 4')
  await p.locator('.bottom-nav').or(first).first().waitFor({ timeout: 20000 })
  if (await first.count()) await completeWizard(p, wizard)
  await p.waitForTimeout(3000)
}

/** The first-run wizard, four steps. Only a name is needed; everything else
 *  is filled in when asked for. `targets` fills a 180 cm, 1996-born man
 *  weighing 80 kg. */
export async function completeWizard(p, {
  name = 'Tester', country = null, city = null, template = 'Minimal planner', targets = false,
  work = null, commute = null,
} = {}) {
  const field = (label) => p.locator('.ob-field', { hasText: label }).locator('input').first()
  const next = () => p.click('.ob-actions button:has-text("Next")')

  // 1. Who is planning.
  await p.getByText('Step 1 of 4').waitFor({ timeout: 20000 })
  await field('Name').fill(name)
  if (country) {
    // Typing filters the list; Enter takes the best match.
    const box = p.locator('.ob-field', { hasText: 'Country' }).locator('input')
    await box.fill(country)
    await box.press('Enter')
  }
  if (city) await field('City').fill(city)
  await next()

  // 2. Your day: work = { start, end, locked }, commute = { before, after, km }.
  await p.getByText('Step 2 of 4').waitFor()
  if (work) {
    await p.locator('.wf-check', { hasText: 'I have work or school hours' }).locator('input').check()
    if (work.start) await p.locator('.wf-grid label', { hasText: 'Start' }).locator('input').fill(work.start)
    if (work.end) await p.locator('.wf-grid label', { hasText: 'End' }).locator('input').fill(work.end)
    if (work.locked) await p.locator('.wf-check', { hasText: 'Keep these hours free' }).locator('input').check()
  }
  if (work && commute) {
    await p.locator('.wf-check', { hasText: 'Plan my commute too' }).locator('input').check()
    if (commute.before != null) await p.locator('.wf-grid label', { hasText: 'Before' }).locator('input').fill(String(commute.before))
    if (commute.after != null) await p.locator('.wf-grid label', { hasText: 'After' }).locator('input').fill(String(commute.after))
    if (commute.km != null) await p.locator('.wf-grid label', { hasText: 'One way' }).locator('input').fill(String(commute.km))
  }
  await next()

  // 3. Start from.
  await p.getByText('Step 3 of 4').waitFor()
  await p.locator('.ob-card', { hasText: template }).click()
  await next()

  // 4. Body targets, off unless asked for.
  await p.getByText('Step 4 of 4').waitFor()
  const toggle = p.locator('button[role=switch][aria-label="Set calorie and body targets"]')
  if ((await toggle.getAttribute('aria-checked')) !== String(Boolean(targets))) await toggle.click()
  if (targets) {
    await p.locator('button[aria-label="Sex"]').click()
    await p.getByRole('option', { name: 'Male', exact: true }).click()
    await field('Date of birth').fill('1996-01-01')
    await field('Height').fill('180')
    await field('Weight today').fill('80')
  }
  await p.click('.ob-actions button:has-text("Start planning")')
  await p.waitForSelector('.bottom-nav', { timeout: 20000 })
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

/** Switch modules on for an account before a check signs in, so a check that
 *  needs the Food or Shop page does not depend on which check ran first.
 *  With { only: true }, every other module is switched off. */
export async function modulesOn(email, keys, { only = false } = {}) {
  const list = keys.map((k) => `('${k}')`).join(', ')
  await sql(`
    insert into public.module_instance (profile_id, module_key, enabled)
      select ${profileOf(email)}, k, true from (values ${list}) v(k)
      on conflict (profile_id, module_key) do update set enabled = true;
    ${only ? `update public.module_instance set enabled = false
      where profile_id = ${profileOf(email)} and module_key not in (${keys.map((k) => `'${k}'`).join(', ')}, 'core');` : ''}`)
}

/** Every built-in module a person can switch on. */
export const ALL_MODULES = ['nutrition', 'shopping', 'training', 'habits', 'supplements', 'health', 'learning',
  'agenda', 'sleep', 'projects', 'finance', 'household']
