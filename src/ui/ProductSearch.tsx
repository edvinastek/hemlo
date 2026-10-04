import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { countryName } from '../lib/countries'
import { addStock } from '../lib/stock'
import { formatGrams } from '../lib/stock-rules'
import { amountChoices, amountHint, readAmount, readUnits, unitLine, type Amount } from '../lib/units-rules'
import { AmountInput } from './AmountInput'
import {
  addProduct, foodByBarcode, lookUpBarcode, productByBarcode, searchProducts, sharedPrices, whereFor, ProductProblem,
} from '../lib/products'
import {
  displayName, formatDay, labelRows, maybeShopLabel, normaliseBarcode, pricesPage, productFromFood, productPage,
  type NutriScore, type PriceRow, type Product,
} from '../lib/products-rules'
import { BarcodeScan } from './BarcodeScan'
import { ReadyMealForm } from './ReadyMeal'
import type { Food, Recipe } from '../lib/types'
import './products.css'
import { useBackClose } from './useBackClose'

/** What the finder is for: the Foods tab (keep it), Stock (put it in the
 *  cupboard), or picking a food for something else (a meal, a recipe line,
 *  the shopping list), which hands the food back. */
type Purpose = 'foods' | 'stock' | 'pick'
type View = 'search' | 'scan' | 'detail' | 'amount'
type Chosen = { product: Product; food: Food | null; said?: string }

const problemText = (e: unknown) =>
  e instanceof ProductProblem ? e.message : 'Something went wrong asking Open Food Facts. Try again.'

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

interface FinderProps {
  start: 'search' | 'scan'
  purpose: Purpose
  onClose: () => void
  onShow?: (name: string) => void
  householdId?: string
  onStocked?: (text: string) => void
  /** For 'pick': the food chosen (kept in the person's foods first). */
  onPick?: (food: Food, product: Product) => void
  /** For 'pick': the words on its button ("Put on plate"). */
  pickLabel?: string
  /** For 'pick': offered "Save as ready meal", which hands the recipe back. */
  onReady?: (recipe: Recipe, food: Food) => void
  /** What to search for first (the words typed in another search). */
  query?: string
}

/** A sheet: search or scan, a product's page, and adding it. */
export function ProductFinder(props: FinderProps) {
  const titleId = useId()
  const { purpose, onClose } = props
  useBackClose(onClose)
  const title = purpose === 'stock' ? 'Scan to add to stock' : 'Find in stores'
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet pf-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="pf-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="slot-link" onClick={onClose}>Close</button>
        </div>
        <ProductFinderBody {...props} />
      </div>
    </>
  )
}

/** The finder without a sheet of its own, to sit inside another sheet (the
 *  add-food sheet's Foods tab), so a sheet never opens on top of a sheet.
 *  Searching goes out only when the person presses Search, never as they
 *  type: Open Food Facts allows ten searches a minute. */
export function ProductFinderBody({ start, purpose, onClose, onShow, householdId, onStocked, onPick, pickLabel, onReady, query: firstQuery }: FinderProps) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const where = useMemo(() => whereFor(profile?.country), [profile?.country])
  const [view, setView] = useState<View>(start)
  const [query, setQuery] = useState(firstQuery ?? '')
  const [results, setResults] = useState<Product[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Chosen | null>(null)

  // Barcodes of the foods already kept, to mark them in the results.
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const kept = useMemo(() => new Set(foods.filter((f) => !f.deleted_at && f.barcode).map((f) => f.barcode as string)), [foods])

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

  return (
      <div className="pf-body">
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
            onStock={() => setView('amount')}
            pickLabel={pickLabel}
            onPick={onPick ? async () => {
              setBusy(true)
              try {
                const food = chosen.food ?? await add(chosen.product)
                if (food) onPick(food, chosen.product)
              } finally { setBusy(false) }
            } : undefined}
            onReady={onReady ? async () => chosen.food ?? await add(chosen.product) : undefined}
            onReadySaved={onReady} />
        )}

        {view === 'amount' && chosen && householdId && (
          <StockAmount chosen={chosen} onBack={() => setView('detail')}
            onSave={async (amount, said) => {
              const food = chosen.food ?? await add(chosen.product)
              if (!food) return
              await addStock(householdId, food.id, amount.grams, undefined, amount.unit ?? undefined)
              onStocked?.(`Put ${said} of ${food.name} in stock.`)
            }} />
        )}
      </div>
  )
}

