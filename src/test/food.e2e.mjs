import { need, open, signIn, sql, profileOf, today, checks, drained, modulesOn } from './e2e.mjs'

// Food logging with no fixed meals (v16): the add-food sheet's two steps, a
// recipe planned under a meal named on the spot, a time given on the day,
// plain numbers as their own meal, eating and un-eating, the meal's task on
// Today ticked both ways (GEN-31), the person's own meals as cards, and the
// one figure on Today. At 360 px, so nothing may run off a small phone.
// Needs TEST_EMAIL, TEST_PASSWORD and SB, and migrations up to 027 on the
// project.
need('TEST_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_EMAIL
const me = profileOf(email)
const { is, failed } = checks()

// A clean day and plain settings: calories only, no meals of one's own.
const reset = `
  delete from public.meal_plan_slot where profile_id = ${me};
  delete from public.food_log where profile_id = ${me};
  delete from public.task where profile_id = ${me} and source = 'meal';
  update public.profile set settings = (settings - 'meal_times' - 'meals')
    || jsonb_build_object('nutrients', jsonb_build_array('kcal'), 'today_metric', 'kcal')
    where id = ${me};`
await sql(reset)

await modulesOn(email, ['nutrition'])
const { b, p, errors } = await open({ viewport: { width: 360, height: 740 } })
await signIn(p, email)

const overflow = () => p.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('.page *, .bottom-sheet *')]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && !el.closest('.af-tabs, .amt-units, .week-strip, table'))
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`).slice(0, 5)
})
const meal = (name) => p.locator(`section.fd-meal[aria-label="${name}"]`)
const row = (text) => p.locator('.row', { hasText: text })
const go = async (href) => { await p.click(`.bottom-nav a[href="${href}"]`); await p.waitForTimeout(1200) }

// 1. No meals of one's own: an empty day says what it is for; no cards.
await go('/food')
is('an empty day offers the first action', await p.locator('.fd-empty').count(), 1)
is('no fixed meal cards', await p.locator('section.fd-meal').count(), 0)

// 2. + Add food: name the meal "Lunch", any time, planned; a recipe from the Recipes tab.
await p.click('.fd-addbtn')
await p.click('.af-chip:has-text("Name it")')
await p.fill('input[aria-label="Meal’s name"]', 'Lunch')
await p.click('.af-chip:has-text("Any time")')
await p.uncheck('.af-eaten input')
is('nothing runs off a 360 px screen in step 1', (await overflow()).join(', '), '')
await p.click('text=Next: choose the food')
await p.click('.af-tabs button:has-text("Recipes")')
await p.fill('.af-search', 'Grilled chicken')
await p.locator('.af-row', { hasText: 'Grilled chicken' }).first().click()
is('it is on the plate', await p.locator('.af-plate-item').count(), 1)
is('nothing runs off a 360 px screen in step 2', (await overflow()).join(', '), '')
await p.click('.af-actions .btn-primary')
await p.waitForTimeout(900)
is('the meal appears, named', await meal('Lunch').count(), 1)
is('without a time', await meal('Lunch').locator('.fd-time').count(), 0)
await go('/')
is('the planned meal is on Today', await row('Lunch: Grilled').count(), 1)
is('without a time on Today', (await row('Lunch: Grilled').locator('.row-time').textContent())?.trim(), '')

// 3. Giving the meal a time on the day puts it at that time on Today.
await go('/food')
await meal('Lunch').locator('button[aria-label="More for Lunch"]').click()
await meal('Lunch').locator('button:has-text("Give it a time")').click()
await p.fill('input[aria-label="Lunch time"]', '12:30')
await p.waitForTimeout(900)
is('the card shows the time', (await meal('Lunch').locator('.fd-time').textContent())?.trim(), '12:30')
await go('/')
is('the meal is at its time on Today', (await row('Lunch: Grilled').locator('.row-time').textContent())?.trim(), '12:30')

// 4. A snack as plain numbers: 250 kcal per 100 g, 180 g eaten, eaten now.
await go('/food')
await p.click('.fd-addbtn')
await p.click('.af-chip:has-text("Another name")')
await p.fill('input[aria-label="Meal’s name"]', 'Snack')
await p.click('.af-chip:has-text("Any time")')
await p.check('.af-eaten input')
await p.click('text=Next: choose the food')
await p.click('.af-tabs button:has-text("Just numbers")')
await p.fill('.qf input[aria-label="What it was"]', 'Granola')
await p.click('.qf button[aria-label="Calories are"]')
await p.locator('.dd-list li', { hasText: 'per 100 g' }).click()
await p.locator('.qf-field', { hasText: 'kcal per 100 g' }).locator('input').fill('250')
await p.fill('input[aria-label="How much was eaten, in grams"]', '180')
is('the total is worked out as it is typed', (await p.locator('.qf-result').textContent())?.trim(), 'Comes to 450 kcal')
await p.click('.qf button[type=submit]')
await p.click('.af-actions .btn-primary')
await p.waitForTimeout(900)
is('the snack shows what it comes to', (await meal('Snack').locator('.fd-kcal').textContent())?.trim(), '450 kcal')
is('and is eaten', await meal('Snack').locator('.fd-head input[type=checkbox]').isChecked(), true)
is('eating it moved the eaten total', /Eaten\s*450 kcal/.test((await p.locator('.totals').textContent()) ?? ''), true)
is('Undo is offered', await p.locator('.undo-bar').count(), 1)

await go('/')
is('its task reads with the numbers', await row('Snack: Granola · 450 kcal').count(), 1)
is('and is ticked', await p.locator('.row.is-done', { hasText: 'Snack: Granola' }).count(), 1)
is('Today shows calories', /^450( \/ \d+)? kcal$/.test((await p.locator('.page-sub').first().textContent()) ?? ''), true)

// 5. Ticking the lunch task on Today eats the lunch (GEN-31).
await row('Lunch: Grilled').locator('input[type=checkbox], button[aria-pressed]').first().click()
await p.waitForTimeout(900)
await go('/food')
is('the meal is eaten after ticking its task', await meal('Lunch').locator('.fd-head input[type=checkbox]').isChecked(), true)

await drained(p)
const [log] = await sql(`select kcal, grams, label, recipe_id from public.food_log
  where profile_id = ${me} and log_date = '${today()}' and deleted_at is null and label = 'Granola'`)
is('the eaten quick meal reached food_log', log ? `${Number(log.kcal)} kcal, ${Number(log.grams)} g, ${log.label}` : 'missing', '450 kcal, 180 g, Granola')
is('with no recipe behind it', log?.recipe_id ?? null, null)
const [lunchLog] = await sql(`select count(*) as n from public.food_log
  where profile_id = ${me} and log_date = '${today()}' and deleted_at is null and recipe_id is not null`)
is('the lunch eaten from its task reached food_log', Number(lunchLog?.n), 1)
const [plan] = await sql(`select kcal, grams, slot from public.meal_plan_slot
  where profile_id = ${me} and slot_date = '${today()}' and deleted_at is null and label = 'Granola'`)
is('the plan holds the same numbers, under the snack', plan ? `${Number(plan.kcal)} kcal, ${Number(plan.grams)} g, ${plan.slot}` : 'missing', '450 kcal, 180 g, snack')
const [lunch] = await sql(`select to_char(slot_time, 'HH24:MI') as t from public.meal_plan_slot
  where profile_id = ${me} and slot_date = '${today()}' and deleted_at is null and slot = 'lunch'`)
is('the lunch time reached the server', lunch?.t, '12:30')

// 6. Unticking takes it back out; ticking again puts it back.
await meal('Snack').locator('.fd-head input[type=checkbox]').click()
await drained(p)
const [gone] = await sql(`select count(*) as n from public.food_log where profile_id = ${me} and label = 'Granola' and deleted_at is null`)
is('unticking removes the log', Number(gone?.n), 0)
await meal('Snack').locator('.fd-head input[type=checkbox]').click()
await drained(p)

// 7. One's own meals: a set to start from; then each is a card, even empty.
await go('/more')
await p.click('.tabs button:has-text("Profile")')
await p.click('.fs-presets button:has-text("Breakfast, lunch, dinner")')
await p.waitForTimeout(800)
is('the meals are listed', await p.locator('.fs-meal').count(), 3)
is('nothing runs off a 360 px screen in Food settings', (await overflow()).join(', '), '')
await go('/food')
is('an empty card for breakfast', await meal('Breakfast').locator('.fd-nothing').count(), 1)
is('lunch takes its own meal’s place', await meal('Lunch').count(), 1)

// 8. Choosing protein, then nothing, for Today's figure.
await go('/more')
await p.click('.tabs button:has-text("Profile")')
await p.locator('.fs-check', { hasText: 'Protein' }).locator('input').click()
await p.waitForTimeout(600)
await p.click('button[aria-label="Figure on Today"]')
await p.locator('.dd-list li', { hasText: 'Protein (g)' }).click()
await p.waitForTimeout(600)
await go('/')
is('Today shows protein when chosen', /^Protein \d+( \/ \d+)? g$/.test((await p.locator('.page-sub').first().textContent()) ?? ''), true)
await go('/more')
await p.click('.tabs button:has-text("Profile")')
await p.click('button[aria-label="Figure on Today"]')
await p.locator('.dd-list li', { hasText: 'Nothing' }).click()
await p.waitForTimeout(600)
await go('/')
is('Today shows no figure when none is chosen', await p.locator('.page-sub').count(), 0)
await drained(p)
const [settings] = await sql(`select settings->>'today_metric' as m, jsonb_array_length(settings->'meals'->'names') as n from public.profile where id = ${me}`)
is('the choices reached the server', `${settings?.m}, ${settings?.n} meals`, 'none, 3 meals')

// Leave the account as the other checks expect it.
await sql(reset)
console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
