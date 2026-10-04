import { useState } from 'react'
import { useApp } from '../lib/store'
import { saveSettings } from '../lib/write'
import { NUTRIENTS, readSettings, type MealName, type MealSettings, type Nutrient, type SettingsChange } from '../lib/settings'
import { retimeMeals } from '../lib/meals'
import { mealKeyFor, MEAL_NAME_MAX } from '../lib/meal-rules'
import { Dropdown } from '../ui/Dropdown'
import { offerUndo } from '../ui/Undo'
import { saveMicroChoice, useNutritionPrefs } from '../lib/nutrition-prefs'
import { MICROS, type MicroCode } from '../lib/micros-rules'
import './food-settings.css'

/** Sets of meals to start from, for someone who wants fixed meals (MEAL-02).
 *  Times are suggestions the person changes or removes. */
const PRESETS: { label: string; meals: { name: string; time: string | null }[]; main: string | null }[] = [
  { label: 'Breakfast, lunch, dinner', main: 'Dinner',
    meals: [{ name: 'Breakfast', time: '08:00' }, { name: 'Lunch', time: '12:30' }, { name: 'Dinner', time: '18:30' }] },
  { label: 'With snacks', main: 'Dinner',
    meals: [{ name: 'Breakfast', time: '08:00' }, { name: 'Snack', time: '10:30' }, { name: 'Lunch', time: '12:30' },
      { name: 'Afternoon snack', time: '15:30' }, { name: 'Dinner', time: '18:30' }] },
  { label: 'Training days', main: 'Dinner',
    meals: [{ name: 'Breakfast', time: '08:00' }, { name: 'Lunch', time: '12:30' }, { name: 'Pre-workout', time: '16:30' },
      { name: 'Dinner', time: '19:00' }, { name: 'Snack', time: null }] },
]

const MAX_MEALS = 12

/** What the food pages count and show, and the person's own meals. It all
 *  starts minimal: calories only, and no meals at all, so food is logged by
 *  time until someone wants fixed meals. */
