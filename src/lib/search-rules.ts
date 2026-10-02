/** The one search (GEN-10 to GEN-12): every list and picker in the app finds
 *  things the same way. Pure.
 *
 *  - Every typed word must appear somewhere (name, or the extra text a list
 *    gives: brand, aisle, tags, notes), in any order.
 *  - Case, accents and punctuation do not matter ("creme" finds "Crème").
 *  - Best first: names starting with the first word, then names with a word
 *    starting with it, then the rest; within each, the person's own and
 *    recently used things first, then the shorter (plainer) name, then A to Z.
 *  - An empty query keeps every item, in A-to-Z order (own and recent first). */

export interface Searchable {
  name: string
  /** Other text the words may be found in. */
  extra?: string
  /** The person's own (a food they added, a recipe they wrote). */
  mine?: boolean
  /** Used recently: higher is more recent. */
  recent?: number
}

/** Lower case, accents taken off, anything not a letter or digit a space. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9½¼¾/.,]+/g, ' ').trim()
}

export const words = (query: string) => fold(query).split(' ').map((w) => w.replace(/^[.,/]+|[.,/]+$/g, '')).filter(Boolean)

/** Does the item have every word? */
export function matches(item: Searchable, ws: string[]): boolean {
  if (!ws.length) return true
  const hay = fold(item.name + ' ' + (item.extra ?? ''))
  return ws.every((w) => hay.includes(w))
}

/** How good a match is: lower is better. */
export function score(item: Searchable, ws: string[]): number {
  const name = fold(item.name)
  const first = ws[0] ?? ''
  const place = !first ? 0 : name.startsWith(first) ? 0 : name.split(' ').some((p) => p.startsWith(first)) ? 1 : 2
  const own = item.mine || item.recent ? 0 : 1
  // With nothing typed there is nothing to rank by length: A to Z instead.
  return place * 1_000_000 + own * 100_000 + (first ? name.length : 0)
}

/** The items that match, best first. */
export function search<T extends Searchable>(items: T[], query: string): T[] {
  const ws = words(query)
  const hits = items.filter((i) => matches(i, ws))
  return hits
    .map((item) => ({ item, s: score(item, ws), r: item.recent ?? 0 }))
    .sort((a, b) => a.s - b.s || b.r - a.r || a.item.name.localeCompare(b.item.name))
    .map((x) => x.item)
}
