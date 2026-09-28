import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { PageHead } from '../ui/PageHead'
import { BookTable } from '../sections/BookTable'
import { dayTotals } from '../lib/nutrition'
import { recipeMacros, mealMultiplier, type Macros } from '../lib/calc'
import { SLOTS, MAIN_SLOT, slotsFor, planMeal, planQuick, markEaten, macrosFor, setMealTime, type SlotKey } from '../lib/meals'
import { readSettings, mealTime, type Nutrient, type ProfileSettings } from '../lib/settings'
import {
  BASES, EMPTY_FORM, MACROS, amountLine, formFrom, isQuick, nutrientLabel, quickAmount, quickCount, quickFromFood, quickMacros, readQuick,
  shownNutrients, type Basis, type QuickEntry, type QuickForm,
} from '../lib/quick-food'
import { amountChoices, amountHint, readAmount, readUnits, unitKey, unitsText } from '../lib/units-rules'
import { AmountInput } from '../ui/AmountInput'
import { FoodUnitsSheet } from '../ui/FoodUnits'
import { SearchPick, type PickItem } from '../ui/SearchPick'
import { Dropdown } from '../ui/Dropdown'
import { ExportLink } from '../ui/ExportLink'
import { MyRecipes } from '../ui/MyRecipes'
import { FindProducts } from '../ui/ProductSearch'
import { moduleByKey } from '../modules/registry'
import type { FieldDef } from '../modules/types'
import { useBuiltinRuleOn } from '../modules/rule-switch'
import type { Food as FoodRow, Recipe, RecipeLine, MealPlanSlot, Target } from '../lib/types'

const NUTRIENT_KEYS: string[] = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g']
const live = (r: object) => !(r as { deleted_at?: string | null }).deleted_at

const SECTIONS = ['Day', 'Recipes', 'Foods']

