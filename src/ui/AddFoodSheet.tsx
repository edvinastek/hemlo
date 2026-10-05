import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { shownNutrients, amountLine } from '../lib/quick-food'
import { amountChoices, gramsLabel, readUnits } from '../lib/units-rules'
import { search, type Searchable } from '../lib/search-rules'
import { foodSearchText } from '../lib/eu-label-rules'
import {
  defaultMeal, defaultTime, defaultWhen, eatenByDefault, goTos, groupDay, groupTitle, identity, itemAmount, itemKind,
  itemMacros, itemName, kcalText, knownKeys, lastAmount, lastPortions, mealName, plateFields, recentItems, resolveMeal, shiftDay,
  startAmount, sumItems, whenTime, addMacros, ZERO, type Item, type Lookup, type MealGroup, type PlateItem, type When,
} from '../lib/meal-rules'
import { addItems, copyMeals, itemHistory, makeLookup, mealsCtx, removeItems, slotsFor } from '../lib/meals'
import { addSaved, isSaved, itemFields, plateKeys, removeSaved, renameSaved, savedFromItems, sortSaved, timesLogged, type SavedMeal } from '../lib/saved-meals-rules'
import { useSavedMeals, writeSavedMeals } from '../lib/saved-meals'
import { isReadyMeal } from '../lib/ready-meal-rules'
import { addProduct, lookUpBarcode, whereFor, ProductProblem } from '../lib/products'
import { maybeShopLabel, type Product } from '../lib/products-rules'
import { AmountInput } from './AmountInput'
import { BarcodeScan, ScanIcon } from './BarcodeScan'
import { FoodEditor } from './FoodEditor'
import { MoreMenu, type MenuItem } from './MoreMenu'
import { ProductFinderBody } from './ProductSearch'
import { QuickNumbers } from './QuickNumbers'
import { ReadyMealForm } from './ReadyMeal'
import { offerUndo } from './Undo'
import type { Food, MealPlanSlot, Recipe, RecipeLine } from '../lib/types'
import './products.css'
import './addfood.css'
import { Tip } from './Tip'
import { useBackClose } from './useBackClose'
import { planToday } from '../lib/day-edge'

/** THE add-food sheet (MEAL-10 to MEAL-14, GEN-51): opened from Food → Day's
 *  round +, a meal's own +, and Today's + menu. It opens where the work is
 *  (CALM-09): on the food, with its guess of the meal, the time and whether
 *  it is eaten in one line ("Lunch · now · eaten — Change"). Change shows
 *  that guess as choices: which meal (the person's own, a new name, or none)
 *  and when (now, the meal's time, a time, or any time). Never a sheet on top
 *  of it.
 *
 *  The food: Recent (what is usually eaten now, then lately), or Search (saved
 *  meals, recipes and foods together, with the barcode scanner in the field;
 *  the shops when nothing is found). "Just the numbers" is a link; copying
 *  from another day is in the sheet's ⋮. Everything picked goes on a
 *  "plate", each with its amount, and the plate goes in at once. */

type Tab = 'recent' | 'search'
/** What takes the lists' place for a moment, with a way back. */
type Mode = 'scan' | 'numbers' | 'copy' | 'find'
// The name from before Visuma, kept: renaming it would lose what is stored under it.
const TAB_KEY = 'getit:addfood:tab'
const SHOW = 30
/** In Search with nothing typed: a few of each, the latest first. */
const BROWSE = 8

/** One thing on the plate, with the name it shows. */
type OnPlate = PlateItem & { name: string }

const live = <T extends { deleted_at?: string | null }>(r: T) => !r.deleted_at

function readTab(): Tab {
  try {
    const t = window.localStorage.getItem(TAB_KEY)
    // v16 kept one of seven tabs; Saved meals, Recipes and Foods are Search now.
    return t === 'search' || t === 'saved' || t === 'recipes' || t === 'foods' ? 'search' : 'recent'
  } catch { return 'recent' }
}
function keepTab(t: Tab) {
  try { window.localStorage.setItem(TAB_KEY, t) } catch { /* private window: the tab is not remembered */ }
}

