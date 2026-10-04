import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { dayDoses, dayTotals } from '../lib/nutrition'
import { dayMicros, microsLine, type MicroPart } from '../lib/micros-rules'
import { rawGrams } from '../lib/calc'
import { readSettings, type Nutrient } from '../lib/settings'
import { amountLine, nutrientLabel, shownNutrients, type QuickEntry } from '../lib/quick-food'
import { amountChoices, findUnit, readUnits, unitKey } from '../lib/units-rules'
import {
  groupDay, groupTitle, itemAmount, knownKeys, itemKind, itemMacros, itemName, kcalText, mealName, plateFields, portionsText,
  sizeMain, sumItems, type Item, type Lookup, type MealGroup, type MealsCtx,
} from '../lib/meal-rules'
import {
  makeLookup, mealsCtx, moveItems, removeItems, restoreItems, setEaten, setMealTime, setSkipped, slotsFor, unskipMeal, updateItem,
} from '../lib/meals'
import { addSaved, savedFromItems } from '../lib/saved-meals-rules'
import { savedMeals, writeSavedMeals } from '../lib/saved-meals'
import { isReadyMeal } from '../lib/ready-meal-rules'
import { AmountInput } from '../ui/AmountInput'
import { AddFoodSheet } from '../ui/AddFoodSheet'
import { QuickNumbers } from '../ui/QuickNumbers'
import { CopySheet } from '../ui/CopySheet'
import { offerUndo } from '../ui/Undo'
import { useBuiltinRuleOn } from '../modules/rule-switch'
import { useExport } from '../ui/ExportLink'
import { dayRi, riLine } from '../lib/day-ri-rules'
import { saveLabelChoice, useNutritionPrefs } from '../lib/nutrition-prefs'
import { trainingOn } from '../lib/body'
import { dayBudget, TRAINING_ENERGY_NOTE } from '../lib/activity'
import { MoreMenu } from '../ui/MoreMenu'
import { FoodPageMenu } from './FoodMenu'
import type { Food, MealPlanSlot, Recipe, RecipeLine } from '../lib/types'
import '../ui/addfood.css'
import './foodday.css'

/** Food's Day tab (MEAL-01 to MEAL-20): the day's food as meals, what it
 *  comes to against the targets, and what was eaten. No fixed meals: the
 *  person's own meals show as cards (when they made some), and everything
 *  else by its time, or under Any time. The round + opens the one add
 *  sheet; copying the day and exporting it are in the page's ⋮ (v17). Loads
 *  what it needs itself, so the Food page only says which tab is open. */
