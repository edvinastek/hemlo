import { useEffect, useId, useState } from 'react'
import { exportRecipes } from './RecipeImport'
import type { Food, Recipe, RecipeLine } from '../lib/types'
import './recipes.css'

/** Every recipe out as a file, in the formats other recipe apps read: GetIt's
 *  own file (to read back in), a spreadsheet, or schema.org Recipe. Opened
 *  from the Recipes tab's ⋮ (v17: until then "Export all" sat on the page,
 *  above a second list of one's own recipes). */
export function RecipesExportSheet({ recipes, lines, foods, onClose }: {
  recipes: Recipe[]
  lines: RecipeLine[]
  foods: Map<string, Food>
  onClose: () => void
}) {
  const titleId = useId()
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function out(kind: 'json' | 'csv' | 'schema') {
    if (busy) return
    setBusy(true)
    try {
      const all = recipes.filter((r) => !r.deleted_at)
      const how = await exportRecipes(kind, all, lines, foods)
      if (how !== 'cancelled') setSaid(`Exported ${all.length} ${all.length === 1 ? 'recipe' : 'recipes'}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Export recipes</h2>
        <div className="rcp-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void out('json')}>GetIt recipe file</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void out('csv')}>Spreadsheet (CSV)</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void out('schema')}>schema.org Recipe</button>
        </div>
        {said && <p className="rcp-done" role="status">{said}</p>}
        <div className="sheet-actions"><button type="button" className="btn grow" onClick={onClose}>Close</button></div>
      </div>
    </>
  )
}