export function AddFoodSheet({ day, meal: startMeal, time: startTime, food: startFood, onClose }: {
  day: string
  /** A food to start the plate with (a food's page: "Add to a meal"). */
  food?: Food
  /** The meal to add to (its label; '' for no meal). Left out, it is
   *  guessed from the time of day and what is usually eaten now. */
  meal?: string | null
  /** A time to add at (adding to food logged at 15:30 with no meal). */
  time?: string | null
  onClose: () => void
}) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const settings = readSettings(profile)
  const ctx = mealsCtx(settings)
  const shown = shownNutrients(settings)
  const titleId = useId()
  // The clock as the sheet opened: "now" does not drift while it is open.
  const [nowHM] = useState(() => format(new Date(), 'HH:mm'))
  const [today] = useState(() => planToday())

  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const recipes = useLiveQuery(() => db.recipe.toArray(), [], [] as Recipe[])
  const lines = useLiveQuery(() => db.recipe_line.toArray(), [], [] as RecipeLine[])
  const history = useLiveQuery(async () => (profile ? itemHistory(profile.id) : []), [profile?.id], null)
  const look = useMemo(() => makeLookup(foods, recipes, lines), [foods, recipes, lines])
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])

  // The guess (filled in once the history is there), and its choices on Change.
  const [step, setStep] = useState<1 | 2>(2)
  const [meal, setMeal] = useState<string | null>(startMeal ?? null)
  const [other, setOther] = useState('')
  const [when, setWhen] = useState<When | null>(startTime ? 'at' : null)
  const [at, setAt] = useState(startTime ?? '')
  const [eatenSet, setEatenSet] = useState<boolean | null>(null)
  const chosenMeal = meal === '\u0000other' ? resolveMeal(other, ctx) : meal ?? ''
  const mealTime = chosenMeal ? defaultTime(chosenMeal, ctx) : null

  useEffect(() => {
    if (history === null || meal !== null) return
    setMeal(defaultMeal(nowHM, ctx, history, today))
  }, [history]) // eslint-disable-line react-hooks/exhaustive-deps
  const whenNow = when ?? defaultWhen(day, today, nowHM, mealTime)
  // "Meal time" only means something for a meal that has one.
  const whenUsed: When = whenNow === 'meal' && !mealTime ? (day === today ? 'now' : 'any') : whenNow
  const time = whenTime(whenUsed, nowHM, at)
  const eaten = eatenSet ?? eatenByDefault(day, today, nowHM, time ?? mealTime)

  // The food.
  const [tab, setTabState] = useState<Tab>(readTab)
  const setTab = (t: Tab) => { setTabState(t); keepTab(t) }
  const [mode, setMode] = useState<Mode | null>(null)
  const [labelFor, setLabelFor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [plate, setPlate] = useState<OnPlate[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [numbersLabel, setNumbersLabel] = useState<string | undefined>(undefined)
  // The food the sheet was opened with goes on the plate once, in the
  // amount it was last had in (so the history is waited for).
  const started = useRef(false)
  useEffect(() => {
    if (!profile || !startFood || started.current || history === null) return
    started.current = true
    putFood(startFood)
  }, [history]) // eslint-disable-line react-hooks/exhaustive-deps

  // Back and Escape close it (CALM-10); an open ⋮ takes Escape first.
  useBackClose(onClose)

  if (!profile) return null

  const dayLabel = day === today ? 'Today' : day === shiftDay(today, -1) ? 'Yesterday' : day === shiftDay(today, 1) ? 'Tomorrow'
    : format(parseISO(day), 'EEE d MMM')
  const guessing = startMeal == null && meal === null
  const whereText = guessing ? 'Guessing the meal…' : [
    mealName(chosenMeal, ctx) ?? 'No meal',
    whenUsed === 'now' ? `now (${nowHM})` : whenUsed === 'at' ? (time ?? 'at a time') : whenUsed === 'meal' ? mealTime : 'any time',
    eaten ? 'eaten' : 'planned',
  ].filter(Boolean).join(' · ')

  /* ---- the plate ---- */
  const unitsOf = (foodId: string) => readUnits(foodById.get(foodId)?.units)
  const packOf = (foodId: string) => Number(foodById.get(foodId)?.pack_size_g ?? 0) || null
  const read = (p: OnPlate) => plateFields(p, p.kind === 'food' ? unitsOf(p.food_id) : [], p.kind === 'food' ? packOf(p.food_id) : null)
  const readAll = plate.map(read)
  const ready = plate.length > 0 && readAll.every((r) => 'fields' in r)
  const plateTotal = readAll.reduce((acc, r) => {
    if (!('fields' in r)) return acc
    const m = itemMacros({ id: '', slot: '', slot_date: day, status: 'planned', recipe_id: null, portion_multiplier: 1, ...r.fields } as Item, look)
    return m ? addMacros(acc, m) : acc
  }, { ...ZERO })

  const put = (p: OnPlate) => {
    setPlate((list) => [...list, p])
    setNote(`${p.name} is on the plate.`)
  }
  const putFood = (food: Food, fallback?: { grams: number } | null) => {
    const start = startAmount(readUnits(food.units), history ? lastAmount(history, food.id) : null, fallback)
    put({ key: crypto.randomUUID(), kind: 'food', food_id: food.id, name: food.name, ...start })
  }
  const putRecipe = (r: Recipe) => {
    const n = history ? lastPortions(history, r.id) : null
    put({ key: crypto.randomUUID(), kind: 'recipe', recipe_id: r.id, name: r.name, text: String(n ?? 1) })
  }
  const putItem = (i: Item) => {
    const kind = itemKind(i)
    if (kind === 'food') {
      const food = foodById.get(i.food_id!)
      if (!food) return
      const units = readUnits(food.units)
      const start = startAmount(units, { grams: i.grams ?? null, unit: i.unit ?? null, unit_qty: i.unit_qty ?? null })
      put({ key: crypto.randomUUID(), kind: 'food', food_id: food.id, name: food.name, ...start })
    } else if (kind === 'recipe') {
      put({ key: crypto.randomUUID(), kind: 'recipe', recipe_id: i.recipe_id!, name: itemName(i, look), text: String(Number(i.portion_multiplier) || 1) })
    } else if (kind === 'quick') {
      put({
        key: crypto.randomUUID(), kind: 'quick', name: itemName(i, look),
        entry: { label: i.label ?? null, kcal: Number(i.kcal), grams: i.grams ?? null, protein_g: i.protein_g ?? null, carbs_g: i.carbs_g ?? null, fat_g: i.fat_g ?? null, fiber_g: i.fiber_g ?? null },
      })
    }
  }

  async function logFields(fields: Partial<MealPlanSlot>[], what: string) {
    if (!fields.length || busy) return
    setBusy(true)
    try {
      const made = await addItems(profile!.id, day, { meal: chosenMeal, time }, fields, eaten)
      const where = mealName(chosenMeal, ctx)
      offerUndo(`${what} added${where ? ` to ${where}` : ''}`, () => removeItems(made))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  function addPlate() {
    const fields = readAll.flatMap((r) => ('fields' in r ? [r.fields as Partial<MealPlanSlot>] : []))
    if (!ready) return
    void logFields(fields, fields.length === 1 ? plate[0].name : `${fields.length} items`)
  }

  /* ---- step 1 ---- */
  if (step === 1) {
    const ownMeals = settings.meals.names
    // Names used lately that are not among the person's meals, offered too.
    const lately = [...new Set((history ?? []).slice().sort((a, b) => b.slot_date.localeCompare(a.slot_date))
      .map((h) => h.slot).filter((s) => s && !ownMeals.some((m) => m.key === s)))].slice(0, 3)
    return (
      <Frame titleId={titleId} title="Add food" sub={dayLabel} onClose={onClose}
        actions={(
          <button type="button" className="btn btn-primary grow" disabled={meal === '\u0000other' && !other.trim()}
            onClick={() => setStep(2)}>Done</button>
        )}>
        <fieldset className="af-field">
          <legend>Which meal?</legend>
          <div className="af-chips">
            {ownMeals.map((m) => (
              <button key={m.key} type="button" className="af-chip" aria-pressed={meal === m.key} onClick={() => setMeal(m.key)}>
                {m.name}{m.time && <small>{m.time}</small>}
              </button>
            ))}
            {lately.map((s) => (
              <button key={s} type="button" className="af-chip" aria-pressed={meal === s} onClick={() => setMeal(s)}>{mealName(s, ctx)}</button>
            ))}
            <button type="button" className="af-chip" aria-pressed={meal === ''} onClick={() => setMeal('')}>No meal</button>
            <button type="button" className="af-chip" aria-pressed={meal === '\u0000other'} onClick={() => setMeal('\u0000other')}>
              {ownMeals.length || lately.length ? 'Another name…' : 'Name it…'}
            </button>
          </div>
          {meal === '\u0000other' && (
            <input className="af-other" type="text" value={other} maxLength={30} autoFocus placeholder="Second breakfast, Pre-workout…"
              aria-label="Meal’s name" onChange={(e) => setOther(e.target.value)} />
          )}
        </fieldset>

        <fieldset className="af-field">
          <legend>When?</legend>
          <div className="af-chips">
            {day === today && (
              <button type="button" className="af-chip" aria-pressed={whenUsed === 'now'} onClick={() => setWhen('now')}>Now <small>{nowHM}</small></button>
            )}
            {mealTime && (
              <button type="button" className="af-chip" aria-pressed={whenUsed === 'meal'} onClick={() => setWhen('meal')}>Meal time <small>{mealTime}</small></button>
            )}
            <button type="button" className="af-chip" aria-pressed={whenUsed === 'at'} onClick={() => setWhen('at')}>At a time…</button>
            {!mealTime && (
              <button type="button" className="af-chip" aria-pressed={whenUsed === 'any'} onClick={() => setWhen('any')}>Any time</button>
            )}
          </div>
          {whenUsed === 'at' && (
            <input className="af-time" type="time" value={at} aria-label="Time eaten" autoFocus
              onChange={(e) => setAt(e.target.value.slice(0, 5))} />
          )}
        </fieldset>

        <label className="af-eaten">
          <input type="checkbox" checked={eaten} onChange={(e) => setEatenSet(e.target.checked)} />
          <span>Eaten already <small>{eaten ? 'counts in what was eaten' : 'planned, ticked when eaten'}</small></span>
        </label>
      </Frame>
    )
  }

  /* ---- an unknown product, made from its label (PROD-05) ---- */
  // The food form takes the sheet's place (never a sheet on a sheet); the
  // new food goes on the plate.
  if (labelFor && userId) {
    return <FoodEditor userId={userId} barcode={labelFor} onClose={() => setLabelFor(null)}
      onSaved={(f) => { putFood(f); setMode(null) }} />
  }

  /* ---- the food ---- */
  const plateKcal = plate.length ? `${Math.round(plateTotal.kcal)} kcal` : ''
  const back = () => { setMode(null); setNote(null) }
  const toNumbers = (label?: string) => { setNumbersLabel(label); setMode('numbers'); setNote(null) }
  return (
    <Frame titleId={titleId} title="Add food" sub={dayLabel} onClose={onClose}
      menu={[{ label: 'Copy from another day…', onSelect: () => { setMode('copy'); setNote(null) } }]}
      // The foot appears with the first thing on the plate (v17: no hint line
      // while it is empty; the + on every row says what a tap does).
      actions={plate.length === 0 ? null : (
        <>
          {plate.length > 0 && (
            <button type="button" className="af-total" aria-live="polite"
              onClick={() => document.getElementById('af-plate')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {plate.length} on the plate · {plateKcal}
            </button>
          )}
          <button type="button" className="btn btn-primary grow" disabled={!ready || busy} onClick={addPlate}>
            {`Add ${plate.length === 1 ? 'it' : `all ${plate.length}`}`}
          </button>
        </>
      )}>
      <div className="af-where">
        <span>{whereText}</span>
        <button type="button" className="slot-link af-change" disabled={guessing} onClick={() => setStep(1)}>Change</button>
      </div>

      {mode === null ? (
        <>
          <div className="af-field-row">
            <input className="af-search" type="search" value={query} autoComplete="off" enterKeyHint="search"
              placeholder="Search foods, recipes, saved meals" aria-label="Search foods, recipes and saved meals"
              onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim() && tab !== 'search') setTab('search') }} />
            <button type="button" className="af-scanbtn" aria-label="Scan a barcode" title="Scan a barcode"
              onClick={() => { setMode('scan'); setNote(null) }}><ScanIcon /></button>
          </div>
          <div className="af-tabrow">
            <div className="af-tabs" role="tablist" aria-label="Where the food comes from">
              {(['recent', 'search'] as Tab[]).map((t) => (
                <button key={t} type="button" role="tab" id={`af-tab-${t}`} aria-selected={tab === t} aria-controls="af-panel"
                  onClick={() => { setTab(t); setNote(null) }}>{t === 'recent' ? 'Recent' : 'Search'}</button>
              ))}
            </div>
            <button type="button" className="slot-link af-numbers" onClick={() => toNumbers(query.trim() || undefined)}>Just the numbers</button>
          </div>

          <div className="af-panel" id="af-panel" role="tabpanel" aria-labelledby={`af-tab-${tab}`}>
            {note && <p className="af-note" role="status">{note}</p>}
            {tab === 'recent' && history && (
              <RecentList history={history} query={query} look={look} ctx={ctx} nowHM={nowHM} today={today} onPick={putItem} />
            )}
            {tab === 'search' && (
              <SearchList profileId={profile.id} foods={foods} recipes={recipes} lines={lines} userId={userId} query={query} look={look}
                history={history ?? []} onFood={(f) => putFood(f)} onRecipe={putRecipe} onItem={putItem}
                onLog={(m) => void logFields(m.items.map((i) => itemFields(i) as Partial<MealPlanSlot>), m.name)}
                onExplode={(m) => {
                  for (const i of m.items) putItem({ id: '', slot: '', slot_date: day, status: 'planned', portion_multiplier: 1, recipe_id: null, ...itemFields(i) } as Item)
                  setNote(`${m.name}: its ${m.items.length === 1 ? 'item is' : `${m.items.length} items are`} on the plate, to change as you like.`)
                }}
                onFind={() => { setMode('find'); setNote(null) }} onNumbers={() => toNumbers(query.trim() || undefined)} />
            )}
          </div>
        </>
      ) : (
        <div className="af-panel">
          <button type="button" className="slot-link af-back" onClick={back}>← Back to the food</button>
          {note && <p className="af-note" role="status">{note}</p>}
          {mode === 'find' && (
            <ProductFinderBody start="search" purpose="pick" pickLabel="Put on plate" query={query} onClose={back}
              onPick={(food, product) => { putFood(food, servingOf(product)); back() }}
              onReady={(recipe) => { putRecipe(recipe); back() }} />
          )}
          {mode === 'scan' && (
            <ScanSource userId={userId} country={profile.country ?? null}
              onFood={(food, product) => putFood(food, servingOf(product))}
              onReady={(recipe) => putRecipe(recipe)}
              onFind={() => setMode('find')}
              onNumbers={(label) => toNumbers(label)}
              onLabel={(code) => setLabelFor(code)} />
          )}
          {mode === 'numbers' && (
            <QuickNumbers key={`${plate.length}:${numbersLabel ?? ''}`} label={numbersLabel} shown={shown} action="Put on plate"
              onSubmit={(entry) => { put({ key: crypto.randomUUID(), kind: 'quick', entry, name: entry.label ?? 'Quick entry' }); setNumbersLabel(undefined) }} />
          )}
          {mode === 'copy' && (
            <CopySource profileId={profile.id} day={day} today={today} look={look}
              onPlate={(items) => { items.forEach(putItem) }}
              onWholeDay={async (from) => {
                const made = await copyMeals(from, [day], 'all', profile.id)
                offerUndo(made.length ? `${made.length} items copied from ${format(parseISO(from), 'EEE d MMM')}` : 'Nothing to copy', () => removeItems(made))
                onClose()
              }} />
          )}
        </div>
      )}

      {plate.length > 0 && (
        <Plate plate={plate} unitsOf={unitsOf} packOf={packOf} read={read} look={look} shown={shown} profileId={profile.id} history={history ?? []}
          onChange={(key, change) => setPlate((list) => list.map((p) => (p.key === key ? { ...p, ...change } as OnPlate : p)))}
          onRemove={(key) => setPlate((list) => list.filter((p) => p.key !== key))} />
      )}
    </Frame>
  )
}

/** A scanned product's own amount: one serving when it states one (it is
 *  then one of the food's units), else the whole pack. */
const servingOf = (p: Product | null | undefined) => (p?.serving ? null : p?.pack ? { grams: p.pack, pack: true } : null)

/** The sheet itself: a heading, the content, and actions kept at its foot. */
function Frame({ titleId, title, sub, onClose, actions, menu, children }: {
  titleId: string; title: string; sub: string; onClose: () => void; actions: React.ReactNode
  /** The sheet's ⋮, for what is rarely needed (Copy from another day). */
  menu?: MenuItem[]
  children: React.ReactNode
}) {
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet af-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="af-head">
          <h2 id={titleId}>{title} <span className="af-sub">{sub}</span></h2>
          <span className="af-head-tools">
            {menu && <MoreMenu label="More ways to add food" items={menu} />}
            <button type="button" className="slot-link af-close" onClick={onClose}>Close</button>
          </span>
        </div>
        {children}
        {actions && <div className="sheet-actions af-actions">{actions}</div>}
      </div>
    </>
  )
}

