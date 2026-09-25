// Play Store phone screenshots at 1080 x 1920, from a demo account.
// Needs DEMO_EMAIL, DEMO_PASSWORD and SB (to fill the demo account with a
// believable week), and a built app served on :4173. The demo account is an
// invented person: make it with scripts/test-accounts.mjs and delete it after.
import { need, sql, open, signIn, profileOf, today, drained } from '../src/test/e2e.mjs'

need('DEMO_EMAIL', 'DEMO_PASSWORD', 'SB')
const email = process.env.DEMO_EMAIL
const pid = profileOf(email)
const day = today()
const ago = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv')

// Filled once; running again only retakes the shots.
const [{ n: seeded }] = await sql(`select count(*)::int n from public.habit where profile_id = ${pid}`)

// 1. Sign in once, which runs the first-run wizard, then plan meals through the UI.
if (!seeded) {
  const { b, p } = await open()
  await signIn(p, email, process.env.DEMO_PASSWORD)
  await p.click('.bottom-nav a[href="/food"]')
  await p.waitForTimeout(1200)
  for (const [slot, name] of [['Breakfast', 'Overnight oats'], ['Lunch', 'Grilled chicken'], ['Dinner', 'Salmon with sweet']]) {
    const sel = p.locator(`select[aria-label="${slot} recipe"]`)
    if (!(await sel.count())) continue
    const value = await sel.locator('option', { hasText: name }).first().getAttribute('value').catch(() => null)
    if (value) { await sel.selectOption(value); await p.waitForTimeout(700) }
  }
  const suggest = p.locator('button.suggest')
  if (await suggest.count()) await suggest.click()
  await p.waitForTimeout(800)
  await drained(p)
  await b.close()
}

// 2. The rest straight into the database: a day's plan, two weeks of
//    weigh-ins, habits and supplements with some history.
if (!seeded) await sql(`
  update public.profile set name = 'Alex' where id = ${pid};
  insert into public.task (profile_id, title, category, planned_date, planned_time, duration_min, status) values
    (${pid}, 'Morning pages', 'Personal', '${day}', '07:00', 15, 'done'),
    (${pid}, 'Deep work: chapter 3 draft', 'Work', '${day}', '09:00', 90, 'done'),
    (${pid}, 'Team check-in', 'Work', '${day}', '11:00', 30, 'todo'),
    (${pid}, 'Calisthenics A', 'Training', '${day}', '17:30', 45, 'todo'),
    (${pid}, 'Groceries for the week', 'Household', '${day}', '18:30', 30, 'todo'),
    (${pid}, 'Read, 30 min', 'Night', '${day}', '21:30', 30, 'todo');
  delete from public.body_log where profile_id = ${pid};
  insert into public.body_log (profile_id, log_date, weight_kg, waist_cm)
    select ${pid}, (current_date - g)::date, round((82.4 + g * 0.11 + (random() - 0.5) * 0.5)::numeric, 1), case when g % 7 = 0 then 88 + g * 0.1 end
    from generate_series(0, 13) g;
  with h as (
    insert into public.habit (profile_id, name, schedule, sort_order) values
      (${pid}, 'Stretch 10 min', 'daily', 0), (${pid}, '10,000 steps', 'daily', 1), (${pid}, 'Phone out of the bedroom', 'daily', 2)
    returning id, sort_order)
  insert into public.habit_log (habit_id, log_date, done)
    select h.id, (current_date - g)::date, true from h, generate_series(1, 9) g where (g + h.sort_order) % 4 <> 0;
  with s as (
    insert into public.supplement (profile_id, name, dose_text, time_slot, sort_order) values
      (${pid}, 'Vitamin D', '25 µg', 'morning', 0), (${pid}, 'Creatine', '5 g', 'midday', 1), (${pid}, 'Magnesium', '300 mg', 'evening', 2)
    returning id, sort_order)
  insert into public.supplement_log (supplement_id, log_date, done)
    select s.id, current_date, true from s where s.sort_order = 0;
`)

// 3. The shots.
const shoot = async (scheme, shots) => {
  const { b, p } = await open({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, colorScheme: scheme })
  await signIn(p, email, process.env.DEMO_PASSWORD)
  await p.waitForTimeout(2500)
  for (const [file, go] of shots) {
    await go(p)
    await p.waitForTimeout(1200)
    await p.screenshot({ path: `store/screenshots/${file}.png` })
    console.log('wrote', file)
  }
  await b.close()
}
const nav = (href) => (p) => p.click(`.bottom-nav a[href="${href}"]`)
const tab = (href, name) => async (p) => { await p.click(`.bottom-nav a[href="${href}"]`); await p.click(`.tabs button:has-text("${name}")`) }

await shoot('light', [
  ['1-today', nav('/')],
  ['2-body', tab('/', 'Body')],
  ['3-meals', nav('/food')],
  ['4-shop', nav('/shop')],
  ['5-week', tab('/plan', 'Week')],
  ['6-month', tab('/plan', 'Month')],
])
await shoot('dark', [['7-today-dark', nav('/')]])
