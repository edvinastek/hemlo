import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { useApp } from '../lib/store'
import { completeProfile, retarget, saveWeighIn, targetsOn, weighIns } from '../lib/body'
import {
  formatChange, isFutureDay, missingFields, missingForTargets, movingAverage,
  parseBirthDate, parseHeight, parseWaist, pickProfile, parseWeight, trendPoints, withChanges,
} from '../lib/body-rules'
import type { Profile } from '../lib/types'
import { builtinRuleOn } from '../modules/rule-switch'
import './weighin.css'

const SHOWN = 8
const TREND_W = 280
const TREND_H = 44

const dayLabel = (d: string) => format(parseISO(d), 'EEE d MMM')
const kg = (n: number) => `${n.toFixed(1)} kg`

/** The day's weigh-in, the targets it produces, and the recent trend. Saving
 *  a weight recalculates the targets from that day, and the arithmetic is
 *  printed under them so no number looks like it came from nowhere. */
export function WeighIn({ profileId, day, history: showHistory = true }: {
  profileId: string; day: string
  /** The last weigh-ins and their trend; the Health page has its own chart
   *  and list, so it leaves them out (v17: shown once). */
  history?: boolean
}) {
  const { profile: active, profiles } = useApp()
  // Another profile's height and age must never feed this one's targets,
  // and the store's active profile can be an old copy; pickProfile says why.
  const profile = pickProfile(profiles, active, profileId)

  const history = useLiveQuery(() => weighIns(profileId), [profileId])
  const target = useLiveQuery(() => targetsOn(profileId, day), [profileId, day])

  const entry = history?.find((r) => r.log_date === day)
  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Fill the form from the day's entry when the day changes or the entry
  // itself changes (saved here or arriving from sync). What someone has typed
  // for this day stays until they save it or move to another day.
  const entryKey = `${day}|${entry?.id ?? ''}|${entry?.updated_at ?? ''}`
  const typed = useRef<string | null>(null)
  useEffect(() => {
    if (typed.current === day) return
    typed.current = null
    setWeight(entry ? String(entry.weight_kg) : '')
    setWaist(entry?.waist_cm != null ? String(entry.waist_cm) : '')
    setError(null)
  }, [entryKey])
  const typing = () => { typed.current = day }
  useEffect(() => setNote(null), [day])

  const today = format(new Date(), 'yyyy-MM-dd')
  const future = isFutureDay(day, today)
  const missing = profile ? missingForTargets(profile) : null

  async function save(e: FormEvent) {
    e.preventDefault()
    setNote(null)
    const w = parseWeight(weight)
    if (!w.ok) return setError(w.message)
    const c = parseWaist(waist)
    if (!c.ok) return setError(c.message)
    setError(null)
    setSaving(true)
    typed.current = null
    try {
      await saveWeighIn(profileId, day, w.value!, c.value)
      // The Health rule "when the weight changes, recalculate the targets",
      // which can be switched off in Edit module.
      if (profile && !await builtinRuleOn(profileId, 'health', 'retarget')) {
        setNote('Weight saved. Targets are left as they are: recalculating is switched off in Edit module.')
      } else if (profile) {
        const result = await retarget(profile, day, w.value!)
        setNote('missing' in result ? 'Weight saved. Targets were not recalculated.' : 'Weight saved and targets recalculated.')
      } else {
        setNote('Weight saved. Targets were not recalculated because this profile is not loaded yet.')
      }
    } catch {
      // A local write only fails when the browser refuses storage, for
      // example when the phone is out of space. Say so rather than leave the
      // button looking as if it did nothing.
      setError('This could not be saved on the phone. Check there is free space and try again.')
    } finally {
      setSaving(false)
    }
  }

  const all = history ?? []
  // Changes are worked out over the whole history so the oldest row shown
  // still compares with the one before it.
  const rows = withChanges(all).slice(0, SHOWN)
  const trend = movingAverage(all).filter((p) => rows.some((r) => r.log_date === p.log_date))

  return (
    <section className="weighin" aria-label="Weigh-in">
      <p className="section-title">Weigh-in · {dayLabel(day)}</p>
      {future ? (
        <p className="empty">This day has not happened yet. A weigh-in can be logged on the day or after it.</p>
      ) : (
        <form className="form-grid weighin-form" onSubmit={save} noValidate>
          <div className="two">
            <label>
              Weight, kg
              <input inputMode="decimal" autoComplete="off" value={weight} placeholder="82.4"
                onChange={(e) => { typing(); setWeight(e.target.value) }} aria-invalid={error !== null && !parseWeight(weight).ok} />
            </label>
            <label>
              Waist, cm (optional)
              <input inputMode="decimal" autoComplete="off" value={waist}
                onChange={(e) => { typing(); setWaist(e.target.value) }} aria-invalid={error !== null && !parseWaist(waist).ok} />
            </label>
          </div>
          {error && <p className="weighin-warn" role="alert">{error}</p>}
          <div className="weighin-actions">
            <span className="row-meta">
              {note ?? (entry ? 'Logged for this day. Saving again updates it.' : 'Nothing logged for this day yet.')}
            </span>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {entry ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      )}

      <p className="section-title">Targets</p>
      {missing && profile && (
        <ProfileGaps key={profile.id} profile={profile} day={day} hasWeighIn={all.some((r) => r.log_date <= day)} message={missing} />
      )}
      {target ? (
        <div className="weighin-targets">
          <div className="totals">
            <span><b>{Math.round(Number(target.kcal ?? 0))}</b> kcal</span>
            <span><b>{Math.round(Number(target.protein_g ?? 0))}</b> g protein</span>
            <span><b>{Math.round(Number(target.fat_g ?? 0))}</b> g fat</span>
            <span><b>{Math.round(Number(target.carbs_g ?? 0))}</b> g carbs</span>
            <span><b>{Math.round(Number(target.fiber_g ?? 0))}</b> g fibre</span>
          </div>
          <p className="weighin-explain">
            {target.reason ? `Targets ${target.reason}` : 'Targets entered without a recorded calculation'}
            {' · since '}{dayLabel(target.from_date)}
          </p>
        </div>
      ) : (
        !missing && <p className="empty">No targets yet. Save a weigh-in and they are worked out from it.</p>
      )}

      {showHistory && <p className="section-title">Last {SHOWN} weigh-ins</p>}
      {!showHistory ? null : rows.length === 0 ? (
        <p className="empty">No weigh-ins yet. The first one starts the trend.</p>
      ) : (
        <>
          {trend.length > 1 && (
            <figure className="weighin-trend">
              <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} preserveAspectRatio="none" role="img"
                aria-label={`7-day average from ${kg(trend[0].avg)} to ${kg(trend[trend.length - 1].avg)}`}>
                <polyline points={trendPoints(trend, TREND_W, TREND_H, 3)} fill="none"
                  stroke="var(--e-accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
                  vectorEffect="non-scaling-stroke" />
              </svg>
              <figcaption className="row-meta">
                7-day average, {kg(trend[0].avg)} on {dayLabel(trend[0].log_date)} to {kg(trend[trend.length - 1].avg)} on {dayLabel(trend[trend.length - 1].log_date)}
              </figcaption>
            </figure>
          )}
          <ol className="weighin-list">
            {rows.map((r) => (
              <li key={r.id} className={r.log_date === day ? 'is-day' : undefined}>
                <span className="weighin-date">{dayLabel(r.log_date)}</span>
                <span className="weighin-value">
                  {kg(r.weight_kg)}
                  {r.waist_cm != null && <span className="weighin-waist"> · waist {Number(r.waist_cm).toFixed(1)} cm</span>}
                </span>
                <span className="weighin-change">{formatChange(r.change)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}


/** Asks for the sex, height or date of birth the targets are waiting for, right
 *  where the gap shows. More has no date of birth field, so without this a
 *  profile made without one could never get targets. */
function ProfileGaps({ profile, day, hasWeighIn, message }: {
  profile: Profile; day: string; hasWeighIn: boolean; message: string
}) {
  const gaps = missingFields(profile)
  const [height, setHeight] = useState('')
  const [birth, setBirth] = useState('')
  const [sex, setSex] = useState<'female' | 'male' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const today = format(new Date(), 'yyyy-MM-dd')
    const fields: Partial<Pick<Profile, 'height_cm' | 'birth_date' | 'sex'>> = {}
    if (gaps.includes('sex')) {
      if (!sex) return setError('Choose female or male: the resting burn differs between the two, so it is not guessed.')
      fields.sex = sex
    }
    if (gaps.includes('height')) {
      const h = parseHeight(height)
      if (!h.ok) return setError(h.message)
      fields.height_cm = h.value
    }
    if (gaps.includes('birth_date')) {
      const b = parseBirthDate(birth, today)
      if (!b.ok) return setError(b.message)
      fields.birth_date = b.value
    }
    setError(null)
    setSaving(true)
    try {
      await completeProfile(profile, fields, day)
    } catch {
      setError('This could not be saved on the phone. Check there is free space and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-grid weighin-form weighin-gaps" onSubmit={save} noValidate>
      <p className="weighin-missing">
        {message} Add {gaps.length > 1 ? 'them' : 'it'} here{hasWeighIn
          ? ' and the targets are worked out from your latest weigh-in.'
          : ', then save a weigh-in to work the targets out.'}
      </p>
      {gaps.includes('sex') && (
        <div role="group" aria-label="Sex" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {(['female', 'male'] as const).map((v) => (
            <button key={v} type="button" className={sex === v ? 'btn btn-primary grow' : 'btn grow'} aria-pressed={sex === v}
              style={{ minHeight: 48 }} onClick={() => setSex(v)}>{v === 'female' ? 'Female' : 'Male'}</button>
          ))}
        </div>
      )}
      <div className={gaps.filter((g) => g !== 'sex').length > 1 ? 'two' : undefined}>
        {gaps.includes('height') && (
          <label>
            Height, cm
            <input inputMode="decimal" autoComplete="off" value={height} placeholder="180"
              onChange={(e) => setHeight(e.target.value)} />
          </label>
        )}
        {gaps.includes('birth_date') && (
          <label>
            Date of birth
            <input type="date" value={birth} max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setBirth(e.target.value)} />
          </label>
        )}
      </div>
      {error && <p className="weighin-warn" role="alert">{error}</p>}
      <div className="weighin-actions">
        <span />
        <button className="btn btn-primary" type="submit" disabled={saving}>Save</button>
      </div>
    </form>
  )
}
