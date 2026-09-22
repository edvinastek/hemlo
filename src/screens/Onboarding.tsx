import { useState } from 'react'
import { useApp } from '../lib/store'
import { edit } from '../lib/write'
import { targetsFor } from '../lib/calc'
import { db } from '../lib/db'
import { queueChange } from '../lib/sync'
import { MODULES } from '../modules/registry'

/** A blank profile, then the targets with the arithmetic shown, so no number
 *  in the app ever looks like it came from nowhere. The nav does not appear
 *  during onboarding. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const profile = useApp((s) => s.profile)
  const [step, setStep] = useState(0)
  const [name, setName] = useState(profile?.name ?? '')
  const [sex, setSex] = useState<'male' | 'female'>(profile?.sex ?? 'male')
  const [birth, setBirth] = useState(profile?.birth_date ?? '')
  const [height, setHeight] = useState(String(profile?.height_cm ?? ''))
  const [weight, setWeight] = useState('')
  const [activity, setActivity] = useState(String(profile?.activity_level ?? 1.5))
  const [goal, setGoal] = useState<'cut' | 'recomp' | 'bulk'>(profile?.goal ?? 'recomp')
  const [shifts, setShifts] = useState({ start: '08:00', end: '17:00' })
  const [chosen, setChosen] = useState<string[]>(MODULES.filter((m) => m.defaultOn).map((m) => m.key))

  if (!profile) return <p className="empty">Setting up…</p>

  const draft = {
    ...profile,
    sex, birth_date: birth || null,
    height_cm: Number(height) || null,
    activity_level: Number(activity),
    goal,
  }
  const targets = Number(weight) > 0 ? targetsFor(draft, Number(weight)) : null

  async function finish() {
    await edit('profile', profile!, {
      name: name || profile!.name,
      sex, birth_date: birth || null,
      height_cm: Number(height) || null,
      activity_level: Number(activity),
      goal,
      day_start: shifts.start,
      day_end: shifts.end,
    })

    if (targets) {
      const today = new Date().toISOString().slice(0, 10)
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

      if (Number(weight) > 0) {
        const log = {
          id: crypto.randomUUID(), profile_id: profile!.id, log_date: today,
          weight_kg: Number(weight), waist_cm: null, note: null,
        }
        await db.body_log.put(log)
        await queueChange('body_log', log, ['profile_id', 'log_date', 'weight_kg'])
      }
    }

    const instances = await db.module_instance.where('profile_id').equals(profile!.id).toArray()
    for (const inst of instances) {
      const want = chosen.includes(inst.module_key)
      if (inst.enabled !== want) await edit('module_instance', inst, { enabled: want })
    }
    onDone()
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 'var(--space-6) 0' }}>
        <header className="page-head">
          <h1 className="page-date">
            {step === 0 ? 'Who is planning' : step === 1 ? 'Your day' : step === 2 ? 'Targets' : 'What to plan'}
          </h1>
          <p className="page-sub">Step {step + 1} of 4</p>
        </header>

        {step === 0 && (
          <>
            <Field label="Name" value={name} onChange={setName} />
            <div className="setting-row">
              <div className="row-name">Sex</div>
              <select className="btn" value={sex} onChange={(e) => setSex(e.target.value as 'male' | 'female')}>
                <option value="male">male</option><option value="female">female</option>
              </select>
            </div>
            <Field label="Date of birth" value={birth} onChange={setBirth} type="date" />
            <Field label="Height" value={height} onChange={setHeight} unit="cm" type="number" />
          </>
        )}

        {step === 1 && (
          <>
            <p className="empty">
              Work hours are locked in the planner: nothing is scheduled across them, and
              meals land around them rather than inside them.
            </p>
            <Field label="Work starts" value={shifts.start} onChange={(v) => setShifts({ ...shifts, start: v })} type="time" />
            <Field label="Work ends" value={shifts.end} onChange={(v) => setShifts({ ...shifts, end: v })} type="time" />
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Weight today" value={weight} onChange={setWeight} unit="kg" type="number" />
            <div className="setting-row">
              <div>
                <div className="row-name">Activity</div>
                <div className="row-meta">1.2 desk job · 1.5 hard training twice a day · 1.9 very active</div>
              </div>
              <input className="btn" style={{ width: 90, textAlign: 'right' }} value={activity}
                onChange={(e) => setActivity(e.target.value)} />
            </div>
            <div className="setting-row">
              <div className="row-name">Goal</div>
              <select className="btn" value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}>
                <option value="cut">cut</option><option value="recomp">recomp</option><option value="bulk">bulk</option>
              </select>
            </div>

            {targets ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <div className="totals" style={{ padding: 0 }}>
                  <span><b>{targets.kcal}</b> kcal</span>
                  <span><b>{targets.protein_g}</b> g protein</span>
                  <span><b>{targets.fat_g}</b> g fat</span>
                  <span><b>{targets.carbs_g}</b> g carbs</span>
                </div>
                <p className="row-meta" style={{ marginTop: 8 }}>{targets.explain}</p>
              </div>
            ) : (
              <p className="empty">Put in a weight and the targets appear, with the arithmetic that produced them.</p>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <p className="empty">
              Turn on what you actually want to plan. Nothing is lost by leaving one off —
              switch it on later and it is there.
            </p>
            {MODULES.filter((m) => m.key !== 'custom').map((m) => (
              <div key={m.key} className="setting-row">
                <div>
                  <div className="row-name">{m.name}</div>
                  <div className="row-meta">{m.summary}</div>
                </div>
                <button
                  className="switch" role="switch" aria-checked={chosen.includes(m.key)}
                  aria-label={m.name}
                  onClick={() => setChosen((c) => c.includes(m.key) ? c.filter((k) => k !== m.key) : [...c, m.key])}
                />
              </div>
            ))}
          </>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-4)' }}>
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
          <button
            className="btn btn-primary"
            style={{ marginLeft: 'auto' }}
            onClick={() => (step < 3 ? setStep(step + 1) : void finish())}
          >
            {step < 3 ? 'Next' : 'Start planning'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, unit, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; unit?: string; type?: string
}) {
  return (
    <div className="setting-row">
      <div className="row-name">{label}</div>
      <div className="row-right">
        <input className="btn" type={type} value={value} style={{ width: 150, textAlign: 'right' }}
          onChange={(e) => onChange(e.target.value)} />
        {unit && <span className="row-meta">{unit}</span>}
      </div>
    </div>
  )
}
