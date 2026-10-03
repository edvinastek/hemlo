import { useEffect, useId, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { shownNutrients } from '../lib/quick-food'
import {
  attributionFor, figureName, figureText, shownFigures, type LabelKey,
} from '../lib/eu-label-rules'
import { useNutritionPrefs } from '../lib/nutrition-prefs'
import { formatCount, gramsLabel, readQty } from '../lib/units-rules'
import { readSharing } from '../lib/sharing-rules'
import {
  isReady, readyProduct, recipeFigures, roleLabel, scaleLines, toBuy, type ScaledLine,
} from '../lib/recipe-rules'
import { toCsv, toGetItJson, toSchemaOrg, type ExportRecipe } from '../lib/recipe-io-rules'
import { recipeToNote } from '../lib/recipe-note-rules'
import { blankTask, saveTask } from '../lib/tasks'
import { SLOTS, planMeal, planQuick, slotsFor, type SlotKey } from '../lib/meals'
import { stockMap } from '../lib/stock'
import { saveFile } from '../lib/native'
import { addToShoppingList } from '../lib/recipe-actions'
import { search } from '../lib/search-rules'
import { SharingStatus } from './SharingChoice'
import { Dropdown } from './Dropdown'
import { FoodUnitsSheet } from './FoodUnits'
import { offerUndo } from './Undo'
import type { Food, Recipe, RecipeLine, Task } from '../lib/types'
import './recipes.css'
import './sharing.css'

type Panel = null | 'task' | 'meal' | 'shop' | 'export' | 'food'

const round1 = (n: number) => Math.round(n * 10) / 10
const qtyText = (n: number) => String(Math.round(n * 100) / 100)

/** An amount as a recipe page shows it: "2 eggs (100 g)", "75 g", "75 g
 *  cooked", or nothing for a line without one. */
function amountOf(l: ScaledLine): string {
  if (l.grams === null) return ''
  const cooked = l.state === 'cooked' ? ' cooked' : ''
  return l.count ? `${formatCount(l.count.qty, l.count.unit)} (${gramsLabel(l.grams)}${cooked})` : `${gramsLabel(l.grams)}${cooked}`
}

/** The recipe in the shape the export formats take: amounts a portion. */
export function exportShape(r: Recipe, lines: RecipeLine[], foods: Map<string, Food>, keys: LabelKey[]): ExportRecipe {
  const own = lines.filter((l) => l.recipe_id === r.id).sort((a, b) => a.sort_order - b.sort_order)
  const fig = recipeFigures(own, foods, keys, 1)
  return {
    name: r.name, role: r.role ?? null, portions: Number(r.portions_per_batch) || 1, minutes: r.cook_minutes ?? null, steps: r.steps ?? null,
    lines: own.map((l) => {
      const f = l.food_id ? foods.get(l.food_id) : undefined
      return {
        text: l.raw_text ?? f?.name ?? '', food: f?.name ?? null, nevo_code: f?.nevo_code ?? null,
        grams_per_portion: l.grams_per_portion == null ? null : Number(l.grams_per_portion), unit: l.unit ?? null,
        unit_qty: l.unit_qty == null ? null : Number(l.unit_qty), state: l.state ?? null, note: l.note ?? null,
      }
    }),
    per_portion: Object.fromEntries(keys.filter((k) => fig[k] && fig[k].missing === 0).map((k) => [k, round1(fig[k].value)])),
  }
}

/** A recipe's own page (REC-02): every recipe can be read in full, shared
 *  ones included: what it is for, its ingredients with amounts in their
 *  units, scaled to any number of portions (REC-06), the steps, and its
 *  figures a portion and for the portions shown. From here: change it (own
 *  ones), make a variation, put it in a task's note, plan it as a meal, put
 *  what is missing on the shopping list, copy or export it (REC-20). */
export function RecipeView({ recipe: given, lines, foods, userId, onClose, onEdit, onVariation }: {
  recipe: Recipe
  lines: RecipeLine[]
  foods: Map<string, Food>
  userId: string | null
  onClose: () => void
  onEdit: (r: Recipe) => void
  onVariation: (r: Recipe) => void
}) {
  const profile = useApp((s) => s.profile)
  const recipe = useLiveQuery(() => db.recipe.get(given.id), [given.id]) ?? given
  const own = useMemo(() => lines.filter((l) => l.recipe_id === recipe.id), [lines, recipe.id])
  const batch = Number(recipe.portions_per_batch) > 0 ? Number(recipe.portions_per_batch) : 1
  const [portionsText, setPortionsText] = useState(String(batch))
  const portions = readQty(portionsText) || batch
  const [panel, setPanel] = useState<Panel>(null)
  const [done, setDone] = useState<string | null>(null)
  const prefs = useNutritionPrefs()
  const titleId = useId()
  const mine = !!userId && recipe.owner_id === userId
  const scaled = scaleLines(recipe.id, own, foods, portions)
  const keys = shownFigures(shownNutrients(readSettings(profile)).filter((k) => k !== 'kcal'), prefs.label.figures).filter((k) => k !== 'kcal')
  const perPortion = recipeFigures(own, foods, ['kcal', ...keys], 1)
  const forShown = recipeFigures(own, foods, ['kcal', ...keys], portions)
  const attribution = attributionFor(own.flatMap((l) => (l.food_id && foods.get(l.food_id) ? [foods.get(l.food_id)!] : [])))
  const ready = readyProduct(recipe, own, foods)

  useEffect(() => {
    if (panel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, panel])

  if (panel === 'food' && ready?.food) return <FoodUnitsSheet food={ready.food} onClose={() => setPanel(null)} />

  const step = (by: number) => setPortionsText(qtyText(Math.max(0.25, Math.min(999, Math.round((portions + by) * 4) / 4))))
  const sharing = readSharing(recipe)
  const back = () => setPanel(null)
  const close = (said: string) => { setDone(said); setPanel(null) }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet rcp" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{recipe.name}</h2>
        <p className="rcp-sub">
          {[roleLabel(recipe.role), `${qtyText(batch)} ${batch === 1 ? 'portion' : 'portions'} a batch`, recipe.cook_minutes ? `${recipe.cook_minutes} min` : null].filter(Boolean).join(' · ')}
          {' · '}
          {mine ? <SharingStatus recipe={recipe} withNote={false} /> : recipe.owner_id ? 'Shared by someone' : 'GetIt’s recipe'}
        </p>
        {mine && sharing === 'rejected' && recipe.review_note && <p className="rcp-warn">Not accepted: {recipe.review_note}</p>}

        {panel === 'task' && profile && <TaskPanel recipe={recipe} scaled={scaled} portions={portions} figures={perPortion} keys={keys} profileId={profile.id} onBack={back} onDone={close} />}
        {panel === 'meal' && profile && <MealPanel recipe={recipe} profileId={profile.id} onBack={back} onDone={close} />}
        {panel === 'shop' && profile && <ShopPanel recipe={recipe} scaled={scaled} portions={portions} profile={profile} onBack={back} onDone={close} />}
        {panel === 'export' && <ExportPanel shape={exportShape(recipe, lines, foods, ['kcal', ...keys])} attribution={attribution} onBack={back} onDone={close} />}

        {!panel && (
          <>
            {ready && (
              <p className="fe-note">
                A ready meal: one portion is {ready.food ? ready.food.name : 'a product not on this device'}
                {ready.grams ? `, ${gramsLabel(ready.grams)}` : ''}.{' '}
                {ready.food && <button type="button" className="slot-link" onClick={() => setPanel('food')}>Open the product</button>}
              </p>
            )}
            {!isReady(recipe) && (
              <div className="rcp-scale" role="group" aria-label="Portions to show">
                <span>Amounts for</span>
                <button type="button" className="btn" aria-label="Fewer portions" onClick={() => step(-1)}>−</button>
                <input inputMode="decimal" value={portionsText} aria-label="Portions" onChange={(e) => setPortionsText(e.target.value)} />
                <button type="button" className="btn" aria-label="More portions" onClick={() => step(1)}>+</button>
                <span>{portions === 1 ? 'portion' : 'portions'}</span>
                {portions !== batch && <button type="button" className="slot-link" onClick={() => setPortionsText(String(batch))}>One batch</button>}
              </div>
            )}

            <p className="rcp-section">Ingredients</p>
            {scaled.length === 0 ? <p className="fe-note">No ingredients listed.</p> : (
              <ul className="rcp-lines">
                {scaled.map((l) => (
                  <li key={l.id}>
                    <span>{l.said ?? l.name}</span>
                    <span className="rcp-amount">{amountOf(l)}</span>
                    {/* What the recipe calls it, and the food it counts as. */}
                    {(l.note || (l.said && l.food && l.said !== l.food.name)) && (
                      <span className="rcp-note">{[l.said && l.food && l.said !== l.food.name ? l.food.name : null, l.note].filter(Boolean).join(' · ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <table className="rcp-figures">
              <thead>
                <tr><th scope="col"><span className="visually-hidden">Figure</span></th><th scope="col">A portion</th>
                  {portions !== 1 && <th scope="col">{qtyText(portions)} portions</th>}</tr>
              </thead>
              <tbody>
                {(['kcal', ...keys] as LabelKey[]).map((k) => {
                  const unit = k === 'kcal' ? 'kcal' : 'g'
                  const a = perPortion[k]
                  const b = forShown[k]
                  const mark = a.missing ? ' *' : ''
                  return (
                    <tr key={k}>
                      <th scope="row">{k === 'kcal' ? 'Energy' : figureName(k)}</th>
                      <td>{figureText(a.value, unit, k)}{mark}</td>
                      {portions !== 1 && <td>{figureText(b.value, unit, k)}{mark}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {(['kcal', ...keys] as LabelKey[]).some((k) => (perPortion[k]?.missing ?? 0) > 0) && (
              <p className="fe-note">* Some ingredients do not give this figure, so the real amount is higher.</p>
            )}

            {recipe.steps?.trim() && (<><p className="rcp-section">Steps</p><p className="rcp-steps">{recipe.steps.trim()}</p></>)}
            {attribution && <p className="rcp-credit">{attribution}.</p>}
            {done && <p className="rcp-done" role="status">{done}</p>}

            <div className="rcp-actions">
              {mine && <button type="button" className="btn btn-primary" onClick={() => onEdit(recipe)}>Edit</button>}
              {userId && <button type="button" className="btn" onClick={() => onVariation(recipe)}>Make a variation</button>}
              {profile && <button type="button" className="btn" onClick={() => setPanel('task')}>Add to a task’s note</button>}
              {profile && <button type="button" className="btn" onClick={() => setPanel('meal')}>Plan as a meal</button>}
              {profile && !isReady(recipe) && <button type="button" className="btn" onClick={() => setPanel('shop')}>Add to shopping list</button>}
              <button type="button" className="btn" onClick={() => setPanel('export')}>Export</button>
              <button type="button" className="btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** Into a task's note (REC-20, NOT-20): the ingredients as a checklist for
 *  the portions shown, the steps and the figures, with a line that links back
 *  to the recipe. A new task on a day, or one already planned. */
function TaskPanel({ recipe, scaled, portions, figures, keys, profileId, onBack, onDone }: {
  recipe: Recipe; scaled: ScaledLine[]; portions: number; figures: Record<string, { value: number; missing: number }>; keys: LabelKey[]
  profileId: string; onBack: () => void; onDone: (said: string) => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [into, setInto] = useState<'new' | 'existing'>('new')
  const [title, setTitle] = useState(recipe.name)
  const [day, setDay] = useState(today)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Task | null>(null)
  const [opts, setOpts] = useState({ ingredients: true, steps: true, figures: true })
  const tasks = useLiveQuery(async () => (await db.task.where('profile_id').equals(profileId).toArray())
    .filter((t) => !t.deleted_at && t.status !== 'done' && (!t.planned_date || t.planned_date >= today)), [profileId], [] as Task[])
  const found = search(tasks.map((t) => ({ t, name: t.title, extra: t.planned_date ?? '' })), query).slice(0, 8)

  const figureLine = `One portion: ${(['kcal', ...keys] as LabelKey[]).map((k) => `${k === 'kcal' ? Math.round(figures[k]?.value ?? 0) + ' kcal' : `${round1(figures[k]?.value ?? 0)} g ${figureName(k).toLowerCase()}`}`).join(' · ')}`
  const block = recipeToNote({ id: recipe.id, name: recipe.name, portions_per_batch: recipe.portions_per_batch, steps: recipe.steps },
    scaled.map((l) => ({ name: l.food?.name ?? l.name, grams_per_portion: l.grams === null ? null : l.grams / portions, unit: l.count?.unit.name ?? null,
      unit_qty: l.count ? l.count.qty / portions : null, units: l.food?.units, raw_text: l.food ? null : l.name })),
    { portions, ingredients: opts.ingredients, steps: opts.steps, figures: opts.figures ? figureLine : null })

  async function add() {
    if (into === 'new') {
      const t = await saveTask(blankTask(profileId, day, { title: title.trim() || recipe.name, notes: block, category: 'Meal', module_key: 'nutrition' }))
      offerUndo('Task added', () => saveTask({ ...t, deleted_at: new Date().toISOString() }, ['deleted_at']))
      onDone(`Added to a new task, “${t.title}”, on ${format(new Date(`${day}T12:00:00`), 'EEE d MMM')}.`)
    } else if (picked) {
      const before = picked.notes
      const t = await saveTask({ ...picked, notes: before?.trim() ? `${before.trimEnd()}\n\n${block}` : block }, ['notes'])
      offerUndo('Added to the note', () => saveTask({ ...t, notes: before }, ['notes']))
      onDone(`Added to the note of “${picked.title}”.`)
    }
  }

  return (
    <div className="rcp-choice form-grid">
      <p className="rcp-section">Add to a task’s note · {qtyText(portions)} {portions === 1 ? 'portion' : 'portions'}</p>
      <div className="amt-units" role="group" aria-label="Which task">
        <button type="button" aria-pressed={into === 'new'} onClick={() => setInto('new')}>A new task</button>
        <button type="button" aria-pressed={into === 'existing'} onClick={() => setInto('existing')}>A task I have</button>
      </div>
      {into === 'new' ? (
        <div className="two">
          <label>Task<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Day<input type="date" value={day} onChange={(e) => setDay(e.target.value || today)} /></label>
        </div>
      ) : (
        <>
          <label>Find the task<input type="search" value={query} placeholder="Type a task’s name" onChange={(e) => { setQuery(e.target.value); setPicked(null) }} /></label>
          <ul className="rcp-list" aria-label="Tasks">
            {found.map(({ t }) => (
              <li key={t.id}>
                <button type="button" className="slot-link" aria-pressed={picked?.id === t.id} onClick={() => setPicked(t)}>{t.title}</button>
                <span>{t.planned_date ? format(new Date(`${t.planned_date}T12:00:00`), 'EEE d MMM') : 'no day'}</span>
              </li>
            ))}
            {found.length === 0 && <li><span className="fe-note">No open task found.</span></li>}
          </ul>
        </>
      )}
      <div>
        {(['ingredients', 'steps', 'figures'] as const).map((k) => (
          <label key={k} className="rcp-check"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
            {k === 'ingredients' ? 'Ingredients as a checklist' : k === 'steps' ? 'Steps' : 'Figures a portion'}</label>
        ))}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary grow" disabled={into === 'existing' && !picked} onClick={() => void add()}>Add to the note</button>
      </div>
    </div>
  )
}

/** Plan it as a meal on a day (REC-20), through the meal plan as it is. */
function MealPanel({ recipe, profileId, onBack, onDone }: { recipe: Recipe; profileId: string; onBack: () => void; onDone: (said: string) => void }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [day, setDay] = useState(today)
  const [slot, setSlot] = useState<SlotKey>(recipe.role === 'breakfast' || recipe.role === 'lunch' || recipe.role === 'snack' || recipe.role === 'dinner' ? recipe.role : 'dinner')
  const [portions, setPortions] = useState('1')
  const there = useLiveQuery(async () => (await slotsFor(profileId, day)).find((s) => s.slot === slot), [profileId, day, slot])
  const thereName = useLiveQuery(async () => (there?.recipe_id ? (await db.recipe.get(there.recipe_id))?.name : there?.label ?? (there?.kcal != null ? 'numbers' : null)) ?? null, [there?.id, there?.recipe_id])
  const n = readQty(portions)

  async function plan() {
    if (!n || n <= 0) return
    const before = there
    await planMeal(profileId, day, slot, recipe.id, n)
    const label = SLOTS.find((s) => s.key === slot)!.label
    offerUndo(`Planned for ${label.toLowerCase()}`, async () => {
      if (before?.recipe_id) await planMeal(profileId, day, slot, before.recipe_id, before.portion_multiplier)
      else if (before && before.kcal != null) {
        await planQuick(profileId, day, slot, {
          label: before.label ?? null, kcal: Number(before.kcal), grams: before.grams ?? null, protein_g: before.protein_g ?? null,
          carbs_g: before.carbs_g ?? null, fat_g: before.fat_g ?? null, fiber_g: before.fiber_g ?? null,
        })
      } else await planMeal(profileId, day, slot, null)
    })
    onDone(`Planned for ${label.toLowerCase()} on ${format(new Date(`${day}T12:00:00`), 'EEE d MMM')}.`)
  }

  return (
    <div className="rcp-choice form-grid">
      <p className="rcp-section">Plan as a meal</p>
      <div className="two">
        <label>Day<input type="date" value={day} onChange={(e) => setDay(e.target.value || today)} /></label>
        <label>Portions<input inputMode="decimal" value={portions} onChange={(e) => setPortions(e.target.value)} /></label>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span className="fe-note">Meal</span>
        <Dropdown<SlotKey> value={slot} options={SLOTS.map((s) => ({ value: s.key, label: s.label }))} label="Meal" onChange={setSlot} />
      </div>
      {there && thereName && there.recipe_id !== recipe.id && <p className="rcp-warn">This takes the place of {thereName} planned then.</p>}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary grow" disabled={!n || n <= 0} onClick={() => void plan()}>Plan it</button>
      </div>
    </div>
  )
}

/** What the recipe needs for the portions shown, less what is in the
 *  cupboard, onto the household's shopping list (REC-20). A food already
 *  on the list (not ticked) gets the amount added to it. */
function ShopPanel({ recipe, scaled, portions, profile, onBack, onDone }: {
  recipe: Recipe; scaled: ScaledLine[]; portions: number; profile: { id: string; household_id: string }
  onBack: () => void; onDone: (said: string) => void
}) {
  const stock = useLiveQuery(() => stockMap(profile.household_id), [profile.household_id])
  const plan = stock ? toBuy(scaled, stock) : null
  const text = scaled.filter((l) => !l.food && l.name)

  async function add() {
    if (!plan) return
    const { count: n, undo } = await addToShoppingList(plan.buy, profile.household_id, profile.id, `For ${recipe.name}`)
    offerUndo('Added to the shopping list', undo)
    onDone(`${n} ${n === 1 ? 'item' : 'items'} on the shopping list${plan.inStock.length ? `; ${plan.inStock.length} already in the cupboard` : ''}.`)
  }

  return (
    <div className="rcp-choice">
      <p className="rcp-section">To buy for {qtyText(portions)} {portions === 1 ? 'portion' : 'portions'}</p>
      {!plan ? <p className="fe-note">Looking in the cupboard…</p> : (
        <>
          {plan.buy.length === 0 ? <p className="fe-note">Everything is in the cupboard already.</p> : (
            <ul className="rcp-list">
              {plan.buy.map((b) => (
                <li key={b.food_id ?? b.name}>
                  <span>{b.name}</span>
                  <span>{b.count ? `${b.count.qty} × ${b.count.unit} (${gramsLabel(b.grams ?? 0)})` : gramsLabel(b.grams ?? 0)}{b.from_stock ? ` · ${gramsLabel(b.from_stock)} in stock` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          {plan.inStock.length > 0 && <p className="fe-note">In the cupboard already: {plan.inStock.join(', ')}.</p>}
          {text.length > 0 && <p className="fe-note">Not added, as they have no food: {text.map((l) => l.name).join(', ')}.</p>}
        </>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary grow" disabled={!plan || plan.buy.length === 0} onClick={() => void add()}>
          Add {plan?.buy.length ?? ''} to the list
        </button>
      </div>
    </div>
  )
}

/** Export one recipe (DATA-05): GetIt's own file (everything, to read back
 *  in), a spreadsheet, or schema.org Recipe for other apps and sites. */
function ExportPanel({ shape, attribution, onBack, onDone }: { shape: ExportRecipe; attribution: string | null; onBack: () => void; onDone: (said: string) => void }) {
  const base = shape.name.replace(/[^\w -]+/g, '').trim().slice(0, 60) || 'recipe'
  async function save(kind: 'json' | 'csv' | 'schema') {
    const body = kind === 'json' ? toGetItJson([shape], attribution) : kind === 'csv' ? toCsv([shape]) : JSON.stringify(toSchemaOrg(shape, attribution), null, 2)
    const type = kind === 'csv' ? 'text/csv' : 'application/json'
    const name = kind === 'json' ? `${base}.getit-recipe.json` : kind === 'csv' ? `${base}.csv` : `${base}.schema.json`
    const how = await saveFile(name, new Blob([body], { type }))
    if (how !== 'cancelled') onDone(`Exported ${name}.`)
  }
  return (
    <div className="rcp-choice">
      <p className="rcp-section">Export</p>
      <div className="rcp-actions">
        <button type="button" className="btn" onClick={() => void save('json')}>GetIt recipe file</button>
        <button type="button" className="btn" onClick={() => void save('csv')}>Spreadsheet (CSV)</button>
        <button type="button" className="btn" onClick={() => void save('schema')}>schema.org Recipe</button>
      </div>
      {attribution && <p className="rcp-credit">The file says: {attribution}.</p>}
      <div className="sheet-actions"><button type="button" className="btn grow" onClick={onBack}>Back</button></div>
    </div>
  )
}