export function Food() {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const settings = readSettings(profile)
  // Calories and whatever the person chose to track; nothing else is shown.
  const shown = shownNutrients(settings)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState('Day')
  const [search, setSearch] = useState('')
  const day = format(date, 'yyyy-MM-dd')
  const mod = moduleByKey.get('nutrition')!

  const foods = useLiveQuery(() => db.food.toArray(), [], [] as FoodRow[])
  const recipes = useLiveQuery(() => db.recipe.toArray(), [], [] as Recipe[])
  const lines = useLiveQuery(() => db.recipe_line.toArray(), [], [])
  const totals = useLiveQuery(
    async () => (profile ? dayTotals(profile.id, day) : null),
    [profile?.id, day], null,
  )
  const target = useLiveQuery(async () => {
    if (!profile) return null
    const rows = (await db.target.where('profile_id').equals(profile.id).sortBy('from_date'))
      .filter((t) => !t.deleted_at && t.from_date <= day)
    return rows[rows.length - 1] ?? null
  }, [profile?.id, day], null)

  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods])
  // Deleted rows stay on the device (a planned meal still names its recipe)
  // but are left off the tables.
  const liveRecipes = useMemo(() => recipes.filter(live), [recipes])
  const liveFoods = useMemo(() => foods.filter(live), [foods])
  // A food's units as the table shows them: "egg/eggs = 50 g".
  const foodRows = useMemo(() => liveFoods.map((f) => ({ ...f, units: unitsText(readUnits(f.units)) })), [liveFoods])
  const [openFood, setOpenFood] = useState<FoodRow | null>(null)

  /** Recipe macros are calculated from the lines every time they are shown,
   *  never read from a stored column, so a changed ingredient is reflected at
   *  once — and a figure typed into the old sheet can never contradict them. */
  const recipeRows = useMemo(() => liveRecipes.map((r) => {
    const m = recipeMacros(lines.filter((l) => l.recipe_id === r.id), foodMap)
    return {
      ...r,
      kcal: Math.round(m.kcal),
      protein_g: Math.round(m.protein_g * 10) / 10,
      carbs_g: Math.round(m.carbs_g * 10) / 10,
      fat_g: Math.round(m.fat_g * 10) / 10,
      fiber_g: Math.round(m.fiber_g * 10) / 10,
      lines_count: lines.filter((l) => l.recipe_id === r.id).length,
    }
  }), [liveRecipes, lines, foodMap])

  // Columns for the nutrients not tracked are left out, not just narrowed.
  const nutrientColumn = (f: FieldDef) => !NUTRIENT_KEYS.includes(f.name) || shown.includes(f.name as Nutrient)
  const narrowColumns = ['name', ...shown.slice(0, 2)]
  const recipeFields: FieldDef[] = [
    { name: 'name', label: 'Recipe', type: 'text', width: 230 },
    { name: 'role', label: 'Role', type: 'select', options: ['breakfast','lunch','dinner','snack','shake','main'], width: 110 },
    { name: 'lines_count', label: 'Items', type: 'integer', width: 60 },
    { name: 'kcal', label: 'kcal', type: 'integer', width: 70 },
    ...shown.filter((k) => k !== 'kcal').map((k): FieldDef => ({ name: k, label: nutrientLabel(k), type: 'number', unit: 'g', width: 80 })),
  ]

  return (
    <div className="page">
      <div className="page-inner">
        <PageHead date={date} onPick={setDate} sections={SECTIONS} active={section} onSection={setSection} />

        {section === 'Day' && profile && (
          <MealDay profileId={profile.id} userId={userId} day={day} recipes={recipes} lines={lines} foods={foodMap}
            target={target} eaten={totals} settings={settings} shown={shown} />
        )}

        {section === 'Recipes' && (
          <>
            <MyRecipes userId={userId} recipes={liveRecipes} lines={lines} foods={foodMap} />
            <BookTable
              kind="recipe"
              head={<span><b>{liveRecipes.length}</b> recipes · macros calculated from the ingredient lines</span>}
              fields={recipeFields}
              priority={narrowColumns}
              rows={recipeRows}
              lines={lines}
              foods={foodMap}
              emptyNote="No recipes yet — import them from your Excel file in More."
            />
          </>
        )}

        {section === 'Foods' && <FindProducts onShow={setSearch} />}
        {section === 'Foods' && (
          <BookTable
            kind="food"
            head={<>
              <span><b>{liveFoods.length}</b> foods in the catalogue</span>
              <input
                className="btn"
                placeholder="Search foods"
                aria-label="Search foods"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '6px 10px', minWidth: 0, flex: '1 1 120px' }}
              />
            </>}
            fields={mod.entities[0].fields.filter(nutrientColumn)}
            priority={narrowColumns}
            rows={foodRows}
            search={search}
            limit={200}
            emptyNote="No food matches that."
            onOpen={(row) => setOpenFood(foodMap.get(row.id) ?? null)}
            openLabel={(row) => `Open ${row.name}: its units`}
          />
        )}
        {openFood && <FoodUnitsSheet food={openFood} onClose={() => setOpenFood(null)} />}
        <ExportLink source={section === 'Day' ? { dataset: 'm:nutrition:meal_plan_slot', range: { from: day, to: day, label: format(date, 'd MMM yyyy') } }
          : { dataset: section === 'Recipes' ? 'm:nutrition:recipe' : 'm:nutrition:food' }} />
      </div>
    </div>
  )
}

type Totals = Record<Nutrient, number>
const ZERO: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
const add = (a: Totals, b: Totals, n = 1): Totals => ({
  kcal: a.kcal + b.kcal * n, protein_g: a.protein_g + b.protein_g * n, carbs_g: a.carbs_g + b.carbs_g * n,
  fat_g: a.fat_g + b.fat_g * n, fiber_g: a.fiber_g + b.fiber_g * n,
})

