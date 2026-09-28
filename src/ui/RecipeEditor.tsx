import { useEffect, useMemo, useState } from 'react'
import { edit, remove } from '../lib/write'
import { recipeMacros } from '../lib/calc'
import {
  choiceOf, macroLine, nextSharing, personalFoods, readRecipe, readSharing, recipeChanges, sharingEffect,
  type Choice, type LineDraft, type RecipeDraft,
} from '../lib/sharing-rules'
import { SearchPick, type PickItem } from './SearchPick'
import { Dropdown } from './Dropdown'
import { SharingChoice } from './SharingChoice'
import type { Food, Recipe, RecipeLine } from '../lib/types'
import './sharing.css'

const ROLES = [
  { value: '', label: 'Any meal' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'shake', label: 'Shake' },
  { value: 'main', label: 'Main meal' },
]

const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

/** Add a recipe, or change one of your own: a name, what it is for, how many
 *  portions a batch makes, the ingredients per portion, the steps, and who can
 *  see it. Saved on this device at once and sent with the next sync, like
 *  every other change. */
export function RecipeEditor({ recipe, lines, foods, userId, onClose }: {
  /** The recipe to change; none for a new one. */
  recipe: Recipe | null
  /** Its saved ingredient lines. */
  lines: RecipeLine[]
  foods: Map<string, Food>
  userId: string
  onClose: () => void
}) {
  const saved = useMemo(() => [...lines].sort((a, b) => a.sort_order - b.sort_order), [lines])
  const current = recipe ? readSharing(recipe) : 'private'
  const [draft, setDraft] = useState<RecipeDraft>(() => ({
    name: recipe?.name ?? '',
    role: recipe?.role ?? '',
    portions: text(recipe?.portions_per_batch ?? 1),
    minutes: text(recipe?.cook_minutes),
    steps: recipe?.steps ?? '',
    lines: saved.map((l) => ({ id: l.id, food_id: l.food_id, grams: text(l.grams_per_portion) })),
  }))
  const [choice, setChoice] = useState<Choice>(choiceOf(current))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (change: Partial<RecipeDraft>) => { setDraft((d) => ({ ...d, ...change })); setError(null) }
  const setLine = (i: number, change: Partial<LineDraft>) =>
    set({ lines: draft.lines.map((l, j) => (j === i ? { ...l, ...change } : l)) })

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  // Foods to pick from: the shared list and the person's own, never deleted.
  const items: PickItem[] = useMemo(() => [...foods.values()]
    .filter((f) => !(f as { deleted_at?: string | null }).deleted_at && (!f.owner_id || f.owner_id === userId))
    .map((f) => ({
      id: f.id, name: f.name, tag: f.owner_id ? 'mine' : undefined,
      meta: f.kcal !== null ? `${Math.round(Number(f.kcal))} kcal / 100 g` : undefined,
    })), [foods, userId])

  const read = readRecipe(draft)
  const values = 'values' in read ? read.values : null
  const changes = values ? recipeChanges(recipe, saved, values) : null
  const next = nextSharing(current, choice, changes?.contentChanged ?? false)
  const blocking = personalFoods(draft.lines, foods)
  const blocked = (next === 'proposed' || next === 'public') && blocking.length > 0
  const nothing = !!recipe && !!changes && Object.keys(changes.fields).length === 0
    && changes.upsert.length === 0 && changes.removed.length === 0 && next === current

  const perPortion = recipeMacros(
    draft.lines.filter((l) => l.food_id).map((l, i) => ({
      id: l.id ?? `new-${i}`, recipe_id: recipe?.id ?? '', food_id: l.food_id, raw_text: null,
      grams_per_portion: Number(l.grams.replace(',', '.')) || 0, state: null, sort_order: i,
    })), foods)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!values || !changes) { setError((read as { error: string }).error); return }
    if (blocked || nothing) return
    setBusy(true)
    try {
      const row = recipe ?? ({ id: crypto.randomUUID() } as Recipe)
      const fields: Partial<Recipe> = { ...changes.fields }
      if (!recipe) Object.assign(fields, { owner_id: userId, deleted_at: null })
      if (!recipe || next !== current) fields.sharing = next
      // The recipe first, so the server has it before its lines arrive.
      if (Object.keys(fields).length) await edit('recipe', row, fields)
      const byId = new Map(saved.map((l) => [l.id, l]))
      for (const l of changes.upsert) {
        const old = l.id ? byId.get(l.id) : undefined
        if (old) {
          await edit('recipe_line', old, { food_id: l.food_id, grams_per_portion: l.grams_per_portion, sort_order: l.sort_order })
        } else {
          await edit('recipe_line', { id: crypto.randomUUID() } as RecipeLine, {
            recipe_id: row.id, food_id: l.food_id, raw_text: null, grams_per_portion: l.grams_per_portion,
            state: null, sort_order: l.sort_order,
          })
        }
      }
      for (const id of changes.removed) await remove('recipe_line', id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const title = recipe ? 'Edit recipe' : 'New recipe'
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title} onSubmit={(e) => void save(e)} noValidate>
        <h2>{title}</h2>
        <div className="form-grid">
          <label>
            Name
            <input type="text" value={draft.name} maxLength={120} autoFocus={!recipe}
              onChange={(e) => set({ name: e.target.value })} />
          </label>
          <div className="two">
            <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--e-ink-soft)' }}>For</span>
              <Dropdown value={draft.role} options={ROLES} label="What the recipe is for" onChange={(role) => set({ role })} />
            </div>
            <label>
              Portions a batch makes
              <input type="text" inputMode="decimal" value={draft.portions} onChange={(e) => set({ portions: e.target.value })} />
            </label>
          </div>

          <div className="re-lines" role="group" aria-label="Ingredients, grams per portion">
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--e-ink-soft)' }}>
              Ingredients · grams in one portion
            </span>
            {draft.lines.map((l, i) => {
              const food = l.food_id ? foods.get(l.food_id) : undefined
              const name = food?.name ?? 'A food not on this device'
              return (
                <div key={l.id ?? `new-${i}`} className="re-line">
                  <span className="re-line-name">
                    {name}{food?.owner_id && <span className="row-chip">mine</span>}
                  </span>
                  <input type="text" inputMode="decimal" value={l.grams} aria-label={`${name}, grams per portion`}
                    placeholder="g" onChange={(e) => setLine(i, { grams: e.target.value })} />
                  <button type="button" className="re-remove" aria-label={`Remove ${name}`}
                    onClick={() => set({ lines: draft.lines.filter((_, j) => j !== i) })}>×</button>
                </div>
              )
            })}
            <SearchPick items={items} label="Add an ingredient" placeholder="Add an ingredient"
              onPick={(f) => set({ lines: [...draft.lines, { id: null, food_id: f.id, grams: '' }] })} />
            {draft.lines.length > 0 && <p className="re-total">One portion: {macroLine(perPortion)}</p>}
          </div>

          <div className="two">
            <label>
              Minutes to make
              <input type="text" inputMode="numeric" value={draft.minutes} placeholder="optional"
                onChange={(e) => set({ minutes: e.target.value })} />
            </label>
            <span />
          </div>
          <label>
            Steps
            <textarea value={draft.steps} placeholder="optional" maxLength={4000} onChange={(e) => set({ steps: e.target.value })} />
          </label>

          <SharingChoice value={choice} onChange={(c) => { setChoice(c); setError(null) }} recipe={recipe}
            effect={sharingEffect(current, next, !recipe)} blocking={blocking} />
          {error && <p className="re-error" role="alert">{error}</p>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary grow" disabled={busy || blocked || nothing}>
            {nothing ? 'Saved' : busy ? 'Saving' : 'Save'}
          </button>
        </div>
      </form>
    </>
  )
}
