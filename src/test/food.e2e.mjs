import { need, open, signIn, sql, profileOf, today, checks, drained } from './e2e.mjs'

// Meals without preset times, meals as plain numbers, and the one figure on
// Today. At 360 px, so the new fields are also checked for running off a
// small phone. Needs TEST_EMAIL, TEST_PASSWORD and SB.
need('TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_EMAIL
const me = profileOf(email)
const { is, failed } = checks()

// A clean day and plain settings: calories only, no default meal times.
const reset = `
  delete from public.meal_plan_slot where profile_id = ${me};
  delete from public.food_log where profile_id = ${me};
  delete from public.task where profile_id = ${me} and source = 'meal';
  update public.profile set settings = (settings - 'meal_times')
    || jsonb_build_object('nutrients', jsonb_build_array('kcal'), 'today_metric', 'kcal')
    where id = ${me};`
await sql(reset)

const { b, p, errors } = await open({ viewport: { width: 360, height: 740 } })
await signIn(p, email)

const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.sheet-wrap, .week-strip, table'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})
const slot = (key) => p.locator(`.slot[data-slot="${key}"]`)
const row = (text) => p.locator('.row', { hasText: text })
const go = async (href) => { await p.click(`.bottom-nav a[href="${href}"]`); await p.waitForTimeout(1200) }

// 1. A meal with no time of its own and no default has no time on Today.
await go('/food')
is('no preset times on the day plan', await slot('lunch').locator('.slot-name').textContent(), 'Lunch')
await p.fill('input[aria-label="Lunch recipe"]', 'Grilled chicken')
await p.locator('.sp-list li[role=option]', { hasText: 'Grilled chicken' }).first().click()
await p.waitForTimeout(900)
await go('/')
is('the planned meal is on Today', await row('Lunch:').count(), 1)
is('without a time', (await row('Lunch:').locator('.row-time').textContent())?.trim(), '')

// 2. Giving it a time puts it at that time on the rail.
await go('/food')
await slot('lunch').locator('button:has-text("Add time")').click()
await p.fill('input[aria-label="Lunch time"]', '12:30')
await p.waitForTimeout(900)
is('the slot header shows the time', await slot('lunch').locator('.slot-name').textContent(), 'Lunch · 12:30')
await go('/')
is('the meal is at its time on Today', (await row('Lunch:').locator('.row-time').textContent())?.trim(), '12:30')

// 3. A snack as plain numbers: 250 kcal per 100 g, 180 g eaten.
await go('/food')
await p.check('input[aria-label="Snack: just numbers"]')
await slot('snack').locator('input[aria-label="What it was"]').fill('Granola')
await slot('snack').locator('button[aria-label="Calories are"]').click()
await slot('snack').locator('.dd-list li', { hasText: 'per 100 g' }).click()
await slot('snack').locator('.qf-field', { hasText: 'kcal per 100 g' }).locator('input').fill('250')
await slot('snack').locator('.qf-field', { hasText: 'Grams eaten' }).locator('input').fill('180')
is('the total is worked out as it is typed', (await slot('snack').locator('.qf-result').textContent())?.trim(), 'Comes to 450 kcal')
is('nothing runs off a 360 px screen with the numbers open', (await overflow()).join(', '), '')
await slot('snack').locator('button:has-text("Save")').click()
await p.waitForTimeout(900)
is('the quick meal shows what it comes to', (await slot('snack').locator('.slot-amounts').textContent())?.trim(), '450 kcal')
await p.click('input[aria-label="Snack eaten"]')
await p.waitForTimeout(900)
is('eating it moves the eaten total', /Eaten\s*450 kcal/.test((await p.locator('.totals').textContent()) ?? ''), true)

await go('/')
is('its task reads with the numbers', await row('Snack: Granola · 450 kcal').count(), 1)
is('and is ticked', await p.locator('.row.is-done', { hasText: 'Snack: Granola' }).count(), 1)

// 4. Today shows the chosen figure: calories by default (only the snack is eaten).
is('Today shows calories', /^450( \/ \d+)? kcal$/.test((await p.locator('.page-sub').first().textContent()) ?? ''), true)

await drained(p)
const [log] = await sql(`select kcal, grams, label, recipe_id from public.food_log
  where profile_id = ${me} and log_date = '${today()}' and deleted_at is null and label = 'Granola'`)
is('the eaten quick meal reached food_log', log ? `${Number(log.kcal)} kcal, ${Number(log.grams)} g, ${log.label}` : 'missing', '450 kcal, 180 g, Granola')
is('with no recipe behind it', log?.recipe_id ?? null, null)
const [plan] = await sql(`select kcal, grams from public.meal_plan_slot
  where profile_id = ${me} and slot_date = '${today()}' and deleted_at is null and slot = 'snack'`)
is('the plan holds the same numbers', plan ? `${Number(plan.kcal)} kcal, ${Number(plan.grams)} g` : 'missing', '450 kcal, 180 g')
const [lunch] = await sql(`select to_char(slot_time, 'HH24:MI') as t from public.meal_plan_slot
  where profile_id = ${me} and slot_date = '${today()}' and deleted_at is null and slot = 'lunch'`)
is('the lunch time reached the server', lunch?.t, '12:30')

// Unticking takes it back out.
await go('/food')
await p.click('input[aria-label="Snack eaten"]')
await drained(p)
const [gone] = await sql(`select count(*) as n from public.food_log where profile_id = ${me} and label = 'Granola' and deleted_at is null`)
is('unticking removes the log', Number(gone?.n), 0)
await p.click('input[aria-label="Snack eaten"]')
await drained(p)

// 5. Choosing protein, then nothing, in settings.
await go('/more')
await p.click('.tabs button:has-text("Profile")')
await p.locator('.fs-check', { hasText: 'Protein' }).locator('input').click()
await p.waitForTimeout(600)
await p.click('button[aria-label="Figure on Today"]')
await p.locator('.dd-list li', { hasText: 'Protein (g)' }).click()
await p.waitForTimeout(600)
is('nothing runs off a 360 px screen in Food settings', (await overflow()).join(', '), '')
await go('/')
is('Today shows protein when chosen', /^Protein \d+( \/ \d+)? g$/.test((await p.locator('.page-sub').first().textContent()) ?? ''), true)

await go('/more')
await p.click('.tabs button:has-text("Profile")')
await p.click('button[aria-label="Figure on Today"]')
await p.locator('.dd-list li', { hasText: 'Nothing' }).click()
await p.waitForTimeout(600)
await go('/')
is('Today shows no figure when none is chosen', await p.locator('.page-sub').count(), 0)
is('and no bar', await p.locator('.metric-track').count(), 0)
await drained(p)
const [settings] = await sql(`select settings->>'today_metric' as m from public.profile where id = ${me}`)
is('the choice reached the server', settings?.m, 'none')

// Leave the account as the other checks expect it.
await sql(reset)
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
