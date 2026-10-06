import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { addRecipesToList, previewRecipesAdd } from '../lib/shopping'
import { addedText, servingsText, shouldAsk, stepServings, SERVINGS_MAX, SERVINGS_MIN, type RecipePick } from '../lib/recipe-shop-rules'
import { offerAction, offerUndo } from './Undo'
import { useBackClose } from './useBackClose'
import type { Recipe } from '../lib/types'
import './recipes.css'

/** Recipes onto the shopping list (REC-08): one recipe from its page's ⋮,
 *  or several from the Recipes tab's select bar. Nothing is asked unless it
 *  must be: a recipe's page has said its servings already, so it is added at
 *  once, unless something it needs is at home (then the small sheet asks
 *  whether to leave that out). Picked from the select bar, the sheet asks
 *  the servings, one quiet stepper a recipe, each starting at the recipe's
 *  own. After adding, one line: "12 items added to Shopping · Undo · Open". */

export interface ShopPick { recipe: Pick<Recipe, 'id' | 'name'>; servings: number }

const toPicks = (p: ShopPick[]): RecipePick[] => p.map((x) => ({ recipe_id: x.recipe.id, servings: x.servings }))

export function useRecipesToList() {
  const profile = useApp((s) => s.profile)
  const navigate = useNavigate()
  const [asking, setAsking] = useState<ShopPick[] | null>(null)

  /** Add them now, and say so once. */
  async function add(picks: ShopPick[], skipHome: boolean): Promise<number> {
    if (!profile) return 0
    const r = await addRecipesToList(profile, toPicks(picks), null, skipHome)
    setAsking(null)
    const open = { label: 'Open', run: () => navigate('/shop') }
    if (r.added > 0) offerUndo(addedText(r.added), r.undo, open)
    else offerAction(addedText(0), 'Open', open.run)
    return r.added
  }

  /** Start: straight in when nothing needs asking, else the sheet. */
  async function start(picks: ShopPick[], servingsKnown: boolean): Promise<void> {
    if (!profile || picks.length === 0) return
    const preview = await previewRecipesAdd(profile.household_id, toPicks(picks))
    if (shouldAsk(servingsKnown, preview.atHome.length)) setAsking(picks)
    else await add(picks, true)
  }

  return { start, add, asking, setAsking }
}

/** The choices, for a sheet of their own or a recipe page's panel: a quiet
 *  stepper a recipe (when several, or the servings were not said), whether
 *  to leave out what is at home (only when something is), and Add. */
export function RecipeShopChoices({ start, servingsKnown, onAdd, onCancel, cancelLabel = 'Cancel' }: {
  start: ShopPick[]
  /** The servings were said already (a recipe's page): no steppers. */
  servingsKnown: boolean
  onAdd: (picks: ShopPick[], skipHome: boolean) => Promise<unknown>
  onCancel: () => void
  /** "Back" on a recipe's page, where the page stays. */
  cancelLabel?: string
}) {
  const profile = useApp((s) => s.profile)
  const [picks, setPicks] = useState(start)
  const [skipHome, setSkipHome] = useState(true)
  const [busy, setBusy] = useState(false)
  const homeId = useId()
  const preview = useLiveQuery(
    async () => (profile ? previewRecipesAdd(profile.household_id, toPicks(picks), null, skipHome) : null),
    [profile?.household_id, JSON.stringify(toPicks(picks)), skipHome],
  )
  const n = preview?.ops.length ?? 0

  async function go() {
    if (busy) return
    setBusy(true)
    try { await onAdd(picks, skipHome) } finally { setBusy(false) }
  }

  return (
    <div className="rcp-choice rs">
      {!servingsKnown && (
        <ul className="rs-list">
          {picks.map((p, i) => (
            <li key={p.recipe.id} className="rs-row">
              <span className="rs-name">{p.recipe.name}</span>
              <span className="rs-step" role="group" aria-label={`Servings of ${p.recipe.name}`}>
                <button type="button" aria-label={`One serving fewer of ${p.recipe.name}`} disabled={p.servings <= SERVINGS_MIN}
                  onClick={() => setPicks(picks.map((x, j) => (j === i ? { ...x, servings: stepServings(x.servings, -1) } : x)))}>−</button>
                <span className="rs-n" aria-live="polite">{servingsText(p.servings)}</span>
                <button type="button" aria-label={`One serving more of ${p.recipe.name}`} disabled={p.servings >= SERVINGS_MAX}
                  onClick={() => setPicks(picks.map((x, j) => (j === i ? { ...x, servings: stepServings(x.servings, 1) } : x)))}>+</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!!preview?.atHome.length && (
        <label className="rs-home" htmlFor={homeId}>
          <input id={homeId} type="checkbox" checked={skipHome} onChange={(e) => setSkipHome(e.target.checked)} />
          <span>
            Leave out what is at home
            <span className="rs-quiet">{preview.atHome.join(', ')}</span>
          </span>
        </label>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className="btn btn-primary grow" disabled={busy || !preview || n === 0} onClick={() => void go()}>
          {!preview ? 'Add' : n === 0 ? 'Nothing to add' : `Add ${n} ${n === 1 ? 'item' : 'items'}`}
        </button>
      </div>
    </div>
  )
}

/** The choices as a small sheet of their own (from the select bar). */
export function RecipeShopSheet({ picks, onAdd, onClose }: {
  picks: ShopPick[]
  onAdd: (picks: ShopPick[], skipHome: boolean) => Promise<unknown>
  onClose: () => void
}) {
  const titleId = useId()
  // Back and Escape close it (CALM-10).
  useBackClose(onClose)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Add to shopping list</h2>
        <RecipeShopChoices start={picks} servingsKnown={false} onAdd={onAdd} onCancel={onClose} />
      </div>
    </>
  )
}
