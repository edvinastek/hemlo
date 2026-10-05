// Checks the links to the shops' own pages (v21, PRICE-07, PRICE-08): every
// link is an official https page, each search has one place for the words,
// the words searched are the item's name without its amount, a chain keeps
// its own country's pages, and the order a sheet lists the shops in. No
// network: scripts/check-shop-links.mjs is the one that asks the sites.
import { LINKS, LINKS_CHECKED, CHAINS, shopLinks, offersUrl, searchUrl, searchWords, linkShops } from '../lib/shops-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// ---- the table ------------------------------------------------------------------------------
const all = Object.entries(LINKS).flatMap(([c, chains]) => Object.entries(chains).map(([k, l]) => ({ c, k, ...l })))
const urls = all.flatMap((l) => [l.offers, l.search].filter(Boolean))
is('every link is https', urls.filter((u) => !u.startsWith('https://')), [])
is('every link parses as a web address', urls.filter((u) => { try { new URL(u.replace('{q}', 'melk')); return false } catch { return true } }), [])
is('each search has one place for the words', all.filter((l) => l.search && l.search.split('{q}').length !== 2).map((l) => `${l.c}/${l.k}`), [])
is('offers pages have no place for words', all.filter((l) => l.offers?.includes('{q}')).map((l) => `${l.c}/${l.k}`), [])
// Each chain links only to its own site (or, for Coop, to Plus, whose shops they became).
const host = (u) => new URL(u.replace('{q}', 'x')).hostname.replace(/^(www|filiale|webwinkel)\./, '')
const own = { albertheijn: /^ah\./, jumbo: /^jumbo\.com$/, lidl: /^lidl\./, aldi: /^aldi(-nord)?\./, aldisud: /^aldi-sued\.de$/, plus: /^plus\.nl$/,
  coop: /^plus\.nl$/, dirk: /^dirk\.nl$/, dekamarkt: /^dekamarkt\.nl$/, hoogvliet: /^hoogvliet\.nl$/, spar: /^spar\./, vomar: /^vomar\.nl$/,
  poiesz: /^poiesz-supermarkten\.nl$/, edeka: /^edeka\.de$/, rewe: /^rewe\.de$/, kaufland: /^kaufland\.de$/, penny: /^penny\.de$/,
  netto: /^netto-online\.de$/, norma: /^norma-online\.de$/, globus: /^globus\.de$/, colruyt: /^colruyt\.be$/, delhaize: /^delhaize\.be$/,
  carrefour: /^carrefour\.be$/, intermarche: /^intermarche\.be$/, okay: /^okay\.be$/, picnic: /^picnic\./ }
is('each chain links only to its own site', all.flatMap((l) => [l.offers, l.search].filter(Boolean)
  .filter((u) => !(own[l.k] ?? /^$/).test(host(u))).map((u) => `${l.c}/${l.k}: ${u}`)), [])
is('every chain the app offers has an entry', Object.entries(CHAINS).flatMap(([c, list]) => list
  .filter((ch) => !LINKS[c]?.[ch.name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '')])
  .map((ch) => `${c}/${ch.name}`)), [])
is('every chain that has shops has an offers page', Object.entries(CHAINS).flatMap(([c, list]) => list
  .filter((ch) => !ch.online && !offersUrl(ch.name, c)).map((ch) => `${c}/${ch.name}`)), [])
is('the date checked is a date', /^\d{4}-\d\d-\d\d$/.test(LINKS_CHECKED), true)

// ---- which country's pages ----------------------------------------------------------------------
is('Albert Heijn in Belgium is ah.be', offersUrl('Albert Heijn', 'BE'), 'https://www.ah.be/bonus')
is('a Dutch chain kept over the border in Germany', offersUrl('Dirk', 'DE'), 'https://www.dirk.nl/aanbiedingen')
is('Jumbo in Belgium keeps its own offers', offersUrl('Jumbo', 'BE'), 'https://www.jumbo.com/nl-be/aanbiedingen')
is('…and no Dutch search instead of the one it lacks', searchUrl('Jumbo', 'BE', 'melk'), null)
is('Aldi in Germany is Aldi Nord', offersUrl('Aldi', 'DE'), 'https://www.aldi-nord.de/angebote.html')
is('Aldi Süd typed any way', offersUrl('aldi sud', 'DE'), 'https://www.aldi-sued.de/angebote')
is('Picnic has no pages', shopLinks('Picnic', 'NL'), {})
is('no country set: the first country that has it', offersUrl('Colruyt', null), 'https://www.colruyt.be/nl/acties')
is('a shop the app does not know', [offersUrl('Bakker Bart', 'NL'), searchUrl('Bakker Bart', 'NL', 'brood')], [null, null])

// ---- the words searched -----------------------------------------------------------------------
is('the amount and the brackets go', searchWords('Halfvolle melk 1,5 l (AH)'), 'Halfvolle melk')
is('packs of cans', [searchWords('6 x 330 ml cola'), searchWords('Cola 6x330ml')], ['cola', 'Cola'])
is('an amount typed first', [searchWords('2 kg apples'), searchWords('½ kg gehakt'), searchWords('3 stuks avocado'), searchWords('500g pasta')],
  ['apples', 'gehakt', 'avocado', 'pasta'])
is('a percentage is part of the amount', searchWords('Melk 1,5%'), 'Melk')
is('numbers inside words stay', [searchWords('7up'), searchWords('xylitol gum'), searchWords('Vitamine B12 tabletten')], ['7up', 'xylitol gum', 'Vitamine B12 tabletten'])
is('commas become spaces', searchWords('Brood, volkoren'), 'Brood volkoren')
is('at most 60 characters, cut at a word', searchWords(`${'word '.repeat(20)}end`), 'word '.repeat(12).trim())
is('nothing but an amount searches for nothing', [searchWords('2 kg'), searchUrl('Jumbo', 'NL', '10')], ['', null])

// ---- the links ------------------------------------------------------------------------------------
is('Albert Heijn, encoded', searchUrl('Albert Heijn', 'NL', 'Crème fraîche 200 ml'), 'https://www.ah.nl/zoeken?query=Cr%C3%A8me%20fra%C3%AEche')
is('a search in the path', searchUrl('Dirk', 'NL', 'halfvolle melk'), 'https://www.dirk.nl/zoeken/producten/halfvolle%20melk')
is('nothing that could break the address', searchUrl('Lidl', 'DE', 'Milch & Honig / #1?'), 'https://www.lidl.de/q/search?q=Milch%20%26%20Honig%20%231%3F')
is('Edeka has offers but no search', [!!offersUrl('Edeka', 'DE'), searchUrl('Edeka', 'DE', 'Milch')], [true, null])

// ---- the order in a sheet -------------------------------------------------------------------------
is('the person\'s own first, in their order; then the rest of the country',
  linkShops(['Lidl', 'Bakker Bart', 'Jumbo'], 'NL', 'offers'),
  { mine: ['Lidl', 'Jumbo'], more: ['Albert Heijn', 'Aldi', 'Plus', 'Dirk', 'Dekamarkt', 'Hoogvliet', 'Coop', 'Spar', 'Vomar', 'Poiesz'] })
is('a chain without a search is left out of a search list', linkShops(['Penny', 'Rewe'], 'DE', 'search').mine, ['Rewe'])
is('kept names in any case are not offered twice', linkShops(['albert heijn'], 'NL', 'offers').more.includes('Albert Heijn'), false)
is('no country: the three countries\' chains, each once', new Set(linkShops([], null, 'offers').more).size, linkShops([], null, 'offers').more.length)

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall shop link checks passed')
