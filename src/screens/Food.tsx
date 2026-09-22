import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import { DataTable } from '../ui/DataTable'
import { dayTotals } from '../lib/nutrition'
import { recipeMacros } from '../lib/calc'
import { moduleByKey } from '../modules/registry'
import type { Food as FoodRow, Recipe } from '../lib/types'

const SECTIONS = ['Day', 'Recipes', 'Foods']

export function Food() {
  const profile = useApp((s) => s.profile)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState('Day')
  const [search, setSearch] = useState('')
  const day = format(date, 'yyyy-MM-dd')
  const mod = moduleByKey.get('nutrition')!

  const foods = useLiveQuery(() => db.food.toArray(), [], [] as FoodRow[])
  const recipes = useLiveQuery(() => db.recipe.toArray(), [], [] as Recipe[])
  const lines = useLiveQuery(() => db.recipe_line.toArray(), [], [])
  const totals = useLiveQuery(
    async () => (profile ? dayTotals(profile.id, day) : null),
    [profile?.id, day], null,
  )
  const target = useLiveQuery(async () => {
    if (!profile) return null
    const rows = await db.target.where('profile_id').equals(profile.id).sortBy('from_date')
    return rows[rows.length - 1] ?? null
  }, [profile?.id], null)

  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])

  /** Recipe macros are calculated from the lines every time they are shown,
   *  never read from a stored column, so a changed ingredient is reflected at
   *  once — and a figure typed into the old sheet can never contradict them. */
  const recipeRows = useMemo(() => recipes.map((r) => {
    const m = recipeMacros(lines.filter((l) => l.recipe_id === r.id), foodMap)
    return {
      ...r,
      kcal: Math.round(m.kcal),
      protein_g: Math.round(m.protein_g * 10) / 10,
      carbs_g: Math.round(m.carbs_g * 10) / 10,
      fat_g: Math.round(m.fat_g * 10) / 10,
      lines_count: lines.filter((l) => l.recipe_id === r.id).length,
    }
  }), [recipes, lines, foodMap])

  const filteredFoods = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
    return rows.slice(0, 200)
  }, [foods, search])

  return (
    <div className="page">
      <div className="page-inner">
        <PageHead date={date} onPick={setDate} sections={SECTIONS} active={section} onSection={setSection} />

        {section === 'Day' && (
          <>
            <div className="totals">
              <span>Eaten <b>{Math.round(totals?.kcal ?? 0)}</b> kcal</span>
              <span>Protein <b>{Math.round(totals?.protein_g ?? 0)}</b> / {Math.round(Number(target?.protein_g ?? 0))} g</span>
              <span>Left <b>{Math.max(0, Math.round(Number(target?.kcal ?? 0) - (totals?.kcal ?? 0)))}</b> kcal</span>
            </div>
            <p className="empty">
              Meals are planned from your recipes. The rotating main meal is scaled so the
              day reaches its target rather than served at a fixed size.
            </p>
          </>
        )}

        {section === 'Recipes' && (
          <>
            <div className="totals"><span><b>{recipes.length}</b> recipes · macros calculated from the ingredient lines</span></div>
            <DataTable
              fields={[
                { name: 'name', label: 'Recipe', type: 'text', width: 230 },
                { name: 'role', label: 'Role', type: 'select', options: ['breakfast','lunch','dinner','snack','shake','main'], width: 110 },
                { name: 'lines_count', label: 'Items', type: 'integer', width: 60 },
                { name: 'kcal', label: 'kcal', type: 'integer', width: 70 },
                { name: 'protein_g', label: 'Protein', type: 'number', unit: 'g', width: 80 },
                { name: 'carbs_g', label: 'Carbs', type: 'number', unit: 'g', width: 80 },
                { name: 'fat_g', label: 'Fat', type: 'number', unit: 'g', width: 80 },
              ]}
              priority={['name', 'kcal', 'protein_g']}
              rows={recipeRows}
              emptyNote="No recipes yet — import them from your Excel file in More."
            />
          </>
        )}

        {section === 'Foods' && (
          <>
            <div className="totals">
              <span><b>{foods.length}</b> foods in the catalogue</span>
              <input
                className="btn"
                placeholder="Search foods"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ marginLeft: 'auto', padding: '6px 10px' }}
              />
            </div>
            <DataTable
              fields={mod.entities[0].fields}
              priority={['name', 'kcal', 'protein_g']}
              rows={filteredFoods as never}
              emptyNote="No food matches that."
            />
            {foods.length > filteredFoods.length && (
              <p className="empty">Showing {filteredFoods.length} of {foods.length}. Search to narrow it.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
