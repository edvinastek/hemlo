import { useId, useMemo, useRef, useState } from 'react'
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
import { MICROS, microText, nrvPercent, partsMicros } from '../lib/micros-rules'
import { rawGrams } from '../lib/calc'
import { formatCount, gramsLabel, readQty } from '../lib/units-rules'
import { readSharing, statusOf } from '../lib/sharing-rules'
import {
  isReady, readyProduct, recipeFigures, roleLabel, scaleLines, toBuy, type ScaledLine,
} from '../lib/recipe-rules'
import { toCsv, toHemloJson, toSchemaOrg, type ExportRecipe } from '../lib/recipe-io-rules'
import { recipeToNote } from '../lib/recipe-note-rules'
import { blankTask, saveTask } from '../lib/tasks'
import { addItems, removeItems } from '../lib/meals'
import { stockMap } from '../lib/stock'
import { saveFile } from '../lib/native'
import { addToShoppingList } from '../lib/recipe-actions'
import { search } from '../lib/search-rules'
import { SharingStatus } from './SharingChoice'
import { RecipeCook } from './RecipeCook'
import { usePhotoUrl } from '../modules/photos'
import { removeRecipePhoto, restoreRecipePhoto, setRecipePhoto } from '../lib/recipe-photo'
import { splitSteps } from '../lib/cook-rules'
import { Dropdown } from './Dropdown'
import { MoreMenu } from './MoreMenu'
import { FoodUnitsSheet } from './FoodUnits'
import { offerUndo } from './Undo'
import type { Food, Recipe, RecipeLine, Task } from '../lib/types'
import './recipes.css'
import './sharing.css'
import { useBackClose } from './useBackClose'
import { planToday } from '../lib/day-edge'