/** A row in a source list: a big button that puts it on the plate. */
function PickRow({ name, meta, tag, onPick, onPlate }: { name: string; meta?: string | null; tag?: string | null; onPick: () => void; onPlate?: boolean }) {
  return (
    <li>
      <button type="button" className="af-row" onClick={onPick}>
        <span className="af-row-text">
          <span className="af-row-name">{name}</span>
          {meta && <span className="af-row-meta">{meta}</span>}
        </span>
        {tag && <span className="sp-tag">{tag}</span>}
        <span className="af-row-add" aria-hidden="true">{onPlate ? '✓' : '+'}</span>
      </button>
    </li>
  )
}

function itemMeta(i: Item, look: Lookup): string {
  const m = itemMacros(i, look)
  return [itemAmount(i, look), m ? `${Math.round(m.kcal)} kcal` : 'kcal unknown'].filter(Boolean).join(' · ')
}

/** Recent: what is usually eaten around now first (MEAL-20), then everything
 *  had lately, each once, with the amount it was had in last time. */
function RecentList({ history, query, look, ctx, nowHM, today, onPick }: {
  history: Item[]; query: string; look: Lookup; ctx: ReturnType<typeof mealsCtx>; nowHM: string; today: string; onPick: (i: Item) => void
}) {
  const usual = useMemo(() => goTos(history, ctx, nowHM, today), [history, ctx, nowHM, today])
  const recent = useMemo(() => recentItems(history, today, 60), [history, today])
  const named = (list: Item[]) => list.map((i) => ({ i, name: itemName(i, look) }))
  const q = query.trim()
  const hits = q ? search(named(recent).map((x) => ({ ...x, extra: '' } as Searchable & { i: Item })), q) : named(recent)
  const usualIds = new Set(usual.map(identity))
  if (!history.length) {
    return <p className="af-empty">Nothing eaten yet. What you add shows here next time, with its amount.</p>
  }
  return (
    <>
      {!q && usual.length > 0 && (
        <>
          <h3 className="af-h">Usually around now</h3>
          <ul className="af-list">{usual.map((i) => <PickRow key={`u${i.id}`} name={itemName(i, look)} meta={itemMeta(i, look)} onPick={() => onPick(i)} />)}</ul>
          <h3 className="af-h">Lately</h3>
        </>
      )}
      {hits.length === 0 ? <p className="af-empty">Nothing you had lately matches. Search finds the rest.</p> : (
        <ul className="af-list">
          {hits.filter((x) => q || !usualIds.has(identity(x.i))).map(({ i, name }) => (
            <PickRow key={i.id} name={name} meta={itemMeta(i, look)} onPick={() => onPick(i)} />
          ))}
        </ul>
      )}
    </>
  )
}

