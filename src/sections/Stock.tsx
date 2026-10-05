import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import {
  addStock, nudgeStock, removeStock, removeStockMany, restoreStock, setStock, setStockDetails, setStockDetailsMany, stockFor,
} from '../lib/stock'
import { addRecipesToList, today } from '../lib/shopping'
import {
  NOTE_MAX, belowMin, bulkSaid, dateText, daysUntil, expiringSoon, formatGrams, groupKey, inUnit, placesFrom, readDate, sortByPlace,
  sortStock, stockCover, stockExportRows, mealNeeds, unitFor, type StockView,
} from '../lib/stock-rules'
import {
  amountChoices, amountHint, countIn, findUnit, formatCount, formatQty, readAmount, readUnits, unitKey, type FoodUnit,
} from '../lib/units-rules'
import { matches, words } from '../lib/search-rules'
import { SearchPick, type PickItem } from '../ui/SearchPick'
import { ProductFinder } from '../ui/ProductSearch'
import { AmountInput } from '../ui/AmountInput'
import { offerUndo } from '../ui/Undo'
import { useExport } from '../ui/ExportLink'
import { useSelection } from '../ui/useSelection'
import { SelectAction, SelectBar, SelectDelete } from '../ui/SelectBar'
import { RowMenu, ScanIcon, Sheet, TabMenu, useDeviceChoice } from './shop-ui'
import { useOffersSheet } from './ShopLinks'
import type { Food, Profile, Recipe, RecipeLine, Stock } from '../lib/types'
import type { FieldDef } from '../modules/types'
import './stock.css'

/** A row as the list shows it. `unit` is the food's unit it is kept in, when
 *  it is ("12 eggs"); the grams are the amount either way. `known` is false
 *  for a food not on this device yet (a housemate's scan still on its way). */
type Item = StockView & {
  row: Stock; units: FoodUnit[]; unit: FoodUnit | undefined; known: boolean
  place: string | null; best_before: string | null; min_grams: number | null
}

/** "12 eggs" for stock kept in a unit, "450 g" or "1.25 kg" otherwise. */
const amountOf = (item: Pick<Item, 'grams' | 'unit'>) =>
  item.unit ? formatCount(countIn(item.grams, item.unit), item.unit) : formatGrams(item.grams)
/** A minimum in the row's own unit when it has one: "keeps 6 eggs in". */
const minOf = (item: Pick<Item, 'min_grams' | 'unit'>) =>
  item.min_grams ? (item.unit ? formatCount(countIn(item.min_grams, item.unit), item.unit) : formatGrams(item.min_grams)) : ''

/** More than this many things in stock and the filter field shows. */
const FILTER_FROM = 16

/** The ticked items as a file (Export… in the select bar). */
const PICKED_FIELDS: FieldDef[] = [
  { name: 'food', label: 'Food', type: 'text' },
  { name: 'amount', label: 'Amount', type: 'text' },
  { name: 'grams_on_hand', label: 'In stock', type: 'number', unit: 'g' },
  { name: 'place', label: 'Place', type: 'text' },
  { name: 'best_before', label: 'Best before', type: 'date' },
  { name: 'min_grams', label: 'Keep at least', type: 'number', unit: 'g' },
  { name: 'note', label: 'Note', type: 'text' },
]

/** Shopping's Stock tab: what is in the household's cupboard, fridge and
 *  freezer, typed in by hand and adjusted whenever someone looks. Every list
 *  is worked out against it, so it never says to buy rice that is already
 *  there; a minimum puts a food on the list when it runs low; a date puts it
 *  under "Use soon".
 *
 *  Calm (v17): one "Add to stock" field with scan in it; amount, place, date
 *  and note appear once a food is picked. The filter shows only for a long
 *  cupboard; grouping, the eaten-meals switch and Export are in the ⋮. */
