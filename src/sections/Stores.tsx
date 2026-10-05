import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { readSettings, type Shop } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { moduleSettings, renameShopPrices, removePrice, saveModuleSettings, updateEntry } from '../lib/shopping'
import {
  addAisle, AISLE_MAX, currencyFor, DEFAULT_AISLES, moveInList, OTHER, priceLabel, readAisles, removeAisle, renameAisle,
  sameShop, shopAisles, type AisleSettings,
} from '../lib/shopping-rules'
import { cleanShopName, offersUrl, suggestShops } from '../lib/shops-rules'
import { countryName } from '../lib/countries'
import { offerUndo } from '../ui/Undo'
import { RowMenu, Sheet, TabMenu } from './shop-ui'
import { useOffersSheet } from './ShopLinks'
import type { Profile } from '../lib/types'

/** How many chains show before "More shops": the most common of the
 *  person's country. */
const FIRST_CHAINS = 4

/** Shop → Stores (SHOP-32 to SHOP-36): the shops the person uses, picked
 *  from the chains of their country (or typed), each with its own aisle
 *  order and the prices noted there; and the aisles themselves, in the
 *  order of a walk round the shop. Nothing here comes from a shop's
 *  catalogue: each shop links out to the chain's own weekly offers page
 *  (PRICE-06), opened in the browser; nothing of it is copied.
 *
 *  Calm (v17): four chains and "More shops", no paragraphs; the aisles wait
 *  under a fold until there is a shop to walk. */