function Thumb({ product }: { product: Product }) {
  if (!product.image) return <span className="pf-thumb is-empty" aria-hidden="true" />
  return (
    <img className="pf-thumb" src={product.image} alt={`Pack of ${displayName(product)}`} loading="lazy" decoding="async"
      width={48} height={48} referrerPolicy="no-referrer" />
  )
}

/** The Nutri-Score letter in its own colour, with the letter written out so
 *  colour is never the only signal (PROD-06). */
export function NutriScoreBadge({ grade }: { grade: NutriScore }) {
  return (
    <span className={`pf-ns pf-ns-${grade}`} role="img" aria-label={`Nutri-Score ${grade.toUpperCase()}`}>
      <span aria-hidden="true">Nutri-Score</span> <b aria-hidden="true">{grade.toUpperCase()}</b>
    </span>
  )
}

/** One product: its whole EU nutrition table, where it is sold, shared
 *  prices, where the data comes from, and what can be done with it. */
function ProductPage({ chosen, purpose, busy, problem, onBack, onAdd, onShow, onStock, onPick, pickLabel, onReady, onReadySaved }: {
  chosen: Chosen
  purpose: Purpose
  busy: boolean
  problem: string | null
  onBack: () => void
  onAdd: () => Promise<void>
  onShow?: () => void
  onStock: () => void
  onPick?: () => Promise<void>
  pickLabel?: string
  /** Keeps the food (when not yet kept) for a ready meal, and gives it. */
  onReady?: () => Promise<Food | null>
  onReadySaved?: (recipe: Recipe, food: Food) => void
}) {
  const { product: p, food, said } = chosen
  const per = p.perMl || p.packUnit === 'ml' ? '100 ml' : '100 g'
  const [ready, setReady] = useState<Food | null>(null)
  if (ready && onReadySaved) {
    return (
      <ReadyMealForm food={ready} product={p} onCancel={() => setReady(null)}
        onSaved={(recipe) => onReadySaved(recipe, ready)} />
    )
  }
  return (
    <article className="pf-page" aria-label={displayName(p)}>
      <button type="button" className="slot-link" onClick={onBack}>← Back</button>
      <div className="pf-title">
        {p.image && <img className="pf-photo" src={p.image} alt={`Pack of ${displayName(p)}`} loading="lazy" referrerPolicy="no-referrer" width={72} height={72} />}
        <div>
          <h3 className="pf-name">{displayName(p)}</h3>
          <p className="row-meta">{[p.brand, p.quantity ?? (p.pack ? formatGrams(p.pack) : null)].filter(Boolean).join(' · ')}</p>
          <p className="row-meta">Barcode {p.code}</p>
          {p.nutriScore && <NutriScoreBadge grade={p.nutriScore} />}
        </div>
      </div>

      <table className="pf-facts">
        <caption>Nutrition per {per}</caption>
        <tbody>
          {labelRows(p).map((r) => (
            <tr key={r.key} className={r.sub ? 'is-sub' : undefined}><th scope="row">{r.label}</th><td>{r.value}</td></tr>
          ))}
        </tbody>
      </table>

      {(() => {
        // The food's units once kept, else the serving the pack states.
        const units = food ? readUnits(food.units) : p.serving ? [p.serving] : []
        return units.length > 0 && (
          <p className="pf-line"><b>Counted as</b> {units.map(unitLine).join(', ')}</p>
        )
      })()}
      <p className="pf-line"><b>Sold at</b> {p.stores.length ? p.stores.join(', ') : 'no shops listed yet'}</p>

      <Prices product={p} />

      <p className="pf-credit">
        Product data: <a href={productPage(p.code)} target="_blank" rel="noopener noreferrer">Open Food Facts</a> (ODbL).<br />
        Prices: <a href={pricesPage(p.code)} target="_blank" rel="noopener noreferrer">Open Prices</a> (ODbL).
      </p>

      {said && <p className="pf-note" role="status">{said}</p>}
      {problem && <p className="pf-note is-bad" role="alert">{problem}</p>}
      <div className="sheet-actions pf-do">
        {purpose === 'pick' && onPick ? (
          <>
            {onReady && (
              <button type="button" className="btn" disabled={busy} onClick={async () => setReady(await onReady())}>Save as ready meal…</button>
            )}
            <button type="button" className="btn btn-primary grow" disabled={busy} onClick={() => void onPick()}>{pickLabel ?? 'Use this food'}</button>
          </>
        ) : purpose === 'stock' ? (
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

/** How much went in the cupboard: packs when the pack size is known, grams
 *  or kilos, or the product's serving ("3 bars") when the pack states one. */
function StockAmount({ chosen, onBack, onSave }: {
  chosen: Chosen; onBack: () => void; onSave: (amount: Amount, said: string) => Promise<void>
}) {
  const p = chosen.product
  const pack = p.pack ?? (chosen.food?.pack_size_g ? Number(chosen.food.pack_size_g) : null)
  const units = chosen.food ? readUnits(chosen.food.units) : p.serving ? [p.serving] : []
  const choices = amountChoices(units, { kilos: true, pack })
  const [unit, setUnit] = useState(pack ? 'packs' : 'g')
  const [text, setText] = useState(pack ? '1' : '')
  const [busy, setBusy] = useState(false)
  const choice = choices.find((c) => c.key === unit) ?? choices[0]
  const read = readAmount(text, choice)
  const amount = read && read.grams > 0 ? read : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!amount || busy) return
    setBusy(true)
    try { await onSave(amount, amountHint(text, choice)) } finally { setBusy(false) }
  }

  return (
    <form className="pf-page" onSubmit={submit}>
      <button type="button" className="slot-link" onClick={onBack}>← Back</button>
      <h3 className="pf-name">{displayName(p)}</h3>
      {!chosen.food && <p className="row-meta">It goes in your foods too.</p>}
      <div className="stock-fields pf-amount">
        <AmountInput text={text} choice={choice.key} choices={choices} onText={setText} onChoice={setUnit}
          label="How much" groupClass="stock-units" input={{ autoFocus: true, onFocus: (e) => e.currentTarget.select() }} />
      </div>
      <p className="stock-hint" aria-live="polite">
        {amount ? `${amountHint(text, choice)}${unit === 'packs' && pack ? `, ${formatGrams(pack)} a pack` : ''}` : text.trim() ? 'That is not an amount.' : ''}
      </p>
      <div className="sheet-actions">
        <button type="submit" className="btn btn-primary grow" disabled={!amount || busy}>Add to stock</button>
      </div>
    </form>
  )
}

/** Scan a barcode and get a food back (PROD-02): the one kept with that
 *  barcode, or the product from Open Food Facts added to the person's foods.
 *  For anywhere food is added (a recipe's ingredient, the shopping list,
 *  stock): open it, and `onFood` gets the food. An unknown barcode offers the
 *  search by name instead. A sheet of its own: open it from a page, not from
 *  inside another sheet (the add-food sheet has scanning built in). */
export function ScanFoodSheet({ title = 'Scan a barcode', action = 'Use this food', onFood, onClose }: {
  title?: string
  /** The button's words on a product's page, when it is shown. */
  action?: string
  onFood: (food: Food, product: Product) => void
  onClose: () => void
}) {
  const titleId = useId()
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const where = useMemo(() => whereFor(profile?.country), [profile?.country])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useBackClose(onClose)

  async function got(code: string) {
    setBusy(true)
    setProblem(null)
    try {
      const found = await lookUpBarcode(code, userId, where)
      if (!found) {
        setProblem(`No product with barcode ${code} in Open Food Facts yet.${maybeShopLabel(code)
          ? ' It may be a shop’s own label for something weighed at the counter; those are not listed.' : ''} Search by name instead.`)
        return
      }
      if (found.food) { onFood(found.food, found.product); return }
      if (!userId) { setProblem('Sign in to keep foods.'); return }
      const { food } = await addProduct(found.product, userId)
      onFood(food, found.product)
    } catch (e) {
      setProblem(problemText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet pf-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="pf-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="slot-link" onClick={onClose}>Close</button>
        </div>
        {searching ? (
          <ProductFinderBody start="search" purpose="pick" pickLabel={action} onClose={onClose}
            onPick={(food, product) => onFood(food, product)} />
        ) : (
          <>
            {busy ? <p className="pf-note" role="status">Looking it up…</p>
              : <BarcodeScan key={attempt} onCode={(c) => void got(c)} onCancel={onClose} />}
            {problem && <p className="pf-note is-bad" role="alert">{problem}</p>}
            <div className="sheet-actions">
              {problem && <button type="button" className="btn" onClick={() => { setProblem(null); setAttempt((n) => n + 1) }}>Scan again</button>}
              <button type="button" className="btn grow" onClick={() => setSearching(true)}>Search by name</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
