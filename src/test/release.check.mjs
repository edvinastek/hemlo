// Checks the release script (scripts/release.mjs) with a stand-in database:
// a fresh database gets every migration in order; one that had 001 to 031 by
// hand gets them written on the list without running them, and only the rest
// run; a second run does nothing; a failing file stops the run with nothing of
// it kept and nothing after it run; a dry run changes nothing; a migration
// missing below one that is in runs anyway. Also the Management API runner,
// the deploy commands, and the secrets file (values never printed). The same
// code against a real Postgres: src/test/release-db.check.mjs.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  FUNCTIONS, SENTINELS, deployCommands, listMigrations, managementApi, migrate, plan, readSecrets, setSecrets, vaultSql, MIGRATIONS,
} from '../../scripts/release.mjs'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// The real list of migrations, with stand-in contents.
const real = listMigrations(MIGRATIONS).map((f) => f.name)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hemlo-release-'))
for (const n of real) fs.writeFileSync(path.join(dir, n), `-- ${n}\ncreate table x_${n.slice(0, 3)} ();`)
const ids = real.map((n) => n.slice(0, 3))
const upTo = (id) => ids.filter((i) => i <= id)

/** A database that knows which migrations ran, and answers the script's
 *  three kinds of question the way Postgres would. */
function fakeDb(applied = [], { tracking = false, failOn = null } = {}) {
  const db = { applied: new Set(applied), tracked: new Set(), tracking, runs: [] }
  db.query = async (sql) => {
    if (sql.includes("to_regclass('public._getit_migrations')")) return [{ exists: db.tracking }]
    if (sql.startsWith('select name from public._getit_migrations')) return [...db.tracked].map((name) => ({ name }))
    return [...sql.matchAll(/select '(\d{3})' as id/g)].map((m) => ({ id: m[1], present: db.applied.has(m[1]) }))
  }
  db.apply = async (sql) => {
    const file = /^-- (\d{3}_\S+\.sql)/.exec(sql)?.[1]
    if (file && file === failOn) throw new Error('ERROR: relation "nowhere" does not exist')
    if (sql.includes('create table if not exists public._getit_migrations')) db.tracking = true
    const names = [...sql.matchAll(/\('(\d{3}_[^']+\.sql)'\)/g)].map((m) => m[1])
    if (file) { db.applied.add(file.slice(0, 3)); db.runs.push(file) }
    for (const n of names) db.tracked.add(n)
  }
  return db
}
const quiet = { log: () => {} }

// A fresh database.
const fresh = fakeDb()
const r1 = await migrate(fresh, { dir, ...quiet })
eq('fresh: every migration runs, in order', fresh.runs, real)
eq('fresh: and each is on the list', [...fresh.tracked].sort(), real)
eq('fresh: nothing failed', r1.failed, null)
const r2 = await migrate(fresh, { dir, ...quiet })
eq('a second run applies nothing', [r2.applied, fresh.runs.length], [[], real.length])

// A database that had 001 to 031 by hand, before the list.
const old = fakeDb(upTo('031'))
const p = await plan(old, listMigrations(dir))
eq('001–031 by hand: recognised, data-only ones (006, 008, 010, 017, 023) by a later one',
  p.found.map((f) => f.id), upTo('031'))
eq('001–031 by hand: the rest is to apply', p.pending.map((f) => f.id), ids.filter((i) => i > '031'))
const r3 = await migrate(old, { dir, ...quiet })
eq('001–031 by hand: only the rest runs', old.runs, real.filter((n) => n > '032'))
eq('001–031 by hand: everything is on the list now', [...old.tracked].sort(), real)
eq('001–031 by hand: what was found is reported', r3.found.length, upTo('031').length)
eq('and a second run does nothing', (await migrate(old, { dir, ...quiet })).applied, [])

// A dry run.
const dry = fakeDb(upTo('031'))
const said = []
const r4 = await migrate(dry, { dir, dryRun: true, log: (s) => said.push(s) })
eq('a dry run runs nothing and makes no list', [dry.runs, dry.tracking, dry.tracked.size], [[], false, 0])
eq('a dry run says what it would apply', said.some((s) => s.startsWith('Would apply: 033_')), true)
eq('a dry run reports nothing applied', r4.applied, [])

// A failing file.
const broken = real.find((n) => n.startsWith('033'))
const bad = fakeDb(upTo('031'), { failOn: broken })
const r5 = await migrate(bad, { dir, ...quiet })
eq('a failing file stops the run', r5.failed?.name, broken)
eq('nothing after it runs', bad.runs, [])
eq('it is not on the list, so the next run tries it again', bad.tracked.has(broken), false)
eq('what was found before it is on the list', bad.tracked.has(real.find((n) => n.startsWith('031'))), true)

// One missing below one that is in (035 by hand, 033 not).
const gap = fakeDb([...upTo('031'), '035'])
const p2 = await plan(gap, listMigrations(dir))
eq('a missing one below one that is in is applied and reported', [p2.pending.map((f) => f.id)[0], p2.outOfOrder.map((f) => f.id)], ['033', ['033']])

// The sentinels.
eq('every migration up to 035 that leaves something to find has a sentinel',
  ids.filter((i) => i <= '035' && !SENTINELS[i]), ['006', '008', '010', '017', '023'])
eq('no sentinel for a file that is not there', Object.keys(SENTINELS).filter((k) => !ids.includes(k)), [])

// The Management API runner.
const calls = []
const api = managementApi('sbp_test', 'abcdefghijklmnopqrst', async (url, init) => {
  calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) })
  return init.body.includes('boom') ? new Response('{"message":"syntax error"}', { status: 400 }) : new Response('[{"x":1}]', { status: 201 })
})
eq('the API runner posts the SQL to the project', [await api.query('select 1 as x'), calls[0].url, calls[0].auth, calls[0].body],
  [[{ x: 1 }], 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/query', 'Bearer sbp_test', { query: 'select 1 as x' }])
let thrown = ''
try { await api.apply('boom') } catch (e) { thrown = e.message }
eq('a refusal is an error with what the API said', thrown, 'HTTP 400: {"message":"syntax error"}')

// Functions.
eq('four functions; only calendar-fetch needs a signed-in caller', FUNCTIONS.map((f) => `${f.name}:${f.verifyJwt}`),
  ['calendar-feed:false', 'calendar-fetch:true', 'telegram-webhook:false', 'telegram-send:false'])
eq('the deploy commands', deployCommands('lphysuemxnmcuukzsoya')[2],
  'npx --yes supabase@2.119.0 functions deploy telegram-webhook --project-ref lphysuemxnmcuukzsoya --use-api --no-verify-jwt')
eq('each function is in the folder', FUNCTIONS.every((f) => fs.existsSync(path.join(MIGRATIONS, '..', 'functions', f.name, 'index.ts'))), true)

// Secrets.
eq('the secrets file', readSecrets('# Telegram\nTELEGRAM_BOT_TOKEN=123:abc\n\nTELEGRAM_WEBHOOK_SECRET = "s3cret"\r\nEMPTY=\n'),
  [{ name: 'TELEGRAM_BOT_TOKEN', value: '123:abc' }, { name: 'TELEGRAM_WEBHOOK_SECRET', value: 's3cret' }, { name: 'EMPTY', value: '' }])
let refused = ''
try { readSecrets('SUPABASE_SERVICE_ROLE_KEY=x') } catch (e) { refused = e.message }
eq('Supabase\'s own are refused', refused.includes('set by Supabase itself'), true)
try { readSecrets('not a line') } catch (e) { refused = e.message }
eq('a line that is not NAME=value is refused', refused.startsWith('release.secrets.env: a line'), true)
eq('Vault SQL quotes the value', vaultSql("it's").includes("'it''s'"), true)

const secretsFile = path.join(dir, 'release.secrets.env')
fs.writeFileSync(secretsFile, 'TELEGRAM_BOT_TOKEN=999:VALUE-one\nTELEGRAM_CRON_SECRET=VALUE-two\nTELEGRAM_BOT_NAME=HemloPlannerBot\n')
const sent = []
const logged = []
const ok = await setSecrets('sbp_test', { dryRun: false, log: (s) => logged.push(s), file: secretsFile, fetchFn: async (url, init) => {
  sent.push({ url: String(url), body: JSON.parse(init.body) })
  return new Response('[]', { status: 200 })
} })
eq('secrets: set in one call, and the job\'s secret put in Vault', [ok, sent.length, sent[0].url.endsWith('/projects/lphysuemxnmcuukzsoya/secrets'), sent[0].body.length, sent[1].body.query.includes("'telegram_cron_secret'")],
  [true, 2, true, 3, true])
eq('secrets: names said, values never', [logged.join('\n').includes('TELEGRAM_BOT_TOKEN'), /VALUE-one|VALUE-two/.test(logged.join('\n'))], [true, false])
const dryLogged = []
const dryCalls = []
await setSecrets('sbp_test', { dryRun: true, log: (s) => dryLogged.push(s), file: secretsFile, fetchFn: async () => { dryCalls.push(1); return new Response('[]') } })
eq('secrets: a dry run sends nothing', [dryCalls.length, dryLogged[0].startsWith('Would set secrets: TELEGRAM_BOT_TOKEN')], [0, true])

fs.rmSync(dir, { recursive: true, force: true })
if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nAll release checks passed')
