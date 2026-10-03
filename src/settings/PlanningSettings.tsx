import { useState } from 'react'
import { format } from 'date-fns'
import { useApp } from '../lib/store'
import { edit } from '../lib/write'
import { mergeSettings, NUTRIENTS, readSettings, type Commute, type Nutrient, type WorkHours } from '../lib/settings'
import { COUNTRIES, cleanCity, countryName } from '../lib/countries'
import { TEMPLATES, templateByKey } from '../lib/templates'
import { applyTemplate } from '../lib/setup'
import { applyWorkPlan } from '../lib/work'
import { describeWork } from '../lib/work-rules'
import { moduleByKey } from '../modules/registry'
import type { Profile } from '../lib/types'
import { Dropdown } from '../ui/Dropdown'
import { SearchPick } from '../ui/SearchPick'
import { WorkFields } from './WorkFields'
import './planning.css'

const COUNTRY_ITEMS = COUNTRIES.map((c) => ({ id: c.code, name: c.name, tag: c.code }))
const TEMPLATE_OPTIONS = TEMPLATES.map((t) => ({ value: t.key, label: t.name, hint: t.description }))

/** Everything the first-run setup asked, changeable later, each part on
 *  its own Settings page (v17): where you are (Profile), work hours and
 *  commute (Planning), and starting again from a template (Modules). Each
 *  is keyed by profile, so switching profiles starts from that profile's
 *  values. */
export function WhereYouAre() {
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  return <Where key={profile.id} profile={profile} />
}
export function WorkSettings() {
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  return <Work key={profile.id} profile={profile} />
}
export function StartingLayout() {
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  return <Layout key={profile.id} profile={profile} />
}

function Where({ profile }: { profile: Profile }) {
  const [city, setCity] = useState(profile.city ?? '')
  return (
    <>
      <p className="section-title">Where you are</p>
      <div className="pl-block">
        <div className="pl-field">
          <span>Country</span>
          <SearchPick items={COUNTRY_ITEMS} label="Country" placeholder="Type to find your country"
            value={countryName(profile.country)}
            onPick={(c) => void edit('profile', profile, { country: c.id })}
            onClear={() => void edit('profile', profile, { country: null })} />
        </div>
        <label className="pl-field">City or town
          <input value={city} maxLength={80} autoComplete="address-level2"
            onChange={(e) => setCity(e.target.value)}
            onBlur={() => { if (cleanCity(city) !== (profile.city ?? null)) void edit('profile', profile, { city: cleanCity(city) }) }} />
        </label>
        <p className="pl-note">Optional. For nearby shops and public holidays.</p>
      </div>
    </>
  )
}

function Work({ profile }: { profile: Profile }) {
  const settings = readSettings(profile)
  const [work, setWork] = useState<WorkHours>(settings.work)
  const [commute, setCommute] = useState<Commute>(settings.commute)
  const [savingWork, setSavingWork] = useState(false)
  const [workNote, setWorkNote] = useState<string | null>(null)

  // Work is saved with a button, not on every change: each save can stop and
  // start repeating series, and a time typed digit by digit would otherwise
  // leave a trail of them.
  const dirty = workKey(work, commute) !== workKey(settings.work, settings.commute)

  async function saveWork() {
    setSavingWork(true)
    try {
      const next = mergeSettings(readSettings(profile), { work, commute })
      const changes = await applyWorkPlan(profile, next)
      await edit('profile', profile, { settings: next })
      setWorkNote(changes.start.some((c) => c.start_date > format(new Date(), 'yyyy-MM-dd'))
        ? 'Saved. The new hours start tomorrow; today stays as it was planned.'
        : changes.start.length ? 'Saved. Added to the plan from today.'
        : changes.stop.length ? 'Saved. Work is no longer added to the plan after today.'
        : 'Saved.')
    } finally {
      setSavingWork(false)
    }
  }

  return (
    <>
      <p className="section-title">Work and commute</p>
      {settings.work.on && !dirty && <p className="pl-note pl-now">{describeWork(settings)}</p>}
      <WorkFields work={work} commute={commute}
        onWork={(c) => { setWork((w) => ({ ...w, ...c })); setWorkNote(null) }}
        onCommute={(c) => { setCommute((x) => ({ ...x, ...c })); setWorkNote(null) }} />
      {(dirty || workNote) && (
        <div className="pl-block">
          {workNote && <p className="pl-note">{workNote}</p>}
          {dirty && (
            <div className="pl-actions">
              <button type="button" className="btn"
                onClick={() => { setWork(settings.work); setCommute(settings.commute) }}>Undo changes</button>
              <button type="button" className="btn btn-primary grow" disabled={savingWork}
                onClick={() => void saveWork()}>Save work hours</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function Layout({ profile }: { profile: Profile }) {
  const settings = readSettings(profile)
  const [pick, setPick] = useState(templateByKey(settings.template)?.key ?? TEMPLATES[0].key)
  const [confirming, setConfirming] = useState(false)
  const [templateNote, setTemplateNote] = useState<string | null>(null)

  async function startAgain() {
    const tpl = templateByKey(pick)
    if (!tpl) return
    await applyTemplate(profile, tpl.key)
    setConfirming(false)
    setTemplateNote(`${tpl.name} applied.`)
  }

  const chosen = templateByKey(pick)
  const current = templateByKey(settings.template)

  return (
    <>
      <p className="section-title">Starting layout</p>
      <div className="pl-block">
        <p className="pl-note">
          {current ? <>Started from <b>{current.name}</b>. </> : ''}Nothing you entered is deleted.
        </p>
        <div className="pl-actions">
          <Dropdown label="Template" className="pl-grow" value={pick} options={TEMPLATE_OPTIONS}
            onChange={(v) => { setPick(v); setConfirming(false); setTemplateNote(null) }} />
          <button type="button" className="btn" onClick={() => setConfirming(true)}>Start again</button>
        </div>
        {confirming && chosen && (
          <div className="pl-confirm" role="alertdialog" aria-label={`Start again from ${chosen.name}`}>
            <p>
              On: {chosen.modules.map((k) => moduleByKey.get(k)?.name ?? k).join(', ')}. Every other module
              goes off (Custom is left as it is) and keeps what it holds. Food figures:{' '}
              {nutrientNames(chosen.nutrients)}; Today shows {chosen.today_metric === 'none' ? 'no figure' : nutrientNames([chosen.today_metric])}.
            </p>
            <p>
              Where each module shows (Today, Plan, the widget, Stats, reminders) goes back to the template’s
              choice{chosen.cards?.length ? <>, and Today’s pinned cards become {chosen.cards.map((c) => moduleByKey.get(c.key)?.name ?? c.key).join(', ')}</> : ''}.
              Work hours, targets, tasks and logs stay as they are.
            </p>
            <div className="pl-actions">
              <button type="button" className="btn" onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className="btn btn-primary grow" onClick={() => void startAgain()}>
                Start again from {chosen.name}
              </button>
            </div>
          </div>
        )}
        {templateNote && <p className="pl-note">{templateNote}</p>}
      </div>
    </>
  )
}

const nutrientNames = (keys: Nutrient[]) =>
  NUTRIENTS.filter((n) => keys.includes(n.key)).map((n) => n.label.toLowerCase()).join(', ')

/** Work and commute as one comparable string, days in a fixed order, so
 *  ticking a day off and on again does not count as a change. */
function workKey(work: WorkHours, commute: Commute): string {
  return JSON.stringify({ ...work, days: [...work.days].sort(), commute })
}