export function StockPanel({ profile, menuSlot }: { profile: Profile; menuSlot: HTMLElement | null }) {
  const householdId = profile.household_id
  const day = today()
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const rows = useLiveQuery(() => stockFor(householdId), [householdId])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useDeviceChoice<'place' | 'aisle' | null>('stock:group', null)
  const auto = readSettings(profile).stock_auto
  const offers = useOffersSheet(profile)

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  const items: Item[] = useMemo(() => (rows ?? []).map((r) => {
    const food = foodById.get(r.food_id)
    const units = readUnits(food?.units)
    return {
      id: r.id, food_id: r.food_id, row: r, units, unit: findUnit(units, r.unit), known: !!food,
      name: food?.name ?? 'Unknown food',
      section: food?.store_section?.trim() || 'Other',
      grams: Number(r.grams_on_hand) || 0,
      note: r.note,
      place: r.place ?? null, best_before: r.best_before ?? null, min_grams: r.min_grams ? Number(r.min_grams) : null,
    }
  }), [rows, foodById])
  const places = placesFrom(items.map((i) => i.place))
  const by = groupBy ?? (items.some((i) => i.place) ? 'place' : 'aisle')
  const sorted = by === 'place' ? sortByPlace(items, places) : sortStock(items)
  const ws = words(query)
  const shown = sorted.filter((i) => matches({ name: i.name, extra: `${i.section} ${i.note ?? ''} ${i.place ?? ''}` }, ws))
  const out = items.filter((i) => i.grams <= 0).length
  const low = items.filter((i) => belowMin(i)).length
  const soon = expiringSoon(items, day, 3)
  const exporter = useExport({ dataset: 'stock' })
  // Several at once (GEN-52): hold a row, or Select in the ⋮.
  const sel = useSelection(items, { onChange: (on) => { if (on) setEditing(null) } })
  const [bulk, setBulk] = useState<null | 'place' | 'date'>(null)
  const pickedExport = useExport(sel.picked.length ? {
    rows: stockExportRows(sel.picked.map((i) => ({ ...i, amount: amountOf(i) }))), fields: PICKED_FIELDS,
    label: `Stock (${sel.picked.length} selected)`,
  } : null)

  async function bulkPlace(place: string | null) {
    const n = sel.picked.length
    const undo = await setStockDetailsMany(sel.picked.map((i) => i.row), { place })
    setBulk(null)
    sel.clear()
    offerUndo(bulkSaid('place', n, place), undo)
  }

  async function bulkDate(date: string | null) {
    const n = sel.picked.length
    const undo = await setStockDetailsMany(sel.picked.map((i) => i.row), { best_before: date })
    setBulk(null)
    sel.clear()
    offerUndo(bulkSaid('date', n, date), undo)
  }

  async function bulkRemove() {
    const n = sel.picked.length
    const undo = await removeStockMany(sel.picked.map((i) => i.row))
    sel.stop()
    offerUndo(bulkSaid('remove', n), undo)
  }

  async function toggleAuto() {
    await saveSettings(profile, { stock_auto: !auto })
    offerUndo(auto ? 'Eaten meals no longer take from stock' : 'Eaten meals now take from stock', async () => {
      const fresh = await db.profile.get(profile.id)
      if (fresh) await saveSettings(fresh, { stock_auto: auto })
    })
  }

  return (
    <>
      <TabMenu slot={menuSlot} items={[
        items.length > 0 && { label: by === 'place' ? 'Group by aisle' : 'Group by place', onSelect: () => setGroupBy(by === 'place' ? 'aisle' : 'place') },
        items.length > 0 && sel.menuItem(),
        { label: auto ? 'Stop taking from stock when meals are eaten' : 'Take from stock when meals are eaten', onSelect: () => void toggleAuto() },
        offers.item,
        exporter.item,
      ]} />
      {exporter.sheet}
      {offers.sheet}
      {pickedExport.sheet}
      {!sel.selecting && <StockAdd householdId={householdId} foods={foods} items={items} places={places} />}

      {soon.length > 0 && !sel.selecting && (
        <section className="stock-soon" aria-label="Use soon">
          <p className="section-title">Use soon</p>
          <ul>
            {soon.map((i) => (
              <li key={i.id}>
                <button type="button" className="stock-soon-row" onClick={() => setEditing(i.id)} aria-label={`${i.name}: ${dateText(i.best_before!, day)}. Change`}>
                  <span className="stock-name">{i.name}</span>
                  <span className={`stock-date${daysUntil(i.best_before!, day) < 0 ? ' is-past' : ''}`}>{dateText(i.best_before!, day)}</span>
                  {i.place && <span className="stock-note">{i.place}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length > 0 && (
        <>
          {(items.length >= FILTER_FROM || query) && (
            <div className="stock-filter">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter stock" aria-label="Filter stock" autoComplete="off" />
            </div>
          )}
          <div className="totals">
            <span><b>{items.length}</b> {items.length === 1 ? 'item' : 'items'}</span>
            {out > 0 && <span><b>{out}</b> out</span>}
            {low > 0 && <span><b>{low}</b> running low, on the list</span>}
          </div>
        </>
      )}

      {rows && items.length === 0 && (
        <p className="empty">Nothing in stock yet; every list takes off what is here.</p>
      )}
      {items.length > 0 && shown.length === 0 && <p className="empty">Nothing in stock matches that.</p>}

      <div className="stock-list">
        {shown.map((item, i) => {
          const g = groupKey(item, by)
          return (
            <div key={item.id}>
              {(i === 0 || groupKey(shown[i - 1], by) !== g) && <h3 className="stock-group">{g}</h3>}
              {editing === item.id && !sel.selecting
                ? <StockEdit item={item} householdId={householdId} places={places} day={day} onDone={() => setEditing(null)} />
                : <StockRow item={item} householdId={householdId} by={by} day={day} onEdit={() => setEditing(item.id)}
                    hold={sel.hold(item.id)} picking={sel.selecting} picked={sel.has(item.id)} onPick={() => sel.toggle(item.id)} />}
            </div>
          )
        })}
      </div>

      {items.length >= 3 && !sel.selecting && <FromStock profile={profile} have={new Map(items.map((i) => [i.food_id, i.grams]))} />}

      {sel.selecting && (
        <SelectBar {...sel.bar(shown, 'items')}>
          <SelectAction count={sel.picked.length} onClick={() => setBulk('place')}>Move to…</SelectAction>
          <SelectAction count={sel.picked.length} onClick={() => setBulk('date')}>Best before…</SelectAction>
          <SelectAction count={sel.picked.length} onClick={() => pickedExport.item?.onSelect()}>Export…</SelectAction>
          <SelectDelete count={sel.picked.length} label="Remove" onDelete={() => void bulkRemove()} />
        </SelectBar>
      )}
      {bulk === 'place' && (
        <BulkPlace count={sel.picked.length} places={places} onSave={(p) => void bulkPlace(p)} onClose={() => setBulk(null)} />
      )}
      {bulk === 'date' && (
        <BulkDate count={sel.picked.length} day={day} onSave={(d) => void bulkDate(d)} onClose={() => setBulk(null)} />
      )}
    </>
  )
}

/** "Move to…" for the ticked items: one place for all of them. */
function BulkPlace({ count, places, onSave, onClose }: { count: number; places: string[]; onSave: (place: string | null) => void; onClose: () => void }) {
  const [place, setPlace] = useState<string | null>(null)
  return (
    <Sheet title={`Move ${count} ${count === 1 ? 'item' : 'items'} to`} onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (place) onSave(place) }}>
        <PlacePick value={place} places={places} onChange={setPlace} />
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => onSave(null)}>No place</button>
          <button type="submit" className="btn btn-primary grow" disabled={!place}>{place ? `Move to ${place}` : 'Pick a place'}</button>
        </div>
      </form>
    </Sheet>
  )
}

/** "Best before…" for the ticked items: one date for all, or none. */
function BulkDate({ count, day, onSave, onClose }: { count: number; day: string; onSave: (date: string | null) => void; onClose: () => void }) {
  const [date, setDate] = useState('')
  const best = date ? readDate(date, day) : null
  return (
    <Sheet title={`Best before, for ${count} ${count === 1 ? 'item' : 'items'}`} onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (best) onSave(best) }}>
        <div className="stock-date-row">
          <label className="stock-label" htmlFor="stock-bulk-date">Best before</label>
          <input id="stock-bulk-date" type="date" value={best ?? date} onChange={(e) => setDate(e.target.value)} data-autofocus />
        </div>
        {best && <p className="stock-hint">{dateText(best, day)}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => onSave(null)}>Clear the date</button>
          <button type="submit" className="btn btn-primary grow" disabled={!best}>Set the date</button>
        </div>
      </form>
    </Sheet>
  )
}

