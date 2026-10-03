import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { edit, remove } from '../lib/write'
import { recipeMacros } from '../lib/calc'
import {
  choiceOf, statusOf, lineGrams, macroLine, nextSharing, personalFoods, readRecipe, readSharing, recipeChanges, sharingEffect,
  LINE_TEXT_MAX, type Choice, type LineDraft, type RecipeDraft,
} from '../lib/sharing-rules'
import { amountChoices, countFits, defaultUnit, entryText, findUnit, gramsLabel, readUnits, unitColumns, unitWord } from '../lib/units-rules'
import { rolesFor } from '../lib/recipe-rules'
import { foodByBarcode, productByBarcode, addProduct, whereFor } from '../lib/products'
import { Dropdown } from './Dropdown'
import { AmountInput } from './AmountInput'
import { SharingChoice } from './SharingChoice'
import { MoreOptions } from './MoreOptions'
import { IngredientPick } from './IngredientPick'
import { FoodEditor } from './FoodEditor'
import { BarcodeScan } from './BarcodeScan'
import { ProductFinder } from './ProductSearch'
import { offerUndo } from './Undo'
import type { Food, Recipe, RecipeLine } from '../lib/types'
import './sharing.css'
import './recipes.css'

const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

/** A saved line as the form holds it: in its unit when it was typed in one
 *  (and the count still fits its grams), its own words, raw or cooked, note. */
function lineDraft(l: RecipeLine, foods: Map<string, Food>): LineDraft {
  const extra = { raw_text: l.raw_text ?? null, state: l.state ?? null, note: l.note ?? '' }
  const units = readUnits(l.food_id ? foods.get(l.food_id)?.units : null)
  if (l.unit && l.unit_qty != null && countFits(Number(l.unit_qty), findUnit(units, l.unit)?.g, l.grams_per_portion)) {
    return { id: l.id, food_id: l.food_id, grams: text(Number(l.unit_qty)), unit: l.unit, ...extra,
      saved: { unit: l.unit, qty: Number(l.unit_qty), grams: Number(l.grams_per_portion ?? 0) } }
  }
  return { id: l.id, food_id: l.food_id, grams: text(l.grams_per_portion == null ? null : Number(l.grams_per_portion)), ...extra }
}

type Sub = { kind: 'food'; name: string; barcode?: string | null } | { kind: 'scan' } | { kind: 'find' } | null

/** Add a recipe, or change one of your own (REC-03 to REC-05, REC-10): a
 *  name, what it is for (a ready meal too), portions a batch makes, the
 *  ingredients per portion (in order, raw or cooked, with a note; lines of
 *  plain text too), the minutes, the steps, and who can see it. An
 *  ingredient that is not there yet is added as a new food, scanned, or
 *  found in the shops without leaving the recipe. Delete is here too, with
 *  an undo. Saved on this device at once and sent with the next sync. */