export function FoodDay({ day }: { day: string }) {
  const profile = useApp((s) => s.profile)
  const settings = readSettings(profile)
  const ctx = mealsCtx(settings)
  const shown = shownNutrients(settings)
  const foods = useLiveQuery(() => db.food.toArray(), [], [] as Food[])
  const recipes = useLiveQuery(() => db.recipe.toArray(), [], [] as Recipe[])
  const lines = useLiveQuery(() => db.recipe_line.toArray(), [], [] as RecipeLine[])
  const look = useMemo(() => makeLookup(foods, recipes, lines), [foods, recipes, lines])
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  const linesByRecipe = useMemo(() => {
    const m = new Map<string, RecipeLine[]>()
    for (const l of lines) m.set(l.recipe_id, [...(m.get(l.recipe_id) ?? []), l])
    return m
  }, [lines])
  // %RI, shown or hidden here and on a food's page alike (FOOD-06).
  const prefs = useNutritionPrefs()
  // Vitamins and minerals the person shows (FOOD-17), with the supplements
  // ticked today that count towards them (SUP-07).
  const partsByRecipe = useMemo(() => {
    const m = new Map<string, MicroPart[]>()
    for (const [id, ls] of linesByRecipe) m.set(id, ls.map((l) => { const f = l.food_id ? foodMap.get(l.food_id) : undefined; return { food: f, grams: rawGrams(l, f) } }))
    return m
  }, [linesByRecipe, foodMap])
  const doses = useLiveQuery(async () => (profile && prefs.micros.length ? dayDoses(profile.id, day) : []), [profile?.id, day, prefs.micros.length], [])
  const rows = useLiveQuery(async () => (profile ? slotsFor(profile.id, day) : []), [profile?.id, day], null)
  const eaten = useLiveQuery(async () => (profile ? dayTotals(profile.id, day) : null), [profile?.id, day], null)
  const target = useLiveQuery(async () => {
    if (!profile) return null
    const list = (await db.target.where('profile_id').equals(profile.id).sortBy('from_date')).filter((t) => !t.deleted_at && t.from_date <= day)
    return list[list.length - 1] ?? null
  }, [profile?.id, day], null)
  // Training logged separately is added to the day's budget (BODY-16).
  const training = useLiveQuery(async () => (profile ? trainingOn(profile.id, day) : null), [profile?.id, day], null)
  const sizeOn = useBuiltinRuleOn(profile?.id, 'nutrition', 'size_main')
  const [adding, setAdding] = useState<{ meal: string | null; time?: string | null } | null>(null)
  const [copying, setCopying] = useState(false)
  const exportSource = useMemo(() => ({ dataset: 'm:nutrition:meal_plan_slot', range: { from: day, to: day, label: format(parseISO(day), 'd MMM yyyy') } }), [day])
  const exp = useExport(exportSource)

  if (!profile) return null
  const groups = rows ? groupDay(rows, ctx) : []
  const planned = sumItems(groups.flatMap((g) => g.items), look)
  const goal = (k: Nutrient) => Math.round(Number(target?.[k] ?? 0))
  const targetKcal = goal('kcal') > 0 ? dayBudget(goal('kcal'), training?.kcal ?? null, training?.mode ?? 'inside') : 0
  const suggestion = sizeOn ? sizeMain(groups, settings.meals.main, targetKcal, look) : null
  const anything = groups.some((g) => g.items.length)
  const ri = prefs.label.ri ? riLine(dayRi(groups.flatMap((g) => g.items), foodMap, linesByRecipe)) : null
  const micros = prefs.micros.length ? microsLine(dayMicros(groups.flatMap((g) => g.items), foodMap, partsByRecipe, doses, prefs.micros), prefs.micros) : null

  return (
    <div className="fd">
      <div className="totals" aria-label="The day’s totals">
        {shown.map((k) => (
          <span key={k}>
            {k === 'kcal' ? 'Planned' : nutrientLabel(k)} <b>{Math.round(planned.total[k])}</b>
            {goal(k) > 0 ? ` / ${k === 'kcal' ? targetKcal : goal(k)}` : ''} {k === 'kcal' ? 'kcal' : 'g'}
          </span>
        ))}
        <span>Eaten <b>{Math.round(eaten?.kcal ?? 0)}</b> kcal</span>
        {planned.unknown > 0 && <span>{planned.unknown} without calories</span>}
      </div>
      {training?.mode === 'added' && training.sets > 0 && (
        <p className="fd-ri">
          {training.kcal === null
            ? 'Training logged: weigh in to add what it burned to the day.'
            : <>Training adds <b>{training.kcal}</b> kcal ({TRAINING_ENERGY_NOTE}).</>}
        </p>
      )}
      {ri && <p className="fd-ri"><span className="visually-hidden">Planned, as a share of an adult’s reference intake: </span><span aria-hidden="true">Reference intake: </span>{ri}</p>}
      {micros && <p className="fd-ri"><span className="visually-hidden">Planned and taken, as a share of the nutrient reference values: </span><span aria-hidden="true">NRV: </span>{micros}</p>}

      {/* The one copy dialog (GEN-55): the days only; times and portions go as they are. */}
      {copying && <CopySheet what={{ kind: 'meals', day, groups: 'all' }} onClose={() => setCopying(false)} />}

      {rows && groups.length === 0 && <p className="fd-empty">Nothing eaten or planned on this day yet.</p>}

      {groups.map((g) => (
        <MealCard key={`${day}:${g.key}`} group={g} day={day} profileId={profile.id} look={look} ctx={ctx} shown={shown}
          suggestion={suggestion && g.items.some((i) => i.id === suggestion.item.id) ? { ...suggestion, kcal: targetKcal } : null}
          onAdd={() => setAdding({ meal: g.meal, time: g.key.startsWith('t:') ? g.time : null })} />
      ))}

      {adding && <AddFoodSheet day={day} meal={adding.meal} time={adding.time} onClose={() => setAdding(null)} />}
      <FoodPageMenu items={[
        anything && { label: 'Copy day to…', onSelect: () => setCopying(true) },
        { label: prefs.label.ri ? 'Hide % of reference intake' : 'Show % of reference intake', onSelect: () => void saveLabelChoice(profile.id, { ...prefs.label, ri: !prefs.label.ri }) },
        exp.item,
      ]} sheets={exp.sheet} />
      {/* The page's one add (CALM-01): the add-food sheet, which guesses the meal. */}
      <button type="button" className="fab" aria-label="Add food" onClick={() => setAdding({ meal: null })}>+</button>
    </div>
  )
}