export function FoodSettings() {
  const profile = useApp((s) => s.profile)
  const [newName, setNewName] = useState('')
  if (!profile) return null
  const settings = readSettings(profile)
  const meals = settings.meals

  async function change(next: SettingsChange) {
    const saved = await saveSettings(profile!, next)
    // Meals already planned from today on follow a changed default time.
    if (next.meals) await retimeMeals(profile!.id, settings, readSettings(saved))
  }

  /** The meals saved whole. The old default times are cleared with the first
   *  change: the meals here hold their times now. */
  function setMeals(next: Partial<MealSettings>) {
    return change({ meals: { ...meals, ...next }, ...(Object.keys(settings.meal_times).length ? { meal_times: {} } : {}) })
  }

  function track(key: Nutrient, on: boolean) {
    const nutrients = on ? [...settings.nutrients, key] : settings.nutrients.filter((k) => k !== key)
    // A figure no longer tracked cannot stay on Today; calories take its place.
    const today_metric = !on && settings.today_metric === key ? 'kcal' : settings.today_metric
    void change({ nutrients, today_metric })
  }

  function add(name: string) {
    const n = name.replace(/\s+/g, ' ').trim().slice(0, MEAL_NAME_MAX)
    if (!n || meals.names.length >= MAX_MEALS) return
    if (meals.names.some((m) => m.name.toLowerCase() === n.toLowerCase())) return
    const key = mealKeyFor(n, meals.names.map((m) => m.key))
    void setMeals({ names: [...meals.names, { key, name: n, time: null }], cards: meals.names.length ? meals.cards : true })
    setNewName('')
  }

  function update(key: string, patch: Partial<MealName>) {
    void setMeals({ names: meals.names.map((m) => (m.key === key ? { ...m, ...patch } : m)) })
  }

  function move(i: number, by: -1 | 1) {
    const names = [...meals.names]
    const j = i + by
    if (j < 0 || j >= names.length) return
    ;[names[i], names[j]] = [names[j], names[i]]
    void setMeals({ names })
  }

  function remove(m: MealName) {
    const before = meals
    void setMeals({ names: meals.names.filter((x) => x.key !== m.key), main: meals.main === m.key ? null : meals.main })
    // What was logged under it stays, under its name; only the card goes.
    offerUndo(`${m.name} removed from your meals`, () => saveSettings(useApp.getState().profile ?? profile!, { meals: before }))
  }

  function preset(p: typeof PRESETS[number]) {
    const taken: string[] = []
    const names = p.meals.map((m) => {
      const key = mealKeyFor(m.name, taken)
      taken.push(key)
      return { key, name: m.name, time: m.time }
    })
    void setMeals({ names, cards: true, main: names.find((n) => n.name === p.main)?.key ?? null })
  }

  const figures = [
    { value: 'none' as const, label: 'Nothing' },
    ...NUTRIENTS.filter((n) => n.key === 'kcal' || settings.nutrients.includes(n.key))
      .map((n) => ({ value: n.key, label: n.key === 'kcal' ? 'Calories' : `${n.label} (g)` })),
  ]

  return (
    <>
      <p className="section-title">Food</p>
      <div className="setting-row">
        <div>
          <div className="row-name">What to count</div>
          <div className="row-meta">Calories always. Tick what else the food pages should show.</div>
          <div className="fs-checks">
            {NUTRIENTS.map((n) => (
              <label key={n.key} className="fs-check">
                <input type="checkbox" checked={n.key === 'kcal' || settings.nutrients.includes(n.key)}
                  disabled={n.key === 'kcal'} onChange={(e) => track(n.key, e.target.checked)} />
                {n.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="row-name">On Today</div>
          <div className="row-meta">The one figure under the date, with a bar when there is a target.</div>
        </div>
        <Dropdown<Nutrient | 'none'> className="fs-figure" value={settings.today_metric} options={figures}
          label="Figure on Today" onChange={(today_metric) => void change({ today_metric })} />
      </div>

      <MicroChoice profileId={profile.id} />

      <div className="setting-row fs-meals-head">
        <div>
          <div className="row-name" id="fs-meals">Meals</div>
          <div className="row-meta">Optional: without them, food is logged by the time it was eaten.</div>
        </div>
      </div>

      {meals.names.length === 0 && (
        <div className="fs-presets" role="group" aria-label="Start from a set of meals">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn" onClick={() => preset(p)}>{p.label}</button>
          ))}
        </div>
      )}

      {meals.names.length > 0 && (
        <ol className="fs-meals" aria-labelledby="fs-meals">
          {meals.names.map((m, i) => (
            <MealRow key={m.key} meal={m} first={i === 0} last={i === meals.names.length - 1}
              onName={(name) => update(m.key, { name })} onTime={(time) => update(m.key, { time })}
              onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => remove(m)} />
          ))}
        </ol>
      )}

      {meals.names.length < MAX_MEALS && (
        <form className="fs-add" onSubmit={(e) => { e.preventDefault(); add(newName) }}>
          <input type="text" value={newName} maxLength={MEAL_NAME_MAX} placeholder="A meal’s name, e.g. Pre-workout"
            aria-label="New meal’s name" onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="btn" disabled={!newName.trim()}>Add meal</button>
        </form>
      )}

      {meals.names.length > 0 && (
        <>
          <div className="setting-row">
            <div>
              <div className="row-name" id="fs-cards">A card for each meal</div>
              <div className="row-meta">Food → Day shows every meal above, even before anything is in it.</div>
            </div>
            <button type="button" className="switch" role="switch" aria-checked={meals.cards} aria-labelledby="fs-cards"
              onClick={() => void setMeals({ cards: !meals.cards })} />
          </div>
          <div className="setting-row">
            <div>
              <div className="row-name">Main meal</div>
              <div className="row-meta">Its recipe is offered in the size that reaches your calorie target.</div>
            </div>
            <Dropdown<string> className="fs-figure" value={meals.main ?? ''} label="Main meal"
              options={[{ value: '', label: 'None' }, ...meals.names.map((m) => ({ value: m.key, label: m.name }))]}
              onChange={(v) => void setMeals({ main: v || null })} />
          </div>
        </>
      )}
    </>
  )
}

