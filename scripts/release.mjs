// The release in one command: database migrations, and (when asked) the server
// functions and their secrets. Node only, nothing to install.
//
//   PowerShell:  $env:SB = "<personal access token>"; node scripts/release.mjs --dry-run
//                $env:SB = "<personal access token>"; node scripts/release.mjs
//                $env:SB = "<personal access token>"; node scripts/release.mjs --functions --secrets
//   bash:        SB=<personal access token> node scripts/release.mjs [--dry-run] [--functions] [--secrets]
//
// Migrations. The database keeps a list of the migrations it has had, in
// public._getit_migrations (its name is from before Hemlo and stays, as the
// live database may have it already; made here when missing; no one but the
// owner can read it). Migrations applied before that list existed (001 to 035, by hand,
// with scripts/apply-migrations.mjs) are recognised by a cheap look for
// something each one made (SENTINELS below, checked against a database built
// from every migration by src/test/release-db.check.mjs) and written on the
// list without running them again. Then every migration not on the list runs,
// in order, each in one transaction together with its line on the list: if
// anything in a file fails, nothing of that file is kept, and the run stops
// there so no later file runs on top of a missing one.
//
// --dry-run    says what would happen and changes nothing.
// --functions  also deploys the server functions (after node scripts/copy-shared.mjs),
//              with the Supabase command line tool (npx, bundled by Supabase's
//              servers, no Docker); without npx it prints the commands to run.
// --secrets    sets the server functions' secrets from release.secrets.env (one
//              NAME=value a line; never committed, see .gitignore). Values are
//              never printed. TELEGRAM_CRON_SECRET also goes into Supabase Vault,
//              where the every-minute job (038) reads it.
//
// The token is read from the environment only (SB) and never written anywhere.
// The SQL runner is passed in (managementApi() here, psql in the checks), so
// exactly this code is what the checks run against a local database.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const REF = 'lphysuemxnmcuukzsoya'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations')
/** The Supabase command line tool, at a version known to bundle on the server (--use-api). */
export const SUPABASE_CLI = 'supabase@2.119.0'

/** Every server function, and whether Supabase should demand a signed-in
 *  caller (calendar-fetch) or let the function check its own key (the feed's
 *  token, Telegram's secret header, the every-minute job's secret). */
export const FUNCTIONS = [
  { name: 'calendar-feed', verifyJwt: false },
  { name: 'calendar-fetch', verifyJwt: true },
  { name: 'telegram-webhook', verifyJwt: false },
  { name: 'telegram-send', verifyJwt: false },
]

/* ---------- recognising migrations applied before the list ------------------------- */

const table = (t) => `to_regclass('public.${t}') is not null`
const column = (t, c) => `exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '${t}' and column_name = '${c}')`
const fn = (sig) => `to_regprocedure('${sig}') is not null`
/** A row that a data migration wrote. Read through query_to_xml so the probe
 *  still parses where the table is not there yet. */
const row = (t, where) => `case when to_regclass('public.${t}') is null then false else
  (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.${t} where ${where.replace(/'/g, "''")}', false, true, '')))[1]::text::int > 0 end`

/** One cheap look per migration for something that migration made and no
 *  earlier one did, and that no later one takes away. A migration that only
 *  rewrites data or grants and leaves nothing to look for has none: it counts
 *  as applied when a later migration is (they were always applied in order),
 *  and running one again would be harmless anyway. Files after 035 are
 *  applied by this script, so the list knows them; a sentinel for one only
 *  helps if it was applied by hand first. */
export const SENTINELS = {
  '001': table('household'),
  '002': table('task'),
  '003': table('food'),
  '004': `(select relrowsecurity from pg_class where oid = to_regclass('public.task'))`,
  '005': row('food', "name = 'Abiyuch' and owner_id is null"),
  '007': table('recipe_macros'),
  '009': fn('public.handle_new_user()'),
  '011': column('target', 'updated_at'),
  '012': fn('private.my_profiles()'),
  '013': column('series_exception', 'deleted_at'),
  '014': `coalesce(pg_get_functiondef(to_regprocedure('public.delete_my_account()')), '') like '%audit_log_entries%'`,
  '015': column('profile', 'country'),
  '016': column('module', 'definition'),
  '018': row('module', "key = 'stats'"),
  '019': table('app_admin'),
  '020': table('calendar_feed'),
  '021': column('food', 'barcode'),
  '022': column('food', 'units'),
  '024': fn('private.calendar_subscription_forget_url()'),
  '025': fn('private.household_foods()'),
  '026': table('chore'),
  '027': column('food', 'nevo_code'),
  '028': table('shop_price'),
  '029': table('routine'),
  '030': column('chore', 'paused_from'),
  '031': column('calendar_event', 'rule'),
  '033': column('supplement', 'stock_count'),
  '035': row('food', "id = '977facc0-dc54-5e68-af41-4c8d5ae40c39'"),
  '038': table('telegram_link_code'),
}

