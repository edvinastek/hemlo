import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, setMeta } from '../lib/db'
import { useApp } from '../lib/store'
import { readSettings, type ShoppingTrip } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { syncTrip, today } from '../lib/shopping'
import { describeDays, listWindow, windowText } from '../lib/shopping-rules'
import { WEEK_ORDER } from '../lib/schedule-rules'
import './shopping-settings.css'

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Settings → Shopping (SHOP-02, SHOP-20, SHOP-21, STK-02): the shopping
 *  trip on the plan, the days it happens on and the meals the list covers;
 *  whether eaten meals take from stock (also in the Stock tab's ⋮). Shown
 *  only while Shopping is on. One helper line a row at most (CALM-12). */
export function ShoppingSettings() {
  const profile = useApp((s) => s.profile)
  const navigate = useNavigate()
  const on = useLiveQuery(async () => !!profile && !!(await db.module_instance.where('profile_id').equals(profile.id)
    .filter((m) => m.module_key === 'shopping').first())?.enabled, [profile?.id], false)
  const [minutes, setMinutes] = useState<string | null>(null)
  const [days, setDays] = useState<string | null>(null)
  if (!profile || !on) return null
  const all = readSettings(profile)
  const s = { ...all.shopping, stock_auto: all.stock_auto }
  const trip = s.trip
  const window = listWindow(today(), trip.days, s.window_days)

  async function change(next: Partial<ShoppingTrip>, place = true) {
    const saved = await saveSettings(profile!, { shopping: { trip: next } })
    // The trip goes where the new settings say, at once.
    await syncTrip(saved.id, { replace: place })
  }

  function toggleDay(d: number) {
    const next = trip.days.includes(d) ? trip.days.filter((x) => x !== d) : [...trip.days, d]
    void change({ days: next })
  }

  return (
    <>
      <p className="section-title">Shopping</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Plan a shopping trip when the list has items</div>
          <div className="row-meta">“Shopping (12 items)” on {describeDays(trip.days)} at {trip.time}, gone when the list is empty.</div>
        </div>
        <button className="switch" role="switch" aria-checked={trip.on} aria-label="Plan a shopping trip when the list has items"
          onClick={() => void change({ on: !trip.on })} />
      </div>

      <div className="setting-row ss-block">
        <div>
          <div className="row-name" id="ss-days">Shopping days</div>
          <div className="row-meta">{trip.days.length ? `On ${describeDays(trip.days)}.` : 'None chosen: the trip goes on the next day.'}</div>
          <div className="ss-days" role="group" aria-labelledby="ss-days">
            {WEEK_ORDER.map((d) => (
              <button key={d} type="button" className="shop-chip" aria-pressed={trip.days.includes(d)} aria-label={LONG[d]}
                onClick={() => toggleDay(d)}>{SHORT[d]}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="setting-row ss-block">
        <div>
          <div className="row-name">Time and length</div>
          <div className="ss-inline">
            <label className="ss-field">
              <span>At</span>
              <input type="time" value={trip.time} onChange={(e) => { if (/^\d{2}:\d{2}/.test(e.target.value)) void change({ time: e.target.value.slice(0, 5) }) }} />
            </label>
            <label className="ss-field">
              <span>For</span>
              <input type="number" inputMode="numeric" min={5} max={600} step={5} value={minutes ?? String(trip.minutes)}
                onChange={(e) => setMinutes(e.target.value)}
                onBlur={() => {
                  const n = Number(minutes)
                  if (minutes !== null && Number.isFinite(n) && n >= 5 && n <= 600) void change({ minutes: Math.round(n) })
                  setMinutes(null)
                }} />
              <span>minutes</span>
            </label>
          </div>
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="row-name">Lock the trip</div>
          <div className="row-meta">It keeps its time; nothing is planned over it.</div>
        </div>
        <button className="switch" role="switch" aria-checked={trip.locked} aria-label="Lock the shopping trip"
          onClick={() => void change({ locked: !trip.locked })} />
      </div>

      <div className="setting-row ss-block">
        <div>
          <div className="row-name">Meals the list covers</div>
          {trip.days.length ? (
            <div className="row-meta">Until the trip after next: now {windowText(window.from, window.to)}.</div>
          ) : (
            <>
              <div className="row-meta">The next days of planned meals: now {windowText(window.from, window.to)}.</div>
              <label className="ss-field">
                <input type="number" inputMode="numeric" min={1} max={28} value={days ?? String(s.window_days)}
                  aria-label="Days of meals the list covers" onChange={(e) => setDays(e.target.value)}
                  onBlur={async () => {
                    const n = Number(days)
                    if (days !== null && Number.isFinite(n) && n >= 1 && n <= 28) {
                      const saved = await saveSettings(profile!, { shopping: { window_days: Math.round(n) } })
                      await syncTrip(saved.id)
                    }
                    setDays(null)
                  }} />
                <span>days</span>
              </label>
            </>
          )}
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="row-name">Take from stock when meals are eaten</div>
          <div className="row-meta">A meal ticked eaten takes its ingredients off the stock; unticked, they go back.</div>
        </div>
        <button className="switch" role="switch" aria-checked={s.stock_auto} aria-label="Take from stock when meals are eaten"
          onClick={() => void saveSettings(profile!, { stock_auto: !s.stock_auto })} />
      </div>

      <div className="setting-row">
        <div>
          <div className="row-name">Shops, aisles and prices</div>
          <div className="row-meta">On the Shop page, under Stores.</div>
        </div>
        <button type="button" className="btn" onClick={async () => { await setMeta('shop:tab', 'Stores'); navigate('/shop') }}>Open Stores</button>
      </div>

    </>
  )
}
