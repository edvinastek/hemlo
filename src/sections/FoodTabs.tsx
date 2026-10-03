import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { BookTable } from './BookTable'
import { recipeMacros } from '../lib/calc'
import { NUTRIENTS, readSettings, type Nutrient } from '../lib/settings'
import { nutrientLabel, shownNutrients } from '../lib/quick-food'
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
import { FindProducts } from '../ui/ProductSearch'
import type { FieldDef } from '../modules/types'
import type { Food as FoodRow, Recipe, RecipeLine } from '../lib/types'


const live = (r: object) => !(r as { deleted_at?: string | null }).deleted_at

function useFoodData() {
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as FoodRow[])
  const recipes = useLiveQuery(() => db.recipe.toArray(), [], [] as Recipe[])
  const lines = useLiveQuery(() => db.recipe_line.toArray(), [], [] as RecipeLine[])
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  return { foods, recipes, lines, foodMap }
}

/** Food's Recipes tab: the person's own recipes, then every recipe, in books. */
export function RecipesTab() {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const shown = shownNutrients(readSettings(profile))
  const { recipes, lines, foodMap } = useFoodData()
  const liveRecipes = useMemo(() => recipes.filter(live), [recipes])
  /** Recipe macros are calculated from the lines every time they are shown,
   *  never read from a stored column, so a changed ingredient is reflected at
   *  once — and a figure typed into the old sheet can never contradict them. */
  const recipeRows = useMemo(() => liveRecipes.map((r) => {
    const m = recipeMacros(lines.filter((l) => l.recipe_id === r.id), foodMap)
    return {
      ...r,
      kcal: Math.round(m.kcal),
      protein_g: Math.round(m.protein_g * 10) / 10,
      carbs_g: Math.round(m.carbs_g * 10) / 10,
      fat_g: Math.round(m.fat_g * 10) / 10,
      fiber_g: Math.round(m.fiber_g * 10) / 10,
      lines_count: lines.filter((l) => l.recipe_id === r.id).length,
    }
  }), [liveRecipes, lines, foodMap])
  const narrowColumns = ['name', ...shown.slice(0, 2)]
  const recipeFields: FieldDef[] = [
    { name: 'name', label: 'Recipe', type: 'text', width: 230 },
    { name: 'role', label: 'Role', type: 'select', options: ['breakfast','lunch','dinner','snack','shake','main'], width: 110 },
    { name: 'lines_count', label: 'Items', type: 'integer', width: 60 },
    { name: 'kcal', label: 'kcal', type: 'integer', width: 70 },
    ...shown.filter((k) => k !== 'kcal').map((k): FieldDef => ({ name: k, label: nutrientLabel(k), type: 'number', unit: 'g', width: 80 })),
  ]
  return (
    <>
      <MyRecipes userId={userId} recipes={liveRecipes} lines={lines} foods={foodMap} />
      <BookTable
        kind="recipe"
        head={<span><b>{liveRecipes.length}</b> recipes · macros calculated from the ingredient lines</span>}
        fields={recipeFields}
        priority={narrowColumns}
        rows={recipeRows}
        lines={lines}
        foods={foodMap}
        emptyNote="No recipes yet — import them from your Excel file in More."
      />
    </>
  )
}

/** Food's Foods tab (FOOD-14): find products in shops, add a food by hand,
 *  and every food, in books: sorted by name, found by the one search (the
 *  Dutch name and synonyms too), with the figures the person chose. */
export function FoodsTab() {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const settings = readSettings(profile)
  const prefs = useNutritionPrefs()
  const { foods, foodMap } = useFoodData()
  const [search, setSearch] = useState('')
  const [openFood, setOpenFood] = useState<FoodRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [choosing, setChoosing] = useState(false)
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
      <FindProducts onShow={setSearch} />
      <div className="ft-tools">
        <input className="ft-search" type="search" placeholder="Search foods, in English or Dutch" aria-label="Search foods"
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