export function Stores({ profile, menuSlot }: { profile: Profile; menuSlot: HTMLElement | null }) {
  const settings = readSettings(profile).shopping
  const shops = settings.shops
  const module = useLiveQuery(() => moduleSettings(profile.id), [profile.id, profile.updated_at])
  const prices = useLiveQuery(() => db.shop_price.where('household_id').equals(profile.household_id).filter((p) => !p.deleted_at).toArray(),
    [profile.household_id], [])
  const [query, setQuery] = useState('')
  const [more, setMore] = useState(false)
  const [aislesOpen, setAislesOpen] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<Shop | null>(null)
  const currency = currencyFor(profile.country)
  const offersSheet = useOffersSheet(profile)
  const suggestions = suggestShops(profile.country, shops.map((s) => s.name), query)
  const name = profile.country ? countryName(profile.country) : null
  // "the Netherlands", "the United Kingdom", but "Germany".
  const home = name && /^(Netherlands|United |Czech Republic|Philippines|Dominican Republic|Bahamas|Gambia)/.test(name) ? `the ${name}` : name

  async function saveShops(next: Shop[], undoLabel?: string) {
    const before = shops
    await saveSettings(profile, { shopping: { shops: next } })
    if (undoLabel) {
      offerUndo(undoLabel, async () => {
        // The profile as it is by then, so changes made since are kept.
        const fresh = await db.profile.get(profile.id)
        if (fresh) await saveSettings(fresh, { shopping: { shops: before } })
      })
    }
  }

  async function add(name: string) {
    const n = cleanShopName(name)
    if (!n || shops.some((s) => sameShop(s.name, n)) || shops.length >= 20) return
    await saveShops([...shops, { name: n, aisles: [] }], `${n} added`)
    setQuery('')
  }

  async function rename(shop: Shop, to: string) {
    const n = cleanShopName(to)
    if (!n || shops.some((s) => s !== shop && sameShop(s.name, n))) return
    await saveShops(shops.map((s) => (s === shop ? { ...s, name: n } : s)))
    // The household's prices and items set to the shop follow its new name.
    await renameShopPrices(profile.household_id, shop.name, n)
    for (const e of await db.shopping_entry.where('household_id').equals(profile.household_id).toArray()) {
      if (!e.deleted_at && sameShop(e.shop, shop.name)) await updateEntry(e, { shop: n })
    }
  }

  const tiles = more || query ? suggestions.slice(0, 40) : suggestions.slice(0, FIRST_CHAINS)

  return (
    <>
      <TabMenu slot={menuSlot} items={[
        offersSheet.item,
        shops.length > 0 && { label: aislesOpen ? 'Hide your aisles' : 'Your aisles…', onSelect: () => setAislesOpen((o) => !o) },
      ]} />
      {offersSheet.sheet}
      <form className="shop-add" onSubmit={(e: FormEvent) => { e.preventDefault(); void add(query) }}>
        <div className="shop-add-row">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={60}
            placeholder="Add a shop" aria-label="Add a shop" autoComplete="off" />
          {cleanShopName(query) && <button type="submit" className="btn btn-primary" disabled={shops.length >= 20}>Add</button>}
        </div>
        {suggestions.length > 0 && (
          <div className="shop-tiles" role="group" aria-label={home ? `Shops in ${home} first` : 'Shops'}>
            {tiles.map((s) => (
              <button key={s.name} type="button" className="shop-tile" onClick={() => void add(s.name)} aria-label={`Add ${s.name}`}>
                <span aria-hidden="true">+</span> {s.name}{s.online ? ' (delivers)' : ''}
              </button>
            ))}
            {!more && !query && suggestions.length > FIRST_CHAINS && (
              <button type="button" className="shop-tile is-quiet" onClick={() => setMore(true)}>More shops</button>
            )}
          </div>
        )}
      </form>

      {shops.length === 0 && <p className="empty">No shops yet; add the ones you use.</p>}

      <ul className="shop-stores">
        {shops.map((shop, i) => {
          const here = prices.filter((p) => sameShop(p.shop, shop.name)).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
          const isOpen = open === shop.name
          const offers = offersUrl(shop.name, profile.country)
          return (
            <li key={shop.name} className="shop-store">
              <div className={`shop-store-head${offers ? ' has-offers' : ''}`}>
                <button type="button" className="shop-what" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : shop.name)}>
                  <span className="shop-name">{shop.name}</span>
                  <span className="shop-meta">
                    {[here.length ? `${here.length} ${here.length === 1 ? 'price' : 'prices'}` : 'no prices yet',
                      shop.aisles.length ? 'its own aisle order' : 'your usual aisle order'].join(' · ')}
                  </span>
                </button>
                {offers && (
                  <a className="shop-offers" href={offers} target="_blank" rel="noopener noreferrer"
                    aria-label={`This week's offers at ${shop.name}, on the ${shop.name} website`}>Offers ↗</a>
                )}
                <RowMenu label={`More for ${shop.name}`} items={[
                  { label: isOpen ? 'Close' : 'Aisles and prices', onSelect: () => setOpen(isOpen ? null : shop.name) },
                  ...(offers ? [{ label: 'This week’s offers ↗', onSelect: () => { window.open(offers, '_blank', 'noopener,noreferrer') } }] : []),
                  { label: 'Move up', disabled: i === 0, onSelect: () => void saveShops(moveInList(shops, i, -1)) },
                  { label: 'Move down', disabled: i === shops.length - 1, onSelect: () => void saveShops(moveInList(shops, i, 1)) },
                  { label: 'Rename…', onSelect: () => setRenaming(shop) },
                  { label: 'Remove', warn: true, onSelect: () => void saveShops(shops.filter((s) => s !== shop), `${shop.name} removed`) },
                ]} />
              </div>
              {isOpen && module && (
                <div className="shop-store-body">
                  <p className="shop-label">Aisles at {shop.name}, in the order you walk them</p>
                  <AisleOrder order={shopAisles(shop, module.aisles)}
                    onOrder={(order) => void saveShops(shops.map((s) => (s === shop ? { ...s, aisles: order } : s)))} />
                  {shop.aisles.length > 0 && (
                    <button type="button" className="btn" onClick={() => void saveShops(shops.map((s) => (s === shop ? { ...s, aisles: [] } : s)), `${shop.name} back to your usual order`)}>
                      Use my usual order here
                    </button>
                  )}
                  <p className="shop-label">Prices noted at {shop.name}</p>
                  {here.length === 0
                    ? <p className="stock-hint">None yet.</p>
                    : (
                      <ul className="shop-price-list">
                        {here.map((p) => (
                          <li key={p.id}>
                            <span className="shop-name">{p.name ?? 'Item'}</span>
                            <span className="shop-price">{priceLabel(p, currency)}</span>
                            <button type="button" className="shop-x" aria-label={`Remove the price of ${p.name} at ${shop.name}`}
                              onClick={async () => offerUndo('Price removed', await removePrice(p))}>×</button>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {module && shops.length > 0 && (
        <section className="shop-aisles" aria-label="Aisles">
          <h3 className="shop-aisle">
            <button type="button" aria-expanded={aislesOpen} onClick={() => setAislesOpen((o) => !o)}>
              <span>Your aisles</span>
              <span className="shop-caret" aria-hidden="true">{aislesOpen ? '▾' : '▸'}</span>
            </button>
          </h3>
          {aislesOpen && <AisleSettingsCard profile={profile} aisles={module.aisles} />}
        </section>
      )}

      {renaming && (
        <Sheet title={`Rename ${renaming.name}`} onClose={() => setRenaming(null)}>
          <RenameForm start={renaming.name} max={60} onSave={async (n) => { await rename(renaming, n); setRenaming(null) }} />
        </Sheet>
      )}
    </>
  )
}

/** The aisles: renamed, reordered, added or taken off (SHOP-35). They are
 *  the order used with "Any shop" and the start of each shop's own order. */
function AisleSettingsCard({ profile, aisles }: { profile: Profile; aisles: AisleSettings }) {
  const [adding, setAdding] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const save = async (next: AisleSettings, label?: string) => {
    const before = aisles
    await saveModuleSettings(profile.id, { aisles: next })
    if (label) offerUndo(label, () => saveModuleSettings(profile.id, { aisles: before }))
  }
  const isDefault = JSON.stringify(aisles.aisles) === JSON.stringify(DEFAULT_AISLES) && !Object.keys(aisles.renamed).length
  return (
    <div className="shop-aisles-body">
      <AisleOrder order={aisles.aisles} onOrder={(order) => void save({ ...aisles, aisles: order })}
        extra={(a) => a === OTHER ? [] : [
          { label: 'Rename…', onSelect: () => setRenaming(a) },
          { label: 'Remove', warn: true, onSelect: () => void save(removeAisle(aisles, a), `${a} removed; its items go under Other`) },
        ]} />
      <form className="shop-add shop-add-aisle" onSubmit={(e) => {
        e.preventDefault()
        const next = addAisle(aisles, adding)
        if (next !== aisles) { void save(next); setAdding('') }
      }}>
        <div className="shop-add-row">
          <input value={adding} onChange={(e) => setAdding(e.target.value)} maxLength={AISLE_MAX} placeholder="New aisle: Asian, Organic, Baby" aria-label="New aisle" />
          <button type="submit" className="btn" disabled={!adding.trim() || addAisle(aisles, adding) === aisles}>Add aisle</button>
        </div>
      </form>
      {!isDefault && (
        <div className="shop-pad">
          <button type="button" className="btn" onClick={() => void save(readAisles(undefined), 'Aisles back to the usual ones')}>Back to the usual aisles</button>
        </div>
      )}
      {renaming && (
        <Sheet title={`Rename ${renaming}`} onClose={() => setRenaming(null)}>
          <RenameForm start={renaming} max={AISLE_MAX} onSave={async (n) => {
            const next = renameAisle(aisles, renaming, n)
            if (next !== aisles) await save(next, `${renaming} is now ${n}`)
            setRenaming(null)
          }} />
        </Sheet>
      )}
    </div>
  )
}

/** A list of aisles with Move up and Move down on each (and any other
 *  actions given), as buttons and in a ⋮ menu. */
function AisleOrder({ order, onOrder, extra }: {
  order: string[]; onOrder: (next: string[]) => void; extra?: (aisle: string) => { label: string; onSelect: () => void; warn?: boolean }[]
}) {
  return (
    <ol className="shop-aisle-order">
      {order.map((a, i) => (
        <li key={a}>
          <span className="shop-aisle-n" aria-hidden="true">{i + 1}</span>
          <span className="shop-aisle-name">{a}</span>
          <button type="button" className="stock-step" aria-label={`Move ${a} up`} disabled={i === 0} onClick={() => onOrder(moveInList(order, i, -1))}>↑</button>
          <button type="button" className="stock-step" aria-label={`Move ${a} down`} disabled={i === order.length - 1} onClick={() => onOrder(moveInList(order, i, 1))}>↓</button>
          {extra && extra(a).length > 0 ? <RowMenu label={`More for ${a}`} items={extra(a)} /> : <span className="shop-more-gap" />}
        </li>
      ))}
    </ol>
  )
}

function RenameForm({ start, max, onSave }: { start: string; max: number; onSave: (name: string) => void }) {
  const [name, setName] = useState(start)
  return (
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave(name.trim()) }}>
      <label>New name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={max} data-autofocus onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="sheet-actions">
        <button type="submit" className="btn btn-primary grow" disabled={!name.trim() || name.trim() === start}>Save</button>
      </div>
    </form>
  )
}
