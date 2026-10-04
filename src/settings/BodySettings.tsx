import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { edit } from '../lib/write'
import { recalcTargets, saveBodySettings, useBodySettings } from '../lib/body'
import { parseBirthDate, parseHeight, type RecalcWhy } from '../lib/body-rules'
import { DEFAULT_PLAN, PLAN_LIMITS, readPlan, type BodyPlan, type Goal } from '../lib/calc'
import { readStoredFactor } from '../lib/activity'
import { ActivityPicker } from '../ui/ActivityPicker'
import { Dropdown } from '../ui/Dropdown'
import type { Profile } from '../lib/types'
import '../ui/activity.css'
import { planToday } from '../lib/day-edge'

const GOALS: { value: Goal; label: string }[] = [
  { value: 'cut', label: 'Lose fat' }, { value: 'recomp', label: 'Maintain and recomp' }, { value: 'bulk', label: 'Build muscle' },
]
const SEXES = [{ value: 'female' as const, label: 'Female' }, { value: 'male' as const, label: 'Male' }]

/** Settings → Food and body → Body and goal: what the calorie budget rests on (sex,
 *  height, date of birth, goal, activity) and the numbers behind it (BODY-03).
 *  Any change works the targets out again from the latest weigh-in, starting
 *  today, and says so (BODY-04). The activity is the same picker onboarding
 *  uses (BODY-15). */
export function BodySettings() {
  const active = useApp((s) => s.profile)
  // The stored row, so a change made here (or synced in) shows at once.
  const profile = useLiveQuery(async () => (active ? (await db.profile.get(active.id)) ?? active : null), [active?.id]) ?? active
  const body = useBodySettings(profile?.id)
  const [note, setNote] = useState<string | null>(null)
  const [height, setHeight] = useState<string | null>(null)
  const [heightError, setHeightError] = useState<string | null>(null)
  if (!profile) return null
  const today = planToday()

  async function change(fields: Partial<Profile>, why: RecalcWhy) {
    const fresh = (await db.profile.get(profile!.id)) ?? profile!
    const next = await edit('profile', fresh, fields)
    setNote(await recalcTargets(next, today, why))
  }
  async function saveHeight() {
    if (height === null) return
    if (!height.trim()) { setHeightError(null); setHeight(null); await change({ height_cm: null }, 'height'); return }
    const h = parseHeight(height)
    if (!h.ok) { setHeightError(h.message); return }
    setHeightError(null)
    setHeight(null)
    if (h.value !== Number(profile!.height_cm)) await change({ height_cm: h.value }, 'height')
  }

  return (
    <>
      <p className="section-title">Body and goal</p>
      <div className="setting-row">
        <div className="row-name">Sex</div>
        <div style={{ width: 170 }}>
          <Dropdown label="Sex" value={profile.sex} options={SEXES} placeholder="Not given"
            onChange={(sex) => void change({ sex }, 'sex')} />
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Height</div>
          {heightError && <div className="row-meta" style={{ color: 'var(--e-warn)' }} role="alert">{heightError}</div>}
        </div>
        <div className="row-right">
          <input className="btn" inputMode="decimal" aria-label="Height in cm" style={{ width: 90, textAlign: 'right' }}
            value={height ?? (profile.height_cm ? String(Number(profile.height_cm)) : '')} placeholder="cm"
            onChange={(e) => setHeight(e.target.value)} onBlur={() => void saveHeight()}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveHeight() }} />
          <span className="row-meta">cm</span>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Date of birth</div>
          <div className="row-meta">For the age in the resting burn.</div>
        </div>
        <input className="btn" type="date" aria-label="Date of birth" max={today} value={profile.birth_date ?? ''} style={{ width: 160 }}
          onChange={(e) => {
            const v = e.target.value
            if (!v) { void change({ birth_date: null }, 'birth_date'); return }
            const b = parseBirthDate(v, today)
            if (b.ok) void change({ birth_date: b.value }, 'birth_date')
          }} />
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Goal</div>
          <div className="row-meta">{goalHint(body.plan)}</div>
        </div>
        <div style={{ width: 190 }}>
          <Dropdown label="Body goal" value={profile.goal} options={GOALS} onChange={(goal) => void change({ goal }, 'goal')} />
        </div>
      </div>
      <div className="setting-row" style={{ display: 'block' }}>
        <div className="row-name" style={{ marginBottom: 'var(--space-2)' }}>Activity</div>
        <ActivityPicker value={{ answers: body.activity, factor: readStoredFactor(profile.activity_level) }}
          onChange={async (v) => {
            await saveBodySettings(profile.id, { activity: v.answers })
            await change({ activity_level: v.factor }, 'activity')
          }} />
      </div>
      <PlanNumbers plan={body.plan} onSave={async (plan) => {
        await saveBodySettings(profile.id, { plan })
        setNote(await recalcTargets((await db.profile.get(profile.id)) ?? profile, today, 'plan'))
      }} />
      {note && <p className="empty" role="status" style={{ padding: 'var(--space-2) var(--space-4)' }}>{note}</p>}
    </>
  )
}

