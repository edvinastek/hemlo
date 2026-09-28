// Copies the pure calendar rules the server functions need from src/lib into
// supabase/functions/_shared/, so each function deploys on its own and still
// runs exactly the code the app runs and the checks test.
//
//   node scripts/copy-shared.mjs          write the copies
//   node scripts/copy-shared.mjs --check  say whether they are up to date
//
// npm run check fails when a copy is out of date (src/test/calendarlinks.check.mjs),
// so a change to the rules cannot reach the app without reaching the server.
//
// Why copies and not imports across folders: the Supabase CLI bundles a
// function from supabase/functions/, and code outside that folder is not
// reliably included. The app's types file is not copied whole (it reaches
// into the rest of the app); the few types the rules need are cut out of it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src/lib')
const OUT = join(root, 'supabase/functions/_shared')

const header = (from) =>
  `// Generated from src/lib/${from} by scripts/copy-shared.mjs. Do not edit here:\n` +
  `// change the original and run \`node scripts/copy-shared.mjs\`.\n\n`

/** The declarations the rules use, cut out of src/lib/types.ts as they are. */
const TYPES = ['UUID', 'TaskStatus', 'Horizon', 'Task', 'Series', 'SeriesException']

function cutTypes(text) {
  const parts = []
  for (const name of TYPES) {
    const block = new RegExp(`^export interface ${name} \\{[\\s\\S]*?^\\}\\n`, 'm').exec(text)
    const alias = new RegExp(`^export type ${name} = [^\\n]*\\n`, 'm').exec(text)
    const found = block?.[0] ?? alias?.[0]
    if (!found) throw new Error(`src/lib/types.ts has no ${name}`)
    if (/import\(/.test(found)) throw new Error(`${name} in src/lib/types.ts reaches into another file`)
    parts.push(found)
  }
  return parts.join('\n')
}

/** Every file to write, by name, with its content. Nothing is written here. */
export function generate() {
  const read = (f) => readFileSync(join(SRC, f), 'utf8')
  const files = {
    'types.ts': header('types.ts (only the types the rules use)') + cutTypes(read('types.ts')),
    // Deno wants the extension on every relative import.
    'series-rules.ts': header('series-rules.ts') + read('series-rules.ts').replace("from './types'", "from './types.ts'"),
    'ics-rules.ts': header('ics-rules.ts') + read('ics-rules.ts'),
    'calendar-links-rules.ts': header('calendar-links-rules.ts') + read('calendar-links-rules.ts'),
  }
  for (const [name, text] of Object.entries(files)) {
    const bad = [...text.matchAll(/from '(\.[^']*)'/g)].map((m) => m[1]).filter((p) => !p.endsWith('.ts'))
    if (bad.length) throw new Error(`${name} imports ${bad.join(', ')} without the .ts Deno needs`)
  }
  return files
}

/** Names of the copies that differ from what generate() makes. */
export function stale() {
  const want = generate()
  return Object.keys(want).filter((name) => {
    try { return readFileSync(join(OUT, name), 'utf8') !== want[name] } catch { return true }
  })
}

function main(argv) {
  if (argv.includes('--check')) {
    const out = stale()
    if (out.length) { process.stderr.write(`Out of date: ${out.join(', ')}. Run node scripts/copy-shared.mjs\n`); return 1 }
    process.stdout.write('The server copies are up to date.\n')
    return 0
  }
  mkdirSync(OUT, { recursive: true })
  for (const [name, text] of Object.entries(generate())) writeFileSync(join(OUT, name), text)
  process.stdout.write(`Wrote ${Object.keys(generate()).length} files to supabase/functions/_shared/\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv)
}