function useRecentRank(history: Item[]) {
  return useMemo(() => {
    const rank = new Map<string, number>()
    const list = recentItems(history, undefined, 200)
    list.forEach((i, n) => rank.set(identity(i)!, list.length - n))
    return rank
  }, [history])
}

/** Search: saved meals, recipes and foods together, through the one search
 *  (v17: three tabs until then). With words typed, what was had lately and
 *  matches comes first, with the amount it was had in; nothing found offers
 *  the shops and plain numbers. With nothing typed, a few of each to browse,
 *  the latest first. */
function SearchList({ profileId, foods, recipes, lines, userId, query, look, history, onFood, onRecipe, onItem, onLog, onExplode, onFind, onNumbers }: {
  profileId: string; foods: Food[]; recipes: Recipe[]; lines: RecipeLine[]; userId: string | null; query: string; look: Lookup
  history: Item[]
  onFood: (f: Food) => void; onRecipe: (r: Recipe) => void; onItem: (i: Item) => void
  onLog: (m: SavedMeal) => void; onExplode: (m: SavedMeal) => void; onFind: () => void; onNumbers: () => void
}) {
  const saved = useSavedMeals(profileId)
  const rank = useRecentRank(history)
  const q = query.trim()
  // Had lately, with its amount: one tap puts it back as it was.
  const lately = useMemo(() => (q ? search(recentItems(history, undefined, 60).map((i) => ({ i, name: itemName(i, look), extra: '' })), q).slice(0, 5) : []),
    [history, look, q])
  const had = new Set(lately.map((x) => identity(x.i)))
  // A recipe is found by its ingredients too: "oats" finds overnight oats.
  const inside = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const l of lines) if (l.food_id) m.set(l.recipe_id, [...(m.get(l.recipe_id) ?? []), look.foods.get(l.food_id)?.name ?? ''])
    return m
  }, [lines, look])
  const recipeHits = useMemo(() => search(recipes.filter(live).map((r) => ({
    r, name: r.name, extra: [isReadyMeal(r) ? 'ready meal' : r.role ?? '', ...(inside.get(r.id) ?? [])].join(' '),
    mine: !!userId && r.owner_id === userId, recent: rank.get(`r:${r.id}`) ?? 0,
  })), query).filter((x) => !had.has(`r:${x.r.id}`)), [recipes, userId, rank, inside, query, lately]) // eslint-disable-line react-hooks/exhaustive-deps
  const foodHits = useMemo(() => search(foods.filter(live).map((f) => ({
    // NEVO's Dutch name and synonyms too: "kip" finds chicken, "granola" crunchy muesli.
    f, name: f.name, extra: [foodSearchText(f), f.store_section].filter(Boolean).join(' '),
    mine: !!userId && f.owner_id === userId, recent: rank.get(`f:${f.id}`) ?? 0,
  })), query).filter((x) => !had.has(`f:${x.f.id}`)), [foods, userId, rank, query, lately]) // eslint-disable-line react-hooks/exhaustive-deps
  const savedHits = search(sortSaved(saved), query)
  const nothing = q && !lately.length && !recipeHits.length && !foodHits.length && !savedHits.length

  if (nothing) {
    return (
      <>
        <p className="af-empty">Nothing called “{q}” yet.</p>
        <div className="af-also">
          <button type="button" className="btn" onClick={onFind}>Find “{q}” in stores</button>
          <button type="button" className="btn" onClick={onNumbers}>Type the numbers</button>
        </div>
      </>
    )
  }
  return (
    <>
      {lately.length > 0 && (
        <>
          <h3 className="af-h">Had lately</h3>
          <ul className="af-list">{lately.map(({ i, name }) => <PickRow key={`h${i.id}`} name={name} meta={itemMeta(i, look)} onPick={() => onItem(i)} />)}</ul>
        </>
      )}
      {savedHits.length > 0 && (
        <SavedList profileId={profileId} saved={saved} hits={savedHits} look={look} onLog={onLog} onExplode={onExplode} />
      )}
      <Section title="Recipes" count={recipeHits.length} first={q ? SHOW : BROWSE}>
        {(n) => recipeHits.slice(0, n).map(({ r, mine }) => {
          const per = look.perPortion(r.id)
          return (
            <PickRow key={r.id} name={r.name} meta={per ? `${Math.round(per.kcal)} kcal a portion` : null}
              tag={isReadyMeal(r) ? 'ready meal' : mine ? 'mine' : null} onPick={() => onRecipe(r)} />
          )
        })}
      </Section>
      <Section title="Foods" count={foodHits.length} first={q ? SHOW : BROWSE}>
        {(n) => foodHits.slice(0, n).map(({ f, mine }) => (
          <PickRow key={f.id} name={f.name}
            meta={[f.kcal != null ? `${Math.round(Number(f.kcal))} kcal / 100 ${f.per_ml ? 'ml' : 'g'}` : 'kcal unknown', f.brand].filter(Boolean).join(' · ')}
            tag={mine ? 'mine' : null} onPick={() => onFood(f)} />
        ))}
      </Section>
      {q && (
        <div className="af-also">
          <button type="button" className="btn" onClick={onFind}>Find “{q}” in stores</button>
        </div>
      )}
    </>
  )
}

