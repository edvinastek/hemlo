import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { BookTable } from './BookTable'
import { recipeMacros } from '../lib/calc'
import { readSettings, type Nutrient } from '../lib/settings'
import { nutrientLabel, shownNutrients } from '../lib/quick-food'
import { readUnits, unitsText } from '../lib/units-rules'
import { FoodUnitsSheet } from '../ui/FoodUnits'
import { MyRecipes } from '../ui/MyRecipes'
import { FindProducts } from '../ui/ProductSearch'
import { moduleByKey } from '../modules/registry'
import type { FieldDef } from '../modules/types'
import type { Food as FoodRow, Recipe, RecipeLine } from '../lib/types'


const NUTRIENT_KEYS: string[] = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g']
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

/** Food's Foods tab: find products in shops, and every food, in books. */
export function FoodsTab() {
  const profile = useApp((s) => s.profile)
  const shown = shownNutrients(readSettings(profile))
  const { foods, foodMap } = useFoodData()
  const [search, setSearch] = useState('')
  const [openFood, setOpenFood] = useState<FoodRow | null>(null)
  const mod = moduleByKey.get('nutrition')!
  const liveFoods = useMemo(() => foods.filter(live), [foods])
  // A food's units as the table shows them: "egg/eggs = 50 g".
  const foodRows = useMemo(() => liveFoods.map((f) => ({ ...f, units: unitsText(readUnits(f.units)) })), [liveFoods])
  // Columns for the nutrients not tracked are left out, not just narrowed.
  const nutrientColumn = (f: FieldDef) => !NUTRIENT_KEYS.includes(f.name) || shown.includes(f.name as Nutrient)
  const narrowColumns = ['name', ...shown.slice(0, 2)]
  return (
    <>
      <FindProducts onShow={setSearch} />
      <BookTable
        kind="food"
        head={<>
          <span><b>{liveFoods.length}</b> foods in the catalogue</span>
          <input
            className="btn"
            placeholder="Search foods"
            aria-label="Search foods"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '6px 10px', minWidth: 0, flex: '1 1 120px' }}
          />
        </>}
        fields={mod.entities[0].fields.filter(nutrientColumn)}
        priority={narrowColumns}
        rows={foodRows}
        search={search}
        limit={200}
        emptyNote="No food matches that."
        onOpen={(row) => setOpenFood(foodMap.get(row.id) ?? null)}
        openLabel={(row) => `Open ${row.name}: its units`}
      />
      {openFood && <FoodUnitsSheet food={openFood} onClose={() => setOpenFood(null)} />}
    </>
  )
}
