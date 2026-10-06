/** The shops a person can pick from in Stores (SHOP-32, SHOP-36): the
 *  supermarket chains of the Netherlands, Germany and Belgium, those of the
 *  person's own country first. Anything else is typed. No shop's catalogue,
 *  prices or offers are fetched; only the chain's name is offered, and links
 *  to its own offers page and site search. Pure: checked in
 *  src/test/shopping.check.mjs and src/test/shoplinks.check.mjs. */

import { fold, search } from './search-rules.ts'

export interface Chain {
  name: string
  /** Delivers to the door rather than having shops. */
  online?: boolean
}

/** Chains by country, most common first. */
export const CHAINS: Record<string, Chain[]> = {
  NL: [
    { name: 'Albert Heijn' }, { name: 'Jumbo' }, { name: 'Lidl' }, { name: 'Aldi' }, { name: 'Plus' }, { name: 'Dirk' },
    { name: 'Dekamarkt' }, { name: 'Hoogvliet' }, { name: 'Coop' }, { name: 'Spar' }, { name: 'Vomar' }, { name: 'Poiesz' },
    { name: 'Picnic', online: true },
  ],
  DE: [
    { name: 'Edeka' }, { name: 'Rewe' }, { name: 'Lidl' }, { name: 'Aldi' }, { name: 'Kaufland' }, { name: 'Penny' },
    { name: 'Netto' }, { name: 'Norma' }, { name: 'Globus' }, { name: 'Aldi Süd' },
  ],
  BE: [
    { name: 'Colruyt' }, { name: 'Delhaize' }, { name: 'Carrefour' }, { name: 'Lidl' }, { name: 'Aldi' }, { name: 'Albert Heijn' },
    { name: 'Intermarché' }, { name: 'Spar' }, { name: 'Okay' }, { name: 'Jumbo' },
  ],
}

/** Countries next door, whose chains come after the person's own. */
const NEAR: Record<string, string[]> = { NL: ['BE', 'DE'], BE: ['NL', 'DE'], DE: ['NL', 'BE'] }

export interface ShopChoice { name: string; online: boolean; country: string; home: boolean }

/** The chains to offer: the person's country's first (SHOP-36), then those
 *  of the countries next to it, then the rest, each name once, leaving out
 *  shops already kept. `query` narrows them with the one search. A country
 *  with no list (or none set) offers the Dutch, Belgian and German chains,
 *  so someone near a border still finds theirs. */
export function suggestShops(country: string | null | undefined, kept: string[], query = ''): ShopChoice[] {
  const home = (country ?? '').toUpperCase()
  const order = CHAINS[home] ? [home, ...(NEAR[home] ?? [])] : []
  for (const c of Object.keys(CHAINS)) if (!order.includes(c)) order.push(c)
  const have = new Set(kept.map((k) => fold(k).replace(/\s+/g, '')))
  const seen = new Set<string>()
  const out: ShopChoice[] = []
  for (const c of order) {
    for (const chain of CHAINS[c]) {
      const key = fold(chain.name).replace(/\s+/g, '')
      if (seen.has(key) || have.has(key)) continue
      seen.add(key)
      out.push({ name: chain.name, online: !!chain.online, country: c, home: c === home })
    }
  }
  if (!query.trim()) return out
  // The one search, keeping the country order among equally good matches.
  const rank = new Map(out.map((s, i) => [s.name, i]))
  return search(out.map((s) => ({ ...s, recent: out.length - (rank.get(s.name) ?? 0) })), query)
}

/** Each chain's own pages, by country (PRICE-06, PRICE-07, PRICE-08): its
 *  weekly offers page and its site search, where `{q}` stands for the words
 *  searched. Only the retailer's official site: Hemlo opens it in the
 *  browser and copies nothing from it. A chain with no search here has none
 *  that opens from a link (or none that could be confirmed); its offers page
 *  still shows. Checked by hand on the date below, and every month by
 *  scripts/check-shop-links.mjs. */
export interface ShopLinks { offers?: string; search?: string }

export const LINKS_CHECKED = '2026-10-05'

