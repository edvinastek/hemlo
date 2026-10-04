// The release script against a real Postgres (not in npm run check: it needs
// the local database from scripts/localdb.sh running).
//
//   LOCALDB_NAME=pg19x4 LOCALDB_PORT=55444 bash scripts/localdb.sh
//   RELEASE_PG="-h /home/pgtest/pg19x4 -p 55444 -U postgres" node src/test/release-db.check.mjs
//
// Makes throwaway databases next to the local one (dropped at the end) and
// runs scripts/release.mjs's own migrate() through a psql runner:
//  1. every sentinel is false before its migration and true after it, and all
//     are still true once every migration has run (so each recognises its own
//     file and nothing later takes it away);
//  2. a fresh database gets every migration, each on the list;
//  3. a second run does nothing;
//  4. a database that had 001 to 031 by hand gets those on the list without
//     running them, and only 033 onwards run;
//  5. a failing file stops the run: nothing of it kept, nothing after it run.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { SENTINELS, listMigrations, migrate, MIGRATIONS } from '../../scripts/release.mjs'

const PG = (process.env.RELEASE_PG ?? '').split(' ').filter(Boolean)
if (!PG.length) { console.log('Set RELEASE_PG to the psql connection, e.g. "-h /home/pgtest/pg19x4 -p 55444 -U postgres".'); process.exit(1) }
const STUB = path.join(MIGRATIONS, '..', '..', 'scripts', 'stub.sql')

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

function psql(db, args, input) {
  const r = spawnSync('psql', [...PG, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], { input, encoding: 'utf8', maxBuffer: 64 << 20 })
  if (r.status !== 0) throw new Error(r.stderr.trim().split('\n').filter((l) => !/NOTICE/.test(l)).join('\n') || `psql exited ${r.status}`)
  return r.stdout
}
/** The runner the script gets: one select's rows as JSON; a script as one transaction. */
const runner = (db) => ({
  query: async (sql) => JSON.parse(psql(db, ['-t', '-A', '-c', `select coalesce(json_agg(q), '[]'::json) from (${sql}) q`]).trim()),
  apply: async (sql) => { psql(db, ['-1', '-f', '-'], sql) },
})
function freshDb(name) {
  psql('postgres', ['-c', `drop database if exists ${name}`])
  psql('postgres', ['-c', `create database ${name}`])
  psql(name, ['-c', 'create extension if not exists pg_trgm'])
  psql(name, ['-f', STUB])
}
const dropDb = (name) => psql('postgres', ['-c', `drop database if exists ${name}`])
const quiet = { log: () => {} }
const files = listMigrations()
const names = files.map((f) => f.name)
const probe = async (db, id) => (await runner(db).query(`select (${SENTINELS[id]}) as present`))[0].present

// 1. The sentinels, one migration at a time.
freshDb('rel_steps')
const wrong = []
for (const f of files) {
  if (SENTINELS[f.id] && (await probe('rel_steps', f.id)) !== false) wrong.push(`${f.id} true before`)
  psql('rel_steps', ['-1', '-f', f.file])
  if (SENTINELS[f.id] && (await probe('rel_steps', f.id)) !== true) wrong.push(`${f.id} false after`)
}
eq('each sentinel is false before its migration and true after it', wrong, [])
const after = []
for (const id of Object.keys(SENTINELS)) if ((await probe('rel_steps', id)) !== true) after.push(id)
eq('all sentinels are still true once every migration has run', after, [])
dropDb('rel_steps')

// 2 and 3. A fresh database.
freshDb('rel_fresh')
const r1 = await migrate(runner('rel_fresh'), quiet)
eq('fresh: every migration applied, in order', r1.applied, names)
eq('fresh: each is on the list', (await runner('rel_fresh').query('select name from public._getit_migrations order by name')).map((r) => r.name), names)
const r2 = await migrate(runner('rel_fresh'), quiet)
eq('a second run applies nothing and finds nothing new', [r2.applied, r2.found, r2.failed], [[], [], null])
eq('the list is the owner\'s only', (await runner('rel_fresh').query(
  `select has_table_privilege('authenticated', 'public._getit_migrations', 'select') or has_table_privilege('anon', 'public._getit_migrations', 'select') as open`))[0].open, false)
dropDb('rel_fresh')

// 4. 001 to 031 by hand, before the list.
freshDb('rel_031')
for (const f of files.filter((f) => f.id <= '031')) psql('rel_031', ['-1', '-f', f.file])
const r3 = await migrate(runner('rel_031'), quiet)
eq('001–031 by hand: recognised without running', r3.found, names.filter((n) => n < '032'))
eq('001–031 by hand: only the rest applied', r3.applied, names.filter((n) => n > '032'))
eq('001–031 by hand: and the second run does nothing', (await migrate(runner('rel_031'), quiet)).applied, [])
dropDb('rel_031')

// 5. A failing file between 031 and 033.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'getit-release-db-'))
for (const f of files) fs.copyFileSync(f.file, path.join(dir, f.name))
fs.writeFileSync(path.join(dir, '032_broken.sql'), 'create table public.zz_half_done (x int);\nselect 1 / 0;\n')
freshDb('rel_fail')
for (const f of files.filter((f) => f.id <= '031')) psql('rel_fail', ['-1', '-f', f.file])
const r4 = await migrate(runner('rel_fail'), { dir, ...quiet })
eq('a failing file stops the run', [r4.failed?.name, r4.applied], ['032_broken.sql', []])
eq('nothing of it was kept', (await runner('rel_fail').query(`select to_regclass('public.zz_half_done') is null as gone`))[0].gone, true)
eq('nothing after it ran (033 not in)', await probe('rel_fail', '033'), false)
eq('it is not on the list; what was found before it is',
  (await runner('rel_fail').query(`select count(*) filter (where name = '032_broken.sql') as broken, count(*) as n from public._getit_migrations`))[0],
  { broken: 0, n: files.filter((f) => f.id <= '031').length })
fs.writeFileSync(path.join(dir, '032_broken.sql'), 'select 1;\n')
const r5 = await migrate(runner('rel_fail'), { dir, ...quiet })
eq('once fixed, the next run carries on from it', r5.applied, ['032_broken.sql', ...names.filter((n) => n > '032')])
dropDb('rel_fail')
fs.rmSync(dir, { recursive: true, force: true })

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nAll release database checks passed')