/** A heading, the first few of a list, and "Show all" for the rest. */
function Section({ title, count, first, children }: { title: string; count: number; first: number; children: (n: number) => React.ReactNode }) {
  const [all, setAll] = useState(false)
  if (!count) return null
  return (
    <>
      <h3 className="af-h">{title}</h3>
      <ul className="af-list">{children(all ? count : first)}</ul>
      {!all && count > first && <button type="button" className="slot-link af-more" onClick={() => setAll(true)}>Show all {count}</button>}
    </>
  )
}

/** Saved meals (MEAL-08): logged whole in one tap, or put on the plate item
 *  by item to change one. Renamed and removed from each one's ⋮. */
function SavedList({ profileId, saved, hits, look, onLog, onExplode }: {
  profileId: string; saved: SavedMeal[]; hits: SavedMeal[]; look: Lookup; onLog: (m: SavedMeal) => void; onExplode: (m: SavedMeal) => void
}) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const summary = (m: SavedMeal) => {
    const items = m.items.map((i) => ({ id: '', slot: '', slot_date: '', status: 'planned', portion_multiplier: 1, recipe_id: null, ...itemFields(i) } as Item))
    const { total, unknown } = sumItems(items, look)
    return `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${kcalText(total, unknown)}`
  }
  return (
    <>
      <h3 className="af-h">Saved meals</h3>
      {problem && <p className="pf-note is-bad" role="alert">{problem}</p>}
      <ul className="af-list af-saved">
        {hits.map((m) => (
          <li key={m.id} className="af-saved-row">
            {renaming?.id === m.id ? (
              <form className="af-rename" onSubmit={async (e) => {
                e.preventDefault()
                const r = renameSaved(saved, m.id, renaming.name)
                if ('error' in r) { setProblem(r.error); return }
                await writeSavedMeals(profileId, r.list)
                setRenaming(null); setProblem(null)
              }}>
                <input value={renaming.name} autoFocus maxLength={60} aria-label="New name" onChange={(e) => setRenaming({ id: m.id, name: e.target.value })} />
                <button type="submit" className="btn">Save</button>
                <button type="button" className="btn" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span className="af-row-text">
                  <span className="af-row-name">{m.name}</span>
                  <span className="af-row-meta">{summary(m)}</span>
                </span>
                <span className="af-saved-tools">
                  <button type="button" className="btn btn-primary" onClick={() => onLog(m)}>Add</button>
                  <button type="button" className="btn" onClick={() => onExplode(m)}>Change items</button>
                  <MoreMenu className="af-dots" label={`More for ${m.name}`} items={[
                    { label: 'Rename', onSelect: () => setRenaming({ id: m.id, name: m.name }) },
                    {
                      label: 'Delete', danger: true,
                      onSelect: async () => {
                        const before = saved
                        await writeSavedMeals(profileId, removeSaved(saved, m.id))
                        offerUndo(`Saved meal “${m.name}” deleted`, () => writeSavedMeals(profileId, before))
                      },
                    },
                  ]} />
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Scan (MEAL-14, PROD-02): a product found goes straight on the plate with
 *  its serving or its pack as the amount, and the scanner is ready for the
 *  next one. A product not known anywhere offers the search by name or the
 *  numbers. A found one can also be saved as a ready meal (PROD-10). */
function ScanSource({ userId, country, onFood, onReady, onFind, onNumbers, onLabel }: {
  userId: string | null; country: string | null
  onFood: (food: Food, product: Product) => void; onReady: (r: Recipe) => void
  onFind: () => void; onNumbers: (label: string) => void
  /** A product nobody knows (PROD-05): make it from its label. */
  onLabel: (barcode: string) => void
}) {
  const where = useMemo(() => whereFor(country), [country])
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<{ food: Food; product: Product } | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [readyFor, setReadyFor] = useState<{ food: Food; product: Product } | null>(null)
  const again = useRef<HTMLButtonElement>(null)

  async function got(code: string) {
    setBusy(true); setProblem(null); setMissing(null); setLast(null)
    try {
      const found = await lookUpBarcode(code, userId, where)
      if (!found) { setMissing(code); return }
      let food = found.food
      if (!food) {
        if (!userId) { setProblem('Sign in to keep foods.'); return }
        food = (await addProduct(found.product, userId)).food
      }
      onFood(food, found.product)
      setLast({ food, product: found.product })
    } catch (e) {
      setProblem(e instanceof ProductProblem ? e.message : 'Something went wrong asking Open Food Facts. Try again.')
    } finally {
      setBusy(false)
      window.setTimeout(() => again.current?.focus(), 0)
    }
  }

  if (readyFor) {
    return (
      <ReadyMealForm food={readyFor.food} product={readyFor.product} onCancel={() => setReadyFor(null)}
        onSaved={(recipe) => { onReady(recipe); setReadyFor(null) }} />
    )
  }
  const settled = last || missing || problem
  return (
    <div className="af-scan">
      {busy && <p className="pf-note" role="status">Looking it up…</p>}
      {!busy && !settled && <BarcodeScan key={attempt} onCode={(c) => void got(c)} onCancel={() => setProblem('Scanning stopped.')} />}
      {last && (
        <div className="af-scanned" role="status">
          <p><b>{last.food.name}</b> is on the plate{last.product.serving ? `: 1 ${last.product.serving.name}` : last.product.pack ? `: the pack, ${gramsLabel(last.product.pack)}` : ''}.</p>
          <button type="button" className="btn" onClick={() => setReadyFor(last)}>Save as ready meal…</button>
        </div>
      )}
      {missing && (
        <div className="af-scanned" role="alert">
          <p>No product with barcode {missing} in Open Food Facts yet.{maybeShopLabel(missing) ? ' It may be a shop’s own label for something weighed at the counter.' : ''}</p>
          <div className="af-also">
            {userId && <button type="button" className="btn" onClick={() => onLabel(missing)}>Add it from its label</button>}
            <button type="button" className="btn" onClick={onFind}>Find by name</button>
            <button type="button" className="btn" onClick={() => onNumbers(`Product ${missing}`)}>Type the numbers</button>
          </div>
        </div>
      )}
      {problem && <p className="pf-note is-bad" role="alert">{problem}</p>}
      {settled && !busy && (
        <button ref={again} type="button" className="btn btn-primary af-again"
          onClick={() => { setLast(null); setMissing(null); setProblem(null); setAttempt((n) => n + 1) }}>Scan again</button>
      )}
      <p className="pf-credit">Product data: Open Food Facts (ODbL). The barcode goes from this device straight to Open Food Facts.</p>
    </div>
  )
}

/** Copy from another day (MEAL-07): yesterday's breakfast onto the plate,
 *  or a whole day's meals as they were. */
function CopySource({ profileId, day, today, look, onPlate, onWholeDay }: {
  profileId: string; day: string; today: string; look: Lookup
  onPlate: (items: Item[]) => void; onWholeDay: (from: string) => Promise<void>
}) {
  const [from, setFrom] = useState(shiftDay(day, -1))
  const profile = useApp((s) => s.profile)
  const ctx = mealsCtx(readSettings(profile))
  const rows = useLiveQuery(() => slotsFor(profileId, from), [profileId, from], [] as MealPlanSlot[])
  const groups: MealGroup[] = groupDay(rows, { ...ctx, meals: { ...ctx.meals, cards: false } }).filter((g) => g.items.length)
  const quick = [
    { d: shiftDay(day, -1), label: 'The day before' },
    { d: shiftDay(day, -7), label: 'A week before' },
    ...(day !== today ? [{ d: today, label: 'Today' }] : []),
  ]
  return (
    <div className="af-copy">
      <div className="af-chips" role="group" aria-label="Copy from">
        {quick.map((q) => (
          <button key={q.label} type="button" className="af-chip" aria-pressed={from === q.d} onClick={() => setFrom(q.d)}>
            {q.label} <small>{format(parseISO(q.d), 'EEE d MMM')}</small>
          </button>
        ))}
        <input type="date" className="af-date" value={from} aria-label="Copy from the day" onChange={(e) => e.target.value && setFrom(e.target.value)} />
      </div>
      {groups.length === 0 ? <p className="af-empty">Nothing was eaten or planned on {format(parseISO(from), 'EEEE d MMMM')}.</p> : (
        <>
          <ul className="af-list">
            {groups.map((g) => {
              const { total, unknown } = sumItems(g.items, look)
              return (
                <li key={g.key} className="af-copy-meal">
                  <span className="af-row-text">
                    <span className="af-row-name">{groupTitle(g)}</span>
                    <span className="af-row-meta">{g.items.map((i) => itemName(i, look)).join(', ')} · {kcalText(total, unknown)}</span>
                  </span>
                  <button type="button" className="btn" onClick={() => onPlate(g.items)}>Put on plate</button>
                </li>
              )
            })}
          </ul>
          {from !== day && (
            <button type="button" className="btn af-whole" onClick={() => void onWholeDay(from)}>
              Copy all of {format(parseISO(from), 'EEE d MMM')} here, meals and times as they were
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** The plate: each thing with its amount (one amount field everywhere,
 *  UNIT-02) and what it comes to, removable; and "Save as a meal". */
function Plate({ plate, unitsOf, packOf, read, look, shown, profileId, history, onChange, onRemove }: {
  plate: OnPlate[]
  unitsOf: (id: string) => ReturnType<typeof readUnits>
  packOf: (id: string) => number | null
  read: (p: OnPlate) => ReturnType<typeof plateFields>
  look: Lookup
  shown: ReturnType<typeof shownNutrients>
  profileId: string
  history: Item[]
  onChange: (key: string, change: Partial<OnPlate>) => void
  onRemove: (key: string) => void
}) {
  const saved = useSavedMeals(profileId)
  // The third time the same things go on the plate by hand, the tip offers
  // to save them as a meal (ONB-13); once, and never for a saved one.
  const keys = useMemo(() => plateKeys(plate), [plate])
  const third = useMemo(() => timesLogged(keys, history) >= 2 && !isSaved(keys, saved), [keys, history, saved])
  const [saving, setSaving] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  async function save() {
    const items = plate.flatMap((p) => { const r = read(p); return 'fields' in r ? [{ id: p.key, slot: '', slot_date: '', status: 'planned', portion_multiplier: 1, recipe_id: null, ...r.fields } as Item] : [] })
    const r = addSaved(saved, { id: crypto.randomUUID(), name: saving ?? '', items: savedFromItems(items) })
    if ('error' in r) { setSaid(r.error); return }
    await writeSavedMeals(profileId, r.list)
    setSaid(`Saved as “${saving!.trim()}”. It is under Saved meals from now on.`)
    setSaving(null)
  }
  return (
    <section className="af-plate" id="af-plate" aria-label="On the plate">
      <h3 className="af-h">On the plate</h3>
      <ul className="af-plate-list">
        {plate.map((p) => {
          const r = read(p)
          const m = 'fields' in r ? itemMacros({ id: '', slot: '', slot_date: '', status: 'planned', portion_multiplier: 1, recipe_id: null, ...r.fields } as Item, look) : null
          return (
            <li key={p.key} className="af-plate-item">
              <span className="af-plate-name">{p.name}</span>
              <span className="af-plate-amount">
                {p.kind === 'food' && (
                  <AmountInput text={p.text} choice={p.choice} choices={amountChoices(unitsOf(p.food_id), { pack: packOf(p.food_id) })}
                    onText={(text) => onChange(p.key, { text })} onChoice={(choice) => onChange(p.key, { choice })}
                    label={`How much ${p.name}`} input={{ onFocus: (e) => e.currentTarget.select() }} />
                )}
                {p.kind === 'recipe' && (
                  <>
                    <input type="text" inputMode="decimal" className="amt-input af-portions" value={p.text} aria-label={`Portions of ${p.name}`}
                      onFocus={(e) => e.currentTarget.select()} onChange={(e) => onChange(p.key, { text: e.target.value })} />
                    <span className="amt-only">{Number(p.text.replace(',', '.')) === 1 ? 'portion' : 'portions'}</span>
                  </>
                )}
                {p.kind === 'quick' && <span className="af-row-meta">{p.entry.grams ? `${gramsLabel(p.entry.grams)} · ` : ''}as typed</span>}
              </span>
              <span className={`af-plate-kcal${'error' in r ? ' is-bad' : ''}`}>
                {'error' in r ? r.error : m ? amountLine(m, knownKeys({ id: '', slot: '', slot_date: '', status: 'planned', portion_multiplier: 1, recipe_id: null, ...r.fields } as Item, look, shown.slice(0, 2))) : 'kcal unknown'}
              </span>
              <button type="button" className="af-remove" aria-label={`Take ${p.name} off the plate`} onClick={() => onRemove(p.key)}>×</button>
            </li>
          )
        })}
      </ul>
      {third && saving === null && <Tip id="save-as-meal" />}
      {saving === null ? (
        <button type="button" className="slot-link af-save" onClick={() => { setSaving(''); setSaid(null) }}>Save as a meal…</button>
      ) : (
        <form className="af-rename" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <input value={saving} autoFocus maxLength={60} placeholder="Name, e.g. Usual breakfast" aria-label="Saved meal’s name"
            onChange={(e) => setSaving(e.target.value)} />
          <button type="submit" className="btn" disabled={!saving.trim()}>Save</button>
          <button type="button" className="btn" onClick={() => setSaving(null)}>Cancel</button>
        </form>
      )}
      {said && <p className="af-note" role="status">{said}</p>}
    </section>
  )
}

