import { need, sql, checks, open, signIn, profileOf, today, drained, APP } from './e2e.mjs'

// Modules for real, as a tester would use them at 360 px: build a module from
// the Expenses preset, add a record with a date and find it in Postgres, turn
// on "put records with a date on the day as a task" and see the task on
// Today, add a field in the editor and see it on the form, add a night on the
// Sleep page, and rename a built-in module's field and see it on its page.
//
// Needs TEST_MODULES_EMAIL (a new account), TEST_PASSWORD and SB. Every query
// is scoped to that account, because this runs against the live project.
need('TEST_MODULES_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_MODULES_EMAIL
const mine = `profile_id = ${profileOf(email)}`
const userId = `(select id from auth.users where email = '${email}')`
const { is, failed } = checks()
const day = today()
const settle = async (p, ms = 600) => { await p.waitForTimeout(ms); await drained(p) }
const one = async (query) => (await sql(query))[0] ?? {}
const exact = (name) => ({ name, exact: true })
// v17: Edit module is under the page's ⋮.
const pageMenu = async (item) => { await p.locator('.page-menu .pm-button').click(); await p.getByRole('menuitem', exact(item)).click() }

const A = await open({ viewport: { width: 360, height: 780 } })
const p = A.p
await signIn(p, email)

// 1. Build a module from the Expenses preset.
await p.goto(`${APP}more?page=modules`, { waitUntil: 'networkidle' })
await p.getByRole('button', exact('Build a module')).click()
await p.getByRole('dialog', { name: 'Build a module' }).getByLabel('Name').first().fill('E2E Spending')
await p.getByRole('button', exact('Next')).click()
await p.getByRole('button', { name: /^Expenses/ }).click()
await p.getByRole('button', exact('Next')).click()
await p.getByLabel('Keywords').fill('expenses, money')
await p.getByRole('button', exact('Next')).click()
is('the preset’s fields are offered', await p.locator('.mb-fields li').count(), 5)
await p.getByRole('button', exact('Next')).click()
await p.getByRole('button', exact('Create')).click()
await p.waitForURL(/\/m\/u_[a-z0-9]{12}$/, { timeout: 15000 })
const key = p.url().match(/\/m\/(u_[a-z0-9]{12})$/)[1]
await p.locator('h1', { hasText: 'E2E Spending' }).waitFor({ timeout: 10000 }).catch(() => undefined)
is('its page opens, with its name', await p.locator('h1', { hasText: 'E2E Spending' }).count(), 1)
// Its records are read a moment after the page draws.
await p.getByText('No expenses yet').waitFor({ timeout: 10000 }).catch(() => undefined)
is('the empty page says how to add the first record', await p.getByText('No expenses yet').count(), 1)

// 2. A record with a date, in Postgres.
await p.getByRole('button', exact('Add expense')).click()
await p.getByLabel('What').fill('Rent')
await p.getByLabel('Amount').fill('750')
await p.getByRole('button', exact('Save')).click()
await settle(p)
let r = await one(`select count(*) n, bool_and(not builtin) b, bool_and(created_by = ${userId}) own,
  max(definition->'entities'->0->'fields'->0->>'name') first_field from public.module where key = '${key}'`)
is('the module is in Postgres', r.n, 1)
is('as a built module of this account', `${r.b} ${r.own}`, 'true true')
is('with the preset’s fields', r.first_field, 'item')
r = await one(`select count(*) n, max(data->>'item') item, max((data->>'amount'))::text amount, max(record_date)::text d
  from public.module_record where ${mine} and module_key = '${key}' and deleted_at is null`)
is('the record is in Postgres', r.n, 1)
is('with its values', `${r.item} ${r.amount}`, 'Rent 750')
is('and its day', r.d, day)
r = await one(`select enabled from public.module_instance where ${mine} and module_key = '${key}'`)
is('the module is switched on', r.enabled, true)

// 3. Rule (a): the record becomes a task on its day, and shows on Today.
await pageMenu('Edit module')
await p.getByRole('tab', exact('Rules')).click()
await p.getByRole('switch', { name: /Put records with a date on the day as a task/ }).click()
await p.getByRole('button', exact('Save')).click()
await settle(p, 1000)
r = await one(`select count(*) n, max(title) t, max(planned_date)::text d from public.task
  where ${mine} and source = 'module' and module_key = '${key}' and deleted_at is null`)
is('one task, made by the rule', r.n, 1)
is('named and dated by the record', `${r.t} ${r.d}`, `Rent ${day}`)
await p.getByRole('button', exact('Back')).click()
await p.goto(APP, { waitUntil: 'networkidle' })
await p.locator('.row', { hasText: 'Rent' }).first().waitFor({ timeout: 10000 }).catch(() => {})
is('the task is on Today', await p.locator('.row', { hasText: 'Rent' }).count(), 1)

// 4. A field added in the editor is on the form, and in the stored definition.
await p.goto(`${APP}m/${key}`, { waitUntil: 'networkidle' })
await pageMenu('Edit module')
await p.getByRole('button', exact('Add a field')).click()
await p.locator('.me-panel').getByLabel('Name').fill('Shop')
await p.getByRole('button', exact('Add field')).click()
await p.getByRole('button', exact('Save')).click()
await settle(p)
await p.getByRole('button', exact('Back')).click()
await p.getByRole('button', exact('Add expense')).click()
is('the new field is on the form', await p.getByLabel('Shop').count(), 1)
await p.getByRole('button', exact('Cancel')).click()
r = await one(`select definition::text like '%"name": "shop"%' or definition::text like '%"name":"shop"%' has from public.module where key = '${key}'`)
is('and in the stored definition', r.has, true)

// 5. Sleep: switched on in Settings → Modules, a night added on its page.
await p.goto(`${APP}more?page=modules`, { waitUntil: 'networkidle' })
const sleepSwitch = p.getByRole('switch', { name: /Turn Sleep (on|off)/ })
if ((await sleepSwitch.getAttribute('aria-checked')) !== 'true') await sleepSwitch.click()
await settle(p)
await p.goto(`${APP}m/sleep`, { waitUntil: 'networkidle' })
// The round + adds a night; quality is five buttons.
await p.getByRole('button', exact('Add a night')).click()
await p.getByLabel('To bed').fill('23:15')
await p.getByLabel('Woke').fill('07:00')
await p.getByRole('group', exact('Quality, 1 to 5')).getByRole('button', exact('4')).click()
await p.getByRole('button', exact('Save')).click()
await settle(p)
r = await one(`select count(*) n, max(went_to_bed)::text b, max(hours)::text h from public.sleep_log where ${mine} and log_date = '${day}' and deleted_at is null`)
is('the night is in Postgres', r.n, 1)
is('with its times and hours', `${r.b} ${Number(r.h)}`, '23:15:00 7.75')
// The table of nights is the page's Nights tab (v17).
await p.getByRole('tab', exact('Nights')).click()
await p.locator('.sheet tbody tr').first().waitFor({ timeout: 8000 }).catch(() => {})
is('and it shows in the table', await p.locator('.sheet tbody tr').count(), 1)

// 6. A built-in module's field renamed: saved as a change over the app's
// version, and shown on its page.
await p.goto(`${APP}m/agenda`, { waitUntil: 'networkidle' })
await pageMenu('Edit module')
await p.getByLabel('Name of the Where field').fill('Place')
await p.getByRole('button', exact('Save')).click()
await settle(p)
await p.getByRole('button', exact('Back')).click()
await p.getByRole('button', exact('Add event')).click()
is('the renamed field is on the form', await p.getByLabel('Place').count(), 1)
await p.getByRole('button', exact('Cancel')).click()
r = await one(`select settings->'overlay'->'labels'->>'calendar_event.location' l from public.module_instance where ${mine} and module_key = 'agenda'`)
is('kept as an overlay in the module’s settings', r.l, 'Place')

is('no page errors', A.errors.length, 0)
if (A.errors.length) console.log(A.errors.join('\n'))
await A.b.close()
console.log(failed() ? `\n${failed()} failed` : '\nall checks passed')
process.exit(failed() ? 1 : 0)
