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
  EXTRA_FIGURES, NEVO_AND_OTHERS, figureName, foodSearchText, saltOf, shownFigures, type ExtraFigure,
} from '../lib/eu-label-rules'
import '../ui/food.css'
import { MyRecipes } from '../ui/MyRecipes'
import { RecipeView } from '../ui/RecipeView'
import { RecipeEditor } from '../ui/RecipeEditor'
import { Dropdown } from '../ui/Dropdown'
import { offerUndo } from '../ui/Undo'
import { stockMap } from '../lib/stock'
import { addToShoppingList } from '../lib/recipe-actions'
import {
  SORTS, recipeFigures, recipeOrder, recipeSearchText, roleLabel, scaleLines, toBuy, usage, variationName, type RecipeSort,
} from '../lib/recipe-rules'
import type { RecipeDraft } from '../lib/sharing-rules'
import '../ui/recipes.css'
import { FindProducts } from '../ui/ProductSearch'
import type { FieldDef } from '../modules/types'
import type { Food as FoodRow, Recipe, RecipeLine } from '../lib/types'


const live = (r: object) => !(r as { deleted_at?: string | null }).deleted_at

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

/** Food's Recipes tab (REC-01 to REC-08, REC-20, REC-21): the person's own
 *  recipes and the ways to add some, then every recipe (ready meals too), in
 *  books, found by the one search over names, ingredients and what each is
 *  for, and sorted as the person chooses. Tapping a recipe opens it in full. */
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
    }
  }), [liveRecipes, lines, foodMap, figures.join(',')])
  const extraText = useMemo(() => {
    const m = new Map(liveRecipes.map((r) => [r.id, recipeSearchText(r, lines, foodMap)]))
    return (r: { id: string }) => m.get(r.id) ?? ''
  }, [liveRecipes, lines, foodMap])
  const order = useMemo(() => recipeOrder(sort, use), [sort, use])
  const narrowColumns = ['name', 'kcal', ...figures.slice(0, 1)]
  const recipeFields: FieldDef[] = [
    { name: 'name', label: 'Recipe', type: 'text', width: 230 },
    { name: 'role_label', label: 'For', type: 'text', width: 110 },
    { name: 'lines_count', label: 'Items', type: 'integer', width: 60 },
    { name: 'kcal', label: 'kcal', type: 'integer', unit: 'a portion', width: 90 },
    ...figures.map((k): FieldDef => ({ name: k, label: figureName(k), type: 'number', unit: 'g', width: 80 })),
  ]

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
      <MyRecipes userId={userId} recipes={liveRecipes} lines={lines} foods={foodMap} onOpen={setOpen} onNew={() => setEditing({ recipe: null })} />
      <div className="rt-tools">
        <input className="ft-search" type="search" placeholder="Search recipes and ingredients" aria-label="Search recipes"
          value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
        <Dropdown<RecipeSort> value={sort} options={SORTS} label="Sort recipes" onChange={setSort} />
      </div>
      <BookTable
        kind="recipe"
        head={<span><b>{liveRecipes.length}</b> recipes · figures a portion, worked out from the ingredients</span>}
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
        emptyNote={search.trim() ? `No recipe matches “${search.trim()}”.` : 'No recipes yet. Make one with New recipe, import one, or bring in your Excel workbook in More.'}
      />
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

/** Food's Foods tab (FOOD-14): find products in shops, add a food by hand,
 *  and every food, in books: sorted by name, found by the one search (the
 *  Dutch name and synonyms too), with the figures the person chose. */
export function FoodsTab({ openId, onOpened }: { openId?: string | null; onOpened?: () => void } = {}) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const settings = readSettings(profile)
  const prefs = useNutritionPrefs()
  const { foods, foodMap } = useFoodData()
  const [search, setSearch] = useState('')
  const [openFood, setOpenFood] = useState<FoodRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [choosing, setChoosing] = useState(false)
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
  const mineCount = liveFoods.filter((f) => userId && f.owner_id === userId).length
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
  return (
    <>
      {gone && <p className="empty" role="status">That food is no longer here. It may have been deleted.</p>}
      <FindProducts onShow={setSearch} />
      <div className="ft-tools">
        <input className="ft-search" type="search" placeholder="Search, in English or Dutch" aria-label="Search foods, in English or Dutch"
          value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
        <button type="button" className="btn" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}>Figures</button>
        {userId && <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>New food</button>}
      </div>
      {choosing && <FigureChoice />}
      <BookTable
        kind="food"
        head={<span><b>{liveFoods.length}</b> foods{mineCount ? <> · <b>{mineCount}</b> your own</> : null} · per 100 g or 100 ml</span>}
        fields={fields}
        priority={narrowColumns}
        rows={foodRows}
        search={search}
        limit={200}
        extra={foodSearchText}
        emptyNote={search.trim() ? `No food matches “${search.trim()}”. Add it as a new food, or find it in stores.` : 'No foods yet.'}
        onOpen={(row) => setOpenFood(foodMap.get(row.id) ?? null)}
        openLabel={(row) => `Open ${row.name}`}
        more={<p className="ft-credit">Shared foods: {NEVO_AND_OTHERS} (a few kept from a USDA list, and products from Open Food Facts).</p>}
      />
      {search.trim() && userId && (
        <div className="ft-more"><button type="button" className="btn" onClick={() => setAdding(true)}>Add “{search.trim()}” as a new food</button></div>
      )}
      {openFood && <FoodUnitsSheet food={openFood} onClose={() => setOpenFood(null)} />}
      {adding && userId && (
        <FoodEditor userId={userId} name={search.trim()} onClose={() => setAdding(false)} onSaved={(f) => setOpenFood(f)} />
      )}
    </>
  )
}

/** Which figures the food and recipe lists show (FOOD-16): any line of the
 *  EU label. The five the app has always counted are the profile's own
 *  choice (also in More → Profile → Food); the rest are kept with Nutrition. */
function FigureChoice() {
  const profile = useApp((s) => s.profile)
  const prefs = useNutritionPrefs()
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
    <div className="setting-row">
      <div>
        <div className="row-name">Figures in the lists</div>
        <div className="row-meta">Any line of the EU label. A food’s own page always shows the whole label.</div>
        <div className="ft-figures" role="group" aria-label="Figures in the lists">
          {lines.map((f) => (
            <label key={f.key}>
              <input type="checkbox" checked={on(f.key)} disabled={f.key === 'kcal'} onChange={(e) => void toggle(f.key, e.target.checked)} />
              {f.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