function StockRow({ item, householdId, by, day, onEdit, hold, picking, picked, onPick }: {
  item: Item; householdId: string; by: 'place' | 'aisle'; day: string; onEdit: () => void
  /** Holding the row starts selecting (GEN-52). */
  hold: ReturnType<ReturnType<typeof useSelection>['hold']>
  /** Selecting: a tap ticks the row, and the −/+ are put away. */
  picking: boolean; picked: boolean; onPick: () => void
}) {
  const isOut = item.grams <= 0
  const isLow = belowMin(item)
  const meta = [
    by === 'aisle' && item.place ? item.place : '',
    item.best_before ? dateText(item.best_before, day) : '',
    item.min_grams ? `keeps ${minOf(item)} in${isLow ? ', on the list' : ''}` : '',
    item.note ?? '',
  ].filter(Boolean)
  const past = item.best_before ? daysUntil(item.best_before, day) < 0 : false
  if (picking) {
    return (
      <div className={`stock-row is-picking${isOut ? ' is-out' : ''}`}>
        <label className="stock-pick">
          <input type="checkbox" checked={picked} onChange={onPick} aria-label={`Select ${item.name}`} />
          <span className="stock-what">
            <span className="stock-name">{item.name}</span>
            {meta.length > 0 && <span className={`stock-note${past ? ' is-past' : ''}`}>{meta.join(' · ')}</span>}
          </span>
        </label>
        <span className={`stock-qty-text${isLow && !isOut ? ' is-low' : ''}`}>{isOut ? 'out' : amountOf(item)}</span>
      </div>
    )
  }
  return (
    <div className={`stock-row${isOut ? ' is-out' : ''}`} {...hold}>
      <button type="button" className="stock-what" onClick={onEdit} aria-label={`Change ${item.name}`}>
        <div className="stock-name">{item.name}</div>
        {meta.length > 0 && <div className={`stock-note${past ? ' is-past' : ''}`}>{meta.join(' · ')}</div>}
      </button>
      <div className="stock-amount">
        <button type="button" className="stock-step" aria-label={`Less ${item.name}`} disabled={isOut}
          onClick={() => void nudgeStock(householdId, item.food_id, -1)}>−</button>
        <button type="button" className={`stock-qty${isLow && !isOut ? ' is-low' : ''}`}
          aria-label={`${item.name}, ${isOut ? 'out' : amountOf(item)}${!isOut && item.unit ? ` (${formatGrams(item.grams)})` : ''}. Change`}
          title={item.unit && !isOut ? formatGrams(item.grams) : undefined}
          onClick={onEdit}>{isOut ? 'out' : amountOf(item)}</button>
        <button type="button" className="stock-step" aria-label={`More ${item.name}`}
          onClick={() => void nudgeStock(householdId, item.food_id, 1)}>+</button>
      </div>
    </div>
  )
}

