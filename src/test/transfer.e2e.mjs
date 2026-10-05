import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { need, open, signIn, modulesOn, checks, drained, sql, profileOf, APP } from './e2e.mjs'

// Import and export end to end: a Finance entry exported as CSV from its
// module page (the link clear of the add button), read back in, as a new row,
// through Settings → Data and account → Import and export and found locally and in Postgres,
// a second read of the same file adding nothing; then a small calendar file read
// into Tasks, a weekly repeat included. Needs TEST_FEAT_EMAIL, TEST_PASSWORD, SB.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
await modulesOn(email, ['finance'])
const { is, failed } = checks()
const { b, p, errors } = await open({ viewport: { width: 360, height: 740 }, acceptDownloads: true })
await signIn(p, email)
const dir = mkdtempSync(join(tmpdir(), 'visuma-transfer-'))
const note = `e2e-transfer-${Date.now()}`

// 1. A Finance entry, made on its page.
await p.goto(new URL('m/finance', APP).href, { waitUntil: 'domcontentloaded' })
// The fast entry (v16): the amount, a note, then a tap on the category
// saves it. The note carries a comma, so the CSV has to quote it.
const memo = `${note}, weekly`
await p.locator('.fab').click()
const sheet = p.locator('.bottom-sheet')
await sheet.getByRole('textbox', { name: 'Amount' }).fill('12.5')
await sheet.locator('label', { hasText: 'Note' }).locator('input').fill(memo)
await sheet.locator('.fin-grid button', { hasText: /^Groceries$/ }).click()
await p.waitForTimeout(800)

// 2. Export… is in the page's ⋮ (v17: no Export links on pages).
is('the page has no Export link', await p.locator('.xl-link').count(), 0)
await p.locator('.page-menu .pm-button').click()
await p.getByRole('menuitem', { name: 'Export…' }).click()
const [download] = await Promise.all([p.waitForEvent('download'), p.locator('.xl-format', { hasText: 'CSV' }).click()])
const csvPath = join(dir, download.suggestedFilename())
await download.saveAs(csvPath)
const csv = readFileSync(csvPath, 'utf8')
is('CSV starts with the byte-order mark', csv.charCodeAt(0), 0xfeff)
is('CSV has the entry, comma quoted', csv.includes(`"${memo}"`) && csv.includes('Groceries'), true)
await p.getByRole('button', { name: 'Close' }).click()

// 3. The file, with its note changed so it is a new row, read back in through Settings.
const again = `${memo}-back`
writeFileSync(csvPath, csv.replace(memo, again))
await p.goto(new URL('more?page=data', APP).href, { waitUntil: 'domcontentloaded' })
await p.locator('.dd-button').first().click()
await p.getByRole('option', { name: /^Finance/ }).click()
await p.locator('.tx input[type=file]').setInputFiles(csvPath)
await p.getByText(/ready/).first().waitFor({ timeout: 10000 })
const importBtn = p.getByRole('button', { name: /^Import \d+ rows?$/ })
is('the preview offers the row', await importBtn.textContent(), 'Import 1 row')
await importBtn.click()
await p.getByText(/rows? added/).waitFor({ timeout: 10000 })
const back = await p.evaluate(async (text) => {
  const open = indexedDB.open('getit')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const rows = await new Promise((r) => { const q = db.transaction('module_record').objectStore('module_record').getAll(); q.onsuccess = () => r(q.result) })
  return rows.filter((x) => x.data?.note === text && !x.deleted_at).map((x) => [x.data.category, x.data.amount])
}, again)
is('the imported entry is there, as exported', JSON.stringify(back), JSON.stringify([['Groceries', 12.5]]))
is('the import reached the server', await drained(p), true)
const server = await sql(`select data->>'category' as c from public.module_record where profile_id = ${profileOf(email)} and data->>'note' = '${again}' and deleted_at is null`)
is('Postgres has the imported entry', server?.[0]?.c, 'Groceries')

// 4. The same file again: every row is already here.
await p.locator('.tx input[type=file]').setInputFiles(csvPath)
await p.getByText(/already here/).first().waitFor({ timeout: 10000 })
// The preview settles once every row has been compared with what is here.
await p.getByRole('button', { name: /^Import 0 rows$/ }).waitFor({ timeout: 10000 }).catch(() => {})
is('a second import adds nothing', await p.getByRole('button', { name: /^Import \d+ rows?$/ }).first().textContent().catch(() => 'no button'), 'Import 0 rows')
await p.getByRole('button', { name: 'Cancel' }).click()

// 5. A calendar file into Tasks.
const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//e2e//EN',
  'BEGIN:VEVENT', 'UID:one@e2e', 'DTSTART:20300107T090000', 'DTEND:20300107T100000', `SUMMARY:${note} one-off`, 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:weekly@e2e', 'DTSTART;VALUE=DATE:20300108', 'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3', `SUMMARY:${note} weekly`, 'END:VEVENT',
  'END:VCALENDAR', ''].join('\r\n')
const icsPath = join(dir, 'e2e.ics')
writeFileSync(icsPath, ics)
await p.locator('.dd-button').first().click()
await p.getByRole('option', { name: /^Tasks/ }).click()
await p.locator('.tx input[type=file]').setInputFiles(icsPath)
await p.getByText(/1 repeating/).waitFor({ timeout: 10000 })
await p.getByRole('button', { name: 'Import 2 rows' }).click()
await p.getByText(/rows? added/).waitFor({ timeout: 10000 })
const local = await p.evaluate(async (text) => {
  const open = indexedDB.open('getit')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const get = (s) => new Promise((r) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => r(q.result) })
  const tasks = (await get('task')).filter((t) => t.title?.startsWith(text))
  const series = (await get('series')).filter((s) => s.title?.startsWith(text))
  return { oneOff: tasks.filter((t) => t.title.endsWith('one-off')).map((t) => [t.planned_date, t.planned_time, t.duration_min]), series: series.map((s) => [s.rule, s.start_date, s.occurrence_count]) }
}, note)
is('the one-off is a task at its time', JSON.stringify(local.oneOff), JSON.stringify([['2030-01-07', '09:00', 60]]))
is('the weekly event is a series', JSON.stringify(local.series), JSON.stringify([['weekly', '2030-01-08', 3]]))
is('everything reached the server', await drained(p), true)

console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} failed` : '\nall checks passed')
await b.close()
process.exit(failed() || errors.length ? 1 : 0)
