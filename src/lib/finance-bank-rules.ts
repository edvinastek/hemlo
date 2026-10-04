/** Bank exports read into Finance (FIN-06), with no database and no React
 *  (checked in src/test/bankcsv.check.mjs against the small invented files in
 *  src/test/fixtures/). The import itself is the generic one (Settings →
 *  Data, Import into Finance · Entry, transfer.ts): a file from one of these
 *  banks is recognised by its header row (or, for ABN AMRO's headerless
 *  .TAB, by the shape of its rows) and turned into Finance's own columns
 *  first, so the preview, the checks and the saving are the same as for any
 *  other file.
 *
 *  The banks' formats (sources in NOTES-X3.md):
 *  - ING (Mijn ING, "Af- en bijschrijvingen", CSV): Datum (yyyymmdd), Naam /
 *    Omschrijving, Rekening, Tegenrekening, Code, Af Bij ("Af" or "Bij"),
 *    Bedrag (EUR) (always positive, "98,87"), Mutatiesoort, Mededelingen;
 *    newer files add Saldo na mutatie and Tag and use ";".
 *  - Rabobank (CSV, Dutch or English headings): IBAN/BBAN, Munt, BIC, Volgnr,
 *    Datum (yyyy-mm-dd), Rentedatum, Bedrag ("+1,23", "-12,50"), Saldo na
 *    trn, Tegenrekening IBAN/BBAN, Naam tegenpartij, …, Omschrijving-1 to -3.
 *  - ABN AMRO: the .TAB (TXT) download is tab-separated with no header:
 *    Rekeningnummer, Muntsoort, Transactiedatum (yyyymmdd), Beginsaldo,
 *    Eindsaldo, Rentedatum, Transactiebedrag ("-12,50"), Omschrijving. The
 *    spreadsheet download has those words as its header row.
 *  - Revolut (CSV): Type, Product, Started Date, Completed Date ("2026-09-03
 *    14:22:10"), Description, Amount (signed, "-12.50"), Fee, Currency, State,
 *    Balance. Only completed rows count; the fee is money out too.
 *
 *  Each row gets a stable reference (Rabobank's own sequence number, else a
 *  hash of the row and how many identical rows came before it in the file),
 *  so reading the same export twice, or one that overlaps, skips what is
 *  already here, yet two identical coffees on one day are both kept. */

export type Bank = 'ing' | 'rabobank' | 'abn' | 'revolut'
export const BANK_NAMES: Record<Bank, string> = { ing: 'ING', rabobank: 'Rabobank', abn: 'ABN AMRO', revolut: 'Revolut' }

type Cell = string | number | boolean | Date | null | undefined

export interface BankRow {
  /** 'yyyy-MM-dd' */
  date: string
  /** Signed: below zero is money out. */
  amount: number
  counterparty: string | null
  description: string | null
  ref: string
}

const norm = (c: Cell) => String(c ?? '').replace(/^﻿/, '').trim().toLowerCase()
const text = (c: Cell) => { const s = String(c ?? '').replace(/\s+/g, ' ').trim(); return s ? s : null }

/** The header names that say which bank, all of which must be there. */
const SIGNS: { bank: Bank; need: string[] }[] = [
  { bank: 'ing', need: ['datum', 'naam / omschrijving', 'af bij', 'bedrag (eur)'] },
  { bank: 'rabobank', need: ['iban/bban', 'volgnr', 'datum', 'bedrag'] },
  { bank: 'rabobank', need: ['iban/bban', 'seq no', 'date', 'amount'] },
  { bank: 'abn', need: ['transactiedatum', 'transactiebedrag'] },
  { bank: 'revolut', need: ['completed date', 'amount', 'description'] },
]

/** Which bank wrote the file, and where its header row is (-1: none, the
 *  rows start at once). Null: not one of the four. */
export function detectBank(rows: Cell[][]): { bank: Bank; header: number } | null {
  const first = rows.findIndex((r) => r.some((c) => norm(c) !== ''))
  if (first < 0) return null
  const head = rows[first].map(norm)
  for (const s of SIGNS) if (s.need.every((n) => head.includes(n))) return { bank: s.bank, header: first }
  // ABN AMRO's .TAB: no header; an account number, EUR, then a yyyymmdd day.
  const r = rows[first]
  if (r.length >= 8 && /^[A-Z]{3}$/.test(String(r[1] ?? '').trim()) && /^\d{8}$/.test(String(r[2] ?? '').trim())
    && readAmount(r[6]) != null) return { bank: 'abn', header: -1 }
  return null
}

/** "98,87", "+1.234,56", "-12.50", "1,234.56", 12.5. The separator that
 *  comes last is the decimal one. */
export function readAmount(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  let s = String(c ?? '').replace(/[\s'€]/g, '').replace(/^EUR/i, '')
  if (!s) return null
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  if (comma > dot) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

/** 20260903, 2026-09-03, 2026-09-03 14:22:10, 03-09-2026. */
export function readBankDay(c: Cell): string | null {
  const s = String(c ?? '').trim()
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s) ?? /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s)
  if (m) return valid(m[1], m[2], m[3])
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s)
  return m ? valid(m[3], m[2], m[1]) : null
}
function valid(y: string, mo: string, d: string): string | null {
  const t = new Date(Date.UTC(+y, +mo - 1, +d))
  return t.getUTCFullYear() === +y && t.getUTCMonth() === +mo - 1 && t.getUTCDate() === +d ? `${y}-${mo}-${d}` : null
}

