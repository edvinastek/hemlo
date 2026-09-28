import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { addStock, nudgeStock, removeStock, setStock, stockFor } from '../lib/stock'
import {
  NOTE_MAX, filterStock, formatGrams, inUnit, sortStock, toGrams, unitFor,
  type StockView, type Unit,
} from '../lib/stock-rules'
import { SearchPick, type PickItem } from '../ui/SearchPick'
import { ScanToStock } from '../ui/ProductSearch'
import type { Food, Profile, Stock } from '../lib/types'
import './stock.css'

type Item = StockView & { row: Stock }

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
    return {
      id: r.id, food_id: r.food_id, row: r,
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
        <button type="button" className="stock-qty" aria-label={`${item.name}, ${isOut ? 'out' : formatGrams(item.grams)}. Change`}
          onClick={onEdit}>{isOut ? 'out' : formatGrams(item.grams)}</button>
        <button type="button" className="stock-step" aria-label={`More ${item.name}`}
          onClick={() => void nudgeStock(householdId, item.food_id, 1)}>+</button>
      </div>
    </div>
  )
}

/** Grams or kilograms, as two buttons: a list that opens for two choices is
 *  one tap too many, and a narrow one runs off a small phone. */
function Units({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
  return (
    <div className="stock-units" role="group" aria-label="Unit">
      {(['g', 'kg'] as Unit[]).map((u) => (
        <button key={u} type="button" aria-pressed={value === u} onClick={() => onChange(u)}>{u}</button>
      ))}
    </div>
  )
}

function StockAdd({ householdId, foods, items }: { householdId: string; foods: Food[]; items: Item[] }) {
  const [food, setFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<Unit>('g')
  const [note, setNote] = useState('')
  const [said, setSaid] = useState<string | null>(null)

  const inStock = useMemo(() => new Map(items.map((i) => [i.food_id, i])), [items])
  const pick: PickItem[] = useMemo(() => foods.map((f) => ({
    id: f.id,
    name: f.name,
    meta: [f.store_section, f.pack_size_g ? `${formatGrams(f.pack_size_g)} pack` : null].filter(Boolean).join(' · ') || undefined,
    tag: inStock.has(f.id) ? 'in stock' : f.owner_id ? 'mine' : undefined,
  })), [foods, inStock])

  const grams = toGrams(amount, unit)
  const already = food ? inStock.get(food.id) : undefined

  function choose(item: PickItem) {
    const f = foods.find((x) => x.id === item.id) ?? null
    setFood(f)
    setSaid(null)
    // A food sold in packs usually arrives as one: start from that, ready to change.
    if (f?.pack_size_g && !amount.trim()) {
      const u = unitFor(f.pack_size_g)
      setUnit(u)
      setAmount(inUnit(f.pack_size_g, u))
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!food || grams === null || grams <= 0) return
    await addStock(householdId, food.id, grams, note.trim() ? note : undefined)
    setSaid(`${already ? 'Added' : 'Put'} ${formatGrams(grams)} of ${food.name} ${already ? 'to what was there' : 'in stock'}.`)
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
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
          placeholder="Amount" aria-label="Amount" autoComplete="off" />
        <Units value={unit} onChange={setUnit} />
        <button type="submit" className="btn btn-primary" disabled={!food || grams === null || grams <= 0}>Add</button>
      </div>
      <input className="stock-note-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX}
        placeholder="Note, if any: opened, in the freezer" aria-label="Note" />
      {already && <p className="stock-hint">{formatGrams(already.grams)} already here; this adds to it.</p>}
      {amount.trim() !== '' && grams === null && <p className="stock-hint is-warn">That is not an amount.</p>}
      {said && !food && <p className="stock-hint" role="status">{said}</p>}
    </form>
  )
}

function StockEdit({ item, householdId, onDone }: { item: Item; householdId: string; onDone: () => void }) {
  const start = unitFor(item.grams)
  const [unit, setUnit] = useState<Unit>(start)
  const [amount, setAmount] = useState(item.grams > 0 ? inUnit(item.grams, start) : '0')
  const [note, setNote] = useState(item.note ?? '')
  const [confirm, setConfirm] = useState(false)
  const grams = toGrams(amount, unit)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (grams === null) return
    await setStock(householdId, item.food_id, grams, note)
    onDone()
  }

  return (
    <form className="stock-form stock-edit" onSubmit={save}>
      <div className="stock-name">{item.name}</div>
      <div className="stock-fields">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
          aria-label={`Amount of ${item.name}`} autoFocus autoComplete="off"
          onFocus={(e) => e.currentTarget.select()} />
        <Units value={unit} onChange={setUnit} />
        <button type="submit" className="btn btn-primary" disabled={grams === null}>Save</button>
      </div>
      <input className="stock-note-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX}
        placeholder="Note" aria-label={`Note for ${item.name}`} />
      {grams === null && <p className="stock-hint is-warn">That is not an amount.</p>}
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
