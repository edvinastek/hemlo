import { useMemo, useState } from 'react'
import { macrosFor } from '../lib/meals'
import { statusOf } from '../lib/sharing-rules'
import { roleLabel } from '../lib/recipe-rules'
import { SharingStatus } from './SharingChoice'
import { RecipeImport, exportRecipes } from './RecipeImport'
import type { Food, Recipe, RecipeLine } from '../lib/types'
import './sharing.css'
import './recipes.css'

/** The person's own recipes, each with who can see it, and the ways to add
 *  some: a new one, or imported (pasted, a page, a file); and all of them
 *  out as a file. Sits above the recipe table on the Food page. Tapping one
 *  opens its page. */
export function MyRecipes({ userId, recipes, lines, foods, onOpen, onNew }: {
  userId: string | null
  recipes: Recipe[]
  lines: RecipeLine[]
  foods: Map<string, Food>
  onOpen: (r: Recipe) => void
  onNew: () => void
}) {
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const mine = useMemo(() => recipes
    .filter((r) => userId && r.owner_id === userId && !r.deleted_at)
    .sort((a, b) => a.name.localeCompare(b.name)), [recipes, userId])
  // Anything waiting or turned down is worth seeing without opening the list.
  const flagged = mine.filter((r) => ['waiting', 'warn'].includes(statusOf(r).tone)).length

  if (!userId) return null
  async function out(kind: 'json' | 'csv' | 'schema') {
    const all = recipes.filter((r) => !r.deleted_at)
    const how = await exportRecipes(kind, all, lines, foods)
    if (how !== 'cancelled') setSaid(`Exported ${all.length} ${all.length === 1 ? 'recipe' : 'recipes'}.`)
    setExporting(false)
  }
  return (
    <div className="my-recipes">
      <div className="my-recipes-head">
        <span className="row-meta">Your own recipes stay private unless you propose one to everyone.</span>
        <button type="button" className="btn btn-primary" onClick={onNew}>New recipe</button>
      </div>
      <div className="my-recipes-head" style={{ paddingTop: 0 }}>
        <button type="button" className="btn" onClick={() => setImporting(true)}>Import</button>
        <button type="button" className="btn" aria-expanded={exporting} onClick={() => setExporting((v) => !v)}>Export all</button>
        {exporting && (
          <span className="rcp-actions" style={{ margin: 0 }}>
            <button type="button" className="slot-link" onClick={() => void out('json')}>GetIt file</button>
            <button type="button" className="slot-link" onClick={() => void out('csv')}>CSV</button>
            <button type="button" className="slot-link" onClick={() => void out('schema')}>schema.org</button>
          </span>
        )}
      </div>
      {said && <p className="rcp-done" style={{ padding: '0 var(--space-4) var(--space-2)' }} role="status">{said}</p>}
      {mine.length > 0 && (
        <details open={mine.length <= 5 || flagged > 0}>
          <summary className="my-recipes-head">Your recipes · {mine.length}</summary>
          {mine.map((r) => (
            <div key={r.id} className="setting-row">
              <div>
                <div className="row-name">{r.name}</div>
                <div className="row-meta">
                  {roleLabel(r.role)} · {Math.round(macrosFor(r.id, lines, foods).kcal)} kcal a portion · <SharingStatus recipe={r} />
                </div>
              </div>
              <button type="button" className="btn" onClick={() => onOpen(r)} aria-label={`Open ${r.name}`}>Open</button>
            </div>
          ))}
        </details>
      )}
      {importing && <RecipeImport userId={userId} onClose={() => setImporting(false)} />}
    </div>
  )
}
