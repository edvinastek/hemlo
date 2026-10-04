// Reading a recipe from a web address (REC-07): src/lib/recipe-fetch-rules.ts.
import { checkRecipeUrl, readPage, fetchProblem, siteOf, PAGE_MAX } from '../lib/recipe-fetch-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const err = (r) => ('error' in r ? 'error' : r.url ?? 'html')

is('an https address is kept', checkRecipeUrl(' https://www.bbcgoodfood.com/recipes/pancakes ').url, 'https://www.bbcgoodfood.com/recipes/pancakes')
is('an address without https:// gets it', checkRecipeUrl('ah.nl/allerhande/recept/R-R123/pannenkoeken').url, 'https://ah.nl/allerhande/recept/R-R123/pannenkoeken')
is('the part after # is dropped', checkRecipeUrl('https://example.com/r#ingredients').url, 'https://example.com/r')
is('nothing typed', err(checkRecipeUrl('  ')), 'error')
is('not an address', err(checkRecipeUrl('pancakes')), 'error')
is('another kind of address is refused', err(checkRecipeUrl('file:///etc/passwd')), 'error')
is('ftp is refused', err(checkRecipeUrl('ftp://example.com/r')), 'error')
for (const h of ['localhost:8080/x', '127.0.0.1/x', '192.168.1.10/r', '10.0.0.2', '172.20.1.1', '169.254.169.254/latest', 'printer.local', '[::1]/x', '[fd00::1]/x']) {
  is(`own network refused: ${h}`, err(checkRecipeUrl(h)), 'error')
}
is('a public address by number is allowed', checkRecipeUrl('http://93.184.216.34/r').url, 'http://93.184.216.34/r')
is('172.32 is public', checkRecipeUrl('http://172.32.0.1/r').url, 'http://172.32.0.1/r')

const page = '<html><head><script type="application/ld+json">{"@type":"Recipe","name":"Pancakes"}</script></head></html>'
is('a page with schema.org data is read', readPage(page).html, page)
is('a page without recipe data says so', /no recipe data/.test(readPage('<html><body>Hello</body></html>').error), true)
is('an empty page', /empty/.test(readPage('').error), true)
is('something that is not text', /empty/.test(readPage({ a: 1 }).error), true)
is('a page past the limit', /too large/.test(readPage(`<script type="application/ld+json">${'x'.repeat(PAGE_MAX)}</script>`).error), true)

is('on the web a blocked site points to the app and to pasting', /app on your phone/.test(fetchProblem('blocked', { web: true })), true)
is('in the app a blocked site points to pasting', /paste it above/.test(fetchProblem('blocked')), true)
is('a missing page', fetchProblem('status', { status: 404 }), 'There is no page at that address.')
is('a refused request', /turned GetIt away/.test(fetchProblem('status', { status: 403 })), true)
is('offline', /offline/.test(fetchProblem('offline')), true)
is('the site’s name', siteOf('https://www.bbcgoodfood.com/recipes/x'), 'bbcgoodfood.com')

console.log(fail ? `\n${fail} failed` : '\nAll recipe fetch checks passed')
process.exit(fail ? 1 : 0)