type Panel = null | 'task' | 'meal' | 'shop' | 'export' | 'food' | 'cook' | 'photo'

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
 *  figures a portion and for the portions shown. Its main action, Plan as a
 *  meal, is at the foot; the rest are in the ⋮ by its name (v17): change it
 *  (own ones), make a variation, put it in a task's note, put what is
 *  missing on the shopping list, export it (REC-20). */
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
  // Vitamins and minerals the person shows (FOOD-17), a portion.
  const microParts = own.map((l) => { const f = l.food_id ? foods.get(l.food_id) : undefined; return { food: f, grams: rawGrams(l, f) } })
  const microSum = prefs.micros.length ? partsMicros(microParts, prefs.micros) : null
  const attribution = attributionFor(own.flatMap((l) => (l.food_id && foods.get(l.food_id) ? [foods.get(l.food_id)!] : [])))
  const ready = readyProduct(recipe, own, foods)

  // Back and Escape close the page (CALM-10); an open ⋮ takes Escape first.
  useBackClose(onClose, !panel)

  if (panel === 'food' && ready?.food) return <FoodUnitsSheet food={ready.food} onClose={() => setPanel(null)} />
  // Cook mode takes the page's place (never a sheet on a sheet), for the portions shown.
  if (panel === 'cook') {
    return <RecipeCook recipe={recipe} portions={portions} onClose={() => setPanel(null)}
      lines={scaled.map((l) => ({ id: l.id, name: l.said ?? l.name, amount: amountOf(l) }))} />
  }

  const step = (by: number) => setPortionsText(qtyText(Math.max(0.25, Math.min(999, Math.round((portions + by) * 4) / 4))))
  const sharing = readSharing(recipe)
  const back = () => setPanel(null)
  const close = (said: string) => { setDone(said); setPanel(null) }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet rcp" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="rcp-head">
          <h2 id={titleId}>{recipe.name}</h2>
          {!panel && (
            <MoreMenu className="rcp-more" label={`More for ${recipe.name}`} items={[
              splitSteps(recipe.steps).length > 0 && { label: 'Cook', onSelect: () => setPanel('cook') },
              mine && { label: 'Edit', onSelect: () => onEdit(recipe) },
              mine && { label: recipe.photo_path ? 'Change photo…' : 'Add a photo…', onSelect: () => setPanel('photo') },
              !!userId && { label: 'Make a variation', onSelect: () => onVariation(recipe) },
              !!profile && { label: 'Add to a task’s note', onSelect: () => setPanel('task') },
              !!profile && !isReady(recipe) && { label: 'Add to shopping list', onSelect: () => setPanel('shop') },
              { label: 'Export…', onSelect: () => setPanel('export') },
            ]} />
          )}
        </div>
        <p className="rcp-sub">
          {[roleLabel(recipe.role), `${qtyText(batch)} ${batch === 1 ? 'portion' : 'portions'} a batch`, recipe.cook_minutes ? `${recipe.cook_minutes} min` : null].filter(Boolean).join(' · ')}
          {/* Who can see it, only when it is not the usual: one's own recipes
              are private unless proposed (v17: no "Private" chip). */}
          {mine ? (statusOf(recipe).tone !== 'plain' && <> · <SharingStatus recipe={recipe} withNote={false} /></>)
            : <> · {recipe.owner_id ? 'Shared by someone' : 'Hemlo’s recipe'}</>}
        </p>
        {mine && sharing === 'rejected' && recipe.review_note && <p className="rcp-warn">Not accepted: {recipe.review_note}</p>}
        {recipe.photo_path && (!panel || panel === 'photo') && <RecipePhoto path={recipe.photo_path} name={recipe.name} />}
        {panel === 'photo' && <PhotoPanel recipe={recipe} onBack={back} onDone={close} />}

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
            {microSum && (
              <table className="rcp-figures rcp-micros">
                <thead><tr><th scope="col"><span className="visually-hidden">Nutrient</span></th><th scope="col">A portion</th><th scope="col">%NRV</th></tr></thead>
                <tbody>
                  {MICROS.filter((m) => prefs.micros.includes(m.code)).map((m) => {
                    const v = microSum.total[m.code] ?? null
                    const mark = microSum.missing[m.code] ? ' *' : ''
                    const pct = nrvPercent(m.code, v)
                    return (
                      <tr key={m.code}>
                        <th scope="row">{m.name}</th>
                        <td>{microText(m.code, v)}{v !== null ? mark : ''}</td>
                        <td>{pct === null ? '' : `${pct}%`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {((['kcal', ...keys] as LabelKey[]).some((k) => (perPortion[k]?.missing ?? 0) > 0)
              || (microSum && prefs.micros.some((c) => microSum.missing[c] && microSum.total[c] !== undefined))) && (
              <p className="fe-note">* Some ingredients do not give this figure, so the real amount is higher.</p>
            )}

            {recipe.steps?.trim() && (<><p className="rcp-section">Steps</p><p className="rcp-steps">{recipe.steps.trim()}</p></>)}
            {attribution && <p className="rcp-credit">{attribution}.</p>}
            {done && <p className="rcp-done" role="status">{done}</p>}

            <div className="sheet-actions">
              <button type="button" className="btn" onClick={onClose}>Close</button>
              {profile && <button type="button" className="btn btn-primary grow" onClick={() => setPanel('meal')}>Plan as a meal</button>}
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** The recipe's photo (REC-11): from this device's copy, so it shows
 *  offline once seen; a quiet line while one not yet here is fetched. */
function RecipePhoto({ path, name }: { path: string; name: string }) {
  const url = usePhotoUrl(path)
  if (url === undefined) return null
  return (
    <div className="rcp-photo">
      {url ? <img src={url} alt={`${name}, photo`} /> : <span className="fe-note">The photo shows once there is a connection.</span>}
    </div>
  )
}

/** Add, change or take off the photo (REC-11): with the camera or from the
 *  files, made smaller on the device. Taking it off can be undone. */
function PhotoPanel({ recipe, onBack, onDone }: { recipe: Recipe; onBack: () => void; onDone: (said: string) => void }) {
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function take(file: File | undefined) {
    if (!file) return
    setBusy(true); setProblem(null)
    try {
      const said = await setRecipePhoto(recipe, file)
      if (said) setProblem(said)
      else onDone('Photo saved.')
    } finally { setBusy(false) }
  }
  async function takeOff() {
    const before = recipe.photo_path ?? null
    await removeRecipePhoto(recipe)
    offerUndo('Photo taken off', () => restoreRecipePhoto(recipe, before))
    onDone('Photo taken off.')
  }
  return (
    <div className="rcp-choice">
      <p className="rcp-section">{recipe.photo_path ? 'Change the photo' : 'Add a photo'}</p>
      <div className="rcp-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => camera.current?.click()}>Take a photo</button>
        <button type="button" className="btn" disabled={busy} onClick={() => files.current?.click()}>Choose a photo</button>
        {recipe.photo_path && <button type="button" className="btn" disabled={busy} onClick={() => void takeOff()}>Take it off</button>}
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={files} type="file" accept="image/*" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }} />
      {busy && <p className="fe-note" role="status">Making the photo smaller…</p>}
      {problem && <p className="rcp-warn" role="alert">{problem}</p>}
      <div className="sheet-actions"><button type="button" className="btn grow" onClick={onBack}>Back</button></div>
    </div>
  )
}

/** How many tasks the picker lists before "Show all" (GEN-10). */
const PICK_LIMIT = 20

/** Into a task's note (REC-20, NOT-20): the ingredients as a checklist for
 *  the portions shown, the steps and the figures, with a line that links back
 *  to the recipe. A new task on a day, or one already planned. */
function TaskPanel({ recipe, scaled, portions, figures, keys, profileId, onBack, onDone }: {
  recipe: Recipe; scaled: ScaledLine[]; portions: number; figures: Record<string, { value: number; missing: number }>; keys: LabelKey[]
  profileId: string; onBack: () => void; onDone: (said: string) => void
}) {
  const today = planToday()
  const [into, setInto] = useState<'new' | 'existing'>('new')
  const [title, setTitle] = useState(recipe.name)
  const [day, setDay] = useState(today)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Task | null>(null)
  const [opts, setOpts] = useState({ ingredients: true, steps: true, figures: true })
  const tasks = useLiveQuery(async () => (await db.task.where('profile_id').equals(profileId).toArray())
    .filter((t) => !t.deleted_at && t.status !== 'done' && (!t.planned_date || t.planned_date >= today)), [profileId], [] as Task[])
  // THE search (GEN-10): the best 20, and "Show all" for the rest.
  const [showAll, setShowAll] = useState(false)
  const matches = search(tasks.map((t) => ({ t, name: t.title, extra: t.planned_date ?? '' })), query)
  const found = showAll ? matches : matches.slice(0, PICK_LIMIT)

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
          <label>Find the task<input type="search" value={query} placeholder="Type a task’s name" onChange={(e) => { setQuery(e.target.value); setPicked(null); setShowAll(false) }} /></label>
          <ul className="rcp-list" aria-label="Tasks">
            {found.map(({ t }) => (
              <li key={t.id}>
                <button type="button" className="slot-link" aria-pressed={picked?.id === t.id} onClick={() => setPicked(t)}>{t.title}</button>
                <span>{t.planned_date ? format(new Date(`${t.planned_date}T12:00:00`), 'EEE d MMM') : 'no day'}</span>
              </li>
            ))}
            {found.length === 0 && <li><span className="fe-note">No open task found.</span></li>}
            {matches.length > found.length && (
              <li><button type="button" className="slot-link" onClick={() => setShowAll(true)}>Show all {matches.length}</button></li>
            )}
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

/** Plan it as a meal on a day (REC-20): added to one of the person's own
 *  meals (or to no meal), next to whatever is planned there already. */
function MealPanel({ recipe, profileId, onBack, onDone }: { recipe: Recipe; profileId: string; onBack: () => void; onDone: (said: string) => void }) {
  const today = planToday()
  const profile = useApp((s) => s.profile)
  const meals = readSettings(profile).meals.names
  const guess = meals.find((m) => m.key === recipe.role || m.name.toLowerCase() === recipe.role)?.key ?? meals[0]?.key ?? ''
  const [day, setDay] = useState(today)
  const [meal, setMeal] = useState<string>(guess)
  const [portions, setPortions] = useState('1')
  const n = readQty(portions)
  const options = [...meals.map((m) => ({ value: m.key, label: m.name })), { value: '', label: 'No meal' }]
  const name = meals.find((m) => m.key === meal)?.name ?? null

  async function plan() {
    if (!n || n <= 0) return
    const time = meals.find((m) => m.key === meal)?.time ?? null
    const made = await addItems(profileId, day, { meal, time }, [{ recipe_id: recipe.id, portion_multiplier: n }], false)
    const when = format(new Date(`${day}T12:00:00`), 'EEE d MMM')
    offerUndo(name ? `Planned for ${name.toLowerCase()}` : 'Planned', () => removeItems(made))
    onDone(name ? `Planned for ${name.toLowerCase()} on ${when}.` : `Planned on ${when}.`)
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
        <Dropdown<string> value={meal} options={options} label="Meal" onChange={setMeal} />
      </div>
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

/** Export one recipe (DATA-05): Hemlo's own file (everything, to read back
 *  in), a spreadsheet, or schema.org Recipe for other apps and sites. */
function ExportPanel({ shape, attribution, onBack, onDone }: { shape: ExportRecipe; attribution: string | null; onBack: () => void; onDone: (said: string) => void }) {
  const base = shape.name.replace(/[^\w -]+/g, '').trim().slice(0, 60) || 'recipe'
  async function save(kind: 'json' | 'csv' | 'schema') {
    const body = kind === 'json' ? toHemloJson([shape], attribution) : kind === 'csv' ? toCsv([shape]) : JSON.stringify(toSchemaOrg(shape, attribution), null, 2)
    const type = kind === 'csv' ? 'text/csv' : 'application/json'
    const name = kind === 'json' ? `${base}.hemlo-recipe.json` : kind === 'csv' ? `${base}.csv` : `${base}.schema.json`
    const how = await saveFile(name, new Blob([body], { type }))
    if (how !== 'cancelled') onDone(`Exported ${name}.`)
  }
  return (
    <div className="rcp-choice">
      <p className="rcp-section">Export</p>
      <div className="rcp-actions">
        <button type="button" className="btn" onClick={() => void save('json')}>Hemlo recipe file</button>
        <button type="button" className="btn" onClick={() => void save('csv')}>Spreadsheet (CSV)</button>
        <button type="button" className="btn" onClick={() => void save('schema')}>schema.org Recipe</button>
      </div>
      {attribution && <p className="rcp-credit">The file says: {attribution}.</p>}
      <div className="sheet-actions"><button type="button" className="btn grow" onClick={onBack}>Back</button></div>
    </div>
  )
}