function goalHint(plan: BodyPlan): string {
  const sign = (n: number) => (n === 0 ? 'holds maintenance' : n < 0 ? `takes ${-n} kcal off` : `adds ${n} kcal`)
  return `Lose fat ${sign(plan.adjust.cut)}, recomp ${sign(plan.adjust.recomp)}, build muscle ${sign(plan.adjust.bulk)}.`
}

/** The numbers behind the targets (BODY-03): each goal's adjustment and
 *  protein per kg, and fat's share. The defaults stay one tap away. */
function PlanNumbers({ plan, onSave }: { plan: BodyPlan; onSave: (p: BodyPlan) => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const goals: Goal[] = ['cut', 'recomp', 'bulk']
  const cur = draft ?? {
    ...Object.fromEntries(goals.map((g) => [`adjust.${g}`, String(plan.adjust[g])])),
    ...Object.fromEntries(goals.map((g) => [`protein.${g}`, String(plan.protein[g])])),
    fat: String(Math.round(plan.fat_share * 100)),
  }
  const isDefault = JSON.stringify(plan) === JSON.stringify(DEFAULT_PLAN)

  async function save() {
    const n = (k: string) => Number(String(cur[k]).replace(',', '.').replace('−', '-'))
    for (const g of goals) {
      const [lo, hi] = PLAN_LIMITS.adjust[g]
      if (!Number.isFinite(n(`adjust.${g}`)) || n(`adjust.${g}`) < lo || n(`adjust.${g}`) > hi) { setError(`${GOALS.find((x) => x.value === g)!.label}: from ${lo} to ${hi} kcal.`); return }
      const [plo, phi] = PLAN_LIMITS.protein
      if (!Number.isFinite(n(`protein.${g}`)) || n(`protein.${g}`) < plo || n(`protein.${g}`) > phi) { setError(`Protein: ${plo} to ${phi} g per kg.`); return }
    }
    const fat = n('fat') / 100
    if (!Number.isFinite(fat) || fat < PLAN_LIMITS.fat_share[0] || fat > PLAN_LIMITS.fat_share[1]) { setError('Fat: 15% to 45% of the calories.'); return }
    setError(null)
    const next = readPlan({
      adjust: Object.fromEntries(goals.map((g) => [g, n(`adjust.${g}`)])),
      protein: Object.fromEntries(goals.map((g) => [g, n(`protein.${g}`)])),
      fat_share: fat,
    })
    setDraft(null)
    await onSave(next)
  }
  const set = (k: string, v: string) => setDraft({ ...cur, [k]: v })
  return (
    <details className="setting-row" style={{ display: 'block' }}>
      <summary className="row-name" style={{ cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center' }}>
        The numbers behind the targets{isDefault ? '' : ' (changed)'}
      </summary>
      <div className="form-grid" style={{ marginTop: 'var(--space-2)' }}>
        <p className="row-meta">Change these only if you follow a plan of your own. Calories a day against maintenance, and protein per kg of body weight.</p>
        {goals.map((g) => (
          <div key={g} className="two">
            <label>{GOALS.find((x) => x.value === g)!.label}, kcal<input inputMode="numeric" value={cur[`adjust.${g}`]} onChange={(e) => set(`adjust.${g}`, e.target.value)} /></label>
            <label>Protein, g per kg<input inputMode="decimal" value={cur[`protein.${g}`]} onChange={(e) => set(`protein.${g}`, e.target.value)} /></label>
          </div>
        ))}
        <div className="two">
          <label>Fat, % of calories<input inputMode="numeric" value={cur.fat} onChange={(e) => set('fat', e.target.value)} /></label>
          <span />
        </div>
        {error && <p className="ap-warn" role="alert">{error}</p>}
        <div className="sheet-actions" style={{ marginTop: 0 }}>
          {!isDefault && <button type="button" className="btn" onClick={() => { setDraft(null); void onSave(DEFAULT_PLAN) }}>Back to the defaults</button>}
          <button type="button" className="btn btn-primary grow" disabled={!draft} onClick={() => void save()}>Save the numbers</button>
        </div>
      </div>
    </details>
  )
}