export function RecipeEditor({ recipe, lines, foods, userId, onClose, start, onSaved }: {
  /** The recipe to change; none for a new one. */
  recipe: Recipe | null
  /** Its saved ingredient lines. */
  lines: RecipeLine[]
  foods: Map<string, Food>
  userId: string
  onClose: () => void
  /** A new recipe's starting point (a variation of another). */
  start?: RecipeDraft
  onSaved?: (recipe: Recipe) => void
}) {
  const country = useApp((s) => s.profile?.country ?? null)
  const saved = useMemo(() => [...lines].sort((a, b) => a.sort_order - b.sort_order), [lines])
  const current = recipe ? readSharing(recipe) : 'private'
  const [draft, setDraft] = useState<RecipeDraft>(() => start ?? ({
    name: recipe?.name ?? '',
    role: recipe?.role ?? '',
    portions: text(recipe?.portions_per_batch == null ? 1 : Number(recipe.portions_per_batch)),
    minutes: text(recipe?.cook_minutes),
    steps: recipe?.steps ?? '',
    lines: saved.map((l) => lineDraft(l, foods)),
  }))
  const [choice, setChoice] = useState<Choice>(choiceOf(current))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sub, setSub] = useState<Sub>(null)
  const [sure, setSure] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // Foods made while the editor is open (a new one, a scanned product) are
  // on this device at once; the list follows them.
  const liveFoods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const allFoods = useMemo(() => {
    const m = new Map(foods)
    for (const f of liveFoods) m.set(f.id, f)
    return m
  }, [foods, liveFoods])
  const set = (change: Partial<RecipeDraft>) => { setDraft((d) => ({ ...d, ...change })); setError(null) }
  const setLine = (i: number, change: Partial<LineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...change } : l)) }))
  const move = (i: number, by: -1 | 1) => setDraft((d) => {
    const next = [...d.lines]
    const j = i + by
    if (j < 0 || j >= next.length) return d
    ;[next[i], next[j]] = [next[j], next[i]]
    return { ...d, lines: next }
  })

  useEffect(() => {
    if (sub) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, sub])

  const unitsOf = (foodId: string) => readUnits(allFoods.get(foodId)?.units)
  const read = readRecipe(draft, unitsOf)
  const values = 'values' in read ? read.values : null
  const changes = values ? recipeChanges(recipe, saved, values) : null
  const next = nextSharing(current, choice, changes?.contentChanged ?? false)
  // What is set under More options, in a few words, while it is closed.
  const extrasSummary = [draft.minutes.trim() ? `${draft.minutes.trim()} min` : null,
    choice === 'propose' || current !== 'private' ? statusOf({ owner_id: userId, sharing: next }).label : null].filter(Boolean).join(' · ') || null
  const blocking = personalFoods(draft.lines, allFoods)
  const blocked = (next === 'proposed' || next === 'public') && blocking.length > 0
  const nothing = !!recipe && !!changes && Object.keys(changes.fields).length === 0
    && changes.upsert.length === 0 && changes.removed.length === 0 && next === current

  // Each line's grams as the form stands, for the running total.
  const gramsNow = (l: LineDraft) => {
    const r = l.food_id ? lineGrams(l, unitsOf(l.food_id)) : null
    return r && 'grams' in r ? r.grams : 0
  }
  const perPortion = recipeMacros(
    draft.lines.filter((l) => l.food_id).map((l, i) => ({
      id: l.id ?? `new-${i}`, recipe_id: recipe?.id ?? '', food_id: l.food_id, raw_text: null,
      grams_per_portion: gramsNow(l), state: l.state ?? null, sort_order: i,
    })), allFoods)

  /** A food on a new line: counted foods start in their usual unit, "1
   *  onion" being a medium one (UNIT-12). */
  function addFood(f: Food) {
    setDraft((d) => ({ ...d, lines: [...d.lines, { id: null, food_id: f.id, grams: '', unit: defaultUnit(readUnits(f.units))?.name ?? null, note: '' }] }))
    setNote(`${f.name} added. Say how much is in one portion.`)
    setError(null)
  }

  async function scanned(code: string) {
    setSub(null)
    try {
      const have = await foodByBarcode(code, userId)
      if (have) { addFood(have); return }
      const product = await productByBarcode(code, whereFor(country))
      if (product) { addFood((await addProduct(product, userId)).food); return }
      setSub({ kind: 'food', name: '', barcode: code })
      setNote(`No product with barcode ${code} in Open Food Facts: type it in from the label.`)
    } catch {
      setNote('The barcode could not be looked up just now. Try again, or add the food by hand.')
    }
  }

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
      const savedRecipe = Object.keys(fields).length ? await edit('recipe', row, fields) : row
      const byId = new Map(saved.map((l) => [l.id, l]))
      for (const l of changes.upsert) {
        const old = l.id ? byId.get(l.id) : undefined
        // The unit goes with the grams it came to, in the same edit. A line in
        // grams that never had a unit sends no unit columns at all.
        const units = unitColumns({ unit: l.unit ?? null, unit_qty: l.unit_qty ?? null }, !!old?.unit)
        const line = {
          food_id: l.food_id, grams_per_portion: l.grams_per_portion, sort_order: l.sort_order, ...units,
          raw_text: l.raw_text ?? null, state: l.state ?? null, note: l.note ?? null,
        }
        if (old) await edit('recipe_line', old, line)
        else await edit('recipe_line', { id: crypto.randomUUID() } as RecipeLine, { recipe_id: row.id, ...line })
      }
      for (const id of changes.removed) await remove('recipe_line', id)
      onSaved?.(savedRecipe)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  /** Deleted from inside the editor (REC-05), with the Undo bar. Meals
   *  already planned with it stay as they are. */
  async function deleteRecipe() {
    if (!recipe) return
    const row = (await db.recipe.get(recipe.id)) ?? recipe
    await edit('recipe', row, { deleted_at: new Date().toISOString() })
    offerUndo(`Deleted ${recipe.name}`, async () => {
      const back = (await db.recipe.get(recipe.id)) ?? row
      await edit('recipe', back, { deleted_at: null })
    })
    onClose()
  }

  // A sub-sheet takes the editor's place rather than stacking on it; the
  // editor keeps everything typed and comes back when it closes.
  if (sub?.kind === 'food') {
    return <FoodEditor userId={userId} name={sub.name} barcode={sub.barcode} onClose={() => setSub(null)} onSaved={(f) => addFood(f)} />
  }
  if (sub?.kind === 'find') {
    return (
      // A product found in a shop goes straight into the recipe (kept in the
      // person's foods first), with words that say so.
      <ProductFinder start="search" purpose="pick" pickLabel="Add to the recipe" onClose={() => setSub(null)}
        onPick={(f) => { addFood(f); setSub(null) }} />
    )
  }
  if (sub?.kind === 'scan') {
    return (
      <>
        <div className="sheet-scrim" onClick={() => setSub(null)} />
        <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Scan an ingredient">
          <h2>Scan an ingredient</h2>
          <BarcodeScan onCode={(code) => void scanned(code)} onCancel={() => setSub(null)} />
          <div className="sheet-actions"><button type="button" className="btn grow" onClick={() => setSub(null)}>Back to the recipe</button></div>
        </div>
      </>
    )
  }

  const title = recipe ? 'Edit recipe' : start ? 'New variation' : 'New recipe'
  const label = { fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--e-ink-soft)' }
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
              <span style={label}>For</span>
              <Dropdown value={draft.role} options={rolesFor(recipe?.role)} label="What the recipe is for" onChange={(role) => set({ role })} />
            </div>
            <label>
              Portions a batch makes
              <input type="text" inputMode="decimal" value={draft.portions} onChange={(e) => set({ portions: e.target.value })} />
            </label>
          </div>
          {draft.role === 'ready' && (
            <p className="fe-note">One product, eaten as one portion: one line, the pack or its serving.</p>
          )}

          <div className="re-lines" role="group" aria-label="Ingredients, amount per portion">
            <span style={label}>Ingredients · how much in one portion</span>
            {draft.lines.map((l, i) => (
              <Line key={l.id ?? `new-${i}`} line={l} i={i} last={i === draft.lines.length - 1} foods={allFoods}
                onChange={(c) => { setLine(i, c); setError(null) }} onMove={(by) => move(i, by)}
                onRemove={() => set({ lines: draft.lines.filter((_, j) => j !== i) })} />
            ))}
            <IngredientPick foods={[...allFoods.values()]} userId={userId} onPick={addFood}
              onNewFood={(name) => setSub({ kind: 'food', name })}
              onText={(t) => set({ lines: [...draft.lines, { id: null, food_id: null, grams: '', raw_text: t.slice(0, LINE_TEXT_MAX), note: '' }] })}
              onScan={() => setSub({ kind: 'scan' })} onFind={() => setSub({ kind: 'find' })} />
            {note && <p className="fe-note" role="status">{note}</p>}
            {draft.lines.some((l) => l.food_id) && <p className="re-total">One portion: {macroLine(perPortion)}</p>}
          </div>

          <label>
            Steps
            <textarea value={draft.steps} placeholder="optional" maxLength={4000} onChange={(e) => set({ steps: e.target.value })} />
          </label>

          {/* How long it takes and who can see it, in one disclosure, open
              when either is set (CALM-08). */}
          <MoreOptions open={!!extrasSummary} summary={extrasSummary}>
            <div className="form-grid">
              <div className="two">
                <label>
                  Minutes to make
                  <input type="text" inputMode="numeric" value={draft.minutes} placeholder="optional"
                    onChange={(e) => set({ minutes: e.target.value })} />
                </label>
                <span />
              </div>
              <SharingChoice value={choice} onChange={(c) => { setChoice(c); setError(null) }} recipe={recipe}
                effect={sharingEffect(current, next, !recipe)} blocking={blocking} />
            </div>
          </MoreOptions>
          {error && <p className="re-error" role="alert">{error}</p>}
        </div>
        {recipe && (sure ? (
          <div className="fs-actions" role="alertdialog" aria-label="Delete this recipe">
            <p className="fe-note" style={{ flexBasis: '100%' }}>Delete {recipe.name}? Meals already planned with it stay as they are.</p>
            <button type="button" className="btn" onClick={() => setSure(false)}>Keep it</button>
            <button type="button" className="btn fs-danger grow" onClick={() => void deleteRecipe()}>Delete recipe</button>
          </div>
        ) : (
          <button type="button" className="slot-link" style={{ marginTop: 'var(--space-3)' }} onClick={() => setSure(true)}>Delete this recipe…</button>
        ))}
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

