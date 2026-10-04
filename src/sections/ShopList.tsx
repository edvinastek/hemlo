import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import {
  addItem, addRecent, addRecipesToList, changeItem, clearBasket, foodChoices, loadShopping, matchTyped, notePriceUndoable,
  putInStock, removeItem, removePrice, saveModuleSettings, setOrder, tick, today, type ShoppingView,
} from '../lib/shopping'
import {
  amountText, cleanLabel, currencyFor, forShop, formatMoney, groupList, guessAisle, itemKey, LIST_MAX, NOTE_MAX, NAME_MAX,
  onList, parseAmount, parseItem, priceLabel, reorderWithin, resolveAisle, sameShop, shopAisles,
  windowText, addSuggestions, listAmountChoices, amountToField, fieldToAmount, type AddChoice, type ListItem,
} from '../lib/shopping-rules'
import {
  choosePrice, dayText, detailText, listTotal, openPricesPage, priceShop, PRICE_ATTRIBUTION, readPriceInput, rowPrice,
  sizeText, summaryText, type ShownPrice,
} from '../lib/price-rules'
import { suggestShops } from '../lib/shops-rules'
import { useOpenPrices, useOpenPricesFor } from '../lib/prices'
import { search } from '../lib/search-rules'
import { foodByBarcode, addProduct, productByBarcode, whereFor, ProductProblem } from '../lib/products'
import { displayName } from '../lib/products-rules'
import { readUnits } from '../lib/units-rules'
import { offerUndo } from '../ui/Undo'
import { Dropdown } from '../ui/Dropdown'
import { MoreOptions } from '../ui/MoreOptions'
import { SearchPick, type PickItem } from '../ui/SearchPick'
import { BarcodeScan } from '../ui/BarcodeScan'
import { AmountInput } from '../ui/AmountInput'
import { useExport } from '../ui/ExportLink'
import { RowMenu, ScanIcon, Sheet, TabMenu, useDeviceChoice } from './shop-ui'
import { SharePrice, useSharedMarks, useSharing } from './SharePrice'
import { canShare, sharedPriceUrl } from '../lib/open-prices-rules'
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
 *  with the next sync.
 *
 *  Calm (v17): the add field is the main action (no round +), with scan as
 *  an icon inside it; recently bought shows while the field has the focus;
 *  "From recipes", "New list" and Export sit in the page's ⋮; one summary
 *  line ("5 to get · €12.40 + 2 unpriced") that opens to the rest. Prices
 *  are quiet on the right of a row: the household's own, else "≈" one from
 *  Open Prices (price-rules.ts); unknown shows nothing. */
