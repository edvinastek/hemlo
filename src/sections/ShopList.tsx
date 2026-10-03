import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import {
  addItem, addRecent, addRecipesToList, changeItem, clearBasket, loadShopping, matchTyped, notePrice,
  putInStock, removeItem, removePrice, saveModuleSettings, setOrder, tick, today, type ShoppingView,
} from '../lib/shopping'
import {
  amountText, cleanLabel, currencyFor, forShop, formatMoney, groupList, guessAisle, itemKey, LIST_MAX, NOTE_MAX, NAME_MAX,
  onList, parseAmount, parseItem, pickPrice, priceLabel, readPrice, reorderWithin, resolveAisle, sameShop, shopAisles,
  tripTotal, windowText, type ListItem,
} from '../lib/shopping-rules'
import { search } from '../lib/search-rules'
import { foodByBarcode, addProduct, productByBarcode, whereFor, ProductProblem } from '../lib/products'
import { displayName } from '../lib/products-rules'
import { offerUndo } from '../ui/Undo'
import { Dropdown } from '../ui/Dropdown'
import { SearchPick, type PickItem } from '../ui/SearchPick'
import { BarcodeScan } from '../ui/BarcodeScan'
import { ExportLink } from '../ui/ExportLink'
import { RowMenu, Sheet, useDeviceChoice } from './shop-ui'
import type { FieldDef } from '../modules/types'
import type { Food, Profile, Recipe } from '../lib/types'

/** The list as a file: what to get, how much, where, and what is in the basket. */
const LIST_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Item', type: 'text' },
  { name: 'amount', label: 'Amount', type: 'text' },
  { name: 'aisle', label: 'Aisle', type: 'text' },
  { name: 'shop', label: 'Shop', type: 'text' },
  { name: 'list', label: 'List', type: 'text' },
  { name: 'why', label: 'Why', type: 'text' },
  { name: 'note', label: 'Note', type: 'text' },
  { name: 'checked', label: 'Got it', type: 'boolean' },
]

/** Shop → List: the household's shopping list. What the planned meals need
 *  (less the cupboard) and what anyone in the household added, by aisle in
 *  the order of the shop chosen, ticked as things go in the basket; then
 *  home, into the cupboard. Works with no signal; ticks reach the others
 *  with the next sync. */