/** One meal: its name and time, what it comes to, its items, and a ⋮ with
 *  everything that can be done to it (every gesture's action is a button). */
function MealCard({ group: g, day, profileId, look, ctx, shown, suggestion, onAdd }: {
  group: MealGroup; day: string; profileId: string; look: Lookup; ctx: MealsCtx; shown: Nutrient[]
  suggestion: { item: Item; portions: number; kcal: number } | null
  onAdd: () => void
}) {
  const [panel, setPanel] = useState<null | 'time' | 'copy' | 'save'>(null)
  const [name, setName] = useState('')
  const [said, setSaid] = useState<string | null>(null)
  const title = groupTitle(g)
  const items = g.items as MealPlanSlot[]
  const live = items.filter((i) => i.status !== 'skipped')
  const { total, unknown } = sumItems(items, look)

  async function removeAll() {
    setPanel(null)
    const before = [...items, ...(g.holders as MealPlanSlot[])]
    await removeItems(before)
    offerUndo(`${title} removed`, () => restoreItems(before))
  }

  return (
    <section className={`fd-meal${g.skipped ? ' is-skipped' : ''}`} aria-label={title}>
      {/* Name, what it comes to, + and ⋮ (v17): whether it was eaten shows on
          its items' ticks, and "Mark all eaten" is in the ⋮. */}
      <header className="fd-head">
        <h3 className="fd-name">{title}{g.name && g.time && <span className="fd-time">{g.time}</span>}</h3>
        {live.length > 0 && <span className="fd-kcal">{kcalText(total, unknown)}</span>}
        <button type="button" className="fd-icon" aria-label={`Add food to ${title}`} onClick={onAdd}>+</button>
        <MoreMenu className="fd-more" label={`More for ${title}`} items={[
          g.meal ? { label: g.time ? 'Change time' : 'Give it a time', onSelect: () => setPanel('time') } : null,
          live.length > 0 ? { label: g.eaten ? 'Not eaten after all' : 'Mark all eaten', onSelect: () => { setPanel(null); void setEaten(live, !g.eaten) } } : null,
          g.meal || items.length > 0 ? {
            label: g.skipped ? 'Not skipped' : 'Skip this meal',
            onSelect: async () => {
              setPanel(null)
              await setSkipped(profileId, day, g, !g.skipped)
              if (!g.skipped) offerUndo(`${title} skipped`, () => unskipMeal(profileId, day, g.key))
            },
          } : null,
          items.length > 0 ? { label: 'Copy to…', onSelect: () => setPanel('copy') } : null,
          items.length > 0 ? { label: 'Save as a saved meal', onSelect: () => { setName(g.name ?? ''); setPanel('save') } } : null,
          items.length > 0 || g.holders.length > 0 ? { label: items.length > 1 ? 'Remove all' : 'Remove', danger: true, onSelect: () => void removeAll() } : null,
        ]} />
      </header>

      {panel === 'time' && (
        <div className="fd-panel">
          <label className="fd-timefield">
            <span>{title} on {format(parseISO(day), 'EEE d MMM')}</span>
            <input type="time" defaultValue={g.time ?? ''} autoFocus aria-label={`${title} time`}
              onChange={(e) => { if (/^\d\d:\d\d/.test(e.target.value)) void setMealTime(profileId, day, g, e.target.value.slice(0, 5)) }} />
          </label>
          {g.items.concat(g.holders).some((i) => i.slot_time) && (
            <button type="button" className="btn" onClick={() => { void setMealTime(profileId, day, g, null); setPanel(null) }}>
              Back to the usual time
            </button>
          )}
          <button type="button" className="btn" onClick={() => setPanel(null)}>Done</button>
        </div>
      )}
      {panel === 'copy' && <CopySheet what={{ kind: 'meals', day, groups: [g.key], label: title }} onClose={() => setPanel(null)} />}
      {panel === 'save' && (
        <form className="fd-panel" onSubmit={async (e) => {
          e.preventDefault()
          const list = await savedMeals(profileId)
          const r = addSaved(list, { id: crypto.randomUUID(), name, items: savedFromItems(items) })
          if ('error' in r) { setSaid(r.error); return }
          await writeSavedMeals(profileId, r.list)
          setSaid(`Saved as “${name.trim()}”: it is under Saved meals when adding food.`)
          setPanel(null)
        }}>
          <input className="fd-namefield" value={name} maxLength={60} autoFocus placeholder="Name, e.g. Usual breakfast" aria-label="Saved meal’s name"
            onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={!name.trim()}>Save</button>
          <button type="button" className="btn" onClick={() => setPanel(null)}>Cancel</button>
        </form>
      )}
      {said && <p className="fd-said" role="status">{said}</p>}

      {g.skipped && <p className="fd-skipped">Skipped</p>}
      {!g.skipped && items.length === 0 && <p className="fd-nothing">Nothing yet</p>}
      {items.length > 0 && (
        <ul className="fd-items">
          {items.map((i, n) => (
            <ItemRow key={i.id} item={i} look={look} ctx={ctx} shown={shown} first={n === 0} last={n === items.length - 1} siblings={items} />
          ))}
        </ul>
      )}
      {suggestion && (
        <button type="button" className="fd-suggest" onClick={() => void updateItem(suggestion.item as MealPlanSlot, { portion_multiplier: suggestion.portions })}>
          {portionsText(suggestion.portions)} of {itemName(suggestion.item, look)} reaches {suggestion.kcal} kcal: use it
        </button>
      )}
    </section>
  )
}

