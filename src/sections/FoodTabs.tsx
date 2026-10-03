import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { BookTable } from './BookTable'
import { NUTRIENTS, readSettings, type Nutrient } from '../lib/settings'
import { shownNutrients } from '../lib/quick-food'
import { readUnits, unitsText } from '../lib/units-rules'
import { FoodUnitsSheet } from '../ui/FoodUnits'
import { FoodEditor } from '../ui/FoodEditor'
import { saveSettings } from '../lib/write'
import { saveLabelChoice, useNutritionPrefs } from '../lib/nutrition-prefs'
import {
  EXTRA_FIGURES, figureName, foodSearchText, saltOf, shownFigures, type ExtraFigure,
} from '../lib/eu-label-rules'
import '../ui/food.css'
import { RecipesExportSheet } from '../ui/MyRecipes'
import { RecipeImport } from '../ui/RecipeImport'
import { RecipeView } from '../ui/RecipeView'
import { RecipeEditor } from '../ui/RecipeEditor'
import { useExport } from '../ui/ExportLink'
import { ScanIcon } from '../ui/BarcodeScan'
import { offerUndo } from '../ui/Undo'
import { stockMap } from '../lib/stock'
import { addToShoppingList } from '../lib/recipe-actions'
import {
  SORTS, recipeFigures, recipeOrder, recipeSearchText, roleLabel, scaleLines, toBuy, usage, variationName, type RecipeSort,
} from '../lib/recipe-rules'
import { statusOf, type RecipeDraft } from '../lib/sharing-rules'
import '../ui/recipes.css'
import { ProductFinder } from '../ui/ProductSearch'
import type { FieldDef } from '../modules/types'
import type { Food as FoodRow, Recipe, RecipeLine } from '../lib/types'


const live = (r: object) => !(r as { deleted_at?: string | null }).deleted_at
const RECIPE_EXPORT = { dataset: 'm:nutrition:recipe' }
/** A recipe's sharing in one word for the list (the recipe's page says it in full). */
const SHARING_WORD: Record<string, string | null> = { plain: null, waiting: 'Waiting', done: 'Shared', warn: 'Not accepted' }
const FOOD_EXPORT = { dataset: 'm:nutrition:food' }

/** A recipe or food asked for by the page's address (/food?recipe=<id>):
 *  read straight from the local copy, so it opens as soon as it is found.
 *  Undefined while it is read; null when it is not there (or deleted). */
function useAsked<T extends { deleted_at?: string | null }>(id: string | null | undefined, read: (id: string) => Promise<T | undefined>): T | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const row = await read(id)
    return row && !row.deleted_at ? row : null
  }, [id])
}

function useFoodData() {
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as FoodRow[])
  const recipes = useLiveQuery(() => db.recipe.toArray(), [], [] as Recipe[])
  const lines = useLiveQuery(() => db.recipe_line.toArray(), [], [] as RecipeLine[])
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  return { foods, recipes, lines, foodMap }
}

/** Food's Recipes tab (REC-01 to REC-08, REC-20, REC-21): every recipe
 *  (ready meals too, and the person's own under "Mine"), in books, found by
 *  the one search over names, ingredients and what each is for. Tapping a
 *  recipe opens it in full; the round + makes a new one. Sort, import,
 *  export, books and select are in the page's ⋮ (v17). Only a recipe shared
 *  or waiting for review is marked: private is how one's own start. */
