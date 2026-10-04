// Checks bank exports read into Finance (FIN-06): each bank recognised from
// its own file (invented rows in src/test/fixtures/), its days, signs and
// amounts, the other party and description, rows that are not money that
// moved left out, and a file read twice adding nothing the second time.
import { readFileSync } from 'node:fs'
import { parseCsv, planImport, rowKey } from '../lib/transfer-rules.ts'
import {
  bankTable, detectBank, readAmount, readBankDay, readBankRows, abnName, stableHash, BANK_REF_FIELD,
} from '../lib/finance-bank-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}
const file = (name) => parseCsv(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')).rows
const rowsOf = (name) => { const t = file(name); return readBankRows(t, detectBank(t)) }
const brief = (r) => [r.date, r.amount, r.counterparty, r.description]

// Amounts and days as the banks write them.
eq('amounts: comma decimals, thousands, signs, dot decimals',
  ['4,35', '2.150,00', '+1.000,00', '-12,45', '-3.80', '1,000.00', '1500,00', 12.5, '', 'abc'].map(readAmount),
  [4.35, 2150, 1000, -12.45, -3.8, 1000, 1500, 12.5, null, null])
eq('days: yyyymmdd, ISO, with a time, dd-mm-yyyy; nonsense refused',
  ['20260901', '2026-09-03', '2026-09-07 09:00:00', '04-09-2026', '20260231', 'soon'].map(readBankDay),
  ['2026-09-01', '2026-09-03', '2026-09-07', '2026-09-04', null, null])

// ING, both the older comma file and the newer semicolon one.
eq('ING recognised', detectBank(file('bank-ing.csv')), { bank: 'ing', header: 0 })
const ing = rowsOf('bank-ing.csv')
eq('ING: Af is money out, Bij money in, the name and the message kept', ing.rows.map(brief), [
  ['2026-09-01', -4.35, 'Bakkerij De Korenaar', 'Pasvolgnr: 001 01-09-2026 08:12 Transactie: X1Y2Z3 Term: AB1234'],
  ['2026-09-01', -4.35, 'Bakkerij De Korenaar', 'Pasvolgnr: 001 01-09-2026 08:12 Transactie: X1Y2Z3 Term: AB1234'],
  ['2026-09-25', 2150, 'Voorbeeld BV', 'Naam: Voorbeeld BV Omschrijving: Salaris september'],
  ['2026-09-28', -875.5, 'Woonstichting Voorbeeld', 'Huur oktober'],
])
eq('two identical rows keep two different references', ing.rows[0].ref !== ing.rows[1].ref, true)
eq('and the same file gives the same references again', rowsOf('bank-ing.csv').rows.map((r) => r.ref), ing.rows.map((r) => r.ref))
eq('ING with semicolons, balance and tag', rowsOf('bank-ing-new.csv').rows.map(brief), [['2026-09-02', -29.99, 'Sportschool Fit', 'Contributie september']])

// Rabobank: signed amounts with comma decimals; its sequence number is the reference.
eq('Rabobank recognised', detectBank(file('bank-rabobank.csv'))?.bank, 'rabobank')
const rabo = rowsOf('bank-rabobank.csv')
eq('Rabobank rows', rabo.rows.map(brief), [
  ['2026-09-03', -23.4, 'Jumbo Venlo', 'Jumbo Venlo'],
  ['2026-09-05', 1000, 'J. Voorbeeld', 'Terugbetaling weekend'],
  ['2026-09-05', -23.4, 'Jumbo Venlo', 'Jumbo Venlo'],
])
eq('Rabobank reference: the account and its sequence number', rabo.rows[0].ref, 'rabobank:NL00RABO0000000005:000000000000001234')
eq('Rabobank in English headings too', detectBank([['IBAN/BBAN', 'Ccy', 'BIC', 'Seq No', 'Date', 'Value Date', 'Amount']])?.bank, 'rabobank')

// ABN AMRO: the .TAB download has no header.
eq('ABN AMRO .TAB recognised by its rows', detectBank(file('bank-abn.TAB')), { bank: 'abn', header: -1 })
const abn = rowsOf('bank-abn.TAB')
eq('ABN AMRO: the day, the signed amount, the other party out of the description',
  abn.rows.map((r) => [r.date, r.amount, r.counterparty]), [['2026-09-04', -12.45, 'Albert Heijn 1234'], ['2026-09-10', 1500, 'Voorbeeld Werkgever']])
eq('ABN AMRO with a header row (the spreadsheet download)', detectBank([['Rekeningnummer', 'Muntsoort', 'Transactiedatum', 'Beginsaldo', 'Eindsaldo', 'Rentedatum', 'Transactiebedrag', 'Omschrijving']])?.bank, 'abn')
eq('names out of ABN descriptions', [abnName('SEPA Overboeking IBAN: NL00 Naam: Jan Jansen  Omschrijving: Lunch'), abnName(null), abnName('Rente')], ['Jan Jansen', null, null])

// Revolut: completed rows only, the fee counted as money out.
eq('Revolut recognised', detectBank(file('bank-revolut.csv'))?.bank, 'revolut')
const rev = rowsOf('bank-revolut.csv')
eq('Revolut: completed ones, on the day completed, a fee taken off', rev.rows.map(brief), [
  ['2026-09-07', -3.8, null, 'Coffee Corner'], ['2026-09-08', -50.5, null, 'To J. Voorbeeld'], ['2026-09-10', 1000, null, 'Top-up by *1234'],
])
eq('pending and reverted ones are skipped', rev.skipped, 2)

// Not a bank's file.
eq('a plain Finance file is left to the generic import', bankTable([['Date', 'Amount', 'Note'], ['2026-09-01', '5', 'x']]), null)
eq('an empty file', detectBank([]), null)

// Into Finance's own columns, through the generic import.
const fields = [
  { name: 'entry_date', label: 'Date', type: 'date' },
  { name: 'category', label: 'Category', type: 'text' },
  { name: 'amount', label: 'Amount', type: 'number' },
  { name: 'kind', label: 'Type', type: 'select', options: ['expense', 'income'] },
  { name: 'note', label: 'Note', type: 'text' },
  BANK_REF_FIELD,
]
const d = { fields, natural: ['bank_ref'], store: 'record' }
const t = bankTable(file('bank-ing.csv'))
eq('the table for the import', t.table.slice(0, 2), [['entry_date', 'amount', 'kind', 'note', 'bank_ref'],
  ['2026-09-01', 4.35, 'expense', 'Bakkerij De Korenaar · Pasvolgnr: 001 01-09-2026 08:12 Transactie: X1Y2Z3 Term: AB1234', t.table[1][4]]])
const first = planImport(t.table, d, new Set())
eq('read the first time: every column found, all four ready (identical rows both kept)', [first.missing, first.valid, first.duplicates, first.withProblems], [[], 4, 0, 0])
eq('salary in as income', first.rows[2].values, { entry_date: '2026-09-25', amount: 2150, kind: 'income', note: 'Voorbeeld BV · Naam: Voorbeeld BV Omschrijving: Salaris september', bank_ref: t.table[3][4] })
const kept = new Set(first.rows.map((r) => rowKey(fields, d.natural, r.values)))
const again = planImport(bankTable(file('bank-ing.csv')).table, d, kept)
eq('read again: nothing new, all skipped as already here', [again.valid, again.duplicates], [0, 4])
const entries = new Set([rowKey(fields, d.natural, { entry_date: '2026-09-01', amount: 4.35, kind: 'expense', note: 'typed by hand' })])
eq('entries typed by hand never block a bank row', planImport(t.table, d, entries).valid, 4)
eq('a stable hash', [stableHash('a'), stableHash('a') === stableHash('b')], [stableHash('a'), false])

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nbank files: all ok')