export function ShopList({ profile, menuSlot }: { profile: Profile; menuSlot: HTMLElement | null }) {
  const day = today()
  const view = useLiveQuery(() => loadShopping(profile, day), [profile.id, profile.household_id, profile.updated_at, day])
  const [shop, setShop] = useDeviceChoice<string | null>('shop:filter', null)
  const [list, setList] = useDeviceChoice<string | null>('shop:list', null)
  const [folded, setFolded] = useDeviceChoice<string[]>('shop:folded', [])
  const [editing, setEditing] = useState<string | null>(null)
  const [pricing, setPricing] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'scan' | 'recipes' | 'list'>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  // A shopping trip ticked off today, with things still in the basket: the
  // list offers to put them away (SHOP-22).
  const tripDone = useLiveQuery(async () => (await db.task.where('[profile_id+planned_date]').equals([profile.id, day]).toArray())
    .some((t) => t.source === 'shopping' && !t.deleted_at && t.status === 'done'), [profile.id, day], false)
  // Shared prices for the products with a barcode, from the device's copy (PRICE-01).
  const codes = view ? view.items.map((i) => (i.food_id ? view.foods.get(i.food_id)?.barcode ?? null : null)).filter((c): c is string => !!c) : []
  const shared = useOpenPrices(codes)
  const exportRows = view ? view.items.map((i) => ({
    name: i.name, amount: i.amount, aisle: i.aisle, shop: i.shop ?? '', list: i.list ?? '', why: i.why, note: i.note ?? '', checked: i.checked,
  })) : null
  const exporter = useExport(exportRows ? { label: 'Shopping list', rows: exportRows, fields: LIST_FIELDS } : null)

  const menu = (
    <TabMenu slot={menuSlot} items={[
      { label: 'Add from recipes…', onSelect: () => setSheet('recipes') },
      { label: 'New list…', onSelect: () => setSheet('list') },
      exporter.item,
    ]} />
  )
  if (!view) return <>{menu}<p className="empty">Reading the list…</p></>
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
  const editingItem = editing ? view.items.find((i) => i.key === editing) ?? null : null
  const pricingItem = pricing ? view.items.find((i) => i.key === pricing) ?? null : null

  const codeOf = (i: ListItem) => (i.food_id ? view.foods.get(i.food_id)?.barcode ?? null : null)
  const perMlOf = (i: ListItem) => !!(i.food_id && view.foods.get(i.food_id)?.per_ml)
  const shownPrice = (i: ListItem): ShownPrice | null => choosePrice({
    own: view.prices.filter((p) => p.item_key === itemKey(i)),
    open: shared.get(codeOf(i) ?? '') ?? [],
    shop: shopOn ?? i.shop, country: profile.country ?? null, currency, today: day,
  })
  const priced = new Map(shown.map((i) => [i.key, rowPrice(i, shownPrice(i), currency, perMlOf(i))]))
  const total = listTotal(open, (k) => priced.get(k)?.cost ?? null)
  const details = [
    `Meals from ${windowText(view.window.from, view.window.to)}`,
    view.covered > 0 && !listOn ? `${view.covered} covered by stock` : '',
    elsewhere > 0 ? `${elsewhere} for other shops` : '',
  ].filter(Boolean)

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
      { label: priced.get(item.key) ? 'Price…' : 'Add price…', onSelect: () => setPricing(item.key) },
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
    const price = priced.get(item.key) ?? null
    const where = item.shop ? `at ${item.shop}` : item.sold_at.length ? `sold at ${item.sold_at.slice(0, 2).join(', ')}` : ''
    const meta = [item.why, where, item.note].filter(Boolean).join(' · ')
    const from = price?.text.startsWith('≈') ? ', from Open Prices' : ''
    return (
      <li key={item.key} className={`shop-row${item.checked ? ' is-ticked' : ''}${price ? ' has-price' : ''}`}>
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
        {price && (
          <button type="button" className={`shop-price-btn${from ? ' is-shared' : ''}`} onClick={() => setPricing(item.key)}
            aria-label={`${item.name}: ${price.text.replace('≈', 'about')}${from}. Price details`}>{price.text}</button>
        )}
        <RowMenu label={`More for ${item.name}`} items={menuFor(item, group)} />
      </li>
    )
  }

  return (
    <>
      {menu}
      {exporter.sheet}
      <AddBox profile={profile} view={view} list={listOn} addRef={addRef} onScan={() => setSheet('scan')} />

      {(view.lists.length > 0 || shops.length > 0) && (
        <div className="shop-filters">
          {shops.length > 0 && (
            <Dropdown<string> className="shop-filter" label="Shop" value={shopOn ?? ''}
              options={[{ value: '', label: 'Any shop' }, ...shops.map((s) => ({ value: s.name, label: s.name }))]}
              onChange={(v) => setShop(v || null)} />
          )}
          {view.lists.length > 0 && (
            <div className="shop-lists" role="group" aria-label="Which list">
              {[null, ...view.lists].map((l) => (
                <button key={l ?? 'main'} type="button" className="shop-chip" aria-pressed={(l ?? null) === listOn}
                  onClick={() => setList(l)}>{l ?? 'Main list'}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {tripDone && basket.length > 0 && (
        <div className="shop-trip-done" role="status">
          <p>The shopping trip is ticked off. Put the {basket.length} bought {basket.length === 1 ? 'item' : 'items'} away?</p>
          <div className="shop-foot">
            <button type="button" className="btn btn-primary" onClick={() => void stockBasket()}>Put in stock</button>
            <button type="button" className="btn" onClick={() => void clear()}>Just clear the basket</button>
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="shop-summary">
          <button type="button" className="shop-summary-btn" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            <span aria-live="polite">{summaryText(total, currency)}</span>
            <span className="shop-caret" aria-hidden="true">{more ? '▴' : '▾'}</span>
          </button>
          {more && <p className="shop-summary-more">{details.join(' · ')}</p>}
        </div>
      )}

      {shown.length === 0 && (
        <p className="empty">
          {onThisList.length > 0
            ? 'Nothing on this list is for this shop.'
            : listOn
              ? `Nothing on ${listOn} yet.`
              : 'Nothing to get. Planned meals add their ingredients here by themselves.'}
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
            </div>
          </section>
        )}
        {said && <p className="stock-hint shop-said" role="status">{said}</p>}
      </div>

      {editingItem && (
        <ItemSheet profile={profile} view={view} item={editingItem} shown={shownPrice(editingItem)} onClose={() => setEditing(null)}
          onPrice={() => { setEditing(null); setPricing(editingItem.key) }} />
      )}
      {pricingItem && (
        <Sheet title={pricingItem.name} onClose={() => setPricing(null)}>
          <PriceBody profile={profile} view={view} item={pricingItem} filter={shopOn} shown={shownPrice(pricingItem)}
            code={codeOf(pricingItem)} perMl={perMlOf(pricingItem)} onSaved={() => setPricing(null)} />
        </Sheet>
      )}
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

/** "Add an item": type it the way it would be written on paper; Enter or
 *  Add puts it on the list. The scan icon sits in the field while it is
 *  empty. What it reads (and the aisle it goes in) shows as it is typed;
 *  recently bought shows once the field has had the focus, while nothing
 *  is typed. */
function AddBox({ profile, view, list, addRef, onScan }: {
  profile: Profile; view: ShoppingView; list: string | null; addRef: React.RefObject<HTMLInputElement>
  onScan: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const parsed = parseItem(text)
  const aisle = parsed ? resolveAisle(guessAisle(parsed.name), view.module.aisles) : null

  // Suggestions as the person types (GEN-13): the one search over the
  // household's own things first (bought before, in stock, their foods),
  // then every food. Picking one adds it with the amount typed.
  const foods = useLiveQuery(() => foodChoices(profile.household_id, userId), [profile.household_id, userId], [])
  const choices = useMemo<AddChoice[]>(() => {
    const onIt = new Set(view.items.filter((i) => !i.checked).map((i) => itemKey(i)))
    const named = view.entries.filter((e) => !e.deleted_at && !e.food_id && e.name)
      .map((e) => ({ key: `n:${e.id}`, name: e.name!, food_id: null, recent: e.bought_at ? 1 : 0, onList: onIt.has(itemKey(e)) }))
    return [...foods.map((f) => ({ key: f.id, name: f.name, food_id: f.id, mine: f.mine, inStock: f.inStock, recent: f.recent, onList: onIt.has(f.id) })), ...named]
  }, [foods, view.items, view.entries])
  const suggestions = useMemo(() => addSuggestions(text, choices), [text, choices])

  async function put(name: string, foodId: string | null) {
    if (!parsed || busy) return
    setBusy(true)
    try {
      const r = await addItem(profile, { ...parsed, name, food_id: foodId, list })
      offerUndo(r.merged ? `More ${name} on the list` : `${name} on the list`, r.undo)
      setText('')
      addRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!parsed || busy) return
    const food = await matchTyped(profile.household_id, userId, parsed.name)
    await put(parsed.name, food?.id ?? null)
  }

  return (
    <form className="shop-add" onSubmit={submit}
      // The tiles come out with the first focus and stay for this visit:
      // hiding them again on blur would move the page under a finger
      // already on its way to something below.
      onFocus={() => setFocused(true)}>
      <div className="shop-add-row">
        <input ref={addRef} type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={NAME_MAX + 20}
          placeholder="Add an item: 2 kg apples" aria-label="Add an item" autoComplete="off" enterKeyHint="done" />
        {text.trim()
          ? <button type="submit" className="btn btn-primary" disabled={!parsed || busy}>Add</button>
          : <button type="button" className="shop-scan" onClick={onScan} aria-label="Scan a barcode to add"><ScanIcon /></button>}
      </div>
      {suggestions.length > 0 && (
        <ul className="shop-suggest" aria-label="Suggestions">
          {suggestions.map((c) => (
            <li key={c.key}>
              <button type="button" disabled={busy} onClick={() => void put(c.name, c.food_id)}>
                <span className="shop-serif">{c.name}</span>
                <span className="shop-suggest-why">{c.onList ? 'on the list' : c.inStock ? 'in stock' : (c.recent ?? 0) > 0 ? 'bought before' : c.mine ? 'your food' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {parsed && (
        <p className="stock-hint shop-add-read" aria-live="polite">
          {[parsed.name, parsed.qty !== null ? amountText(parsed) : '', aisle && aisle !== 'Other' ? aisle : ''].filter(Boolean).join(' · ')}
        </p>
      )}
      {focused && !text && view.recents.length > 0 && (
        <section className="shop-recent" aria-label="Recently bought">
          <p className="shop-recent-title">Recently bought</p>
          <div className="shop-tiles">
            {view.recents.slice(0, 8).map((t) => (
              <button key={t.key} type="button" className="shop-tile" aria-label={`Add ${t.name}${t.qty ? `, ${amountText(t)}` : ''}`}
                // The field keeps the focus, so the tiles stay for the next one.
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  const r = await addRecent(profile, t, list)
                  offerUndo(r.merged ? `More ${t.name} on the list` : `${t.name} on the list`, r.undo)
                }}>
                <span aria-hidden="true">+</span> {t.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </form>
  )
}

/** Changing one item: how much, which food it is, aisle, shop, list, note,
 *  and the price at a shop. A planned item's amount comes from the plan. */
function ItemSheet({ profile, view, item, shown, onClose, onPrice }: {
  profile: Profile; view: ShoppingView; item: ListItem; shown: ShownPrice | null; onClose: () => void
  /** Opens the price sheet in this one's place (never a sheet on a sheet). */
  onPrice: () => void
}) {
  const e = item.entry
  const manual = item.kind === 'manual'
  const food = item.food_id ? view.foods.get(item.food_id) : undefined
  const saved = { qty: e?.qty ?? null, unit: e?.unit ?? null, grams: e?.qty ? null : e?.grams ?? null }
  const [name, setName] = useState(item.name)
  // Unlinked, the amount is typed as on paper ("2 kg"); linked to a food it
  // is a number and one of the food's choices (UNIT-02). `amount` holds the
  // whole text in the first case and the number in the second.
  const startChoices = food ? listAmountChoices(food, saved) : []
  const startField = food ? amountToField(saved, startChoices) : null
  const [amount, setAmount] = useState(manual && e ? (startField ? startField.text : amountText(saved)) : '')
  const [unitKey, setUnitKey] = useState(startField?.key ?? 'g')
  const [foodId, setFoodId] = useState<string | null>(item.food_id)
  const [aisle, setAisle] = useState(item.aisle)
  const [itemShop, setItemShop] = useState(item.shop ?? '')
  const [list, setList] = useState(item.list ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const chosenFood = foodId ? foods.find((f) => f.id === foodId) ?? food : undefined
  const choices = useMemo(() => (chosenFood ? listAmountChoices(chosenFood, saved) : []),
    [chosenFood, e?.qty, e?.unit])
  const read = !manual ? { qty: null, unit: null, grams: null }
    : chosenFood ? fieldToAmount(amount, unitKey, choices) : parseAmount(amount)

  /** Linking or unlinking a food carries the amount across: "2 kg" typed
   *  becomes 2 and kg; 6 eggs unlinked becomes "6 eggs". */
  function pickFood(id: string | null) {
    const next = id ? foods.find((f) => f.id === id) : undefined
    const was = read ?? { qty: null, unit: null, grams: null }
    if (next) {
      const f = amountToField(was, listAmountChoices(next, was))
      setAmount(f.text)
      setUnitKey(f.key)
    } else if (chosenFood) {
      setAmount(amountText(was, readUnits(chosenFood.units)))
    }
    setFoodId(id)
  }
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
              <input value={name} onChange={(ev) => setName(ev.target.value)} maxLength={NAME_MAX} data-autofocus className="shop-serif" />
            </label>
            {chosenFood ? (
              <div className="shop-field">
                <span className="shop-label">How much</span>
                <div className="stock-fields shop-amount-field">
                  <AmountInput text={amount} choice={unitKey} choices={choices} onText={setAmount} onChoice={setUnitKey}
                    label={`How much ${chosenFood.name}`} groupClass="stock-units" input={{ placeholder: 'Any' }} />
                </div>
              </div>
            ) : (
              <label>How much
                <input value={amount} onChange={(ev) => setAmount(ev.target.value)} placeholder="2 kg, 6, 2 packs, or leave empty" inputMode="text" />
              </label>
            )}
            {!read && <p className="stock-hint is-warn">{chosenFood ? 'That is not an amount.' : 'That is not an amount. Try "2 kg", "6" or "2 packs".'}</p>}
          </>
        ) : (
          <p className="stock-hint">From the meal plan: {[item.amount, item.why].filter(Boolean).join(', ')}. Change the meals to change how much.</p>
        )}
        <MoreOptions open={!!(foodId || e?.aisle || item.shop || item.list || item.note)}
          summary={[chosenFood?.name, e?.aisle ? aisle : '', itemShop, list, note.trim() ? 'note' : ''].filter(Boolean).join(' · ') || null}>
          {manual && (
            <div className="shop-field">
              <span className="shop-label">Which food it is</span>
              <SearchPick items={pick} label="Food" placeholder="Search foods" value={chosenFood?.name ?? null}
                onPick={(p) => pickFood(p.id)} onClear={() => pickFood(null)} />
            </div>
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
        </MoreOptions>
        <div className="shop-field">
          <span className="shop-label">Price</span>
          <button type="button" className="shop-price-line" onClick={onPrice}>
            {shown ? detailText(shown, currencyFor(profile.country), !!chosenFood?.per_ml) : 'Add price'}
          </button>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn shop-warn" onClick={async () => {
            const undo = await removeItem(profile, item, view.window.to)
            offerUndo(manual ? `${item.name} taken off the list` : `${item.name}: not needed this time`, undo)
            onClose()
          }}>{manual ? 'Remove' : 'Not needed this time'}</button>
          <button type="submit" className="btn btn-primary grow" disabled={!read}>Save</button>
        </div>
      </form>
    </Sheet>
  )
}

/** An item's price (PRICE-03, PRICE-04): where the price on its row comes
 *  from, the prices the household noted per shop, and a quick way to note
 *  one: type it, say whether it is for the pack or a kilo, Save. The shop
 *  is the list's shop filter, else the one used last. */
function PriceBody({ profile, view, item, filter, shown, code, perMl, onSaved }: {
  profile: Profile; view: ShoppingView; item: ListItem; filter: string | null; shown: ShownPrice | null
  code: string | null; perMl: boolean; onSaved: () => void
}) {
  const key = itemKey(item)
  const rows = view.prices.filter((p) => p.item_key === key)
  const currency = currencyFor(profile.country)
  // With no shops kept yet, the country's chains stand in.
  const shopNames = view.shops.length ? view.shops.map((s) => s.name) : suggestShops(profile.country, [], '').filter((s) => !s.online).slice(0, 8).map((s) => s.name)
  const [last, setLast] = useDeviceChoice<string | null>('shop:price-shop', null)
  const [picked, setPicked] = useState<string | null>(null)
  const shop = picked ?? priceShop(filter ?? item.shop, last, shopNames)
  const packG = item.line?.pack_size_g ?? (item.food_id ? view.foods.get(item.food_id)?.pack_size_g ?? null : null)
  // Loose things bought by weight ("2 kg apples") are priced by the kilo.
  const [per, setPer] = useState<'pack' | 'kg'>(!packG && item.grams && !item.pieces ? 'kg' : 'pack')
  const [text, setText] = useState('')
  const read = readPriceInput(text, per, packG)
  const sharedCopy = useOpenPricesFor(code)
  // Sharing a price with Open Prices (PRICE-05): only when the person
  // turned it on, only for a product with a barcode, and only on a tap.
  const sharing = useSharing()
  const marks = useSharedMarks()
  const [sharingId, setSharingId] = useState<string | null>(null)
  const sharingRow = sharingId ? rows.find((r) => r.id === sharingId) ?? null : null
  if (sharingRow && code) {
    return <SharePrice profile={profile} name={item.name} price={sharingRow} code={code} perMl={perMl} onClose={() => setSharingId(null)} />
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!read || !shop) return
    const undo = await notePriceUndoable(profile, shop, { food_id: item.food_id, name: item.name }, read.price, read.amount_g)
    setLast(shop)
    offerUndo(`Price at ${shop} noted`, undo)
    onSaved()
  }

  return (
    <section className="shop-prices" aria-label="Prices">
      {shown && <p className="shop-price-now">{detailText(shown, currency, perMl)}</p>}
      {!shown && code && sharedCopy?.fetched_at && <p className="stock-hint">No shared price for this product here yet.</p>}
      <form className="shop-price-form" onSubmit={save}>
        <label className="shop-field"><span className="shop-label">Price</span>
          <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder={formatMoney(1.99, currency)}
            data-autofocus aria-label={`Price of ${item.name}`} />
        </label>
        <div className="shop-field">
          <span className="shop-label" id={`per-${key}`}>For</span>
          <div className="stock-units shop-per" role="group" aria-labelledby={`per-${key}`}>
            <button type="button" aria-pressed={per === 'pack'} onClick={() => setPer('pack')}>{packG ? `${sizeText(packG, perMl)} pack` : 'each'}</button>
            <button type="button" aria-pressed={per === 'kg'} onClick={() => setPer('kg')}>{perMl ? 'a litre' : 'a kg'}</button>
          </div>
        </div>
        {shopNames.length > 0 && (
          <Dropdown<string> label="Shop for the price" value={shop} onChange={setPicked} options={shopNames.map((n) => ({ value: n, label: n }))} />
        )}
        <button type="submit" className="btn btn-primary" disabled={!read || !shop}>Save price</button>
      </form>
      {text.trim() !== '' && !read && <p className="stock-hint is-warn">That is not a price.</p>}
      {rows.length > 0 && (
        <ul>
          {rows.map((r) => {
            const mark = marks[r.id]
            const can = sharing.on && !mark && canShare(r, code, packG, today()).ok
            return (
              <li key={r.id} className={can || mark ? 'has-share' : undefined}>
                <span className="shop-price-shop">{r.shop}</span>
                <span className="shop-price">{priceLabel(r, currency, perMl)}{r.noted_on ? ` · ${dayText(r.noted_on)}` : ''}</span>
                {mark && <a className="op-shared" href={sharedPriceUrl(mark.id)} target="_blank" rel="noopener noreferrer" aria-label={`Shared with Open Prices: see the price at ${r.shop}`}>Shared</a>}
                {can && (
                  <button type="button" className="slot-link op-share-btn" onClick={() => setSharingId(r.id)}
                    aria-label={`Share the price at ${r.shop} with Open Prices`}>Share</button>
                )}
                <button type="button" className="shop-x" aria-label={`Remove the price at ${r.shop}`}
                  onClick={async () => offerUndo(`Price at ${r.shop} removed`, await removePrice(r))}>×</button>
              </li>
            )
          })}
        </ul>
      )}
      {code && (
        <p className="pf-credit">
          {PRICE_ATTRIBUTION}. <a href={openPricesPage(code)} target="_blank" rel="noopener noreferrer">See the reports</a>
        </p>
      )}
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
        {taken && <p className="stock-hint is-warn">There is a list with that name already.</p>}
        <div className="sheet-actions">
          <button type="submit" className="btn btn-primary grow" disabled={!n || taken}>Make the list</button>
        </div>
      </form>
    </Sheet>
  )
}