export function RecipesTab({ openId, onOpened }: { openId?: string | null; onOpened?: () => void } = {}) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const settings = readSettings(profile)
  const prefs = useNutritionPrefs()
  const { recipes, lines, foodMap } = useFoodData()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<RecipeSort>('name')
  const [open, setOpen] = useState<Recipe | null>(null)
  const [editing, setEditing] = useState<{ recipe: Recipe | null; start?: RecipeDraft } | null>(null)
  const [tool, setTool] = useState<null | 'sort' | 'import' | 'export'>(null)
  const exp = useExport(RECIPE_EXPORT)
  // A recipe asked for by the address (a note's "Open recipe", the hub's
  // search) opens on its page; the address is then cleared so Back and a
  // reload do not open it again.
  const asked = useAsked(openId, (id) => db.recipe.get(id))
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!openId || asked === undefined) return
    if (asked) { setOpen(asked); setEditing(null) }
    setGone(!asked)
    onOpened?.()
  }, [openId, asked, onOpened])
  const logs = useLiveQuery(async () => (profile ? db.food_log.where('profile_id').equals(profile.id).toArray() : []), [profile?.id], [])
  const slots = useLiveQuery(async () => (profile ? db.meal_plan_slot.where('profile_id').equals(profile.id).toArray() : []), [profile?.id], [])
  const use = useMemo(() => usage(logs, slots), [logs, slots])
  const liveRecipes = useMemo(() => recipes.filter(live), [recipes])
  const figures = shownFigures(shownNutrients(settings).filter((k) => k !== 'kcal'), prefs.label.figures).filter((k) => k !== 'kcal')
  /** Recipe figures are worked out from the lines every time they are shown,
   *  never read from a stored column, so a changed ingredient shows at once. */
  const recipeRows = useMemo(() => liveRecipes.map((r) => {
    const own = lines.filter((l) => l.recipe_id === r.id)
    const f = recipeFigures(own, foodMap, ['kcal', ...figures], 1)
    const values = Object.fromEntries(figures.map((k) => [k, f[k].missing === own.filter((l) => l.food_id).length && own.length ? null : Math.round(f[k].value * 10) / 10]))
    return {
      ...r, ...values,
      kcal: own.some((l) => l.food_id) ? Math.round(f.kcal.value) : null,
      role_label: roleLabel(r.role),
      lines_count: own.length,
      // Shared, waiting or not accepted: said in the list in a word. Private,
      // how one's own start, says nothing (a space, so the cell stays blank).
      sharing_label: (userId && r.owner_id === userId && SHARING_WORD[statusOf(r).tone]) || '\u00a0',
    }
  }), [liveRecipes, lines, foodMap, figures.join(','), userId])
  const anyFlagged = recipeRows.some((r) => r.sharing_label !== '\u00a0')
  const extraText = useMemo(() => {
    const m = new Map(liveRecipes.map((r) => [r.id, recipeSearchText(r, lines, foodMap)]))
    return (r: { id: string }) => m.get(r.id) ?? ''
  }, [liveRecipes, lines, foodMap])
  const order = useMemo(() => recipeOrder(sort, use), [sort, use])
  const narrowColumns = ['name', 'kcal', ...figures.slice(0, 1), ...(anyFlagged ? ['sharing_label'] : [])]
  const recipeFields: FieldDef[] = [
    { name: 'name', label: 'Recipe', type: 'text', width: 230 },
    { name: 'role_label', label: 'For', type: 'text', width: 110 },
    { name: 'lines_count', label: 'Items', type: 'integer', width: 60 },
    { name: 'kcal', label: 'kcal', type: 'integer', unit: 'a portion', width: 90 },
    ...figures.map((k): FieldDef => ({ name: k, label: figureName(k), type: 'number', unit: 'g', width: 80 })),
    ...(anyFlagged ? [{ name: 'sharing_label', label: 'Sharing', type: 'text', width: 120 } as FieldDef] : []),
  ]
  const sortLabel = SORTS.find((x) => x.value === sort)?.label

  function variation(r: Recipe) {
    const own = lines.filter((l) => l.recipe_id === r.id).sort((a, b) => a.sort_order - b.sort_order)
    const taken = liveRecipes.filter((x) => x.owner_id === userId).map((x) => x.name)
    setOpen(null)
    setEditing({
      recipe: null,
      start: {
        name: variationName(r.name, taken), role: r.role ?? '', portions: String(Number(r.portions_per_batch) || 1),
        minutes: r.cook_minutes == null ? '' : String(r.cook_minutes), steps: r.steps ?? '',
        // The copy's lines are new lines with the same amounts.
        lines: own.map((l) => ({
          id: null, food_id: l.food_id, grams: l.unit && l.unit_qty != null ? String(Number(l.unit_qty)) : l.grams_per_portion == null ? '' : String(Number(l.grams_per_portion)),
          unit: l.unit ?? null, raw_text: l.raw_text ?? null, state: l.state ?? null, note: l.note ?? '',
          saved: l.unit && l.unit_qty != null ? { unit: l.unit, qty: Number(l.unit_qty), grams: Number(l.grams_per_portion ?? 0) } : null,
        })),
      },
    })
  }

  async function addSelectedToList(picked: Recipe[], say: (t: string, bad?: boolean) => void) {
    if (!profile) return
    const stock = await stockMap(profile.household_id)
    const scaled = picked.flatMap((r) => scaleLines(r.id, lines, foodMap, Number(r.portions_per_batch) || 1))
    const { buy, inStock } = toBuy(scaled, stock)
    if (buy.length === 0) { say(inStock.length ? 'Everything they need is in the cupboard already.' : 'These recipes have no ingredients to buy.'); return }
    const { count, undo } = await addToShoppingList(buy, profile.household_id, profile.id, picked.length === 1 ? `For ${picked[0].name}` : `For ${picked.length} recipes`)
    offerUndo('Added to the shopping list', undo)
    say(`${count} ${count === 1 ? 'item' : 'items'} on the shopping list, a batch of each${inStock.length ? `; ${inStock.length} already in the cupboard` : ''}.`)
  }

  return (
    <>
      {gone && <p className="empty" role="status">That recipe is no longer here. It may have been deleted.</p>}
      <div className="rt-tools">
        <input className="ft-search" type="search" placeholder="Search recipes and ingredients" aria-label="Search recipes"
          value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
      </div>
      <BookTable
        kind="recipe"
        head={<span><b>{liveRecipes.length}</b> {liveRecipes.length === 1 ? 'recipe' : 'recipes'}{sort !== 'name' ? ` · ${sortLabel}` : ''}</span>}
        fields={recipeFields}
        priority={narrowColumns}
        rows={recipeRows as never}
        lines={lines}
        foods={foodMap}
        search={search}
        extra={extraText}
        order={order as never}
        onOpen={(row) => setOpen(liveRecipes.find((r) => r.id === row.id) ?? null)}
        openLabel={(row) => `Open ${row.name}`}
        actions={profile ? (picked, say) => (
          <button type="button" className="btn" disabled={picked.length === 0}
            onClick={() => void addSelectedToList(picked as unknown as Recipe[], say)}>Add to shopping list</button>
        ) : undefined}
        emptyNote={search.trim() ? `No recipe matches “${search.trim()}”.` : 'No recipes yet.'}
        menu={[
          { label: 'Sort…', onSelect: () => setTool('sort') },
          userId ? { label: 'Import recipes…', onSelect: () => setTool('import') } : null,
          { label: 'Export recipes…', disabled: liveRecipes.length === 0, onSelect: () => setTool('export') },
          exp.item && { ...exp.item, label: 'Export as a table…' },
        ]}
        menuSheets={(
          <>
            {exp.sheet}
            {tool === 'sort' && (
              <ChoiceSheet title="Sort recipes" options={SORTS} value={sort} onClose={() => setTool(null)}
                onPick={(v) => { setSort(v); setTool(null) }} />
            )}
            {tool === 'import' && userId && <RecipeImport userId={userId} onClose={() => setTool(null)} />}
            {tool === 'export' && <RecipesExportSheet recipes={liveRecipes} lines={lines} foods={foodMap} onClose={() => setTool(null)} />}
          </>
        )}
      />
      {userId && !editing && !open && (
        <button type="button" className="fab" aria-label="New recipe" onClick={() => setEditing({ recipe: null })}>+</button>
      )}
      {open && !editing && (
        <RecipeView recipe={open} lines={lines} foods={foodMap} userId={userId} onClose={() => setOpen(null)}
          onEdit={(r) => setEditing({ recipe: r })} onVariation={variation} />
      )}
      {editing && userId && (
        <RecipeEditor key={editing.recipe?.id ?? 'new'} recipe={editing.recipe} userId={userId} foods={foodMap} start={editing.start}
          lines={editing.recipe ? lines.filter((l) => l.recipe_id === editing.recipe!.id) : []}
          onClose={() => setEditing(null)}
          // A new recipe or a variation opens on its page once saved.
          onSaved={(r) => { if (!editing.recipe) setOpen(r) }} />
      )}
    </>
  )
}

