import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { countryName } from '../lib/countries'
import { addStock } from '../lib/stock'
import { formatGrams } from '../lib/stock-rules'
import {
  addProduct, foodByBarcode, productByBarcode, searchProducts, sharedPrices, whereFor, ProductProblem,
} from '../lib/products'
import {
  displayName, formatDay, maybeShopLabel, normaliseBarcode, pricesPage, productFromFood, productPage, stockGrams,
  type AmountUnit, type PriceRow, type Product,
} from '../lib/products-rules'
import { BarcodeScan } from './BarcodeScan'
import type { Food } from '../lib/types'
import './products.css'

type Purpose = 'foods' | 'stock'
type View = 'search' | 'scan' | 'detail' | 'amount'
type Chosen = { product: Product; food: Food | null; said?: string }

const problemText = (e: unknown) =>
  e instanceof ProductProblem ? e.message : 'Something went wrong asking Open Food Facts. Try again.'

/** The Foods tab's way into the shops: search Open Food Facts, or scan a
 *  barcode. "Show in Foods" narrows the table to the food. */
export function FindProducts({ onShow }: { onShow: (name: string) => void }) {
  const [open, setOpen] = useState<null | 'search' | 'scan'>(null)
  return (
    <div className="pf-bar">
      <button type="button" className="btn" onClick={() => setOpen('search')}>Find in stores</button>
      <button type="button" className="btn" onClick={() => setOpen('scan')}>Scan barcode</button>
      {open && <ProductFinder start={open} purpose="foods" onClose={() => setOpen(null)} onShow={onShow} />}
    </div>
  )
}

/** The Stock tab's scan: read a barcode, find the food (or add it from Open
 *  Food Facts), say how much, and it goes in the cupboard like any other. */