/** A short, stable hash (FNV-1a, 53 bits) written in base 36. */
export function stableHash(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return ((h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff)).toString(36)
}

/** The rows of a bank's file as dated, signed amounts. `skipped`: rows
 *  that are not money that moved (Revolut's pending, declined or reverted
 *  ones) or cannot be read. */
export function readBankRows(rows: Cell[][], found: { bank: Bank; header: number }): { rows: BankRow[]; skipped: number } {
  const { bank, header } = found
  const head = header >= 0 ? rows[header].map(norm) : []
  const col = (...names: string[]) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i } return -1 }
  const body = rows.slice(header + 1).filter((r) => r.some((c) => norm(c) !== ''))
  const out: BankRow[] = []
  const seen = new Map<string, number>()
  let skipped = 0
  const push = (r: Omit<BankRow, 'ref'>, own: string | null) => {
    const base = `${bank}|${r.date}|${r.amount.toFixed(2)}|${r.counterparty ?? ''}|${r.description ?? ''}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.push({ ...r, ref: `${bank}:${own ?? stableHash(`${base}|${n}`)}` })
  }
  for (const r of body) {
    const at = (i: number) => (i >= 0 ? r[i] : null)
    if (bank === 'ing') {
      const date = readBankDay(at(col('datum')))
      const amt = readAmount(at(col('bedrag (eur)')))
      const af = norm(at(col('af bij')))
      if (!date || amt == null || (af !== 'af' && af !== 'bij')) { skipped++; continue }
      push({ date, amount: af === 'af' ? -Math.abs(amt) : Math.abs(amt), counterparty: text(at(col('naam / omschrijving'))),
        description: text(at(col('mededelingen'))) }, null)
    } else if (bank === 'rabobank') {
      const date = readBankDay(at(col('datum', 'date')))
      const amt = readAmount(at(col('bedrag', 'amount')))
      if (!date || amt == null) { skipped++; continue }
      const desc = [col('omschrijving-1', 'description-1'), col('omschrijving-2', 'description-2'), col('omschrijving-3', 'description-3')]
        .map((i) => text(at(i))).filter(Boolean).join(' ') || null
      // The account and its sequence number name the row for good.
      const seq = text(at(col('volgnr', 'seq no')))
      const iban = text(at(col('iban/bban')))
      push({ date, amount: amt, counterparty: text(at(col('naam tegenpartij', 'name counterpty'))), description: desc },
        seq && iban ? `${iban}:${seq}` : null)
    } else if (bank === 'abn') {
      const date = readBankDay(header >= 0 ? at(col('transactiedatum')) : r[2])
      const amt = readAmount(header >= 0 ? at(col('transactiebedrag')) : r[6])
      if (!date || amt == null) { skipped++; continue }
      const desc = text(header >= 0 ? at(col('omschrijving')) : r[7])
      push({ date, amount: amt, counterparty: abnName(desc), description: desc }, null)
    } else {
      const state = norm(at(col('state')))
      const date = readBankDay(at(col('completed date')))
      const amt = readAmount(at(col('amount')))
      const fee = readAmount(at(col('fee'))) ?? 0
      if ((state && state !== 'completed') || !date || amt == null) { skipped++; continue }
      // A fee is charged on top: what left the account is the amount less the fee.
      push({ date, amount: Math.round((amt - Math.abs(fee)) * 100) / 100, counterparty: null, description: text(at(col('description'))) }, null)
    }
  }
  return { rows: out, skipped }
}

/** ABN AMRO puts the other party inside the description: "/NAME/Albert Heijn
 *  1234/" in SEPA lines, "BEA, Betaalpas  Albert Heijn 1234,PAS123" at a till. */
export function abnName(desc: string | null): string | null {
  if (!desc) return null
  const sepa = /\/NAME\/([^/]+)\//.exec(desc)
  if (sepa) return sepa[1].trim() || null
  const naam = /Naam:\s*(.+?)(?:\s{2,}|\s+(?:Omschrijving|IBAN|Kenmerk|Machtiging):|$)/.exec(desc)
  if (naam) return naam[1].trim() || null
  const card = /^(?:BEA|GEA),?\s+(?:Betaalpas|Apple Pay|Google Pay)?\s*(.+?),PAS\d+/i.exec(desc)
  return card ? card[1].trim() || null : null
}

/** The hidden field that keeps a bank row's reference with its entry. */
export const BANK_REF_FIELD = { name: 'bank_ref', label: 'Bank reference', type: 'text' as const, hidden: true }

const NOTE_MAX = 240

/** A bank's file as a table of Finance's own columns, ready for the generic
 *  import: the day, the amount (positive) and its type, a note naming the
 *  other party and what it was for, and the reference. Null: not a bank's file. */
export function bankTable(rows: Cell[][]): { bank: Bank; name: string; table: Cell[][]; read: number; skipped: number } | null {
  const found = detectBank(rows)
  if (!found) return null
  const { rows: list, skipped } = readBankRows(rows, found)
  const table: Cell[][] = [['entry_date', 'amount', 'kind', 'note', 'bank_ref']]
  for (const r of list) {
    if (r.amount === 0) continue
    const note = [r.counterparty, r.description && r.description !== r.counterparty ? r.description : null].filter(Boolean).join(' · ').slice(0, NOTE_MAX) || null
    table.push([r.date, Math.abs(r.amount), r.amount < 0 ? 'expense' : 'income', note, r.ref])
  }
  return { bank: found.bank, name: BANK_NAMES[found.bank], table, read: list.length, skipped }
}