function MealDay({ profileId, userId, day, recipes, lines, foods, target, eaten, settings, shown }: {
  profileId: string; userId: string | null; day: string; recipes: Recipe[]; lines: RecipeLine[]; foods: Map<string, FoodRow>
  target: Target | null
  eaten: Macros | null
  settings: ProfileSettings
  shown: Nutrient[]
}) {
  const slots = useLiveQuery(() => slotsFor(profileId, day), [profileId, day], [] as MealPlanSlot[])
  const bySlot = new Map(slots.map((s) => [s.slot, s]))
  const perPortion = (recipeId: string | null) => recipeId ? macrosFor(recipeId, lines, foods) : null

  /** What one planned meal comes to: its own numbers, or its recipe × portions. */
  const slotTotals = (s: MealPlanSlot | undefined): Totals | null => {
    if (!s) return null
    if (isQuick(s)) return quickMacros(s)
    const m = perPortion(s.recipe_id)
    return m ? add(ZERO, m, s.portion_multiplier) : null
  }

  // Recipes as the picker lists them: own ones tagged, calories per portion.
  const items: PickItem[] = useMemo(() => recipes.filter(live).map((r) => ({
    id: r.id, name: r.name,
    tag: userId && r.owner_id === userId ? 'mine' : undefined,
    meta: `${Math.round(macrosFor(r.id, lines, foods).kcal)} kcal per portion`,
  })), [recipes, lines, foods, userId])

  const planned = slots.reduce((acc, s) => add(acc, slotTotals(s) ?? ZERO), ZERO)

  // The main meal is sized to close whatever the other meals leave open. It is
  // a calorie sum, so it needs a calorie target to aim at.
  const main = bySlot.get(MAIN_SLOT)
  const mainPer = main && !isQuick(main) ? perPortion(main.recipe_id) : null
  const others = slots.filter((s) => s.slot !== MAIN_SLOT).reduce((acc, s) => add(acc, slotTotals(s) ?? ZERO), ZERO)
  const targetKcal = Math.round(Number(target?.kcal ?? 0))
  // The Nutrition rule "scale the main meal", which Edit module can switch off.
  const sizeMain = useBuiltinRuleOn(profileId, 'nutrition', 'size_main')
  const suggestion = sizeMain && targetKcal > 0 && mainPer && mainPer.kcal > 0
    ? Math.round(mealMultiplier({ kcal: targetKcal, protein_g: target?.protein_g ?? null }, others, mainPer) * 10) / 10 : null

  const goal = (k: Nutrient) => Math.round(Number(target?.[k] ?? 0))

  return (
    <>
      <div className="totals">
        {shown.map((k) => (
          <span key={k}>
            {k === 'kcal' ? 'Planned' : nutrientLabel(k)} <b>{Math.round(planned[k])}</b>
            {goal(k) > 0 ? ` / ${goal(k)}` : ''} {k === 'kcal' ? 'kcal' : 'g'}
          </span>
        ))}
        <span>Eaten <b>{Math.round(eaten?.kcal ?? 0)}</b> kcal</span>
      </div>

      {SLOTS.map((def) => {
        const slot = bySlot.get(def.key)
        const sizeTo = def.key === MAIN_SLOT && slot && suggestion !== null && Math.abs(suggestion - slot.portion_multiplier) >= 0.1
          ? suggestion : null
        return (
          // Keyed by the slot row too: a meal made, cleared or on another day
          // starts from what is stored, not from the last one's open fields.
          <MealSlot key={`${day}:${def.key}:${slot?.id ?? ''}`} slotKey={def.key} label={def.label} slot={slot} day={day} profileId={profileId}
            time={slot ? mealTime(slot, settings) : settings.meal_times[def.key] ?? null}
            items={items} recipes={recipes} totals={slotTotals(slot)} shown={shown} foods={foods}
            suggest={sizeTo !== null ? { portions: sizeTo, kcal: targetKcal } : null} />
        )
      })}
      <p className="empty">
        Planned meals appear on Today, at their time if they have one, and fill the shopping list.
        A meal can be a recipe or just the numbers off a packet.
      </p>
    </>
  )
}

