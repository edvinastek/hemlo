/** The shops a person can pick from in Stores (SHOP-32, SHOP-36): the
 *  supermarket chains of the Netherlands, Germany and Belgium, those of the
 *  person's own country first. Anything else is typed. No shop's catalogue,
 *  prices or offers are fetched; only the chain's name is offered. Pure:
 *  checked in src/test/shopping.check.mjs. */

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
    { name: 'Netto' }, { name: 'Norma' }, { name: 'Globus' },
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
