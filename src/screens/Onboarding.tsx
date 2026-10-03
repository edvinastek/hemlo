import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useApp } from '../lib/store'
import { edit } from '../lib/write'
import { missingForCalc, targetsFor } from '../lib/calc'
import { db } from '../lib/db'
import { queueChange } from '../lib/sync'
import { mergeSettings, readSettings, type Commute, type WorkHours } from '../lib/settings'
import { COUNTRIES, cleanCity, cleanCountry, countryName } from '../lib/countries'
import { DEFAULT_TEMPLATE, TEMPLATES, modulesFor, suggestTemplate, templateByKey, templateLayout } from '../lib/templates'
import { DEFAULT_FACTOR, NO_ANSWERS } from '../lib/activity'
import { saveBodySettings } from '../lib/body'
import { ActivityPicker, type ActivityValue } from '../ui/ActivityPicker'
import { applyModules, TEMPLATE_MODULE_KEYS } from '../lib/setup'
import { applyWorkPlan } from '../lib/work'
import { MODULES, moduleByKey } from '../modules/registry'
import { suggestModules } from '../modules/def-rules'
import { Dropdown } from '../ui/Dropdown'
import { SearchPick } from '../ui/SearchPick'
import { WorkFields } from '../settings/WorkFields'
import './onboarding.css'

const TITLES = ['Who is planning', 'Your day', 'Start from', 'Body targets']

const SEX_OPTIONS = [{ value: 'female' as const, label: 'Female' }, { value: 'male' as const, label: 'Male' }]
const GOAL_OPTIONS = [
  { value: 'cut' as const, label: 'Lose fat', hint: '500 kcal under maintenance' },
  { value: 'recomp' as const, label: 'Maintain and recomp', hint: 'at maintenance' },
  { value: 'bulk' as const, label: 'Build muscle', hint: '300 kcal over maintenance' },
]
const COUNTRY_ITEMS = COUNTRIES.map((c) => ({ id: c.code, name: c.name, tag: c.code }))