function MealSlot({ slotKey, label, slot, day, profileId, time, items, recipes, totals, shown, suggest, foods }: {
  slotKey: SlotKey; label: string; slot: MealPlanSlot | undefined; day: string; profileId: string
  time: string | null; items: PickItem[]; recipes: Recipe[]; totals: Totals | null; shown: Nutrient[]
  foods: Map<string, FoodRow>
  suggest: { portions: number; kcal: number } | null
}) {
  const quickSaved = !!slot && isQuick(slot)
  const [quick, setQuick] = useState(quickSaved)
  const planned = !!slot && (!!slot.recipe_id || quickSaved)
  const recipe = slot?.recipe_id ? recipes.find((r) => r.id === slot.recipe_id) : undefined
  const chosen = recipe?.name
    ?? (quickSaved ? [slot!.label, quickCount(slot!), `${Math.round(Number(slot!.kcal))} kcal`].filter(Boolean).join(' · ') : null)

  const toggle = (
    <label className="slot-toggle">
      <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} aria-label={`${label}: just numbers`} />
      Just numbers
    </label>
  )

  return (
    <div className="slot" data-slot={slotKey}>
      <div className="slot-head">
        <span className="slot-name">{label}{time ? ` · ${time}` : ''}</span>
        <MealTime label={label} own={slot?.slot_time?.slice(0, 5) ?? null} time={time}
          onSet={(t) => void setMealTime(profileId, day, slotKey, t)} />
      </div>

      {quick ? (
        <QuickFields key={slot?.id ?? 'new'} slot={slot} shown={shown} toggle={toggle} foods={foods}
          onSave={(entry) => void planQuick(profileId, day, slotKey, entry)} />
      ) : (
        <div className="slot-pick">
          <SearchPick items={items} label={`${label} recipe`} placeholder="Choose a recipe" value={chosen}
            onPick={(r) => void planMeal(profileId, day, slotKey, r.id, recipe ? slot!.portion_multiplier : 1)}
            onClear={() => void planMeal(profileId, day, slotKey, null)} />
          {toggle}
        </div>
      )}

      {planned && (
        <div className="slot-foot">
          <span className="row-meta slot-amounts">
            {/* A counted meal says how much: "2 eggs (100 g) · 143 kcal". */}
            {quickSaved && slot!.unit ? `${quickAmount(slot!)} · ` : ''}{totals ? amountLine(totals, shown) : ''}
          </span>
          {!quickSaved && (
            <input type="number" min={0.25} step={0.25} value={slot!.portion_multiplier} aria-label={`${label} portions`}
              className="slot-portions"
              onChange={(e) => void planMeal(profileId, day, slotKey, slot!.recipe_id, Number(e.target.value) || 1)} />
          )}
          <label className="slot-eaten">
            <input type="checkbox" checked={slot!.status === 'eaten'} aria-label={`${label} eaten`}
              onChange={(e) => void markEaten(slot!, e.target.checked)} />
            eaten
          </label>
        </div>
      )}
      {suggest && slot && (
        <button className="suggest" onClick={() => void planMeal(profileId, day, slotKey, slot.recipe_id, suggest.portions)}>
          {suggest.portions}× reaches {suggest.kcal} kcal — use it
        </button>
      )}
    </div>
  )
}

/** "Add time" until opened; then a time field, clearable when the meal has a
 *  time of its own. Clearing falls back to the default time, if one is set. */
function MealTime({ label, own, time, onSet }: {
  label: string; own: string | null; time: string | null; onSet: (t: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" className="slot-link" onClick={() => setOpen(true)}>
        {time ? 'Change time' : 'Add time'}
      </button>
    )
  }
  return (
    <span className="slot-time">
      <input type="time" value={time ?? ''} aria-label={`${label} time`} autoFocus={!time}
        // A half-typed time reads as empty; only a whole one is saved.
        onChange={(e) => { if (/^\d\d:\d\d/.test(e.target.value)) onSet(e.target.value.slice(0, 5)) }} />
      {own && (
        <button type="button" className="slot-link" aria-label={`Clear ${label} time`}
          onClick={() => { onSet(null); setOpen(false) }}>×</button>
      )}
      <button type="button" className="slot-link" onClick={() => setOpen(false)}>Done</button>
    </span>
  )
}

