import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import { DataTable } from '../ui/DataTable'
import { dayTotals } from '../lib/nutrition'
import { recipeMacros, mealMultiplier, type Macros } from '../lib/calc'
import { SLOTS, MAIN_SLOT, slotsFor, planMeal, markEaten, macrosFor } from '../lib/meals'
import { moduleByKey } from '../modules/registry'
import type { Food as FoodRow, Recipe, RecipeLine, MealPlanSlot } from '../lib/types'

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
    const rows = (await db.target.where('profile_id').equals(profile.id).sortBy('from_date'))
      .filter((t) => !t.deleted_at && t.from_date <= day)
    return rows[rows.length - 1] ?? null
  }, [profile?.id, day], null)

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

        {section === 'Day' && profile && (
          <MealDay profileId={profile.id} day={day} recipes={recipes} lines={lines} foods={foodMap}
            target={target ? { kcal: Number(target.kcal ?? 0), protein_g: Number(target.protein_g ?? 0) } : null}
            eaten={totals} />
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

function MealDay({ profileId, day, recipes, lines, foods, target, eaten }: {
  profileId: string; day: string; recipes: Recipe[]; lines: RecipeLine[]; foods: Map<string, FoodRow>
  target: { kcal: number; protein_g: number } | null
  eaten: Macros | null
}) {
  const slots = useLiveQuery(() => slotsFor(profileId, day), [profileId, day], [] as MealPlanSlot[])
  const bySlot = new Map(slots.map((s) => [s.slot, s]))
  const perPortion = (recipeId: string | null) => recipeId ? macrosFor(recipeId, lines, foods) : null
  const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name))

  // What the day comes to as planned, portions included.
  const planned = slots.reduce((acc, s) => {
    const m = perPortion(s.recipe_id)
    if (!m) return acc
    return { kcal: acc.kcal + m.kcal * s.portion_multiplier, protein_g: acc.protein_g + m.protein_g * s.portion_multiplier }
  }, { kcal: 0, protein_g: 0 })

  // The main meal is sized to close whatever the other meals leave open.
  const main = bySlot.get(MAIN_SLOT)
  const mainPer = perPortion(main?.recipe_id ?? null)
  const others = slots.filter((s) => s.slot !== MAIN_SLOT).reduce((acc, s) => {
    const m = perPortion(s.recipe_id)
    return m ? { ...acc, kcal: acc.kcal + m.kcal * s.portion_multiplier, protein_g: acc.protein_g + m.protein_g * s.portion_multiplier } : acc
  }, { kcal: 0, carbs_g: 0, fiber_g: 0, fat_g: 0, protein_g: 0 })
  const suggestion = target && mainPer && mainPer.kcal > 0
    ? Math.round(mealMultiplier(target, others, mainPer) * 10) / 10 : null

  return (
    <>
      <div className="totals">
        <span>Planned <b>{Math.round(planned.kcal)}</b>{target ? ` / ${Math.round(target.kcal)}` : ''} kcal</span>
        <span>Protein <b>{Math.round(planned.protein_g)}</b>{target ? ` / ${Math.round(target.protein_g)}` : ''} g</span>
        <span>Eaten <b>{Math.round(eaten?.kcal ?? 0)}</b> kcal</span>
      </div>

      {SLOTS.map((def) => {
        const slot = bySlot.get(def.key)
        const m = perPortion(slot?.recipe_id ?? null)
        return (
          <div key={def.key} className="slot">
            <div>
              <div className="row-meta">{def.label} · {def.time}</div>
              <select value={slot?.recipe_id ?? ''} aria-label={`${def.label} recipe`}
                onChange={(e) => void planMeal(profileId, day, def.key, e.target.value || null, slot?.portion_multiplier ?? 1)}
                style={{ marginTop: 4 }}>
                <option value="">Nothing planned</option>
                {sorted.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {slot && m && (
                <div className="row-meta" style={{ marginTop: 4 }}>
                  {Math.round(m.kcal * slot.portion_multiplier)} kcal · {Math.round(m.protein_g * slot.portion_multiplier)} g protein
                </div>
              )}
              {def.key === MAIN_SLOT && slot && suggestion !== null && Math.abs(suggestion - slot.portion_multiplier) >= 0.1 && (
                <button className="suggest" onClick={() => void planMeal(profileId, day, def.key, slot.recipe_id, suggestion)}>
                  {suggestion}× reaches {Math.round(target!.kcal)} kcal — use it
                </button>
              )}
            </div>
            {slot && (
              <div className="row-right">
                <input type="number" min={0.25} step={0.25} value={slot.portion_multiplier} aria-label="Portions"
                  style={{ width: 64 }}
                  onChange={(e) => void planMeal(profileId, day, def.key, slot.recipe_id, Number(e.target.value) || 1)} />
                <label className="row-meta" style={{ display: 'grid', justifyItems: 'center' }}>
                  <input type="checkbox" checked={slot.status === 'eaten'}
                    onChange={(e) => void markEaten(slot, e.target.checked)} />
                  eaten
                </label>
              </div>
            )}
          </div>
        )
      })}
      <p className="empty">
        Planned meals appear on Today at their time and fill the shopping list. Macros come from
        the ingredients, and the main meal can be sized to reach the day's target.
      </p>
    </>
  )
}