export const LINKS: Record<string, Record<string, ShopLinks>> = {
  NL: {
    albertheijn: { offers: 'https://www.ah.nl/bonus', search: 'https://www.ah.nl/zoeken?query={q}' },
    jumbo: { offers: 'https://www.jumbo.com/aanbiedingen/nu', search: 'https://www.jumbo.com/producten/?searchType=keyword&searchTerms={q}' },
    lidl: { offers: 'https://www.lidl.nl/c/aanbiedingen/a10008785', search: 'https://www.lidl.nl/q/search?q={q}' },
    aldi: { offers: 'https://www.aldi.nl/aanbiedingen.html', search: 'https://www.aldi.nl/zoeken.html?query={q}' },
    plus: { offers: 'https://www.plus.nl/aanbiedingen', search: 'https://www.plus.nl/zoekresultaten?SearchTerm={q}' },
    dirk: { offers: 'https://www.dirk.nl/aanbiedingen', search: 'https://www.dirk.nl/zoeken/producten/{q}' },
    dekamarkt: { offers: 'https://www.dekamarkt.nl/aanbiedingen', search: 'https://www.dekamarkt.nl/zoeken/{q}' },
    // Hoogvliet moved from hoogvliet.com to hoogvliet.nl.
    hoogvliet: { offers: 'https://hoogvliet.nl/aanbiedingen', search: 'https://hoogvliet.nl/search/{q}' },
    // Coop's shops became Plus shops; coop.nl leads to plus.nl.
    coop: { offers: 'https://www.plus.nl/aanbiedingen', search: 'https://www.plus.nl/zoekresultaten?SearchTerm={q}' },
    spar: { offers: 'https://www.spar.nl/aanbiedingen/', search: 'https://www.spar.nl/zoek/?fq={q}' },
    vomar: { offers: 'https://www.vomar.nl/folders', search: 'https://www.vomar.nl/zoeken?search={q}' },
    poiesz: { offers: 'https://webwinkel.poiesz-supermarkten.nl/aanbiedingen', search: 'https://webwinkel.poiesz-supermarkten.nl/boodschappen/zoeken?query={q}' },
    // Picnic lives in its app: no offers page or search on the web.
    picnic: {},
  },
  DE: {
    // Edeka's product search could not be confirmed (its site turns robots away).
    edeka: { offers: 'https://www.edeka.de/angebote/' },
    rewe: { offers: 'https://www.rewe.de/angebote/', search: 'https://www.rewe.de/shop/productList?search={q}' },
    lidl: { offers: 'https://www.lidl.de/c/online-prospekte/s10005610', search: 'https://www.lidl.de/q/search?q={q}' },
    // "Aldi" in Germany is Aldi Nord, the Aldi of the Dutch and Belgian border.
    aldi: { offers: 'https://www.aldi-nord.de/angebote.html', search: 'https://www.aldi-nord.de/suchergebnisse.html?query={q}' },
    // Aldi Süd's search could not be confirmed (its site turns robots away).
    aldisud: { offers: 'https://www.aldi-sued.de/angebote' },
    kaufland: { offers: 'https://filiale.kaufland.de/angebote/uebersicht.html', search: 'https://filiale.kaufland.de/suche.html?q={q}' },
    // Penny's site has offers and a shop finder, no product search.
    penny: { offers: 'https://www.penny.de/angebote' },
    netto: {
      offers: 'https://www.netto-online.de/filialangebote',
      search: 'https://www.netto-online.de/INTERSHOP/web/WFS/Plus-NettoDE-Site/de_DE/-/EUR/ViewMMPParametricSearch-SimpleOfferSearch?SearchTerm={q}',
    },
    norma: { offers: 'https://www.norma-online.de/de/angebote/', search: 'https://www.norma-online.de/de/suchergebnis?q={q}' },
    // Globus asks which of its halls first, then shows that hall's offers.
    globus: { offers: 'https://www.globus.de/angebote', search: 'https://www.globus.de/searchdetail.php?query={q}' },
  },
  BE: {
    colruyt: { offers: 'https://www.colruyt.be/nl/acties', search: 'https://www.colruyt.be/nl/producten?searchTerm={q}' },
    delhaize: { offers: 'https://www.delhaize.be/nl/Promolandingpage', search: 'https://www.delhaize.be/nl/shop/search?q={q}' },
    carrefour: { offers: 'https://www.carrefour.be/nl/al-onze-promoties', search: 'https://www.carrefour.be/nl/search?q={q}' },
    lidl: { offers: 'https://www.lidl.be/c/nl-BE/acties-deze-week/a10082242', search: 'https://www.lidl.be/q/nl-BE/search?q={q}' },
    aldi: { offers: 'https://www.aldi.be/aanbiedingen.html', search: 'https://www.aldi.be/zoekresultaten.html?query={q}' },
    albertheijn: { offers: 'https://www.ah.be/bonus', search: 'https://www.ah.be/zoeken?query={q}' },
    // Intermarché sells nothing online: its search finds its offers and folders.
    intermarche: { offers: 'https://www.intermarche.be/nl/folders/', search: 'https://www.intermarche.be/nl/?s={q}' },
    spar: { offers: 'https://www.spar.be/promoties' },
    // Okay's site turns robots away, so its search could not be confirmed.
    okay: { offers: 'https://www.okay.be/nl/promos/promoties' },
    // Jumbo Belgium has offers but no product search of its own.
    jumbo: { offers: 'https://www.jumbo.com/nl-be/aanbiedingen' },
  },
}