/** Vitamins and minerals (FOOD-17): off by default; the person picks which
 *  the food pages, recipes and the day show, as a share of the NRV. The
 *  list opens under the row, so the row itself stays one line. */
function MicroChoice({ profileId }: { profileId: string }) {
  const prefs = useNutritionPrefs()
  const [open, setOpen] = useState(false)
  const chosen = prefs.micros
  const names = MICROS.filter((m) => chosen.includes(m.code)).map((m) => m.name)
  const toggle = (code: MicroCode, on: boolean) =>
    void saveMicroChoice(profileId, on ? [...chosen, code] : chosen.filter((c) => c !== code))
  return (
    <div className="setting-row">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row-name" id="fs-micros">Vitamins and minerals</div>
        <div className="row-meta">{names.length ? names.join(', ') : 'None shown'}</div>
        {open && (
          <div id="fs-micros-list" role="group" aria-labelledby="fs-micros">
            {[true, false].map((vitamin) => (
              <div key={String(vitamin)} className="fs-checks" role="group" aria-label={vitamin ? 'Vitamins' : 'Minerals'}>
                {MICROS.filter((m) => m.vitamin === vitamin).map((m) => (
                  <label key={m.code} className="fs-check">
                    <input type="checkbox" checked={chosen.includes(m.code)} onChange={(e) => toggle(m.code, e.target.checked)} />
                    {m.name}
                  </label>
                ))}
              </div>
            ))}
            {chosen.length > 0 && (
              <button type="button" className="slot-link fs-micros-none" onClick={() => void saveMicroChoice(profileId, [])}>Show none</button>
            )}
          </div>
        )}
      </div>
      <button type="button" className="btn fs-micros-btn" aria-expanded={open} aria-controls="fs-micros-list" onClick={() => setOpen(!open)}>
        {open ? 'Done' : 'Choose'}
      </button>
    </div>
  )
}

/** One meal: its name (saved when the field is left), its default time,
 *  moving it up or down, removing it. */
function MealRow({ meal, first, last, onName, onTime, onUp, onDown, onRemove }: {
  meal: MealName; first: boolean; last: boolean
  onName: (name: string) => void; onTime: (time: string | null) => void
  onUp: () => void; onDown: () => void; onRemove: () => void
}) {
  const [name, setName] = useState(meal.name)
  const [timing, setTiming] = useState(false)
  const commit = () => {
    const n = name.replace(/\s+/g, ' ').trim()
    if (n && n !== meal.name) onName(n.slice(0, MEAL_NAME_MAX))
    else setName(meal.name)
  }
  return (
    <li className="fs-meal">
      <input className="fs-meal-name" type="text" value={name} maxLength={MEAL_NAME_MAX} aria-label={`Name of ${meal.name}`}
        onChange={(e) => setName(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }} />
      <span className="fs-meal-time">
        {meal.time || timing ? (
          <>
            <input type="time" value={meal.time ?? ''} aria-label={`Default time of ${meal.name}`} autoFocus={!meal.time}
              // Only a whole time is saved; a half-typed one reads as empty.
              onChange={(e) => { if (/^\d\d:\d\d/.test(e.target.value)) { onTime(e.target.value.slice(0, 5)); setTiming(false) } }} />
            <button type="button" className="fs-icon" aria-label={`No default time for ${meal.name}`}
              onClick={() => { onTime(null); setTiming(false) }}>×</button>
          </>
        ) : (
          <button type="button" className="slot-link fs-addtime" onClick={() => setTiming(true)}>Add time</button>
        )}
      </span>
      <span className="fs-meal-tools">
        <button type="button" className="fs-icon" aria-label={`Move ${meal.name} up`} disabled={first} onClick={onUp}>↑</button>
        <button type="button" className="fs-icon" aria-label={`Move ${meal.name} down`} disabled={last} onClick={onDown}>↓</button>
        <button type="button" className="fs-icon" onClick={onRemove} aria-label={`Remove ${meal.name}`}>Remove</button>
      </span>
    </li>
  )
}