/** One ingredient line: its name and tools (move up, move down, remove),
 *  the amount in grams or the food's unit, raw or cooked, and a note. A line
 *  of plain text is its words and, if wanted, grams. Every action is a
 *  visible button with a name. */
function Line({ line: l, i, last, foods, onChange, onMove, onRemove }: {
  line: LineDraft; i: number; last: boolean; foods: Map<string, Food>
  onChange: (c: Partial<LineDraft>) => void; onMove: (by: -1 | 1) => void; onRemove: () => void
}) {
  const food = l.food_id ? foods.get(l.food_id) : undefined
  const name = food ? food.name : l.food_id ? 'A food not on this device' : (l.raw_text || 'A line of text')
  const units = readUnits(food?.units)
  const kept = l.saved ? { name: l.saved.unit, g: l.saved.qty > 0 ? l.saved.grams / l.saved.qty : 0 } : null
  const choices = amountChoices(units, { keep: kept && kept.g > 0 ? kept : null, perMl: food?.per_ml ? 1 : food?.density ? Number(food.density) : null })
  const choice = l.unit ? choices.find((c) => c.unit && c.unit.name.toLowerCase() === l.unit!.toLowerCase()) : choices[0]
  const got = l.food_id ? lineGrams(l, units) : null
  const hint = got && 'grams' in got && choice
    ? (got.unit ? entryText({ grams: got.grams, unit: got.unit, unit_qty: got.unit_qty }, units) : gramsLabel(got.grams))
    : ''
  const what = choice?.unit ? unitWord(choice.unit, 2) : 'grams'
  const canCook = !!food && (food.cook_yield ?? 0) > 0 && Number(food.cook_yield) !== 1
  return (
    <div className="rl">
      <div className="rl-head">
        <span className="rl-name">
          {food || l.food_id ? name : <input className="rl-text" value={l.raw_text ?? ''} maxLength={LINE_TEXT_MAX} aria-label={`Line ${i + 1}, text`}
            onChange={(e) => onChange({ raw_text: e.target.value })} style={{ width: '100%' }} />}
          {food?.owner_id && <span className="row-chip">mine</span>}
        </span>
        <button type="button" className="rl-tool" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="rl-tool" aria-label={`Move ${name} down`} disabled={last} onClick={() => onMove(1)}>↓</button>
        <button type="button" className="re-remove" aria-label={`Remove ${name}`} onClick={onRemove}>×</button>
      </div>
      <div className="rl-amount">
        {l.food_id ? (
          <>
            <AmountInput text={l.grams} choice={choice?.key ?? 'g'} choices={choices} label={`${name}, ${what} per portion`}
              input={{ placeholder: choice?.unit ? 'how many' : 'g' }}
              onText={(t) => onChange({ grams: t })}
              onChoice={(key) => onChange({ unit: choices.find((c) => c.key === key)?.unit?.name ?? null })} />
            {canCook && (
              <div className="rl-state amt-units" role="group" aria-label={`${name}: weighed raw or cooked`}>
                <button type="button" aria-pressed={l.state !== 'cooked'} onClick={() => onChange({ state: 'raw' })}>raw</button>
                <button type="button" aria-pressed={l.state === 'cooked'} onClick={() => onChange({ state: 'cooked' })}>cooked</button>
              </div>
            )}
            <span className="amt-hint" aria-live="polite">
              {hint}{l.state === 'cooked' && canCook ? ` cooked, about ${gramsLabel((got && 'grams' in got ? got.grams : 0) / Number(food!.cook_yield))} raw` : ''}
            </span>
          </>
        ) : (
          <input className="rl-grams" inputMode="decimal" value={l.grams} placeholder="g" aria-label={`${name}, grams per portion, optional`}
            onChange={(e) => onChange({ grams: e.target.value })} />
        )}
      </div>
      {l.food_id && (
        <input className="rl-note" value={l.note ?? ''} maxLength={LINE_TEXT_MAX} placeholder="Note, e.g. finely chopped"
          aria-label={`${name}, note`} onChange={(e) => onChange({ note: e.target.value })} />
      )}
    </div>
  )
}
