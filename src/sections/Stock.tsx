import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { addStock, nudgeStock, removeStock, setStock, stockFor } from '../lib/stock'
import {
  NOTE_MAX, filterStock, formatGrams, inUnit, sortStock, unitFor,
  type StockView,
} from '../lib/stock-rules'
import {
  amountChoices, amountHint, countIn, findUnit, formatCount, formatQty, readAmount, readUnits, unitKey, type FoodUnit,
} from '../lib/units-rules'
import { SearchPick, type PickItem } from '../ui/SearchPick'
import { ScanToStock } from '../ui/ProductSearch'
import { AmountInput } from '../ui/AmountInput'
import type { Food, Profile, Stock } from '../lib/types'
import './stock.css'

/** A row as the list shows it. `unit` is the food's unit it is kept in, when
 *  it is ("12 eggs"); the grams are the amount either way. */
type Item = StockView & { row: Stock; units: FoodUnit[]; unit: FoodUnit | undefined }

/** "12 eggs" for stock kept in a unit, "450 g" or "1.25 kg" otherwise. */
const amountOf = (item: Pick<Item, 'grams' | 'unit'>) =>
  item.unit ? formatCount(countIn(item.grams, item.unit), item.unit) : formatGrams(item.grams)

/** Shopping's Stock tab: what is in the household's cupboard, typed in by
 *  hand and adjusted whenever someone looks. Every trip is worked out against
 *  it, so the list never says to buy rice that is already there. */
export function StockPanel({ profile }: { profile: Profile }) {
  const householdId = profile.household_id
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const rows = useLiveQuery(() => stockFor(householdId), [householdId])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const auto = readSettings(profile).stock_auto

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  const items: Item[] = useMemo(() => sortStock((rows ?? []).map((r) => {
    const food = foodById.get(r.food_id)
    const units = readUnits(food?.units)
    return {
      id: r.id, food_id: r.food_id, row: r, units, unit: findUnit(units, r.unit),
      name: food?.name ?? 'Unknown food',
      section: food?.store_section?.trim() || 'Other',
      grams: Number(r.grams_on_hand) || 0,
      note: r.note,
    }
  })), [rows, foodById])
  const shown = filterStock(items, query)
  const out = items.filter((i) => i.grams <= 0).length

  return (
    <>
      <StockAdd householdId={householdId} foods={foods} items={items} />
      <ScanToStock householdId={householdId} />

      {items.length > 0 && (
        <>
          <div className="stock-filter">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter stock" aria-label="Filter stock" autoComplete="off" />
          </div>
          <div className="totals">
            <span><b>{items.length}</b> {items.length === 1 ? 'item' : 'items'}</span>
            {out > 0 && <span><b>{out}</b> out</span>}
          </div>
        </>
      )}

      {rows && items.length === 0 && (
        <p className="empty">
          Nothing in stock yet. Add what is in the cupboard and every trip takes it off the list.
        </p>
      )}
      {items.length > 0 && shown.length === 0 && <p className="empty">Nothing in stock matches that.</p>}

      <div className="stock-list">
        {shown.map((item, i) => (
          <div key={item.id}>
            {(i === 0 || shown[i - 1].section !== item.section) && <h3 className="stock-group">{item.section}</h3>}
            {editing === item.id
              ? <StockEdit item={item} householdId={householdId} onDone={() => setEditing(null)} />
              : <StockRow item={item} householdId={householdId} onEdit={() => setEditing(item.id)} />}
          </div>
        ))}
      </div>

      <p className="section-title">When meals are eaten</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Take ingredients out of stock when a meal is eaten</div>
          <div className="row-meta">
            Ticking a planned meal eaten takes its ingredients, times the portions, off what is here;
            unticking puts them back. Meals typed as plain numbers change nothing. Off unless you want it.
          </div>
        </div>
        <button className="switch" role="switch" aria-checked={auto}
          aria-label="Take ingredients out of stock when a meal is eaten"
          onClick={() => void saveSettings(profile, { stock_auto: !auto })} />
      </div>
    </>
  )
}

function StockRow({ item, householdId, onEdit }: { item: Item; householdId: string; onEdit: () => void }) {
  const isOut = item.grams <= 0
  return (
    <div className={`stock-row${isOut ? ' is-out' : ''}`}>
      <div className="stock-what">
        <div className="stock-name">{item.name}</div>
        {item.note && <div className="stock-note">{item.note}</div>}
      </div>
      <div className="stock-amount">
        <button type="button" className="stock-step" aria-label={`Less ${item.name}`} disabled={isOut}
          onClick={() => void nudgeStock(householdId, item.food_id, -1)}>−</button>
        <button type="button" className="stock-qty"
          aria-label={`${item.name}, ${isOut ? 'out' : amountOf(item)}${!isOut && item.unit ? ` (${formatGrams(item.grams)})` : ''}. Change`}
          title={item.unit && !isOut ? formatGrams(item.grams) : undefined}
          onClick={onEdit}>{isOut ? 'out' : amountOf(item)}</button>
        <button type="button" className="stock-step" aria-label={`More ${item.name}`}
          onClick={() => void nudgeStock(householdId, item.food_id, 1)}>+</button>
      </div>
    </div>
  )
}

