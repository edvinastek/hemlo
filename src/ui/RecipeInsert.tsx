import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { search } from '../lib/search-rules'
import { combinedIngredients } from '../lib/recipe-note-rules'
import { loadRecipes, noteLinesOf, recipeBlockText } from '../lib/recipe-note'
import type { Recipe } from '../lib/types'
import './notes.css'

interface Chosen { id: string; portions: number }

/** Insert → Recipe (NOT-20 to NOT-23): find recipes with the one search,
 *  pick one or several, say how many portions of each and which parts go
 *  in (the ingredients as a checklist scaled to the portions, the steps,
 *  one portion's figures), and for several, an optional list of all their
 *  ingredients added up. Each recipe keeps a link back to itself. An
 *  inline panel, so the task sheet never gets a second sheet on top. */
export function RecipeInsert({ onInsert, onClose }: { onInsert: (text: string) => void; onClose: () => void }) {
  const userId = useApp((s) => s.session?.user.id ?? null)
  const recipes = useLiveQuery(async () => (await db.recipe.toArray()).filter((r) => !r.deleted_at), [], undefined)
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const [chosen, setChosen] = useState<Chosen[]>([])
  const [parts, setParts] = useState({ ingredients: true, steps: true, figures: false })
  const [combined, setCombined] = useState(false)
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map((recipes ?? []).map((r) => [r.id, r])), [recipes])
  const items = useMemo(() => (recipes ?? []).map((r) => ({ r, name: r.name, mine: !!userId && r.owner_id === userId })), [recipes, userId])
  const found = search(items, query)
  const shown = all ? found : found.slice(0, 20)
  const picked = new Set(chosen.map((c) => c.id))

  function toggle(r: Recipe) {
    setChosen((now) => (now.some((c) => c.id === r.id) ? now.filter((c) => c.id !== r.id)
      : [...now, { id: r.id, portions: Math.max(1, Math.round(Number(r.portions_per_batch) || 1)) }]))
  }
  function setPortions(id: string, n: number) {
    setChosen((now) => now.map((c) => (c.id === id ? { ...c, portions: Math.min(99, Math.max(0.5, Math.round(n * 2) / 2)) } : c)))
  }

  async function insert() {
    if (!chosen.length || busy) return
    setBusy(true)
    try {
      const data = await loadRecipes(chosen.map((c) => c.id))
      const blocks = chosen.filter((c) => data.has(c.id)).map((c) => recipeBlockText(data.get(c.id)!, { portions: c.portions, ...parts }))
      if (combined && chosen.length > 1) {
        blocks.push(combinedIngredients(chosen.filter((c) => data.has(c.id)).map((c) => ({ lines: noteLinesOf(data.get(c.id)!), portions: c.portions }))))
      }
      if (blocks.length) onInsert(blocks.join('\n\n'))
    } finally {
      setBusy(false)
    }
  }

  const nothing = !parts.ingredients && !parts.steps && !parts.figures

  return (
    <div className="tp ri" role="group" aria-label="Insert a recipe" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="tp-head">
        <span className="tp-title">Insert a recipe</span>
        <button type="button" className="tp-close" onClick={onClose}>Close</button>
      </div>
      {recipes && recipes.length === 0 ? (
        <p className="tp-empty">No recipes on this phone yet. Write one under Food, Recipes, and it can go into any note.</p>
      ) : (
        <>
          <input className="tp-search" type="search" value={query} placeholder="Search recipes" aria-label="Search recipes"
            onChange={(e) => { setQuery(e.target.value); setAll(false) }} autoFocus />
          {shown.length === 0 && recipes && <p className="tp-empty">No recipe has “{query.trim()}” in its name.</p>}
          <ul className="tp-list ri-list">
            {shown.map(({ r }) => (
              <li key={r.id}>
                <button type="button" className="tp-item ri-item" aria-pressed={picked.has(r.id)} onClick={() => toggle(r)}>
                  <span className="ri-box" aria-hidden="true">{picked.has(r.id) ? '✓' : ''}</span>
                  <span className="tp-name">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {!all && found.length > shown.length && (
            <button type="button" className="tp-more" onClick={() => setAll(true)}>Show all {found.length}</button>
          )}
        </>
      )}

      {chosen.length > 0 && (
        <div className="ri-chosen">
          {chosen.map((c) => (
            <div key={c.id} className="ri-row">
              <span className="ri-name">{byId.get(c.id)?.name ?? 'Recipe'}</span>
              <div className="ri-step" role="group" aria-label={`Portions of ${byId.get(c.id)?.name ?? 'the recipe'}`}>
                <button type="button" className="ri-btn" aria-label="One portion fewer" onClick={() => setPortions(c.id, c.portions - 1)} disabled={c.portions <= 1}>−</button>
                <span className="ri-count" aria-live="polite">{c.portions} {c.portions === 1 ? 'portion' : 'portions'}</span>
                <button type="button" className="ri-btn" aria-label="One portion more" onClick={() => setPortions(c.id, c.portions + 1)}>+</button>
              </div>
            </div>
          ))}
          <div className="ri-parts" role="group" aria-label="What to put in">
            {([['ingredients', 'Ingredients as a checklist'], ['steps', 'Steps'], ['figures', 'Figures for one portion']] as const).map(([k, label]) => (
              <button key={k} type="button" className="ne-pill" aria-pressed={parts[k]} onClick={() => setParts({ ...parts, [k]: !parts[k] })}>{label}</button>
            ))}
            {chosen.length > 1 && (
              <button type="button" className="ne-pill" aria-pressed={combined} onClick={() => setCombined(!combined)}>All ingredients added up</button>
            )}
          </div>
          <button type="button" className="btn btn-primary ri-go" disabled={busy || nothing} onClick={() => void insert()}>
            Insert {chosen.length === 1 ? 'the recipe' : `${chosen.length} recipes`}
          </button>
          {nothing && <p className="tp-empty">Choose at least one part to put in.</p>}
        </div>
      )}
    </div>
  )
}