export function ScanToStock({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  return (
    <div className="pf-bar">
      <button type="button" className="btn" onClick={() => { setSaid(null); setOpen(true) }}>Scan to add</button>
      {said && <p className="stock-hint" role="status">{said}</p>}
      {open && (
        <ProductFinder start="scan" purpose="stock" householdId={householdId} onClose={() => setOpen(false)}
          onStocked={(text) => { setSaid(text); setOpen(false) }} />
      )}
    </div>
  )
}

/** A sheet: search or scan, a product's page, and adding it. Searching goes
 *  out only when the person presses Search, never as they type: Open Food
 *  Facts allows ten searches a minute. */
export function ProductFinder({ start, purpose, onClose, onShow, householdId, onStocked }: {
  start: 'search' | 'scan'
  purpose: Purpose
  onClose: () => void
  onShow?: (name: string) => void
  householdId?: string
  onStocked?: (text: string) => void
}) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const where = useMemo(() => whereFor(profile?.country), [profile?.country])
  const [view, setView] = useState<View>(start)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const titleId = useId()

  // Barcodes of the foods already kept, to mark them in the results.
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const kept = useMemo(() => new Set(foods.filter((f) => !f.deleted_at && f.barcode).map((f) => f.barcode as string)), [foods])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function search(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      const code = normaliseBarcode(query)
      if (code) { await lookUp(code); return }
      const found = await searchProducts(query, where)
      setResults(found)
    } catch (err) {
      setProblem(problemText(err))
    } finally {
      setBusy(false)
    }
  }

  /** A barcode, scanned or typed: the food already kept, else Open Food Facts. */
  const lookUp = useCallback(async (code: string) => {
    setProblem(null)
    setBusy(true)
    try {
      const mine = await foodByBarcode(code, userId)
      const own = mine ? productFromFood(mine) : null
      if (mine && own) {
        setChosen({ product: own, food: mine, said: 'Already in your foods.' })
        setView('detail')
        return
      }
      const product = await productByBarcode(code, where)
      if (!product) {
        setProblem(`No product with barcode ${code} in Open Food Facts yet.${maybeShopLabel(code)
          ? ' It may be a shop’s own label for something weighed at the counter; those are not listed.' : ''}`)
        setView('search')
        return
      }
      setChosen({ product, food: null })
      setView('detail')
    } catch (err) {
      setProblem(problemText(err))
      setView('search')
    } finally {
      setBusy(false)
    }
  }, [userId, where])

  async function add(product: Product): Promise<Food | null> {
    if (!userId) { setProblem('Sign in to keep foods.'); return null }
    const { food, existed } = await addProduct(product, userId)
    setChosen({ product, food, said: existed ? 'Already in your foods.' : 'Added to your foods.' })
    return food
  }

  const title = purpose === 'stock' ? 'Scan to add to stock' : 'Find in stores'

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet pf-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="pf-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="slot-link" onClick={onClose}>Close</button>
        </div>

        {view === 'search' && (
          <>
            <form className="pf-search" onSubmit={search} role="search">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={start === 'search'}
                placeholder="Product, brand or barcode" aria-label="Search Open Food Facts" autoComplete="off" enterKeyHint="search" maxLength={80} />
              <button type="submit" className="btn btn-primary" disabled={busy || !query.trim()}>Search</button>
            </form>
            <div className="pf-actions">
              <button type="button" className="btn" onClick={() => { setProblem(null); setView('scan') }}>Scan barcode</button>
              <span className="row-meta">Shops in {countryName(profile?.country) ?? 'the Netherlands'}</span>
            </div>
            {busy && <p className="pf-note" role="status">Searching…</p>}
            {problem && <p className="pf-note is-bad" role="alert">{problem}</p>}
            {results && !busy && (
              results.length === 0
                ? <p className="pf-note">Nothing found. Try fewer or other words, in the shop’s language.</p>
                : (
                  <ul className="pf-results" aria-label="Products found">
                    {results.map((p) => (
                      <li key={p.code}>
                        <button type="button" className="pf-hit" onClick={() => {
                          const food = foods.find((f) => !f.deleted_at && f.barcode === p.code) ?? null
                          setChosen({ product: p, food, said: food ? 'Already in your foods.' : undefined })
                          setView('detail')
                        }}>
                          <Thumb product={p} />
                          <span className="pf-hit-text">
                            <span className="pf-hit-name">{displayName(p)}</span>
                            {(p.brand || p.quantity) && <span className="row-meta">{[p.brand, p.quantity].filter(Boolean).join(' · ')}</span>}
                            {p.stores.length > 0 && <span className="row-meta pf-stores">{p.stores.slice(0, 3).join(', ')}</span>}
                          </span>
                          <span className="pf-hit-kcal">
                            {p.per100.kcal ?? '–'}<small>kcal/100 {p.packUnit === 'ml' ? 'ml' : 'g'}</small>
                            {kept.has(p.code) && <span className="sp-tag">mine</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
            )}
            <p className="pf-credit">
              Product data: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Food Facts</a> (ODbL).
              Searches go from this device straight to Open Food Facts.
            </p>
          </>
        )}

        {view === 'scan' && (
          <>
            {busy && <p className="pf-note" role="status">Looking it up…</p>}
            {!busy && <BarcodeScan onCode={(code) => void lookUp(code)} onCancel={() => (start === 'scan' && !results ? onClose() : setView('search'))} />}
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setView('search')}>Search by name instead</button>
            </div>
          </>
        )}

        {view === 'detail' && chosen && (
          <ProductPage chosen={chosen} purpose={purpose} busy={busy} problem={problem}
            onBack={() => { setProblem(null); setView(results ? 'search' : start) }}
            onAdd={async () => {
              setBusy(true)
              try { await add(chosen.product) } finally { setBusy(false) }
            }}
            onShow={onShow && chosen.food ? () => { onShow(chosen.food!.name); onClose() } : undefined}
            onStock={() => setView('amount')} />
        )}

        {view === 'amount' && chosen && householdId && (
          <StockAmount chosen={chosen} onBack={() => setView('detail')}
            onSave={async (grams) => {
              const food = chosen.food ?? await add(chosen.product)
              if (!food) return
              await addStock(householdId, food.id, grams)
              onStocked?.(`Put ${formatGrams(grams)} of ${food.name} in stock.`)
            }} />
        )}
      </div>
    </>
  )
}

function Thumb({ product }: { product: Product }) {
  if (!product.image) return <span className="pf-thumb is-empty" aria-hidden="true" />
  return (
    <img className="pf-thumb" src={product.image} alt={`Pack of ${displayName(product)}`} loading="lazy" decoding="async"
      width={48} height={48} referrerPolicy="no-referrer" />
  )
}

const FACTS: [keyof Product['per100'], string, string][] = [
  ['kcal', 'Energy', 'kcal'], ['protein_g', 'Protein', 'g'], ['carbs_g', 'Carbohydrate', 'g'], ['fat_g', 'Fat', 'g'], ['fiber_g', 'Fibre', 'g'],
]

/** One product: its figures per 100 g, where it is sold, shared prices,
 *  where the data comes from, and adding it. */
function ProductPage({ chosen, purpose, busy, problem, onBack, onAdd, onShow, onStock }: {
  chosen: Chosen
  purpose: Purpose
  busy: boolean
  problem: string | null
  onBack: () => void
  onAdd: () => Promise<void>
  onShow?: () => void
  onStock: () => void
}) {
  const { product: p, food, said } = chosen
  const per = p.packUnit === 'ml' ? '100 ml' : '100 g'
  return (
    <article className="pf-page" aria-label={displayName(p)}>
      <button type="button" className="slot-link" onClick={onBack}>← Back</button>
      <div className="pf-title">
        {p.image && <img className="pf-photo" src={p.image} alt={`Pack of ${displayName(p)}`} loading="lazy" referrerPolicy="no-referrer" width={72} height={72} />}
        <div>
          <h3 className="pf-name">{displayName(p)}</h3>
          <p className="row-meta">{[p.brand, p.quantity ?? (p.pack ? formatGrams(p.pack) : null)].filter(Boolean).join(' · ')}</p>
          <p className="row-meta">Barcode {p.code}</p>
        </div>
      </div>

      <table className="pf-facts">
        <caption>Per {per}</caption>
        <tbody>
          {FACTS.map(([key, label, unit]) => (
            <tr key={key}><th scope="row">{label}</th><td>{p.per100[key] === null ? '–' : `${p.per100[key]} ${unit}`}</td></tr>
          ))}
        </tbody>
      </table>

      <p className="pf-line"><b>Sold at</b> {p.stores.length ? p.stores.join(', ') : 'no shops listed yet'}</p>

      <Prices product={p} />

      <p className="pf-credit">
        Product data: <a href={productPage(p.code)} target="_blank" rel="noopener noreferrer">Open Food Facts</a> (ODbL).<br />
        Prices: <a href={pricesPage(p.code)} target="_blank" rel="noopener noreferrer">Open Prices</a> (ODbL).
      </p>

      {said && <p className="pf-note" role="status">{said}</p>}
      {problem && <p className="pf-note is-bad" role="alert">{problem}</p>}
      <div className="sheet-actions pf-do">
        {purpose === 'stock' ? (
          <button type="button" className="btn btn-primary grow" disabled={busy} onClick={onStock}>Put in stock…</button>
        ) : food ? (
          onShow && <button type="button" className="btn btn-primary grow" onClick={onShow}>Show in Foods</button>
        ) : (
          <button type="button" className="btn btn-primary grow" disabled={busy} onClick={() => void onAdd()}>Add to my foods</button>
        )}
      </div>
    </article>
  )
}

/** Prices people have shared on Open Prices: the latest per shop. Few Dutch
 *  shops are covered yet, so "none yet" is the usual answer. */
function Prices({ product }: { product: Product }) {
  const [rows, setRows] = useState<PriceRow[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setRows(null)
    setProblem(null)
    sharedPrices(product).then((r) => { if (live) setRows(r) }).catch((e) => { if (live) setProblem(problemText(e)) })
    return () => { live = false }
  }, [product])
  return (
    <section className="pf-prices" aria-label="Shared prices">
      <h4>Shared prices</h4>
      {!rows && !problem && <p className="row-meta" role="status">Looking for prices…</p>}
      {problem && <p className="row-meta">Prices could not be fetched. {problem}</p>}
      {rows && rows.length === 0 && <p className="row-meta">No shared prices yet.</p>}
      {rows && rows.length > 0 && (
        <ul>
          {rows.map((r, i) => (
            <li key={i}>
              <span className="pf-shop">{r.shop}{r.city ? `, ${r.city}` : ''}</span>
              <span className="pf-price">{r.label}{r.offer ? ' (offer)' : ''}</span>
              <span className="row-meta">{[r.perUnit, formatDay(r.date)].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** How much went in the cupboard: packs when the pack size is known, else grams. */
function StockAmount({ chosen, onBack, onSave }: { chosen: Chosen; onBack: () => void; onSave: (grams: number) => Promise<void> }) {
  const p = chosen.product
  const pack = p.pack ?? (chosen.food?.pack_size_g ? Number(chosen.food.pack_size_g) : null)
  const [unit, setUnit] = useState<AmountUnit>(pack ? 'packs' : 'g')
  const [text, setText] = useState(pack ? '1' : '')
  const [busy, setBusy] = useState(false)
  const grams = stockGrams(text, unit, pack)
  const units: AmountUnit[] = pack ? ['packs', 'g', 'kg'] : ['g', 'kg']

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (grams === null || busy) return
    setBusy(true)
    try { await onSave(grams) } finally { setBusy(false) }
  }

  return (
    <form className="pf-page" onSubmit={submit}>
      <button type="button" className="slot-link" onClick={onBack}>← Back</button>
      <h3 className="pf-name">{displayName(p)}</h3>
      {!chosen.food && <p className="row-meta">It goes in your foods too.</p>}
      <div className="stock-fields pf-amount">
        <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" autoFocus autoComplete="off"
          aria-label="How much" onFocus={(e) => e.currentTarget.select()} />
        <div className="stock-units" role="group" aria-label="Unit">
          {units.map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u}</button>
          ))}
        </div>
      </div>
      <p className="stock-hint" aria-live="polite">
        {grams !== null ? `${formatGrams(grams)}${unit === 'packs' && pack ? ` (${formatGrams(pack)} a pack)` : ''}` : text.trim() ? 'That is not an amount.' : ''}
      </p>
      <div className="sheet-actions">
        <button type="submit" className="btn btn-primary grow" disabled={grams === null || busy}>Add to stock</button>
      </div>
    </form>
  )
}