function StockAdd({ householdId, foods, items }: { householdId: string; foods: Food[]; items: Item[] }) {
  const [food, setFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const [note, setNote] = useState('')
  const [said, setSaid] = useState<string | null>(null)

  const inStock = useMemo(() => new Map(items.map((i) => [i.food_id, i])), [items])
  const pick: PickItem[] = useMemo(() => foods.map((f) => ({
    id: f.id,
    name: f.name,
    meta: [f.store_section, f.pack_size_g ? `${formatGrams(f.pack_size_g)} pack` : null].filter(Boolean).join(' · ') || undefined,
    tag: inStock.has(f.id) ? 'in stock' : f.owner_id ? 'mine' : undefined,
  })), [foods, inStock])

  // Grams and kilos, and the food's own units ("egg") when it has any.
  const choices = useMemo(() => amountChoices(readUnits(food?.units), { kilos: true }), [food])
  const choice = choices.find((c) => c.key === unit) ?? choices[0]
  const read = readAmount(amount, choice)
  const grams = read?.grams ?? null
  const already = food ? inStock.get(food.id) : undefined

  function choose(item: PickItem) {
    const f = foods.find((x) => x.id === item.id) ?? null
    setFood(f)
    setSaid(null)
    const units = readUnits(f?.units)
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
    if (!food || !read || read.grams <= 0) return
    await addStock(householdId, food.id, read.grams, note.trim() ? note : undefined, read.unit ?? undefined)
    setSaid(`${already ? 'Added' : 'Put'} ${amountHint(amount, choice)} of ${food.name} ${already ? 'to what was there' : 'in stock'}.`)
    setFood(null)
    setAmount('')
    setNote('')
  }

  return (
    <form className="stock-form stock-add" onSubmit={submit}>
      <SearchPick items={pick} onPick={choose} label="Food to add to stock"
        placeholder="Add to stock: search foods" value={food?.name ?? null}
        onClear={() => setFood(null)} />
      <div className="stock-fields">
        <AmountInput text={amount} choice={choice.key} choices={choices} onText={setAmount} onChoice={setUnit}
          label="Amount" groupClass="stock-units" input={{ placeholder: 'Amount' }} />
        <button type="submit" className="btn btn-primary" disabled={!food || grams === null || grams <= 0}>Add</button>
      </div>
      <input className="stock-note-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX}
        placeholder="Note, if any: opened, in the freezer" aria-label="Note" />
      {choice.unit && read && <p className="stock-hint">{amountHint(amount, choice)}</p>}
      {already && <p className="stock-hint">{amountOf(already)} already here; this adds to it.</p>}
      {amount.trim() !== '' && grams === null && <p className="stock-hint is-warn">That is not an amount.</p>}
      {said && !food && <p className="stock-hint" role="status">{said}</p>}
    </form>
  )
}

function StockEdit({ item, householdId, onDone }: { item: Item; householdId: string; onDone: () => void }) {
  // Opens in what the row shows: eggs for stock kept in eggs, else g or kg.
  const choices = amountChoices(item.units, { kilos: true })
  const start = item.unit ? unitKey(item.unit.name) : unitFor(item.grams)
  const first = item.grams <= 0 ? '0'
    : item.unit ? formatQty(countIn(item.grams, item.unit)) : inUnit(item.grams, unitFor(item.grams))
  const [unit, setUnit] = useState(start)
  const [amount, setAmount] = useState(first)
  const [note, setNote] = useState(item.note ?? '')
  const [confirm, setConfirm] = useState(false)
  const choice = choices.find((c) => c.key === unit) ?? choices[0]
  const read = readAmount(amount, choice)
  // Left as it opened, the stored grams stand: no drift from rounding.
  const grams = read && unit === start && amount === first ? item.grams : read?.grams ?? null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (grams === null || !read) return
    // Saved in grams or kilos the row goes back to grams; in eggs it shows eggs.
    await setStock(householdId, item.food_id, grams, note, read.unit)
    onDone()
  }

  return (
    <form className="stock-form stock-edit" onSubmit={save}>
      <div className="stock-name">{item.name}</div>
      <div className="stock-fields">
        <AmountInput text={amount} choice={choice.key} choices={choices} onText={setAmount} onChoice={setUnit}
          label={`Amount of ${item.name}`} groupClass="stock-units"
          input={{ autoFocus: true, onFocus: (e) => e.currentTarget.select() }} />
        <button type="submit" className="btn btn-primary" disabled={grams === null}>Save</button>
      </div>
      <input className="stock-note-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX}
        placeholder="Note" aria-label={`Note for ${item.name}`} />
      {grams === null && <p className="stock-hint is-warn">That is not an amount.</p>}
      {grams !== null && choice.unit && <p className="stock-hint">{amountHint(amount, choice)}</p>}
      <div className="stock-actions">
        {confirm ? (
          <>
            <span className="stock-hint stock-ask">Take {item.name} off the list?</span>
            <button type="button" className="btn warn" onClick={async () => { await removeStock(item.row); onDone() }}>Remove</button>
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