/** Food's Foods tab (FOOD-14): every food, in books, sorted by name and
 *  found by the one search (the Dutch name and synonyms too), with the
 *  figures the person chose. One search field, with the barcode scanner in
 *  it; a search that finds nothing offers the shops (Open Food Facts) and a
 *  new food. The round + makes a new food; Find in stores, Figures, books and
 *  select are in the page's ⋮ (v17). The data credits are on each food's own
 *  page and in Settings → About (CALM-13). */
export function FoodsTab({ openId, onOpened }: { openId?: string | null; onOpened?: () => void } = {}) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const settings = readSettings(profile)
  const prefs = useNutritionPrefs()
  const { foods, foodMap } = useFoodData()
  const [search, setSearch] = useState('')
  const [openFood, setOpenFood] = useState<FoodRow | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [tool, setTool] = useState<null | 'figures' | 'find' | 'scan'>(null)
  const exp = useExport(FOOD_EXPORT)
  // A food asked for by the address (/food?food=<id>, the hub's search).
  const asked = useAsked(openId, (id) => db.food.get(id))
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!openId || asked === undefined) return
    if (asked) setOpenFood(asked)
    setGone(!asked)
    onOpened?.()
  }, [openId, asked, onOpened])
  const liveFoods = useMemo(() => foods.filter(live), [foods])
  const figures = shownFigures(shownNutrients(settings).filter((k) => k !== 'kcal'), prefs.label.figures)
  // A food's row as the table shows it: salt worked out from published
  // sodium, units as text ("onion/onions = 95 g").
  const foodRows = useMemo(() => liveFoods.map((f) => ({
    ...f, salt_g: saltOf(f), units: unitsText(readUnits(f.units)),
  })), [liveFoods])
  const fields: FieldDef[] = [
    { name: 'name', label: 'Food', type: 'text', width: 230 },
    { name: 'name_nl', label: 'Dutch name', type: 'text', width: 180 },
    ...figures.map((k): FieldDef => ({
      name: k, label: k === 'kcal' ? 'kcal' : figureName(k), type: 'number', unit: k === 'kcal' ? '/100 g' : 'g', width: k === 'kcal' ? 72 : 76,
    })),
    { name: 'state', label: 'State', type: 'text', width: 80 },
    { name: 'units', label: 'Units', type: 'text', width: 200 },
  ]
  const narrowColumns = ['name', ...figures.slice(0, 2)]
  const typed = search.trim()
  return (
    <>
      {gone && <p className="empty" role="status">That food is no longer here. It may have been deleted.</p>}
      <div className="ft-tools">
        <div className="ft-field">
          <input className="ft-search" type="search" placeholder="Search, in English or Dutch" aria-label="Search foods, in English or Dutch"
            value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          <button type="button" className="ft-scan" aria-label="Scan a barcode" title="Scan a barcode" onClick={() => setTool('scan')}>
            <ScanIcon />
          </button>
        </div>
      </div>
      <BookTable
        kind="food"
        head={<span><b>{liveFoods.length}</b> {liveFoods.length === 1 ? 'food' : 'foods'} · per 100 g or 100 ml</span>}
        fields={fields}
        priority={narrowColumns}
        rows={foodRows}
        search={search}
        limit={200}
        extra={foodSearchText}
        emptyNote={typed ? `No food called “${typed}” here yet.` : 'No foods yet.'}
        onOpen={(row) => setOpenFood(foodMap.get(row.id) ?? null)}
        openLabel={(row) => `Open ${row.name}`}
        // Not found, or not the one: the shops, or the person's own.
        after={() => typed ? (
          <div className="ft-more">
            <button type="button" className="btn" onClick={() => setTool('find')}>Find “{typed}” in stores</button>
            {userId && <button type="button" className="btn" onClick={() => setAdding(typed)}>Add it as a new food</button>}
          </div>
        ) : null}
        menu={[
          { label: 'Find in stores…', onSelect: () => setTool('find') },
          { label: 'Figures in the lists…', onSelect: () => setTool('figures') },
          exp.item,
        ]}
        menuSheets={(
          <>
            {exp.sheet}
            {tool === 'figures' && <FigureChoice onClose={() => setTool(null)} />}
            {(tool === 'find' || tool === 'scan') && (
              <ProductFinder start={tool === 'scan' ? 'scan' : 'search'} purpose="foods" query={typed}
                onClose={() => setTool(null)} onShow={setSearch} />
            )}
          </>
        )}
      />
      {openFood && <FoodUnitsSheet food={openFood} onClose={() => setOpenFood(null)} />}
      {adding !== null && userId && (
        <FoodEditor userId={userId} name={adding} onClose={() => setAdding(null)} onSaved={(f) => setOpenFood(f)} />
      )}
      {userId && adding === null && !openFood && (
        <button type="button" className="fab" aria-label="New food" onClick={() => setAdding(typed)}>+</button>
      )}
    </>
  )
}