/** One item: eaten tick, name, how much and what it comes to. Tapping it
 *  opens its amount to change; its ⋮ moves it to another meal or removes it. */
function ItemRow({ item, look, ctx, shown, siblings }: {
  item: MealPlanSlot; look: Lookup; ctx: MealsCtx; shown: Nutrient[]; first: boolean; last: boolean; siblings: MealPlanSlot[]
}) {
  const [open, setOpen] = useState<null | 'edit' | 'move'>(null)
  const name = itemName(item, look)
  const kind = itemKind(item)
  const m = itemMacros(item, look)
  const amount = itemAmount(item, look)
  const skipped = item.status === 'skipped'
  const recipe = kind === 'recipe' ? look.recipes.get(item.recipe_id!) : undefined

  async function remove() {
    setOpen(null)
    await removeItems([item])
    offerUndo(`${name} removed`, () => restoreItems([item]))
  }
  async function moveTo(meal: string) {
    setOpen(null)
    const before = { meal: item.slot, time: item.slot_time ?? null }
    // Moved into a meal of the person's, it takes that meal's time on the day.
    const there = siblings.find((s) => s.slot === meal && s.id !== item.id)
    await moveItems([item], { meal, time: meal ? there?.slot_time ?? null : item.slot_time ?? null })
    offerUndo(`${name} moved to ${mealName(meal, ctx) ?? 'no meal'}`, () => moveItems([{ ...item }], before))
  }

  return (
    <li className={`fd-item${skipped ? ' is-skipped' : ''}`}>
      <div className="fd-item-row">
        <label className="fd-tick">
          <input type="checkbox" checked={item.status === 'eaten'} disabled={skipped} aria-label={`${name} eaten`}
            onChange={(e) => void setEaten([item], e.target.checked)} />
        </label>
        <button type="button" className="fd-item-main" aria-expanded={open === 'edit'} onClick={() => setOpen(open === 'edit' ? null : 'edit')}>
          <span className="fd-item-name">{name}{recipe && isReadyMeal(recipe) && <span className="sp-tag">ready meal</span>}</span>
          <span className="fd-item-meta">{[amount, m ? amountLine(m, knownKeys(item, look, shown.slice(0, 2))) : 'kcal unknown'].filter(Boolean).join(' · ')}</span>
        </button>
        <MoreMenu className="fd-more" label={`More for ${name}`} items={[
          { label: 'Change amount', onSelect: () => setOpen('edit') },
          { label: 'Move to another meal', onSelect: () => setOpen('move') },
          { label: 'Remove', danger: true, onSelect: () => void remove() },
        ]} />
      </div>
      {open === 'move' && (
        <div className="fd-menu" role="group" aria-label={`Move ${name} to`}>
          {ctx.meals.names.filter((x) => x.key !== item.slot).map((x) => (
            <button key={x.key} type="button" className="btn" onClick={() => void moveTo(x.key)}>{x.name}</button>
          ))}
          {item.slot && <button type="button" className="btn" onClick={() => void moveTo('')}>No meal</button>}
          <button type="button" className="btn" onClick={() => setOpen(null)}>Cancel</button>
        </div>
      )}
      {open === 'edit' && <ItemEditor item={item} look={look} shown={shown} onDone={() => setOpen(null)} onRemove={() => void remove()} />}
    </li>
  )
}

