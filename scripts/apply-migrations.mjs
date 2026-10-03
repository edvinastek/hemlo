// Applies migrations to the live Supabase project through the Management API.
//
//   PowerShell:  $env:SB = "<personal access token>"; node scripts/apply-migrations.mjs 026 027 028 029 030 031
//   bash:        SB=<personal access token> node scripts/apply-migrations.mjs 026 027 028 029 030 031
//
// Each file is sent as one request, and Postgres runs it as one transaction:
// if anything in a file fails, nothing of that file is kept, and the script
// stops there so the later files are never run on top of a half-done one.
// The token is read from the environment only; it is never written anywhere.
import fs from 'node:fs'
import path from 'node:path'

const REF = 'lphysuemxnmcuukzsoya'
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'supabase', 'migrations')
const token = process.env.SB
if (!token) { console.error('Set SB to a Supabase personal access token first.'); process.exit(1) }
const wanted = process.argv.slice(2)
if (!wanted.length) { console.error('Name the migrations to apply, e.g. 026 027'); process.exit(1) }

async function run(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return { ok: r.ok, status: r.status, text: await r.text() }
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
for (const n of wanted) {
  const file = files.find((f) => f.startsWith(`${n}_`))
  if (!file) { console.error(`No migration starting with ${n}_`); process.exit(1) }
  process.stdout.write(`${file} … `)
  const res = await run(fs.readFileSync(path.join(DIR, file), 'utf8'))
  if (!res.ok) {
    console.log(`FAILED (${res.status})\n${res.text.slice(0, 2000)}\nNothing of ${file} was kept. Stopped before the rest.`)
    process.exit(1)
  }
  console.log('done')
}

// A quick look that the new tables and columns are there.
const check = await run(`select
  to_regclass('public.shopping_entry') is not null as "026 shopping_entry",
  to_regclass('public.chore') is not null as "026 chore",
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'food' and column_name = 'nevo_code') as "027 NEVO foods",
  to_regclass('public.shop_price') is not null as "028 shop_price",
  to_regclass('public.routine') is not null as "029 routine",
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chore' and column_name = 'paused_from') as "030 chore holidays",
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'calendar_event' and column_name = 'rule') as "031 repeating events"`)
console.log(check.ok ? check.text : `Check failed: ${check.text}`)