export const TRACKING = `
create table if not exists public._getit_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public._getit_migrations enable row level security;
revoke all on public._getit_migrations from public, anon, authenticated;`

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`
const record = (names) => `insert into public._getit_migrations (name) values ${names.map((n) => `(${quote(n)})`).join(', ')} on conflict (name) do nothing;`

/** The migration files in order: 038_v19_telegram_reminders.sql → id 038. */
export function listMigrations(dir = MIGRATIONS) {
  return fs.readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()
    .map((name) => ({ name, id: name.slice(0, 3), file: path.join(dir, name) }))
}

/** What the database has and what it needs, without changing anything.
 *  runner.query(sql) returns rows for one select. */
export async function plan(runner, files, sentinels = SENTINELS) {
  const [{ exists }] = await runner.query(`select to_regclass('public._getit_migrations') is not null as exists`)
  const tracked = new Set(exists ? (await runner.query('select name from public._getit_migrations')).map((r) => r.name) : [])
  const untracked = files.filter((f) => !tracked.has(f.name))
  const probed = untracked.filter((f) => sentinels[f.id])
  const present = new Map()
  if (probed.length) {
    const rows = await runner.query(probed.map((f) => `select ${quote(f.id)} as id, (${sentinels[f.id]}) as present`).join('\nunion all\n'))
    for (const r of rows) present.set(r.id, r.present === true || r.present === 't' || r.present === 'true')
  }
  // The last file known to be in: tracked, or recognised by its sentinel.
  const lastIn = files.reduce((last, f, i) => (tracked.has(f.name) || present.get(f.id) ? i : last), -1)
  const found = []
  const pending = []
  const outOfOrder = []
  files.forEach((f, i) => {
    if (tracked.has(f.name)) return
    if (present.has(f.id)) {
      if (present.get(f.id)) found.push(f)
      else { pending.push(f); if (i < lastIn) outOfOrder.push(f) }
    } else if (i < lastIn) found.push(f) // nothing to look for, and a later one is in
    else pending.push(f)
  })
  return { tracking: exists, tracked: [...tracked], found, pending, outOfOrder }
}

/** The release of the database. runner.apply(sql) runs a script as one
 *  transaction and throws when it fails. Returns what was done. */
export async function migrate(runner, { dir = MIGRATIONS, dryRun = false, log = console.log, sentinels = SENTINELS } = {}) {
  const files = listMigrations(dir)
  const p = await plan(runner, files, sentinels)
  if (!p.tracking) log(dryRun ? 'The list of applied migrations would be made now.' : 'Making the list of applied migrations.')
  if (p.found.length) log(`Already applied before the list existed: ${p.found.map((f) => f.id).join(', ')}`)
  if (p.outOfOrder.length) log(`Note: ${p.outOfOrder.map((f) => f.name).join(', ')} missing although a later migration is in; it runs now.`)
  if (!p.pending.length) log('No migrations to apply.')
  else log(`${dryRun ? 'Would apply' : 'To apply'}: ${p.pending.map((f) => f.name).join(', ')}`)
  const result = { found: p.found.map((f) => f.name), applied: [], failed: null }
  if (dryRun) return result
  await runner.apply(TRACKING + (p.found.length ? `\n${record(p.found.map((f) => f.name))}` : ''))
  for (const f of p.pending) {
    const sql = fs.readFileSync(f.file, 'utf8')
    try {
      // The file and its line on the list, in one transaction.
      await runner.apply(`${sql}\n;\n${record([f.name])}`)
    } catch (e) {
      result.failed = { name: f.name, error: String(e?.message ?? e).slice(0, 2000) }
      log(`${f.name} FAILED. Nothing of it was kept; stopped before the rest.\n${result.failed.error}`)
      return result
    }
    result.applied.push(f.name)
    log(`${f.name} applied`)
  }
  return result
}

/* ---------- the live project, through the Management API ------------------------------------ */

const API = 'https://api.supabase.com/v1'

/** Runs SQL on the project. The Management API sends a script as one query,
 *  so Postgres runs all of it as one transaction. */
export function managementApi(token, ref = REF, fetchFn = fetch) {
  const call = async (query) => {
    const r = await fetchFn(`${API}/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
    })
    const text = await r.text()
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 2000)}`)
    return text ? JSON.parse(text) : []
  }
  return { query: call, apply: async (sql) => { await call(sql) } }
}

/* ---------- functions and secrets ------------------------------------------------------------ */

/** The deploy command for each function. */
export const deployCommands = (ref = REF) => FUNCTIONS.map((f) =>
  `npx --yes ${SUPABASE_CLI} functions deploy ${f.name} --project-ref ${ref} --use-api${f.verifyJwt ? '' : ' --no-verify-jwt'}`)

/** NAME=value lines; # comments and blank lines skipped; quotes taken off. */
export function readSecrets(text) {
  const out = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) throw new Error(`release.secrets.env: a line is not NAME=value (${line.split('=')[0].slice(0, 30)}…)`)
    if (m[1].startsWith('SUPABASE_')) throw new Error(`release.secrets.env: ${m[1]} is set by Supabase itself`)
    out.push({ name: m[1], value: m[2].replace(/^(['"])(.*)\1$/, '$2') })
  }
  return out
}

/** The secret the every-minute job sends, into Vault (038 reads it there). */
export const vaultSql = (value) => `do $v$
begin
  if to_regclass('vault.secrets') is null then raise notice 'No Vault here'; return; end if;
  if exists (select 1 from vault.secrets where name = 'telegram_cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'telegram_cron_secret'), ${quote(value)});
  else
    perform vault.create_secret(${quote(value)}, 'telegram_cron_secret');
  end if;
end $v$;`

export async function setSecrets(token, { dryRun, log, fetchFn = fetch, file = path.join(ROOT, 'release.secrets.env') }) {
  if (!fs.existsSync(file)) { log('No release.secrets.env: no secrets set (see docs/release.md).'); return true }
  const secrets = readSecrets(fs.readFileSync(file, 'utf8')).filter((s) => s.value)
  log(`${dryRun ? 'Would set' : 'Setting'} secrets: ${secrets.map((s) => s.name).join(', ') || 'none'}`)
  if (dryRun || !secrets.length) return true
  const r = await fetchFn(`${API}/projects/${REF}/secrets`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(secrets),
  })
  if (!r.ok) { log(`Secrets FAILED (HTTP ${r.status}).`); return false }
  const cron = secrets.find((s) => s.name === 'TELEGRAM_CRON_SECRET')
  if (cron) {
    // The error could quote the statement, and so the value: never shown.
    try { await managementApi(token, REF, fetchFn).apply(vaultSql(cron.value)) } catch {
      log('TELEGRAM_CRON_SECRET could not be put in Vault; docs/telegram.md has the step to do it by hand.')
      return false
    }
  }
  log('Secrets set.')
  return true
}

function deployFunctions(token, { dryRun, log }) {
  const copy = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'copy-shared.mjs')], { cwd: ROOT, encoding: 'utf8' })
  if (copy.status !== 0) { log(`copy-shared failed:\n${copy.stderr}`); return false }
  const commands = deployCommands()
  if (dryRun) { log(`Would deploy:\n  ${commands.join('\n  ')}`); return true }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  for (const [i, f] of FUNCTIONS.entries()) {
    log(`Deploying ${f.name} …`)
    const args = commands[i].split(' ').slice(1)
    const r = spawnSync(npx, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, SUPABASE_ACCESS_TOKEN: token } })
    if (r.status !== 0) {
      log(`${f.name} was not deployed. Run these yourself (with $env:SUPABASE_ACCESS_TOKEN set to the same token):\n  ${commands.slice(i).join('\n  ')}`)
      return false
    }
  }
  return true
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const token = process.env.SB
  if (!token) { console.error('Set SB to a Supabase personal access token first (PowerShell: $env:SB = "<token>").'); return 1 }
  const log = (s) => console.log(s)
  const runner = managementApi(token)
  const result = await migrate(runner, { dryRun, log })
  if (result.failed) return 1
  if (argv.includes('--secrets') && !(await setSecrets(token, { dryRun, log }))) return 1
  if (argv.includes('--functions') && !deployFunctions(token, { dryRun, log })) return 1
  log(dryRun ? 'Dry run: nothing was changed.' : 'Done.')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }, (e) => { console.error(String(e?.message ?? e)); process.exitCode = 1 })
}
