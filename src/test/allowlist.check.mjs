// Checks the tester allowlist parser: what it accepts, what it refuses, and
// that the SQL it prints is safe to paste. Importing the script must not run it.
import { normalise, isValidEmail, splitCells, parseAddresses, toSql } from '../../scripts/allowlist.mjs'

let fail = 0
const is = (label, got, want) => {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  const ok = g === w
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${g}, expected ${w}`}`)
}

// Normalising: trim, lower case, quotes, "Name <address>", mailto:.
is('trims and lower-cases', normalise('  Anna.Jansen@Gmail.COM \t'), 'anna.jansen@gmail.com')
is('drops quotes', normalise('"piet@example.nl"'), 'piet@example.nl')
is('unwraps a display name', normalise('Piet de Vries <Piet@Example.nl>'), 'piet@example.nl')
is('drops mailto:', normalise('mailto:kees@example.nl'), 'kees@example.nl')

// Validation.
is('plain gmail address', isValidEmail('anna.jansen@gmail.com'), true)
is('plus tag', isValidEmail('anna+getit@gmail.com'), true)
is('apostrophe in local part', isValidEmail("o'neill@example.ie"), true)
is('subdomain', isValidEmail('a@mail.example.co.uk'), true)
is('punycode tld', isValidEmail('a@example.xn--p1ai'), true)
is('no at sign', isValidEmail('anna.gmail.com'), false)
is('two at signs', isValidEmail('a@b@gmail.com'), false)
is('no domain dot', isValidEmail('anna@localhost'), false)
is('space inside', isValidEmail('anna jansen@gmail.com'), false)
is('leading dot', isValidEmail('.anna@gmail.com'), false)
is('double dot', isValidEmail('anna..j@gmail.com'), false)
is('trailing dot in domain', isValidEmail('anna@gmail.com.'), false)
is('hyphen-edged label', isValidEmail('anna@-gmail.com'), false)
is('numeric tld', isValidEmail('anna@example.123'), false)
is('comma typo', isValidEmail('anna@gmail,com'), false)
is('too long', isValidEmail('a'.repeat(250) + '@x.nl'), false)

// Cells.
is('comma split', splitCells('Anna,anna@gmail.com'), ['Anna', 'anna@gmail.com'])
is('semicolon split', splitCells('Anna;anna@gmail.com'), ['Anna', 'anna@gmail.com'])
is('quoted comma kept', splitCells('"Jansen, Anna",anna@gmail.com'), ['Jansen, Anna', 'anna@gmail.com'])
is('escaped quote', splitCells('"say ""hi""",x@y.nl'), ['say "hi"', 'x@y.nl'])

// A plain list with a blank line, a comment, a duplicate in other case and a typo.
const list = parseAddresses('\uFEFFanna@gmail.com\n\n# friends from work\nPiet@Gmail.com\nANNA@gmail.com \nkees@gmail\n')
is('list: accepted in order', list.emails, ['anna@gmail.com', 'piet@gmail.com'])
is('list: one duplicate dropped', list.duplicates, 1)
is('list: typo rejected with its line', list.rejected, [{ line: 6, text: 'kees@gmail', reason: 'not a valid email address' }])

// A CSV export: header skipped, names ignored, Windows line endings.
const csv = parseAddresses('Name,Email,Joined\r\nAnna,anna@gmail.com,2026-09-20\r\n"Vries, Piet",piet@gmail.com,2026-09-21\r\nno address here\r\n')
is('csv: header skipped, names ignored', csv.emails, ['anna@gmail.com', 'piet@gmail.com'])
is('csv: a later line without an address is reported', csv.rejected, [{ line: 4, text: 'no address here', reason: 'no email address' }])

// Several addresses on one line.
is('several per line', parseAddresses('a@x.nl, b@x.nl; c@x.nl').emails, ['a@x.nl', 'b@x.nl', 'c@x.nl'])
is('empty file', parseAddresses('').emails, [])

// SQL: one statement, quotes escaped, idempotent.
is('sql for two', toSql(['a@x.nl', "o'neill@x.ie"]),
  "insert into private.signup_allowlist (email) values\n  ('a@x.nl'),\n  ('o''neill@x.ie')\non conflict do nothing;")
is('sql for none is empty', toSql([]), '')

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