/** Change how much: the one amount field for a food (UNIT-02), portions for
 *  a recipe, the numbers for a quick entry. */
function ItemEditor({ item, look, shown, onDone, onRemove }: {
  item: MealPlanSlot; look: Lookup; shown: Nutrient[]; onDone: () => void; onRemove: () => void
}) {
  const kind = itemKind(item)
  const food = kind === 'food' ? look.foods.get(item.food_id!) : undefined
  const units = readUnits(food?.units)
  const pack = Number((food as Food | undefined)?.pack_size_g ?? 0) || null
  const unit = item.unit ? findUnit(units, item.unit) : undefined
  const [text, setText] = useState(kind === 'recipe' ? String(Number(item.portion_multiplier) || 1)
    : unit && item.unit_qty != null ? String(Number(item.unit_qty)) : String(Number(item.grams ?? 0) || ''))
  const [choice, setChoice] = useState(unit ? unitKey(unit.name) : 'g')

  if (kind === 'quick') {
    return (
      <div className="fd-edit">
        <QuickNumbers start={item as Partial<QuickEntry>} shown={shown} action="Save"
          onSubmit={(entry) => { void updateItem(item, { ...entry, unit: null, unit_qty: null }); onDone() }} />
        <button type="button" className="btn fd-danger" onClick={onRemove}>Remove</button>
      </div>
    )
  }
  const plate = kind === 'recipe'
    ? plateFields({ key: '', kind: 'recipe', recipe_id: item.recipe_id!, text })
    : plateFields({ key: '', kind: 'food', food_id: item.food_id!, text, choice }, units, pack)
  const fields = 'fields' in plate ? plate.fields : null
  const preview = fields ? itemMacros({ ...item, ...fields } as Item, look) : null
  return (
    <form className="fd-edit" onSubmit={(e) => {
      e.preventDefault()
      if (!fields) return
      const { food_id: _f, recipe_id: _r, ...change } = fields
      void updateItem(item, change as Partial<MealPlanSlot>)
      onDone()
    }}>
      <div className="fd-amount">
        {kind === 'food' ? (
          <AmountInput text={text} choice={choice} choices={amountChoices(units, { pack })} onText={setText} onChoice={setChoice}
            label={`How much ${itemName(item, look)}`} input={{ autoFocus: true, onFocus: (e) => e.currentTarget.select() }} />
        ) : (
          <>
            <input type="text" inputMode="decimal" className="amt-input" value={text} autoFocus aria-label="Portions"
              onFocus={(e) => e.currentTarget.select()} onChange={(e) => setText(e.target.value)} />
            <span className="amt-only">portions</span>
          </>
        )}
      </div>
      <span className="fd-preview" aria-live="polite">{fields ? (preview ? amountLine(preview, knownKeys({ ...item, ...fields } as Item, look, shown)) : 'kcal unknown') : (plate as { error: string }).error}</span>
      <div className="fd-edit-actions">
        <button type="button" className="btn fd-danger" onClick={onRemove}>Remove</button>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!fields}>Save</button>
      </div>
    </form>
  )
}
