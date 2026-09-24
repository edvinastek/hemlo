#!/usr/bin/env node
/** Turns a file of tester addresses into the one SQL statement that lets them
 *  sign up while GetIt is invite-only (see supabase/migrations/012_security.sql).
 *
 *    node scripts/allowlist.mjs store/testers/testers.csv
 *
 *  The statement goes to stdout, to paste into the Supabase SQL editor. The
 *  count and anything that was not accepted go to stderr, so a redirect of
 *  stdout captures only SQL. Nothing is written to disk: tester addresses are
 *  personal data, and the only place they need to exist is the allowlist
 *  itself. store/testers/*.txt and *.csv are ignored by git for the same reason.
 *
 *  Accepts plain lists (one address per line) and CSV exports such as a Google
 *  Form or a Play Console tester list: any cell containing an @ is read as an
 *  address, other cells (names, dates) are ignored. */

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Deliberately stricter than RFC 5322: quoted local parts, IP-literal domains
// and comments are legal but no tester will have one, and a typo is far more
// likely than an exotic address. The apostrophe is allowed (o'neill@...), which
// is why toSql escapes quotes.
const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const TLD = /^([a-z]{2,}|xn--[a-z0-9-]+)$/

/** Trim a cell, drop surrounding quotes, and unwrap "Name <address>". The
 *  allowlist table only accepts lower case, and Supabase compares lower case. */
export function normalise(cell) {
  let s = String(cell).trim()
  const angle = s.match(/<([^<>]*)>\s*$/)
  if (angle) s = angle[1]
  s = s.replace(/^["']+|["']+$/g, '').trim()
  if (s.toLowerCase().startsWith('mailto:')) s = s.slice(7)
  return s.toLowerCase()
}

/** Whether an already normalised string is a usable email address. */
export function isValidEmail(s) {
  if (typeof s !== 'string' || s.length > 254 || /\s/.test(s)) return false
  const at = s.lastIndexOf('@')
  if (at < 1 || s.indexOf('@') !== at) return false
  const local = s.slice(0, at)
  const domain = s.slice(at + 1)
  if (local.length > 64 || !LOCAL.test(local)) return false
  const labels = domain.split('.')
  if (labels.length < 2) return false
  if (!labels.every((l) => l.length <= 63 && LABEL.test(l))) return false
  return TLD.test(labels[labels.length - 1])
}

/** Split a line into cells. Commas, semicolons (Dutch Excel) and tabs all
 *  separate; a quoted cell may contain any of them. */
export function splitCells(line) {
  const cells = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (!quoted && (ch === ',' || ch === ';' || ch === '\t')) {
      cells.push(cur); cur = ''
    } else cur += ch
  }
  cells.push(cur)
  return cells
}

/** Read every address out of a text or CSV file's contents.
 *  Returns the unique valid addresses in first-seen order, how many duplicates
 *  were dropped, and every line or cell that was refused, with its line number,
 *  so the person running it can fix the source file. */
export function parseAddresses(text) {
  const emails = []
  const seen = new Set()
  const rejected = []
  let duplicates = 0
  let sawContent = false
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const first = !sawContent
    sawContent = true
    const candidates = splitCells(line).filter((c) => c.includes('@'))
    if (candidates.length === 0) {
      // A first line without any @ is a CSV header ("Email", "Name,Email").
      if (!first) rejected.push({ line: lineNo, text: line, reason: 'no email address' })
      return
    }
    for (const cell of candidates) {
      const email = normalise(cell)
      if (!isValidEmail(email)) {
        rejected.push({ line: lineNo, text: cell.trim(), reason: 'not a valid email address' })
      } else if (seen.has(email)) {
        duplicates++
      } else {
        seen.add(email)
        emails.push(email)
      }
    }
  })
  return { emails, rejected, duplicates }
}

/** One insert for all addresses. "on conflict do nothing" makes it safe to
 *  run again after adding a few names to the same file. */
export function toSql(emails) {
  if (emails.length === 0) return ''
  const rows = emails.map((e) => `  ('${e.replace(/'/g, "''")}')`).join(',\n')
  return `insert into private.signup_allowlist (email) values\n${rows}\non conflict do nothing;`
}

function main(argv) {
  const file = argv[2]
  if (!file || argv.length > 3) {
    process.stderr.write('Usage: node scripts/allowlist.mjs <file of email addresses>\n')
    return 2
  }
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    process.stderr.write(`Could not read ${file}: ${err.message}\n`)
    return 2
  }
  const { emails, rejected, duplicates } = parseAddresses(text)
  for (const r of rejected) process.stderr.write(`line ${r.line}: ${r.reason}: ${r.text}\n`)
  process.stderr.write(`${emails.length} address${emails.length === 1 ? '' : 'es'}` +
    `${duplicates ? `, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} dropped` : ''}` +
    `${rejected.length ? `, ${rejected.length} rejected` : ''}\n`)
  if (emails.length === 0) return 1
  process.stdout.write(toSql(emails) + '\n')
  return 0
}

// Run only when called as a script, so the check file can import the parser.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv)
}