/** One choice from a short list, as a sheet: how the recipes are sorted. */
function ChoiceSheet<V extends string>({ title, options, value, onPick, onClose }: {
  title: string; options: { value: V; label: string }[]; value: V; onPick: (v: V) => void; onClose: () => void
}) {
  useEscape(onClose)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="ft-choices" role="group" aria-label={title}>
          {options.map((o) => (
            <button key={o.value} type="button" className="ft-choice" aria-pressed={o.value === value} onClick={() => onPick(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="sheet-actions"><button type="button" className="btn grow" onClick={onClose}>Close</button></div>
      </div>
    </>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}

/** Which figures the food and recipe lists show (FOOD-16): any line of the
 *  EU label. The five the app has always counted are the profile's own
 *  choice (also in Settings → Food); the rest are kept with Nutrition. A
 *  sheet from the Foods tab's ⋮. */
function FigureChoice({ onClose }: { onClose: () => void }) {
  const profile = useApp((s) => s.profile)
  const prefs = useNutritionPrefs()
  useEscape(onClose)
  if (!profile) return null
  const settings = readSettings(profile)
  const core = NUTRIENTS.map((n) => n.key as string)
  const on = (k: string) => k === 'kcal' || settings.nutrients.includes(k as Nutrient) || prefs.label.figures.includes(k as ExtraFigure)
  async function toggle(k: string, want: boolean) {
    if (core.includes(k)) {
      const nutrients = want ? [...settings.nutrients, k as Nutrient] : settings.nutrients.filter((x) => x !== k)
      const today_metric = !want && settings.today_metric === k ? 'kcal' : settings.today_metric
      await saveSettings(profile!, { nutrients, today_metric })
    } else {
      const figures = want ? [...prefs.label.figures, k as ExtraFigure] : prefs.label.figures.filter((x) => x !== k)
      await saveLabelChoice(profile!.id, { ...prefs.label, figures })
    }
  }
  const lines = [{ key: 'kcal', label: 'Calories' }, ...EXTRA_FIGURES]
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Figures in the lists">
        <h2>Figures in the lists</h2>
        <div className="ft-figures" role="group" aria-label="Figures in the lists">
          {lines.map((f) => (
            <label key={f.key}>
              <input type="checkbox" checked={on(f.key)} disabled={f.key === 'kcal'} onChange={(e) => void toggle(f.key, e.target.checked)} />
              {f.label}
            </label>
          ))}
        </div>
        <div className="sheet-actions"><button type="button" className="btn grow" onClick={onClose}>Done</button></div>
      </div>
    </>
  )
}
