import { useState, type ReactNode } from 'react'
import { readSettings } from '../lib/settings'
import { sameShop } from '../lib/shopping-rules'
import { linkShops, offersUrl, searchUrl, searchWords } from '../lib/shops-rules'
import { Sheet, type MenuItem } from './shop-ui'
import type { MenuItem as PageMenuItem } from '../ui/MoreMenu'
import type { Profile } from '../lib/types'
import './shop-links.css'

/** Links to the shops' own pages (PRICE-07, PRICE-08): each chain's weekly
 *  offers page and its site search, opened in the browser. Hemlo copies
 *  nothing back; a search sends the shop only the item's name. */

/** How many "Search at …" lines an item's ⋮ shows before "Other shops…". */
const SEARCH_IN_MENU = 3

/** Opens a shop's page in the browser, outside the app. */
export function openShopPage(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** "Offers this week…" in the Shop page's ⋮ and its sheet. */
export function useOffersSheet(profile: Profile): { item: PageMenuItem; sheet: ReactNode } {
  const [open, setOpen] = useState(false)
  const kept = readSettings(profile).shopping.shops.map((s) => s.name)
  return {
    item: { label: 'Offers this week…', onSelect: () => setOpen(true) },
    sheet: open ? <LinksSheet kind="offers" kept={kept} country={profile.country} onClose={() => setOpen(false)} /> : null,
  }
}

/** The lines in a shopping item's ⋮: "Search at Albert Heijn ↗" for up to
 *  three of the person's shops (the item's own shop first), and "Other
 *  shops…" for the rest and the other chains of their country. With no
 *  shop of theirs that has a search, one "Search at a shop…". */
export function searchMenuItems(kept: string[], country: string | null | undefined, name: string, itemShop: string | null,
  onOther: () => void): MenuItem[] {
  if (!searchWords(name)) return []
  const { mine, more } = linkShops(kept, country, 'search')
  const own = itemShop ? mine.find((s) => sameShop(s, itemShop)) : undefined
  const order = own ? [own, ...mine.filter((s) => s !== own)] : mine
  if (order.length === 0) return more.length ? [{ label: 'Search at a shop…', onSelect: onOther }] : []
  const items: MenuItem[] = order.slice(0, SEARCH_IN_MENU).map((shop) => ({
    label: `Search at ${shop} ↗`,
    onSelect: () => { const url = searchUrl(shop, country, name); if (url) openShopPage(url) },
  }))
  if (order.length > SEARCH_IN_MENU || more.length) items.push({ label: 'Other shops…', onSelect: onOther })
  return items
}

/** A sheet of shops, each a line that opens the chain's own page: the
 *  person's shops first, the other chains of their country under a quiet
 *  "More shops". For a search, `query` is the item's name. */
export function LinksSheet({ kind, kept, country, query, onClose }: {
  kind: 'offers' | 'search'; kept: string[]; country: string | null | undefined; query?: string; onClose: () => void
}) {
  const { mine, more } = linkShops(kept, country, kind)
  // A search sheet comes from "Other shops…": the other chains are what was asked for.
  const [showMore, setShowMore] = useState(mine.length === 0 || kind === 'search')
  const words = query ? searchWords(query) : ''
  const urlOf = (shop: string) => (kind === 'offers' ? offersUrl(shop, country) : searchUrl(shop, country, query ?? ''))
  const row = (shop: string) => {
    const url = urlOf(shop)
    if (!url) return null
    return (
      <li key={shop}>
        <a className="shop-link-row" href={url} target="_blank" rel="noopener noreferrer"
          aria-label={kind === 'offers' ? `${shop}: this week’s offers, on the ${shop} website` : `Search for ${words} at ${shop}, on the ${shop} website`}>
          <span className="shop-name">{shop}</span>
          <span className="shop-link-out" aria-hidden="true">↗</span>
        </a>
      </li>
    )
  }
  return (
    <Sheet title={kind === 'offers' ? 'Offers this week' : `Search for ${words}`} onClose={onClose}>
      {mine.length > 0 && <ul className="shop-link-list" aria-label="Your shops">{mine.map(row)}</ul>}
      {more.length > 0 && mine.length > 0 && (
        <button type="button" className="shop-link-more" aria-expanded={showMore} onClick={() => setShowMore((m) => !m)}>
          <span>More shops</span>
          <span className="shop-caret" aria-hidden="true">{showMore ? '▾' : '▸'}</span>
        </button>
      )}
      {more.length > 0 && showMore && <ul className="shop-link-list" aria-label={mine.length ? 'More shops' : 'Shops'}>{more.map(row)}</ul>}
      {mine.length === 0 && more.length === 0 && <p className="stock-hint">None of these shops has a page to open.</p>}
    </Sheet>
  )
}

/** The one quiet line under the filters while the list shows one shop:
 *  "Offers at Albert Heijn ›", straight to the chain's offers page. */
export function OffersLine({ shop, country }: { shop: string; country: string | null | undefined }) {
  const url = offersUrl(shop, country)
  if (!url) return null
  return (
    <p className="shop-offers-line">
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`This week’s offers at ${shop}, on the ${shop} website`}>
        Offers at {shop} ›
      </a>
    </p>
  )
}