export function ShopList({ profile, addRef }: { profile: Profile; addRef: React.RefObject<HTMLInputElement> }) {
  const day = today()
  const view = useLiveQuery(() => loadShopping(profile, day), [profile.id, profile.household_id, profile.updated_at, day])
  const [shop, setShop] = useDeviceChoice<string | null>('shop:filter', null)
  const [list, setList] = useDeviceChoice<string | null>('shop:list', null)
  const [folded, setFolded] = useDeviceChoice<string[]>('shop:folded', [])
  const [editing, setEditing] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'scan' | 'recipes' | 'list'>(null)
  const [said, setSaid] = useState<string | null>(null)

  if (!view) return <p className="empty">Reading the list…</p>
  const shops = view.shops
  // A shop or list that has gone (renamed, removed on another phone) falls back to all.
  const shopOn = shop && shops.some((s) => sameShop(s.name, shop)) ? shop : null
  const listOn = list && view.lists.some((l) => l.toLowerCase() === list.toLowerCase()) ? list : null
  const currency = currencyFor(profile.country)
  const order = shopOn ? shopAisles(shops.find((s) => sameShop(s.name, shopOn)), view.module.aisles) : view.module.aisles.aisles
  const onThisList = view.items.filter((i) => onList(i, listOn))
  const shown = onThisList.filter((i) => forShop(i, shopOn))
  const elsewhere = onThisList.length - shown.length
  const { aisles, basket } = groupList(shown, order)
  const open = shown.filter((i) => !i.checked)
  const priceOf = (i: ListItem) => pickPrice(view.prices.filter((p) => p.item_key === itemKey(i)), shopOn)
  const total = tripTotal(open, priceOf)
  const editingItem = editing ? view.items.find((i) => i.key === editing) ?? null : null

  const isFolded = (name: string) => folded.includes(name)
  const fold = (name: string) => setFolded(isFolded(name) ? folded.filter((f) => f !== name) : [...folded, name])

  async function doTick(item: ListItem, on: boolean) {
    await tick(profile, item, on)
  }

  async function move(item: ListItem, dir: -1 | 1) {
    const group = aisles.find((g) => g.aisle === item.aisle)
    if (!group) return
    const sorts = reorderWithin(group.items.map((i) => ({ key: i.key, sort: i.sort })), item.key, dir)
    if (!sorts.length) return
    const undo = await setOrder(profile, view!.items, sorts)
    offerUndo(`${item.name} moved ${dir < 0 ? 'up' : 'down'}`, undo)
  }

  async function remove(item: ListItem) {
    const undo = await removeItem(profile, item, view!.window.to)
    offerUndo(item.kind === 'plan' ? `${item.name}: not needed this time` : `${item.name} taken off the list`, undo)
  }

  async function toList(item: ListItem, to: string | null) {
    const undo = await changeItem(profile, item, { list: to })
    offerUndo(`${item.name} moved to ${to ?? 'the main list'}`, undo)
  }

  async function stockBasket() {
    const r = await putInStock(profile, basket)
    setSaid(`${r.bought} ${r.bought === 1 ? 'item' : 'items'} bought${r.stocked ? `, ${r.stocked} put in stock` : ''}.`)
    offerUndo('Basket put away', r.undo)
  }

  async function clear() {
    const r = await clearBasket(profile, basket, view!.window.to)
    setSaid(`${r.bought} ${r.bought === 1 ? 'item' : 'items'} bought and taken off the list.`)
    offerUndo('Basket cleared', r.undo)
  }

  const menuFor = (item: ListItem, group: ListItem[] | null): Parameters<typeof RowMenu>[0]['items'] => {
    const at = group ? group.findIndex((g) => g.key === item.key) : -1
    return [
      { label: item.checked ? 'Take out of the basket' : 'In the basket', onSelect: () => void doTick(item, !item.checked) },
      { label: 'Change…', onSelect: () => setEditing(item.key) },
      ...(group ? [
        { label: 'Move up', disabled: at <= 0, onSelect: () => void move(item, -1) },
        { label: 'Move down', disabled: at < 0 || at >= group.length - 1, onSelect: () => void move(item, 1) },
      ] : []),
      ...(item.kind === 'manual'
        ? [...(item.list ? [{ label: 'Move to the main list', onSelect: () => void toList(item, null) }] : []),
          ...view!.lists.filter((l) => l.toLowerCase() !== (item.list ?? '').toLowerCase())
            .map((l) => ({ label: `Move to ${l}`, onSelect: () => void toList(item, l) }))]
        : []),
      { label: item.kind === 'plan' ? 'Not needed this time' : 'Remove', warn: true, onSelect: () => void remove(item) },
    ]
  }

  const row = (item: ListItem, group: ListItem[] | null) => {
    const price = priceOf(item)
    const where = item.shop ? `at ${item.shop}` : item.sold_at.length ? `sold at ${item.sold_at.slice(0, 2).join(', ')}` : ''
    const meta = [item.why, where, item.note, price ? formatMoney(Number(price.price), currency) + (price.amount_g ? '' : ' each') : '']
      .filter(Boolean).join(' · ')
    return (
      <li key={item.key} className={`shop-row${item.checked ? ' is-ticked' : ''}`}>
        <button type="button" className="shop-tick" role="checkbox" aria-checked={item.checked}
          aria-label={`${item.name}${item.amount ? `, ${item.amount}` : ''}: in the basket`} onClick={() => void doTick(item, !item.checked)}>
          <span className="shop-box" aria-hidden="true" />
        </button>
        <button type="button" className="shop-what" onClick={() => setEditing(item.key)} aria-label={`Change ${item.name}`}>
          <span className="shop-line">
            <span className="shop-name">{item.name}</span>
            {item.amount && <span className="shop-amount">{item.amount}</span>}
          </span>
          {meta && <span className="shop-meta">{meta}</span>}
        </button>
        <RowMenu label={`More for ${item.name}`} items={menuFor(item, group)} />
      </li>
    )
  }

  const exportRows = view.items.map((i) => ({
    name: i.name, amount: i.amount, aisle: i.aisle, shop: i.shop ?? '', list: i.list ?? '', why: i.why, note: i.note ?? '', checked: i.checked,
  }))

  return (
    <>
      <AddBox profile={profile} view={view} list={listOn} addRef={addRef} onScan={() => setSheet('scan')} onRecipes={() => setSheet('recipes')} />

      {view.recents.length > 0 && (
        <section className="shop-recent" aria-label="Recently bought">
          <p className="shop-recent-title">Recently bought</p>
          <div className="shop-tiles">
            {view.recents.map((t) => (
              <button key={t.key} type="button" className="shop-tile" aria-label={`Add ${t.name}${t.qty ? `, ${amountText(t)}` : ''}`}
                onClick={async () => {
                  const r = await addRecent(profile, t, listOn)
                  offerUndo(r.merged ? `More ${t.name} on the list` : `${t.name} on the list`, r.undo)
                }}>
                <span aria-hidden="true">+</span> {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {(view.lists.length > 0 || shops.length > 0) && (
        <div className="shop-filters">
          {view.lists.length > 0 && (
            <div className="shop-lists" role="group" aria-label="Which list">
              {[null, ...view.lists].map((l) => (
                <button key={l ?? 'main'} type="button" className="shop-chip" aria-pressed={(l ?? null) === listOn}
                  onClick={() => setList(l)}>{l ?? 'Main list'}</button>
              ))}
              <button type="button" className="shop-chip" onClick={() => setSheet('list')}>+ List</button>
            </div>
          )}
          {shops.length > 0 && (
            <Dropdown<string> className="shop-filter" label="Shop" value={shopOn ?? ''}
              options={[{ value: '', label: 'Any shop' }, ...shops.map((s) => ({ value: s.name, label: s.name }))]}
              onChange={(v) => setShop(v || null)} />
          )}
        </div>
      )}

      <div className="totals" aria-live="polite">
        <span>Meals from {windowText(view.window.from, view.window.to)}</span>
        <span><b>{open.length}</b> to get</span>
        {basket.length > 0 && <span><b>{basket.length}</b> in the basket</span>}
        {view.covered > 0 && !listOn && <span><b>{view.covered}</b> covered by stock</span>}
        {elsewhere > 0 && <span><b>{elsewhere}</b> for other shops</span>}
        {total.priced > 0 && <span><b>{formatMoney(total.total, currency)}</b> for {total.priced} of {total.of} priced</span>}
      </div>

      {shown.length === 0 && (
        <p className="empty">
          {onThisList.length > 0
            ? 'Nothing on this list is for this shop. Choose Any shop to see the rest.'
            : listOn
              ? `Nothing on ${listOn} yet. Add something above.`
              : 'The list is empty. Add what you need above; planned meals add their ingredients by themselves.'}
        </p>
      )}

      <div className="shop-list">
        {aisles.map((g) => (
          <section key={g.aisle} className="shop-group">
            <h3 className="shop-aisle">
              <button type="button" aria-expanded={!isFolded(g.aisle)} onClick={() => fold(g.aisle)}>
                <span>{g.aisle}</span>
                <span className="shop-count">{g.items.length}</span>
                <span className="shop-caret" aria-hidden="true">{isFolded(g.aisle) ? '▸' : '▾'}</span>
              </button>
            </h3>
            {!isFolded(g.aisle) && <ul>{g.items.map((i) => row(i, g.items))}</ul>}
          </section>
        ))}

        {basket.length > 0 && (
          <section className="shop-group shop-basket">
            <h3 className="shop-aisle">
              <button type="button" aria-expanded={!isFolded('__basket')} onClick={() => fold('__basket')}>
                <span>In the basket</span>
                <span className="shop-count">{basket.length}</span>
                <span className="shop-caret" aria-hidden="true">{isFolded('__basket') ? '▸' : '▾'}</span>
              </button>
            </h3>
            {!isFolded('__basket') && <ul>{basket.map((i) => row(i, null))}</ul>}
            <div className="shop-foot">
              <button type="button" className="btn btn-primary" onClick={() => void stockBasket()}>Put in stock</button>
              <button type="button" className="btn" onClick={() => void clear()}>Bought, clear the basket</button>
              <p className="stock-hint">
                Put in stock adds what was bought to the cupboard: whole packs where the pack size is known, else the
                amount on the list. Things that are not food just come off the list.
              </p>
            </div>
          </section>
        )}
        {said && <p className="stock-hint shop-said" role="status">{said}</p>}
      </div>

      <ExportLink source={{ label: 'Shopping list', rows: exportRows, fields: LIST_FIELDS }} />

      {editingItem && <ItemSheet profile={profile} view={view} item={editingItem} shop={shopOn} onClose={() => setEditing(null)} />}
      {sheet === 'scan' && <ScanSheet profile={profile} list={listOn} onClose={() => setSheet(null)} />}
      {sheet === 'recipes' && <RecipesSheet profile={profile} list={listOn} onClose={() => setSheet(null)} />}
      {sheet === 'list' && (
        <ListSheet view={view} onClose={() => setSheet(null)}
          onMade={async (name) => {
            await saveModuleSettings(profile.id, { lists: [...view.module.lists, name] })
            setList(name)
            setSheet(null)
          }} />
      )}
    </>
  )
}

/** "+ Add item": type it the way it would be written on paper. What it
 *  reads (and the aisle it goes in) shows as it is typed. */
function AddBox({ profile, view, list, addRef, onScan, onRecipes }: {
  profile: Profile; view: ShoppingView; list: string | null; addRef: React.RefObject<HTMLInputElement>
  onScan: () => void; onRecipes: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const parsed = parseItem(text)
  const aisle = parsed ? resolveAisle(guessAisle(parsed.name), view.module.aisles) : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!parsed || busy) return
    setBusy(true)
    try {
      const food = await matchTyped(profile.household_id, userId, parsed.name)
      const r = await addItem(profile, { ...parsed, food_id: food?.id ?? null, list })
      offerUndo(r.merged ? `More ${parsed.name} on the list` : `${parsed.name} on the list`, r.undo)
      setText('')
      addRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="shop-add" onSubmit={submit}>
      <div className="shop-add-row">
        <input ref={addRef} type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={NAME_MAX + 20}
          placeholder="Add an item: 2 kg apples, 6 eggs" aria-label="Add an item" autoComplete="off" enterKeyHint="done" />
        <button type="submit" className="btn btn-primary" disabled={!parsed || busy}>Add</button>
      </div>
      <p className="stock-hint shop-add-read" aria-live="polite">
        {parsed
          ? [parsed.name, parsed.qty !== null ? amountText(parsed) : '', aisle && aisle !== 'Other' ? aisle : ''].filter(Boolean).join(' · ')
          : 'An amount first or last is understood: "2 kg apples", "milk x2", "toilet paper".'}
      </p>
      <div className="shop-add-more">
        <button type="button" className="btn" onClick={onScan}>Scan</button>
        <button type="button" className="btn" onClick={onRecipes}>From recipes</button>
      </div>
    </form>
  )
}

/** Changing one item: how much, which food it is, aisle, shop, list, note,
 *  and the price at a shop. A planned item's amount comes from the plan. */
function ItemSheet({ profile, view, item, shop, onClose }: {
  profile: Profile; view: ShoppingView; item: ListItem; shop: string | null; onClose: () => void
}) {
  const e = item.entry
  const manual = item.kind === 'manual'
  const food = item.food_id ? view.foods.get(item.food_id) : undefined
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState(manual && e ? amountText({ qty: e.qty, unit: e.unit ?? null, grams: e.qty ? null : e.grams }) : '')
  const [foodId, setFoodId] = useState<string | null>(item.food_id)
  const [aisle, setAisle] = useState(item.aisle)
  const [itemShop, setItemShop] = useState(item.shop ?? '')
  const [list, setList] = useState(item.list ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const read = manual ? parseAmount(amount) : { qty: null, unit: null, grams: null }
  const chosenFood = foodId ? foods.find((f) => f.id === foodId) ?? food : undefined
  const aisleOptions = [...new Set([...view.module.aisles.aisles, item.aisle])].map((a) => ({ value: a, label: a }))

  async function save(ev: FormEvent) {
    ev.preventDefault()
    if (!read) return
    const changes: Record<string, unknown> = {}
    const autoAisle = resolveAisle(e?.aisle || food?.store_section || guessAisle(item.name) || null, view.module.aisles)
    if (aisle !== autoAisle || e?.aisle) changes.aisle = aisle === autoAisle && !e?.aisle ? null : aisle
    if ((itemShop || null) !== (item.shop ?? null)) changes.shop = itemShop || null
    if ((note.trim() || null) !== (item.note ?? null)) changes.note = note.trim().slice(0, NOTE_MAX) || null
    if (manual) {
      const n = cleanLabel(name, NAME_MAX)
      if (n && n !== item.name) changes.name = n
      if (read.qty !== (e?.qty ?? null) || read.unit !== (e?.unit ?? null)) Object.assign(changes, read)
      if (foodId !== item.food_id) changes.food_id = foodId
      if ((list || null) !== (item.list ?? null)) changes.list = list || null
    }
    if (Object.keys(changes).length) {
      const undo = await changeItem(profile, item, changes)
      offerUndo(`${item.name} changed`, undo)
    }
    onClose()
  }

  const pick: PickItem[] = useMemo(() => foods.filter((f) => !f.deleted_at).map((f) => ({ id: f.id, name: f.name, meta: f.brand ?? undefined })), [foods])

  return (
    <Sheet title={manual ? 'Change item' : item.name} onClose={onClose}>
      <form className="form-grid" onSubmit={save}>
        {manual ? (
          <>
            <label>Item
              <input value={name} onChange={(ev) => setName(ev.target.value)} maxLength={NAME_MAX} data-autofocus />
            </label>
            <label>How much
              <input value={amount} onChange={(ev) => setAmount(ev.target.value)} placeholder="2 kg, 6, 2 packs, or leave empty" inputMode="text" />
            </label>
            {!read && <p className="stock-hint is-warn">That is not an amount. Try "2 kg", "6" or "2 packs".</p>}
            <div className="shop-field">
              <span className="shop-label">Which food it is (optional)</span>
              <SearchPick items={pick} label="Food" placeholder="Search foods" value={chosenFood?.name ?? null}
                onPick={(p) => setFoodId(p.id)} onClear={() => setFoodId(null)} />
              <span className="stock-hint">Linked to a food, it can go in stock and count its packs.</span>
            </div>
          </>
        ) : (
          <p className="stock-hint">From the meal plan: {[item.amount, item.why].filter(Boolean).join(', ')}. Change the meals to change how much.</p>
        )}
        <div className="two">
          <div className="shop-field">
            <span className="shop-label">Aisle</span>
            <Dropdown<string> label="Aisle" value={aisle} options={aisleOptions} onChange={setAisle} />
          </div>
          {view.shops.length > 0 && (
            <div className="shop-field">
              <span className="shop-label">Shop</span>
              <Dropdown<string> label="Shop" value={itemShop} onChange={setItemShop}
                options={[{ value: '', label: 'Any shop' }, ...view.shops.map((s) => ({ value: s.name, label: s.name }))]} />
            </div>
          )}
        </div>
        {manual && view.lists.length > 0 && (
          <div className="shop-field">
            <span className="shop-label">List</span>
            <Dropdown<string> label="List" value={list} onChange={setList}
              options={[{ value: '', label: 'Main list' }, ...view.lists.map((l) => ({ value: l, label: l }))]} />
          </div>
        )}
        <label>Note
          <input value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={NOTE_MAX} placeholder="The big bag, the one with the blue lid" className="shop-serif" />
        </label>
        <div className="sheet-actions">
          <button type="button" className="btn shop-warn" onClick={async () => {
            const undo = await removeItem(profile, item, view.window.to)
            offerUndo(manual ? `${item.name} taken off the list` : `${item.name}: not needed this time`, undo)
            onClose()
          }}>{manual ? 'Remove' : 'Not needed this time'}</button>
          <button type="submit" className="btn btn-primary grow" disabled={!read}>Save</button>
        </div>
      </form>
      {view.shops.length > 0 && <PriceBlock profile={profile} view={view} item={{ ...item, food_id: manual ? foodId : item.food_id }} startShop={shop ?? item.shop} perMl={!!chosenFood?.per_ml} />}
    </Sheet>
  )
}

/** Prices for an item, one per shop, typed when seen on the shelf. */
function PriceBlock({ profile, view, item, startShop, perMl }: {
  profile: Profile; view: ShoppingView; item: ListItem; startShop: string | null; perMl: boolean
}) {
  const key = itemKey(item)
  const rows = view.prices.filter((p) => p.item_key === key)
  const [shop, setShop] = useState(startShop && view.shops.some((s) => sameShop(s.name, startShop)) ? view.shops.find((s) => sameShop(s.name, startShop))!.name : view.shops[0].name)
  const [price, setPrice] = useState('')
  const [per, setPer] = useState(item.line?.pack_size_g ? `${item.line.pack_size_g} g` : '')
  const currency = currencyFor(profile.country)
  const p = readPrice(price)
  const amt = parseAmount(per)
  const amountG = amt && amt.grams ? amt.grams : null
  const ok = p !== null && amt !== null && (amt.qty === null || amt.grams !== null || amt.unit !== null || amt.qty === 1)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (p === null || !ok) return
    await notePrice(profile, shop, { food_id: item.food_id, name: item.name }, p, amountG)
    setPrice('')
  }

  return (
    <section className="shop-prices" aria-label="Prices">
      <p className="section-title shop-prices-title">Prices</p>
      {rows.length === 0 && <p className="stock-hint">No price noted yet. Type one when you see it on the shelf.</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <span className="shop-price-shop">{r.shop}</span>
            <span className="shop-price">{priceLabel(r, currency, perMl)}</span>
            <button type="button" className="shop-x" aria-label={`Remove the price at ${r.shop}`}
              onClick={async () => offerUndo(`Price at ${r.shop} removed`, await removePrice(r))}>×</button>
          </li>
        ))}
      </ul>
      <form className="shop-price-form" onSubmit={save}>
        <Dropdown<string> label="Shop for the price" value={shop} onChange={setShop} options={view.shops.map((s) => ({ value: s.name, label: s.name }))} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder={formatMoney(1.99, currency)} aria-label="Price" />
        <input value={per} onChange={(e) => setPer(e.target.value)} placeholder="for 1 kg, or empty for each" aria-label="What the price is for" />
        <button type="submit" className="btn" disabled={p === null || !ok}>Note price</button>
      </form>
      {price.trim() !== '' && p === null && <p className="stock-hint is-warn">That is not a price.</p>}
      {per.trim() !== '' && !amt && <p className="stock-hint is-warn">Say what it is for as an amount: "1 kg", "500 g", "1 l".</p>}
    </section>
  )
}

/** Scan a barcode to put that product on the list. A product not yet in
 *  your foods is fetched from Open Food Facts and kept, so the list knows
 *  its pack size and where it is sold. */
function ScanSheet({ profile, list, onClose }: { profile: Profile; list: string | null; onClose: () => void }) {
  const userId = useApp((s) => s.session?.user.id ?? null)
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [again, setAgain] = useState(0)

  async function found(code: string) {
    setBusy(true)
    setStatus({ text: 'Looking it up…' })
    try {
      let food = await foodByBarcode(code, userId)
      if (!food) {
        const product = await productByBarcode(code, whereFor(profile.country))
        if (!product) { setStatus({ text: `No product with barcode ${code} in Open Food Facts yet. Type it in instead.`, bad: true }); return }
        if (!userId) { setStatus({ text: 'Sign in to keep scanned products.', bad: true }); return }
        food = (await addProduct(product, userId)).food
        setStatus({ text: `${displayName(product)} added to your foods.` })
      }
      const r = await addItem(profile, { name: food.name, food_id: food.id, qty: 1, unit: food.pack_size_g ? 'pack' : null, grams: null, list })
      offerUndo(r.merged ? `More ${food.name} on the list` : `${food.name} on the list`, r.undo)
      setStatus({ text: `${food.name} is on the list. Scan the next one, or close.` })
      setAgain((n) => n + 1)
    } catch (e) {
      setStatus({ text: e instanceof ProductProblem ? e.message : 'That could not be looked up. Try again.', bad: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Scan to add" onClose={onClose}>
      {!busy && <BarcodeScan key={again} onCode={(c) => void found(c)} onCancel={onClose} />}
      {status && <p className={`pf-note${status.bad ? ' is-bad' : ''}`} role="status">{status.text}</p>}
      <p className="pf-credit">Product data: Open Food Facts (ODbL). Looked up from this device.</p>
    </Sheet>
  )
}

/** Recipes' ingredients onto the list: pick one or several, say how many
 *  portions, and what the cupboard already has is left off. */
function RecipesSheet({ profile, list, onClose }: { profile: Profile; list: string | null; onClose: () => void }) {
  const recipes = useLiveQuery(() => db.recipe.toArray(), [], [] as Recipe[])
  const userId = useApp((s) => s.session?.user.id ?? null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [said, setSaid] = useState<string | null>(null)
  const found = useMemo(() => search(recipes.filter((r) => !r.deleted_at).map((r) => ({
    ...r, mine: !!userId && r.owner_id === userId, extra: r.role ?? '',
  })), query).slice(0, 60), [recipes, query, userId])
  const ids = Object.keys(picked)

  async function add() {
    const r = await addRecipesToList(profile, ids.map((id) => ({ recipe_id: id, portions: picked[id] })), list)
    setSaid(`${r.added} ${r.added === 1 ? 'item' : 'items'} added${r.covered ? `; ${r.covered} already in stock` : ''}.`)
    offerUndo(`Ingredients of ${ids.length} ${ids.length === 1 ? 'recipe' : 'recipes'} added`, r.undo)
    setPicked({})
  }

  return (
    <Sheet title="Add from recipes" onClose={onClose}>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" className="shop-search" autoComplete="off" />
      <ul className="shop-recipes">
        {found.map((r) => {
          const n = picked[r.id]
          return (
            <li key={r.id} className={n ? 'is-picked' : undefined}>
              <label className="shop-recipe-pick">
                <input type="checkbox" checked={!!n} onChange={(e) => {
                  const next = { ...picked }
                  if (e.target.checked) next[r.id] = Math.max(1, r.portions_per_batch || 1)
                  else delete next[r.id]
                  setPicked(next)
                }} />
                <span className="shop-name">{r.name}</span>
                {r.role === 'ready' && <span className="sp-tag">Ready meal</span>}
              </label>
              {n !== undefined && (
                <span className="shop-portions" role="group" aria-label={`Portions of ${r.name}`}>
                  <button type="button" className="stock-step" aria-label="One portion fewer" disabled={n <= 0.5}
                    onClick={() => setPicked({ ...picked, [r.id]: Math.max(0.5, n - (n > 1 ? 1 : 0.5)) })}>−</button>
                  <span className="shop-portion-n">{n} {n === 1 ? 'portion' : 'portions'}</span>
                  <button type="button" className="stock-step" aria-label="One portion more" disabled={n >= 50}
                    onClick={() => setPicked({ ...picked, [r.id]: Math.min(50, n + (n < 1 ? 0.5 : 1)) })}>+</button>
                </span>
              )}
            </li>
          )
        })}
        {found.length === 0 && <li className="stock-hint">No recipe matches that.</li>}
      </ul>
      {said && <p className="stock-hint" role="status">{said}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn btn-primary grow" disabled={!ids.length} onClick={() => void add()}>
          {ids.length ? `Add the ingredients of ${ids.length} ${ids.length === 1 ? 'recipe' : 'recipes'}` : 'Pick a recipe'}
        </button>
      </div>
    </Sheet>
  )
}

/** A new list: "Me", "Party", "Chemist". */
function ListSheet({ view, onClose, onMade }: { view: ShoppingView; onClose: () => void; onMade: (name: string) => void }) {
  const [name, setName] = useState('')
  const n = cleanLabel(name, LIST_MAX)
  const taken = view.lists.some((l) => l.toLowerCase() === n.toLowerCase()) || n.toLowerCase() === 'main list'
  const field = useRef<HTMLInputElement>(null)
  return (
    <Sheet title="New list" onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (n && !taken) onMade(n) }}>
        <label>Name
          <input ref={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={LIST_MAX} placeholder="Me, Party, Chemist" />
        </label>
        <p className="stock-hint">
          {taken ? 'There is a list with that name already.'
            : 'Planned meals stay on the main list. Items can be moved between lists from their ⋮ menu.'}
        </p>
        <div className="sheet-actions">
          <button type="submit" className="btn btn-primary grow" disabled={!n || taken}>Make the list</button>
        </div>
      </form>
    </Sheet>
  )
}
