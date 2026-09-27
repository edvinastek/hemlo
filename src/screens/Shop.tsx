import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format } from 'date-fns'
import { getMeta, setMeta } from '../lib/db'
import { useApp } from '../lib/store'
import { DataTable } from '../ui/DataTable'
import { tripFromPlan, type TripLine } from '../lib/shopping'
import { addStock, stockMap } from '../lib/stock'
import { boughtGrams } from '../lib/stock-rules'
import { StockPanel } from '../sections/Stock'

const SECTIONS = ['Trip', 'Stock', 'Stores']

/** What the plan needs up to the next trip, less what is already in the
 *  cupboard, rounded up to whole packs. Nothing here is typed by hand. */
export function Shop() {
  const [section, setSection] = useState('Trip')
  const profile = useApp((s) => s.profile)
  const today = format(new Date(), 'yyyy-MM-dd')
  const until = format(addDays(new Date(), 3), 'yyyy-MM-dd')

  // The trip reads stock inside the same live query, so an amount changed on
  // the Stock tab (or taken by a meal) redraws the list at once.
  const trip = useLiveQuery(async () => {
    if (!profile) return { lines: [] as TripLine[], covered: 0 }
    const stock = await stockMap(profile.household_id)
    const lines = await tripFromPlan(profile.id, today, until, stock)
    // Foods the cupboard covers in full drop off the list. Counting them keeps
    // a short list from looking like a plan that forgot something.
    const covered = stock.size ? (await tripFromPlan(profile.id, today, until)).length - lines.length : 0
    return { lines, covered }
  }, [profile?.id, profile?.household_id, today, until], { lines: [] as TripLine[], covered: 0 })
  const { lines, covered } = trip
  const [stocked, setStocked] = useState<string | null>(null)

  // What has gone in the basket is remembered on this device for the trip, so
  // a phone that locks mid-aisle does not lose the ticks.
  const tripKey = `shop:checked:${today}`
  const checked = useLiveQuery(() => getMeta<string[]>(tripKey, []), [tripKey], [] as string[])
  // What to buy is what the plan needs less what is already here.
  const rows = lines.map((l) => ({ ...l, buy_g: Math.max(0, l.needed_g - l.from_stock_g), checked: checked.includes(l.id) }))
  const fromStock = rows.some((r) => r.from_stock_g > 0)
  const ticked = lines.filter((l) => checked.includes(l.id))
  async function tick(row: TripLine, _field: string, value: unknown) {
    setStocked(null)
    const next = value ? [...new Set([...checked, row.id])] : checked.filter((id) => id !== row.id)
    await setMeta(tripKey, next)
  }

  /** Home from the shop: what went in the basket goes in the cupboard, and
   *  its ticks are cleared, so the trip that follows is worked out from it. */
  async function stockTicked() {
    if (!profile || ticked.length === 0) return
    for (const line of ticked) {
      const grams = boughtGrams(line)
      if (grams > 0) await addStock(profile.household_id, line.id, grams)
    }
    const done = new Set(ticked.map((l) => l.id))
    await setMeta(tripKey, checked.filter((id) => !done.has(id)))
    setStocked(`${ticked.length} ${ticked.length === 1 ? 'item' : 'items'} put in stock.`)
  }

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <h1 className="page-date">Shopping</h1>
          <p className="page-sub">Everything the next four days of meals need, in the weights a shop sells.</p>
          <div className="tabs" role="tablist">
            {SECTIONS.map((s) => (
              <button key={s} role="tab" aria-selected={s === section} onClick={() => setSection(s)}>{s}</button>
            ))}
          </div>
        </header>

        {section === 'Trip' && (
          <>
            <div className="totals">
              <span>Covering {format(new Date(), 'd MMM')} to {format(addDays(new Date(), 3), 'd MMM')}</span>
              <span><b>{lines.length - ticked.length}</b> of {lines.length} left</span>
              {covered > 0 && <span><b>{covered}</b> covered by stock</span>}
            </div>
            <DataTable
              // Pack columns appear only once foods have pack sizes; a column of
              // dashes tells a shopper nothing.
              fields={[
                { name: 'name', label: 'Item', type: 'text', width: 220 },
                { name: 'buy_g', label: 'Needed', type: 'number', unit: 'g', width: 90 },
                // Shown only once something is in stock; then it explains
                // why a need is smaller than the recipe says.
                ...(fromStock ? [{ name: 'from_stock_g', label: 'From stock', type: 'number' as const, unit: 'g', width: 90 }] : []),
                ...(rows.some((r) => r.pack_size_g) ? [
                  { name: 'pack_size_g', label: 'Pack', type: 'number' as const, unit: 'g', width: 80 },
                  { name: 'packs', label: 'Packs', type: 'formula' as const, formula: 'ceil((needed_g - from_stock_g) / pack_size_g)', width: 70 },
                ] : []),
                { name: 'checked', label: 'Got it', type: 'boolean', width: 70 },
              ]}
              priority={['name', 'buy_g', ...(fromStock ? ['from_stock_g'] : []), 'checked']}
              rows={rows as never}
              editable={['checked']}
              onChange={(row, field, value) => void tick(row as never, field, value)}
              emptyNote={covered > 0
                ? 'Everything the plan needs is already in stock.'
                : 'No trip planned. Plan some meals first and the list fills itself.'}
            />
            {(ticked.length > 0 || stocked) && (
              <div className="trip-foot">
                {ticked.length > 0 && (
                  <>
                    <button className="btn" onClick={() => void stockTicked()}>Put ticked items in stock</button>
                    <p className="stock-hint">
                      Adds what was bought: whole packs where the pack size is known, else the amount needed.
                    </p>
                  </>
                )}
                {stocked && <p className="stock-hint" role="status">{stocked}</p>}
              </div>
            )}
          </>
        )}

        {section === 'Stock' && profile && <StockPanel profile={profile} />}

        {section === 'Stores' && (
          <p className="empty">
            Stores hold pack sizes and prices. Start with the ones you actually use and type
            a price when you notice it; nothing here needs a shop's catalogue to work.
          </p>
        )}
      </div>
    </div>
  )
}