/** Fridge, Freezer, Cupboard and the person's own places, as one-tap
 *  choices, with a field for a new one. */
function PlacePick({ value, places, onChange }: { value: string | null; places: string[]; onChange: (v: string | null) => void }) {
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  return (
    <div className="stock-places" role="group" aria-label="Where it is kept">
      {places.map((p) => (
        <button key={p} type="button" className="shop-chip" aria-pressed={value?.toLowerCase() === p.toLowerCase()}
          onClick={() => onChange(value?.toLowerCase() === p.toLowerCase() ? null : p)}>{p}</button>
      ))}
      {typing ? (
        <input className="stock-place-input" value={text} autoFocus maxLength={40} placeholder="Cellar, garage"
          aria-label="Another place" onChange={(e) => setText(e.target.value)}
          onBlur={() => { if (text.trim()) onChange(text.trim()); setTyping(false); setText('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }} />
      ) : (
        <button type="button" className="shop-chip" onClick={() => setTyping(true)}>Other…</button>
      )}
    </div>
  )
}

function StockAdd({ householdId, foods, items, places }: {
  householdId: string; foods: Food[]; items: Item[]; places: string[]
}) {
  const [food, setFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const [note, setNote] = useState('')
  const [place, setPlace] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [said, setSaid] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const userId = useApp((s) => s.session?.user.id ?? null)
  const inStock = useMemo(() => new Map(items.map((i) => [i.food_id, i])), [items])
  // A housemate's scanned food is here too (it is in the shared cupboard),
  // but it is theirs, not "mine".
  // A deleted food (one a newer catalogue replaced) is not offered: picking
  // it would add its replacement under another name.
  const pick: PickItem[] = useMemo(() => foods.filter((f) => !f.deleted_at).map((f) => ({
    id: f.id,
    name: f.name,
    meta: [f.store_section, f.pack_size_g ? `${formatGrams(f.pack_size_g)} pack` : null].filter(Boolean).join(' · ') || undefined,
    tag: inStock.has(f.id) ? 'in stock' : userId && f.owner_id === userId ? 'mine' : undefined,
  })), [foods, inStock, userId])

  // Grams and kilos, and the food's own units ("egg") when it has any.
  const choices = useMemo(() => amountChoices(readUnits(food?.units), { kilos: true }), [food])
  const choice = choices.find((c) => c.key === unit) ?? choices[0]
  const read = readAmount(amount, choice)
  const grams = read?.grams ?? null
  const already = food ? inStock.get(food.id) : undefined
  const best = date ? readDate(date, today()) : null

  function choose(item: PickItem) {
    const f = foods.find((x) => x.id === item.id) ?? null
    setFood(f)
    setSaid(null)
    const units = readUnits(f?.units)
    const had = f ? inStock.get(f.id) : undefined
    if (had?.place) setPlace(had.place)
    if (f?.pack_size_g && !amount.trim()) {
      // A food sold in packs usually arrives as one: start from that, ready to change.
      const u = unitFor(f.pack_size_g)
      setUnit(u)
      setAmount(inUnit(f.pack_size_g, u))
    } else if (units.length) {
      // A food counted in units is added in them: "12" eggs.
      setUnit(unitKey(units[0].name))
    } else if (unit.startsWith('u:')) {
      setUnit('g')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!food || !read || read.grams <= 0 || (date && !best)) return
    const row = await addStock(householdId, food.id, read.grams, note.trim() ? note : undefined, read.unit ?? undefined)
    if (place || best) await setStockDetails(row, { ...(place ? { place } : {}), ...(best ? { best_before: best } : {}) })
    setSaid(`${already ? 'Added' : 'Put'} ${amountHint(amount, choice)} of ${food.name} ${already ? 'to what was there' : 'in stock'}.`)
    setFood(null)
    setAmount('')
    setNote('')
    setDate('')
    setPlace(null)
  }

  return (
    <>
      <form className="stock-form stock-add" onSubmit={submit}>
        <div className="stock-add-field">
          <SearchPick items={pick} onPick={choose} label="Add to stock"
            placeholder="Add to stock" value={food?.name ?? null}
            onClear={() => setFood(null)} />
          {!food && (
            <button type="button" className="shop-scan" onClick={() => { setSaid(null); setScanning(true) }} aria-label="Scan a barcode to add to stock">
              <ScanIcon />
            </button>
          )}
        </div>
        {food && (
          <>
            <div className="stock-fields">
              <AmountInput text={amount} choice={choice.key} choices={choices} onText={setAmount} onChoice={setUnit}
                label="Amount" groupClass="stock-units" input={{ placeholder: 'Amount', autoFocus: true }} />
              <button type="submit" className="btn btn-primary" disabled={grams === null || grams <= 0 || (!!date && !best)}>Add</button>
            </div>
            {choice.unit && read && <p className="stock-hint">{amountHint(amount, choice)}</p>}
            {already && <p className="stock-hint">{amountOf(already)} already here; this adds to it.</p>}
            {amount.trim() !== '' && grams === null && <p className="stock-hint is-warn">That is not an amount.</p>}
            <PlacePick value={place} places={places} onChange={setPlace} />
            <div className="stock-date-row">
              <label className="stock-label" htmlFor="stock-add-date">Best before</label>
              <input id="stock-add-date" type="date" value={best ?? date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <input className="stock-note-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX}
              placeholder="Note, if any: opened, the big bag" aria-label="Note" />
          </>
        )}
        {said && !food && <p className="stock-hint" role="status">{said}</p>}
      </form>
      {/* The finder has forms of its own, so it sits beside this one, not in it. */}
      {scanning && (
        <ProductFinder start="scan" purpose="stock" householdId={householdId} onClose={() => setScanning(false)}
          onStocked={(text) => { setSaid(text); setScanning(false) }} />
      )}
    </>
  )
}

function StockEdit({ item, householdId, places, day, onDone }: { item: Item; householdId: string; places: string[]; day: string; onDone: () => void }) {
  // Opens in what the row shows: eggs for stock kept in eggs, else g or kg.
  const choices = amountChoices(item.units, { kilos: true })
  const start = item.unit ? unitKey(item.unit.name) : unitFor(item.grams)
  const first = item.grams <= 0 ? '0'
    : item.unit ? formatQty(countIn(item.grams, item.unit)) : inUnit(item.grams, unitFor(item.grams))
  const minStart = item.min_grams ? (item.unit ? formatQty(countIn(item.min_grams, item.unit)) : inUnit(item.min_grams, unitFor(item.min_grams))) : ''
  const [unit, setUnit] = useState(start)
  const [amount, setAmount] = useState(first)
  const [note, setNote] = useState(item.note ?? '')
  const [place, setPlace] = useState<string | null>(item.place)
  const [date, setDate] = useState(item.best_before ?? '')
  const [min, setMin] = useState(minStart)
  // The minimum opens in the unit it reads best in, as the amount does.
  const minStartUnit = item.unit ? unitKey(item.unit.name) : item.min_grams ? unitFor(item.min_grams) : 'g'
  const [minUnit, setMinUnit] = useState(minStartUnit)
  const [confirm, setConfirm] = useState(false)
  const choice = choices.find((c) => c.key === unit) ?? choices[0]
  const minChoice = choices.find((c) => c.key === minUnit) ?? choices[0]
  const read = readAmount(amount, choice)
  const minRead = min.trim() ? readAmount(min, minChoice) : null
  const best = date ? readDate(date, day) : null
  // Left as it opened, the stored grams stand: no drift from rounding.
  const grams = read && unit === start && amount === first ? item.grams : read?.grams ?? null
  const ok = grams !== null && !!read && (!min.trim() || !!minRead) && (!date || !!best)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!ok || grams === null || !read) return
    const before = item.row
    // Saved in grams or kilos the row goes back to grams; in eggs it shows
    // eggs. A food not on this device yet keeps whatever unit its row has:
    // only grams can be typed here, and that says nothing about eggs.
    const row = await setStock(householdId, item.food_id, grams, note, item.known ? read.unit : read.unit ?? undefined)
    await setStockDetails(row, {
      place, best_before: best,
      min_grams: minRead && min.trim() === minStart && minUnit === minStartUnit ? item.min_grams : minRead?.grams ?? null,
    })
    offerUndo(`${item.name} changed`, () => restoreStock(before))
    onDone()
  }

  return (
    <form className="stock-form stock-edit" onSubmit={save}>
      <div className="stock-name">{item.name}</div>
      <div className="stock-fields">
        <AmountInput text={amount} choice={choice.key} choices={choices} onText={setAmount} onChoice={setUnit}
          label={`Amount of ${item.name}`} groupClass="stock-units"
          input={{ autoFocus: true, onFocus: (e) => e.currentTarget.select() }} />
        <button type="submit" className="btn btn-primary" disabled={!ok}>Save</button>
      </div>
      {grams === null && <p className="stock-hint is-warn">That is not an amount.</p>}
      {grams !== null && choice.unit && <p className="stock-hint">{amountHint(amount, choice)}</p>}
      <PlacePick value={place} places={places} onChange={setPlace} />
      <div className="stock-date-row">
        <label className="stock-label" htmlFor={`best-${item.id}`}>Best before</label>
        <input id={`best-${item.id}`} type="date" value={best ?? date} onChange={(e) => setDate(e.target.value)} />
        {date && <button type="button" className="slot-link" onClick={() => setDate('')}>Clear</button>}
      </div>
      <div className="stock-min">
        <span className="stock-label">Keep at least</span>
        <div className="stock-fields">
          <AmountInput text={min} choice={minChoice.key} choices={choices} onText={setMin} onChoice={setMinUnit}
            label={`Least to keep of ${item.name}`} groupClass="stock-units" input={{ placeholder: 'None' }} />
        </div>
        <p className={`stock-hint${min.trim() && !minRead ? ' is-warn' : ''}`}>
          {min.trim() && !minRead ? 'That is not an amount.' : 'Below this, it goes on the shopping list by itself.'}
        </p>
      </div>
      <input className="stock-note-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX}
        placeholder="Note" aria-label={`Note for ${item.name}`} />
      <div className="stock-actions">
        {confirm ? (
          <>
            <span className="stock-hint stock-ask">Take {item.name} off the list?</span>
            <button type="button" className="btn warn" onClick={async () => {
              const before = item.row
              await removeStock(item.row)
              offerUndo(`${item.name} taken out of stock`, () => restoreStock(before))
              onDone()
            }}>Remove</button>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => setConfirm(true)}>Remove</button>
            <button type="button" className="btn grow" onClick={onDone}>Cancel</button>
          </>
        )}
      </div>
    </form>
  )
}

/** "Cook from what is here" (STK-06): recipes the cupboard covers most of,
 *  with the rest one tap from the list. */
function FromStock({ profile, have }: { profile: Profile; have: Map<string, number> }) {
  const userId = useApp((s) => s.session?.user.id ?? null)
  const ideas = useLiveQuery(async () => {
    const recipes = (await db.recipe.toArray()).filter((r: Recipe) => !r.deleted_at && r.role !== 'ready')
    const lines = await db.recipe_line.toArray()
    const byRecipe = new Map<string, RecipeLine[]>()
    for (const l of lines) byRecipe.set(l.recipe_id, [...(byRecipe.get(l.recipe_id) ?? []), l])
    const ids = [...new Set(lines.map((l) => l.food_id).filter((id): id is string => !!id))]
    const foods = new Map((await db.food.bulkGet(ids)).filter((f): f is Food => !!f).map((f) => [f.id, f]))
    return recipes
      .map((r) => ({ r, ...stockCover(mealNeeds(byRecipe.get(r.id) ?? [], foods, 1), have) }))
      .filter((x) => x.share >= 0.5)
      .sort((a, b) => b.share - a.share || (a.r.owner_id === userId ? -1 : 0) || a.r.name.localeCompare(b.r.name))
      .slice(0, 5)
  }, [have, userId], [])
  if (!ideas.length) return null
  return (
    <section aria-label="Cook from what is here">
      <p className="section-title">Cook from what is here</p>
      <ul className="stock-ideas">
        {ideas.map(({ r, share, missing }) => (
          <li key={r.id} className="stock-row">
            <div className="stock-what">
              <div className="stock-name">{r.name}</div>
              <div className="stock-note">{missing.length ? `${Math.round(share * 100)}% of it is here, ${missing.length} missing` : 'Everything is here'}</div>
            </div>
            {missing.length > 0 && (
              <RowMenu label={`More for ${r.name}`} items={[{
                label: 'Put the rest on the list',
                onSelect: async () => {
                  const res = await addRecipesToList(profile, [{ recipe_id: r.id, portions: 1 }])
                  offerUndo(`${res.added} ${res.added === 1 ? 'item' : 'items'} for ${r.name} on the list`, res.undo)
                },
              }]} />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
