import { useState } from 'react'
import { useApp } from '../lib/store'
import { saveSettings } from '../lib/write'
import { NUTRIENTS, readSettings, type MealSlotKey, type Nutrient, type ProfileSettings } from '../lib/settings'
import { retimeMeals, SLOTS } from '../lib/meals'
import { Dropdown } from '../ui/Dropdown'
import './food-settings.css'

/** What the food pages count and show, and whether meals have default times.
 *  Everything here starts minimal: calories only, and no meal times, so the
 *  day plan never shows a time nobody chose. */
export function FoodSettings() {
  const profile = useApp((s) => s.profile)
  const [adding, setAdding] = useState<MealSlotKey | null>(null)
  if (!profile) return null
  const settings = readSettings(profile)

  async function change(next: Partial<ProfileSettings>) {
    const saved = await saveSettings(profile!, next)
    // Meals already planned from today on follow a changed default time.
    if (next.meal_times) await retimeMeals(profile!.id, settings, readSettings(saved))
  }

  function track(key: Nutrient, on: boolean) {
    const nutrients = on ? [...settings.nutrients, key] : settings.nutrients.filter((k) => k !== key)
    // A figure no longer tracked cannot stay on Today; calories take its place.
    const today_metric = !on && settings.today_metric === key ? 'kcal' : settings.today_metric
    void change({ nutrients, today_metric })
  }

  function setTime(slot: MealSlotKey, time: string | null) {
    const meal_times = { ...settings.meal_times }
    if (time) meal_times[slot] = time
    else delete meal_times[slot]
    void change({ meal_times })
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

      <div className="setting-row fs-times">
        <div>
          <div className="row-name">Default meal times</div>
          <div className="row-meta">
            Optional. A meal with a time sits at it on Today; without one it has none. A time given
            on the day itself always wins.
          </div>
        </div>
      </div>
      {SLOTS.map((s) => {
        const time = settings.meal_times[s.key]
        return (
          <div key={s.key} className="setting-row fs-time">
            <div className="row-name">{s.label}</div>
            <div className="row-right">
              {time || adding === s.key ? (
                <>
                  <input className="btn" type="time" value={time ?? ''} aria-label={`Default ${s.label} time`}
                    autoFocus={!time}
                    // Only a whole time is saved; a half-typed one reads as empty.
                    onChange={(e) => { if (/^\d\d:\d\d/.test(e.target.value)) { setTime(s.key, e.target.value.slice(0, 5)); setAdding(null) } }} />
                  <button type="button" className="btn" onClick={() => { if (time) setTime(s.key, null); setAdding(null) }}>
                    Remove
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => setAdding(s.key)}>Add time</button>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
