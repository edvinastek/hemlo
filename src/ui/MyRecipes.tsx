import { useMemo, useState } from 'react'
import { macrosFor } from '../lib/meals'
import { statusOf } from '../lib/sharing-rules'
import { SharingStatus } from './SharingChoice'
import { RecipeEditor } from './RecipeEditor'
import type { Food, Recipe, RecipeLine } from '../lib/types'
import './sharing.css'

/** The person's own recipes, each with who can see it, and the way to add
 *  one. Sits above the recipe table on the Food page. */
export function MyRecipes({ userId, recipes, lines, foods }: {
  userId: string | null
  recipes: Recipe[]
  lines: RecipeLine[]
  foods: Map<string, Food>
}) {
  const [open, setOpen] = useState<Recipe | 'new' | null>(null)
  const mine = useMemo(() => recipes
    .filter((r) => userId && r.owner_id === userId && !r.deleted_at)
    .sort((a, b) => a.name.localeCompare(b.name)), [recipes, userId])
  // Anything waiting or turned down is worth seeing without opening the list.
  const flagged = mine.filter((r) => ['waiting', 'warn'].includes(statusOf(r).tone)).length

  if (!userId) return null
  const editing = open === 'new' ? null : open
  return (
    <div className="my-recipes">
      <div className="my-recipes-head">
        <span className="row-meta">Your own recipes stay private unless you propose one to everyone.</span>
        <button type="button" className="btn btn-primary" onClick={() => setOpen('new')}>New recipe</button>
      </div>
      {mine.length > 0 && (
        <details open={mine.length <= 5 || flagged > 0}>
          <summary className="my-recipes-head">Your recipes · {mine.length}</summary>
          {mine.map((r) => (
            <div key={r.id} className="setting-row">
              <div>
                <div className="row-name">{r.name}</div>
                <div className="row-meta">
                  {Math.round(macrosFor(r.id, lines, foods).kcal)} kcal a portion · <SharingStatus recipe={r} />
                </div>
              </div>
              <button type="button" className="btn" onClick={() => setOpen(r)} aria-label={`Edit ${r.name}`}>Edit</button>
            </div>
          ))}
        </details>
      )}
      {open && (
        <RecipeEditor key={editing?.id ?? 'new'} recipe={editing} userId={userId} foods={foods}
          lines={editing ? lines.filter((l) => l.recipe_id === editing.id) : []}
          onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