/** The ways the numbers can be given, and one more: worked out from a food
 *  and how much of it, in grams or one of its units ("2 eggs"). */
type Mode = Basis | 'food'
const BASIS_OPTIONS: { value: Mode; label: string }[] = [
  ...BASES.map((b) => ({ value: b.value as Mode, label: b.label })),
  { value: 'food', label: 'From a food' },
]

/** A meal as plain numbers. Only calories are needed; any macro typed in is
 *  kept. Figures can be the total, or per 100 g (or another size) with the
 *  grams eaten, and the total is worked out as they type. */
function QuickFields({ slot, shown, toggle, onSave, foods }: {
  slot: MealPlanSlot | undefined; shown: Nutrient[]; toggle: ReactNode; onSave: (entry: QuickEntry) => void
  foods: Map<string, FoodRow>
}) {
  const [form, setForm] = useState<QuickForm>(() => (slot && isQuick(slot) ? formFrom(slot) : EMPTY_FORM))
  const [fromFood, setFromFood] = useState(false)
  if (fromFood) {
    return <FoodFields slot={slot} shown={shown} toggle={toggle} foods={foods} onSave={onSave}
      onMode={(m) => { if (m !== 'food') { setFromFood(false); setForm((f) => ({ ...f, basis: m })) } }} />
  }
  // Tracked macros first; the rest are one tap away, and kept if filled in.
  const first = MACROS.filter((k) => shown.includes(k))
  const rest = MACROS.filter((k) => !shown.includes(k))
  const [more, setMore] = useState(() => rest.some((k) => form[k] !== ''))
  const set = (change: Partial<QuickForm>) => setForm((f) => ({ ...f, ...change }))

  const result = readQuick(form)
  const entry = 'entry' in result ? result.entry : null
  const touched = form.kcal !== '' || form.grams !== ''
  // Saved already when the form comes to exactly what the slot holds.
  const same = !!entry && !!slot && isQuick(slot)
    && JSON.stringify(formFrom(entry)) === JSON.stringify(formFrom(slot))
  const per = form.basis === 'total' ? '' : ` ${BASES.find((b) => b.value === form.basis)!.label.replace('…', form.portion_g || '…')}`

  const field = (key: keyof QuickForm, text: string, placeholder?: string) => (
    <label key={key} className="qf-field">
      <span>{text}</span>
      <input type="text" inputMode="decimal" autoComplete="off" value={form[key]} placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  )

  return (
    <div className="qf">
      <div className="slot-pick">
        <input className="qf-label" type="text" value={form.label} maxLength={120} placeholder="What it was (optional)"
          aria-label="What it was" onChange={(e) => set({ label: e.target.value })} />
        {toggle}
      </div>
      <div className="qf-grid">
        {/* The dropdown sits in the left column so its list, wider than the
            field, opens across the screen and not off its edge. */}
        <div className="qf-field">
          <span>Calories are</span>
          <Dropdown<Mode> value={form.basis} options={BASIS_OPTIONS} label="Calories are"
            onChange={(m) => (m === 'food' ? setFromFood(true) : set({ basis: m }))} />
        </div>
        {field('kcal', `kcal${per}`)}
        {form.basis === 'portion' && field('portion_g', 'One portion, g')}
        {form.basis !== 'total' && field('grams', 'Grams eaten')}
        {first.map((k) => field(k, `${nutrientLabel(k)}, g${per}`, 'optional'))}
        {more && rest.map((k) => field(k, `${nutrientLabel(k)}, g${per}`, 'optional'))}
      </div>
      <div className="qf-actions">
        {!more && rest.length > 0 && (
          <button type="button" className="slot-link" onClick={() => setMore(true)}>
            {first.length ? 'More' : 'Add macros'}
          </button>
        )}
        <span className="row-meta qf-result" aria-live="polite">
          {entry ? `Comes to ${amountLine(quickMacros(entry), shown)}` : touched ? (result as { error: string }).error : ''}
        </span>
        <button type="button" className="btn btn-primary" disabled={!entry || same} onClick={() => entry && onSave(entry)}>
          {same ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

/** A meal from one food and how much of it: pick the food, say how much in
 *  grams or one of its units ("2" eggs), and the numbers are worked out from
 *  the food's figures per 100 g. Saved as plain numbers like any quick meal,
 *  with the unit and how many kept beside the grams. */
function FoodFields({ slot, shown, toggle, foods, onSave, onMode }: {
  slot: MealPlanSlot | undefined; shown: Nutrient[]; toggle: ReactNode; foods: Map<string, FoodRow>
  onSave: (entry: QuickEntry) => void; onMode: (m: Mode) => void
}) {
  const [foodId, setFoodId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [unit, setUnit] = useState('g')
  const [open, setOpen] = useState<FoodRow | null>(null)
  const food = foodId ? foods.get(foodId) : undefined
  const units = readUnits(food?.units)
  const choices = amountChoices(units)
  const choice = choices.find((c) => c.key === unit) ?? choices[0]
  const items: PickItem[] = useMemo(() => [...foods.values()].filter(live).map((f) => ({
    id: f.id, name: f.name, tag: f.owner_id ? 'mine' : undefined,
    meta: [f.kcal != null ? `${Math.round(Number(f.kcal))} kcal / 100 g` : null,
      ...readUnits(f.units).slice(0, 2).map((u) => u.name)].filter(Boolean).join(' · ') || undefined,
  })), [foods])
  const result = food ? quickFromFood(food, readAmount(text, choice)) : null
  const entry = result && 'entry' in result ? result.entry : null
  const same = !!entry && !!slot && isQuick(slot) && JSON.stringify(formFrom(entry)) === JSON.stringify(formFrom(slot))
    && (slot.unit ?? null) === (entry.unit ?? null)

  return (
    <div className="qf">
      <div className="slot-pick">
        <SearchPick items={items} label="Food eaten" placeholder="Which food" value={food?.name ?? null}
          onPick={(f) => {
            setFoodId(f.id)
            // Counted foods start in their first unit: "2" eggs.
            const first = readUnits(foods.get(f.id)?.units)[0]
            setUnit(first ? unitKey(first.name) : 'g')
          }}
          onClear={() => setFoodId(null)} />
        {toggle}
      </div>
      <div className="qf-grid">
        <div className="qf-field">
          <span>Calories are</span>
          <Dropdown<Mode> value="food" options={BASIS_OPTIONS} label="Calories are" onChange={onMode} />
        </div>
        <div className="qf-field is-wide">
          <span>How much</span>
          <div className="qf-amount">
            <AmountInput text={text} choice={choice.key} choices={choices} onText={setText} onChoice={setUnit}
              label="How much was eaten" input={{ placeholder: choice.unit ? 'how many' : 'g' }} />
          </div>
        </div>
      </div>
      <div className="qf-actions">
        {food && (
          <button type="button" className="slot-link" onClick={() => setOpen(food)}>
            {units.length ? 'Units' : 'Add a unit'}
          </button>
        )}
        <span className="row-meta qf-result" aria-live="polite">
          {entry ? `${amountHint(text, choice)} comes to ${amountLine(quickMacros(entry), shown)}`
            : food && text.trim() && result && 'error' in result ? result.error : ''}
        </span>
        <button type="button" className="btn btn-primary" disabled={!entry || same} onClick={() => entry && onSave(entry)}>
          {same ? 'Saved' : 'Save'}
        </button>
      </div>
      {open && <FoodUnitsSheet food={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