/** First run, four short steps, all optional but a name. The app is a planner
 *  first: who is planning, the fixed parts of the day (if there are any), a
 *  starting layout, and only then, if wanted, calorie and body targets. The
 *  nav does not appear during onboarding. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const profile = useApp((s) => s.profile)
  const initial = useMemo(() => readSettings(profile), [profile?.id])
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  // 1. Who is planning
  const [name, setName] = useState(profile?.name ?? '')
  const [country, setCountry] = useState<string | null>(cleanCountry(profile?.country))
  const [city, setCity] = useState(profile?.city ?? '')

  // 2. Your day
  const [work, setWork] = useState<WorkHours>(initial.work)
  const [commute, setCommute] = useState<Commute>(initial.commute)

  // 3. Start from
  const firstTemplate = templateByKey(initial.template)?.key ?? DEFAULT_TEMPLATE
  const [template, setTemplate] = useState(firstTemplate)
  const [pickedByHand, setPickedByHand] = useState(false)
  const [describe, setDescribe] = useState('')
  const [modules, setModules] = useState<string[]>(modulesFor(firstTemplate))
  const [showModules, setShowModules] = useState(false)
  const suggestion = suggestTemplate(describe)
  // Modules whose own keywords appear in the words typed (MOD-07), beyond
  // what the template already switches on: offered one tap each.
  const extraModules = suggestModules(describe).filter((k) => k !== 'custom' && !modules.includes(k) && moduleByKey.has(k))

  // 4. Body targets
  const [targetsOn, setTargetsOn] = useState(templateByKey(firstTemplate)!.targets)
  const [sex, setSex] = useState<'male' | 'female' | null>(profile?.sex ?? null)
  const [birth, setBirth] = useState(profile?.birth_date ?? '')
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '')
  const [weight, setWeight] = useState('')
  const [activityChoice, setActivityChoice] = useState<ActivityValue>({ answers: NO_ANSWERS, factor: DEFAULT_FACTOR })
  const activity = activityChoice.factor
  const [goal, setGoal] = useState<'cut' | 'recomp' | 'bulk'>(profile?.goal ?? 'recomp')

  if (!profile) return <p className="empty">Setting up…</p>

  const tpl = templateByKey(template)!
  const draft = {
    ...profile,
    sex, birth_date: birth || null,
    height_cm: Number(height) || null,
    activity_level: activity,
    goal,
  }
  // No guessing: without sex, height and date of birth there is no resting
  // burn to work from, so no targets are shown or saved (BODY-05).
  const missing = missingForCalc(draft)
  const targets = targetsOn && Number(weight) > 0
    ? targetsFor(draft, Number(weight), new Date(), { trainingAdded: activityChoice.answers.mode === 'added' }) : null
  const missingWords = [
    ...missing.map((m) => (m === 'birth_date' ? 'date of birth' : m)),
    ...(Number(weight) > 0 ? [] : ['weight today']),
  ]

  function choose(key: string, byHand: boolean) {
    setTemplate(key)
    setModules(modulesFor(key))
    setTargetsOn(templateByKey(key)!.targets)
    if (byHand) setPickedByHand(true)
  }

  function onDescribe(text: string) {
    setDescribe(text)
    // A suggestion takes over only until a card has been tapped: after that
    // the person's own pick stands, and the suggestion is just highlighted.
    const s = suggestTemplate(text)
    if (s && !pickedByHand && s.key !== template) choose(s.key, false)
  }

  /** "Skip": a working planner straight away (ONB-11): Today, Plan and
   *  tasks, the Minimal planner's layout, no work hours and no body details.
   *  Everything can be set later in More. */
  async function skip() {
    if (busy) return
    await finish({ skipping: true })
  }

  async function finish(opts: { skipping?: boolean } = {}) {
    if (busy) return
    setBusy(true)
    try {
      const chosen = opts.skipping ? templateByKey(DEFAULT_TEMPLATE)! : tpl
      const on = opts.skipping ? modulesFor(DEFAULT_TEMPLATE) : modules
      const settings = mergeSettings(readSettings(profile), {
        onboarded: true, template: chosen.key,
        ...(opts.skipping ? {} : { work, commute }),
        nutrients: [...chosen.nutrients], today_metric: chosen.today_metric,
        // Where each module shows and the cards pinned to Today (ONB-10).
        ...templateLayout(chosen.key, on, TEMPLATE_MODULE_KEYS),
      })

      await applyModules(profile!.id, on)

      // Body fields, the target and the weigh-in only when targets are wanted:
      // with the switch off, nothing about the body is written anywhere.
      const body = targetsOn && !opts.skipping ? {
        sex, birth_date: birth || null,
        height_cm: Number(height) || null,
        activity_level: activity,
        goal,
      } : {}

      if (targetsOn && !opts.skipping) await saveBodySettings(profile!.id, { activity: activityChoice.answers })

      if (targets && !opts.skipping) {
        // The person's own calendar day, not the UTC date, which is still
        // yesterday until 02:00 in the Netherlands in summer.
        const today = format(new Date(), 'yyyy-MM-dd')
        const row = {
          id: crypto.randomUUID(),
          profile_id: profile!.id,
          from_date: today,
          kcal: targets.kcal,
          protein_g: targets.protein_g,
          fat_g: targets.fat_g,
          carbs_g: targets.carbs_g,
          fiber_g: targets.fiber_g,
          reason: targets.explain,
          updated_at: new Date().toISOString(),
        }
        await db.target.put(row)
        await queueChange('target', row, ['profile_id', 'from_date', 'kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'reason'])

        const log = {
          id: crypto.randomUUID(), profile_id: profile!.id, log_date: today,
          weight_kg: Number(weight), waist_cm: null, note: null,
        }
        await db.body_log.put(log)
        await queueChange('body_log', log, ['profile_id', 'log_date', 'weight_kg'])
      }

      if (!opts.skipping) await applyWorkPlan(profile!, settings)

      // The profile goes last: marking it onboarded is what swaps this screen
      // for the app, so everything else is already in place when it does.
      await edit('profile', profile!, {
        name: name.trim() || profile!.name,
        country: cleanCountry(country),
        city: cleanCity(city),
        settings,
        ...body,
      })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const canGoOn = step !== 0 || name.trim().length > 0
  const last = step === TITLES.length - 1

  return (
    <div className="page">
      <div className="ob">
        <header className="page-head">
          <p className="page-sub">Step {step + 1} of {TITLES.length}</p>
          <h1 className="page-date">{TITLES[step]}</h1>
        </header>

        {step === 0 && (
          <div className="ob-form">
            <label className="ob-field">Name
              <input value={name} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="ob-field">
              <span>Country <span className="ob-optional">optional</span></span>
              <SearchPick items={COUNTRY_ITEMS} label="Country" placeholder="Type to find your country"
                value={countryName(country)} onPick={(c) => setCountry(c.id)} onClear={() => setCountry(null)} />
            </div>
            <label className="ob-field">
              <span>City or town <span className="ob-optional">optional</span></span>
              <input value={city} maxLength={80} autoComplete="address-level2" onChange={(e) => setCity(e.target.value)} />
            </label>
            <p className="ob-note">Country and city are used for nearby shops and public holidays. You can change them in Settings.</p>
          </div>
        )}

        {step === 1 && (
          <>
            <p className="ob-lead">Only the fixed parts, if you have any. Everything else you plan as you go.</p>
            <WorkFields work={work} commute={commute}
              onWork={(c) => setWork((w) => ({ ...w, ...c }))}
              onCommute={(c) => setCommute((x) => ({ ...x, ...c }))} />
          </>
        )}

        {step === 2 && (
          <>
            <div className="ob-form">
              <label className="ob-field">Describe your days in a few words
                <input value={describe} placeholder="e.g. student, exams, part-time job"
                  onChange={(e) => onDescribe(e.target.value)} />
              </label>
              {describe.trim() && (
                <p className="ob-note" aria-live="polite">
                  {suggestion
                    ? <>Suggested: <b>{templateByKey(suggestion.key)!.name}</b>, from “{suggestion.matched.join('”, “')}”.</>
                    : 'No match for those words. Pick the closest below.'}
                </p>
              )}
              {extraModules.length > 0 && (
                <div className="ob-extra" aria-live="polite">
                  <span className="ob-note">Those words also point at:</span>
                  {extraModules.map((k) => (
                    <button key={k} type="button" className="chip ob-add"
                      aria-label={`Switch on ${moduleByKey.get(k)!.name}`}
                      onClick={() => setModules((c) => (c.includes(k) ? c : [...c, k]))}>
                      + {moduleByKey.get(k)!.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="ob-cards" role="radiogroup" aria-label="Starting layout">
              {TEMPLATES.map((t) => (
                <button key={t.key} type="button" role="radio" aria-checked={t.key === template}
                  className={`ob-card${suggestion?.key === t.key ? ' is-suggested' : ''}`}
                  onClick={() => choose(t.key, true)}>
                  <span className="ob-card-name">
                    {t.name}
                    {suggestion?.key === t.key && <span className="ob-tag">suggested</span>}
                  </span>
                  <span className="ob-card-desc">{t.description}</span>
                </button>
              ))}
            </div>

            <button type="button" className="ob-expander" aria-expanded={showModules}
              onClick={() => setShowModules((v) => !v)}>
              <span>Adjust modules</span>
              <span className="ob-expander-meta">{modules.length} on {showModules ? '▴' : '▾'}</span>
            </button>
            {showModules && MODULES.filter((m) => m.key !== 'custom').map((m) => (
              <div key={m.key} className="setting-row">
                <div>
                  <div className="row-name">{m.name}</div>
                  <div className="row-meta">{m.summary}</div>
                </div>
                <button
                  className="switch" role="switch" aria-checked={modules.includes(m.key)}
                  aria-label={m.name}
                  onClick={() => setModules((c) => c.includes(m.key) ? c.filter((k) => k !== m.key) : [...c, m.key])}
                />
              </div>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <div className="setting-row">
              <div>
                <div className="row-name">Set calorie and body targets</div>
                <div className="row-meta">
                  Optional. A calorie and protein budget for the meal plan. While this is off,
                  nothing about your body is saved.
                </div>
              </div>
              <button className="switch" role="switch" aria-checked={targetsOn}
                aria-label="Set calorie and body targets" onClick={() => setTargetsOn((v) => !v)} />
            </div>

            {targetsOn && (
              <div className="ob-form">
                <div className="ob-two">
                  <div className="ob-field">
                    <span>Sex</span>
                    <Dropdown label="Sex" value={sex} options={SEX_OPTIONS} onChange={setSex} />
                  </div>
                  <label className="ob-field">Date of birth
                    <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
                  </label>
                </div>
                <div className="ob-two">
                  <label className="ob-field">Height, cm
                    <input type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
                  </label>
                  <label className="ob-field">Weight today, kg
                    <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </label>
                </div>
                <div className="ob-field">
                  <span>Activity</span>
                  <ActivityPicker value={activityChoice} onChange={setActivityChoice} />
                </div>
                <div className="ob-field">
                  <span>Body goal</span>
                  <Dropdown label="Body goal" value={goal} options={GOAL_OPTIONS} onChange={setGoal} />
                </div>

                {targets ? (
                  <div className="ob-targets">
                    <div className="totals" style={{ padding: 0 }}>
                      <span><b>{targets.kcal}</b> kcal</span>
                      <span><b>{targets.protein_g}</b> g protein</span>
                      <span><b>{targets.fat_g}</b> g fat</span>
                      <span><b>{targets.carbs_g}</b> g carbs</span>
                    </div>
                    <p className="row-meta">{targets.explain}</p>
                  </div>
                ) : (
                  <p className="ob-note" aria-live="polite">
                    Still needed for the targets: {missingWords.join(', ')}. They then appear with the arithmetic that produced them.
                  </p>
                )}
              </div>
            )}
            {!targetsOn && (
              <p className="ob-note ob-pad">Targets can be added later: height and date of birth in Settings, then a weigh-in on the Body tab.</p>
            )}
          </>
        )}

        <div className="ob-actions">
          {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>Back</button>}
          {!last && (
            <button type="button" className="btn ob-skip" disabled={busy} onClick={() => void skip()}
              title="Start with Today, Plan and tasks; set the rest later in Settings">Skip</button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canGoOn || busy}
            onClick={() => (last ? void finish() : setStep(step + 1))}
          >
            {last ? 'Start planning' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