const keyOf = (shop: string) => fold(shop).replace(/\s+/g, '')

/** A shop's pages: the chain's in the person's country; a chain that country
 *  does not have, in a country next door (a Dutch chain kept by someone
 *  over the border), else anywhere. A chain the person's country has keeps
 *  its own pages even where one is missing: Jumbo in Belgium has no search,
 *  and the Dutch one sells a different range. */
export function shopLinks(shop: string, country: string | null | undefined): ShopLinks {
  const key = keyOf(shop)
  const home = (country ?? '').toUpperCase()
  const order = [home, ...(NEAR[home] ?? []), ...Object.keys(LINKS)]
  for (const c of order) {
    const links = LINKS[c]?.[key]
    if (links) return links
  }
  return {}
}

/** The chain's weekly offers page, or none. */
export function offersUrl(shop: string, country: string | null | undefined): string | null {
  return shopLinks(shop, country).offers ?? null
}

/** The words to search a shop's site for: the item's name without the
 *  amount, pack size or anything in brackets ("Halfvolle melk 1,5 l (AH)"
 *  is "Halfvolle melk"). At most 60 characters, cut at a word. */
export function searchWords(name: string): string {
  let t = String(name ?? '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  // "6 x 330 ml", "2x", "1,5 l", "500g", "½ kg", "3 stuks": amounts, not words to search.
  const amount = /(^|[\s,;/])(\d+([.,]\d+)?|[½¼¾])\s*(kg|kilo|g|gr|gram|grams|mg|l|ltr|liter|litre|litres|liters|ml|cl|dl|st|stuk|stuks|stk|stück|pcs|pieces?|packs?|pak|pakken|%)?(?=$|\s|[,;/](?!\d))/gi
  const times = /(^|[\s,;/])(\d+|[½¼¾])\s*[x×](?=$|[\s\d])/gi
  t = t.replace(times, ' ').replace(amount, ' ')
  t = t.replace(/[,;/]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (t.length > 60) t = /\s/.test(t.slice(0, 61)) ? t.slice(0, 61).replace(/\s+\S*$/, '') : t.slice(0, 60)
  return t
}

/** The chain's own site search for an item, or none: the item's name
 *  (searchWords) in the link, URL-encoded. Nothing else of the person's
 *  goes with it. */
export function searchUrl(shop: string, country: string | null | undefined, query: string): string | null {
  const template = shopLinks(shop, country).search
  const words = searchWords(query)
  if (!template || !words) return null
  return template.replace('{q}', encodeURIComponent(words))
}

/** The shops to offer links for, in the order a sheet lists them: the
 *  person's own first (the order they keep them in), then the other chains
 *  of their country (or, with none, of the three countries) that have such
 *  a page, each chain and each page once. `kind` says which page. */
export function linkShops(kept: string[], country: string | null | undefined, kind: keyof ShopLinks): { mine: string[]; more: string[] } {
  const link = (name: string) => shopLinks(name, country)[kind]
  const mine = kept.filter((k) => link(k))
  const seen = new Set(kept.map(keyOf))
  // A chain whose page is one already listed (Coop's is Plus's) is not offered again.
  const pages = new Set(mine.map(link))
  const home = (country ?? '').toUpperCase()
  const pool = CHAINS[home] ? CHAINS[home] : Object.values(CHAINS).flat()
  const more: string[] = []
  for (const c of pool) {
    const key = keyOf(c.name)
    const page = link(c.name)
    if (seen.has(key) || !page || pages.has(page)) continue
    seen.add(key)
    pages.add(page)
    more.push(c.name)
  }
  return { mine, more }
}

/** A shop's name as kept: spaces tidied, at most 60 characters. A chain's
 *  name typed in other case is written the chain's way ("albert heijn" is
 *  "Albert Heijn"). */
export function cleanShopName(text: string): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!t) return ''
  const key = fold(t).replace(/\s+/g, '')
  for (const list of Object.values(CHAINS)) {
    const hit = list.find((c) => fold(c.name).replace(/\s+/g, '') === key)
    if (hit) return hit.name
  }
  return t
}
