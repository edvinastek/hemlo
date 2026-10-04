import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { weighIns } from '../lib/body'
import { formatChange } from '../lib/body-rules'
import { addDays } from '../lib/schedule-rules'
import {
  chartScale, describeRate, goalDate, lastDays, readGoalWeight, trendLine, weeklyRate, type TrendPoint,
} from '../lib/trend-rules'
import { saveModuleDef, useModuleDef } from '../modules/defs'
import type { FieldDef } from '../modules/types'
import { WeighIn } from './WeighIn'
import { DefView, DeleteButton, Sheet, defTabs, localToday, saveModuleSetting, useInstance, useTab } from './ModuleKit'
import { ModuleMenu } from '../modules/ModuleHead'
import {
  MEASURE_ENTITY, WEEKDAY_NAMES, WEEKDAY_ORDER, describeMeasure, describeMeasureChange, describeWeighInPlan, latestMeasure, measureFields,
  measureSeries, missingFromSet, readWeighInPlan, recordOfDay, type MeasurePoint,
} from '../lib/body-measure-rules'
import { deleteMeasures, restoreMeasures, saveMeasures, useMeasureRecords } from '../lib/body-measures'
import { getReminderSettings, rescheduleReminders } from '../lib/notify'
import { moduleView } from '../lib/module-view-rules'
import { readSettings } from '../lib/settings'
import { useApp } from '../lib/store'
import { offerUndo } from '../ui/Undo'
import type { ModuleRecord } from '../lib/types'
import './health.css'

const dayLabel = (d: string) => format(parseISO(d), 'EEE d MMM')
const kg = (n: number) => `${n.toFixed(1)} kg`
const RANGES: { days: number | null; label: string }[] = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 365, label: 'A year' }, { days: null, label: 'All' }]
const W = 320
const H = 140

/** The Health page (HLT-02, HLT-03): the trend weight as the headline, the
 *  weekly rate and when the goal weight would be reached, a chart with each
 *  weigh-in as a dot and the trend as a line, and a weigh-in for any day,
 *  today or past, added or changed with the same form Today uses. v19: the
 *  body measures the person added (HLT-04), each with its latest, its change
 *  and its chart; the weigh-in day and its reminder from the ⋮ (HLT-05). */
export function Health({ profileId }: { profileId: string; day: string }) {
  const def = useModuleDef('health')
  const today = localToday()
  const [day, setDay] = useState(today)
  const [range, setRange] = useState<number | null>(90)
  const [goalSheet, setGoalSheet] = useState(false)
  const top = useRef<HTMLDivElement>(null)
  const rows = useLiveQuery(() => weighIns(profileId), [profileId])
  const inst = useInstance(profileId, 'health')
  const weightGoal = useLiveQuery(async () => (await db.goal.where('profile_id').equals(profileId).toArray())
    .find((g) => !g.deleted_at && g.status === 'active' && g.measure_source === 'weight' && g.measure_target != null) ?? null, [profileId])
  // One page (CALM-05): the weight table and any other view of the
  // module's own are under ⋮ → Views.
  const views = defTabs(def)
  const [tab, setTab] = useTab('health', [{ key: 'overview', name: 'Overview' }, ...views])
  // The weigh-in is for today; another day is one tap away.
  const [otherDay, setOtherDay] = useState(false)
  const [sheet, setSheet] = useState<null | 'weighday'>(null)
  const measureEntity = def?.entities.find((e) => e.name === MEASURE_ENTITY)
  const measures = measureFields(measureEntity)

  const line = useMemo(() => trendLine(rows ?? []), [rows])
  if (!rows || inst === undefined || weightGoal === undefined) return null
  const own = readGoalWeight(inst?.settings)
  // The goal weight: Health's own, else an active weight goal's target.
  const goal = own ?? (weightGoal ? Number(weightGoal.measure_target) : null)
  const last = line.at(-1) ?? null
  const rate = weeklyRate(line, today)
  const eta = goalDate(last?.trend ?? null, rate, goal, today)
  const shown = lastDays(line, today, range)
  const pick = (d: string) => { setDay(d); top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }

  return (
    <>
      <ModuleMenu views={views} active={tab} onView={setTab} items={[
        { label: 'Weigh-in day…', onSelect: () => setSheet('weighday') },
        // The ready-made measures in one step; Edit module has them too, and any field of your own.
        def && measureEntity && !measures.length ? { label: 'Add body measures', onSelect: () => void addMeasureSet(profileId, def) } : null,
      ]} />
      {tab === 'overview' && (
        <>
          <div className="kit-figures is-two" aria-label="Weight at a glance">
            <div className="kit-figure is-head">
              <span className="k">Trend weight</span>
              <span className="v">{last ? kg(last.trend) : '—'}</span>
              <span className="s">{last ? `last weighed ${kg(last.weight)} on ${dayLabel(last.day)}` : 'Weigh in to start the trend.'}</span>
            </div>
            <div className="kit-figure">
              <span className="k">Weekly rate</span>
              <span className="v hlt-v">{rate == null ? '—' : describeRate(rate)}</span>
              <span className="s">{rate == null ? describeRate(null) : 'from the trend, last 4 weeks'}</span>
            </div>
            <button type="button" className="kit-figure hlt-goal" onClick={() => setGoalSheet(true)} aria-label="Goal weight: change">
              <span className="k">Goal</span>
              <span className="v hlt-v">{goal != null ? kg(goal) : 'Set one'}</span>
              <span className="s">{eta.day ? `about ${format(parseISO(eta.day), 'd MMM yyyy')}` : goal != null ? 'no date yet' : 'for an estimated date'}</span>
            </button>
          </div>
          {goal != null && <p className="kit-note">{eta.note}{!own && weightGoal ? ` From your goal “${weightGoal.title}”.` : ''}</p>}

          {line.length > 0 && (
            <>
              <div className="kit-toolbar">
                <div className="kit-seg hlt-range-seg" role="group" aria-label="How far back">
                  {RANGES.map((r) => <button key={r.label} type="button" aria-pressed={range === r.days} onClick={() => setRange(r.days)}>{r.label}</button>)}
                </div>
              </div>
              <WeightChart points={shown} goal={goal} />
            </>
          )}

          <div ref={top} className="hlt-day">
            {otherDay || day !== today ? (
              <>
                <button type="button" className="btn" aria-label="Day before" onClick={() => setDay(addDays(day, -1))}>‹</button>
                <label className="hlt-daypick">
                  <span className="visually-hidden">Day of the weigh-in</span>
                  <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
                </label>
                <button type="button" className="btn" aria-label="Day after" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>›</button>
                <button type="button" className="btn" onClick={() => { setDay(today); setOtherDay(false) }}>Today</button>
              </>
            ) : (
              <button type="button" className="hlt-another" onClick={() => setOtherDay(true)}>Another day</button>
            )}
          </div>
          <WeighIn key={day} profileId={profileId} day={day} history={false} />

          {measures.length > 0 && <Measures profileId={profileId} fields={measures} today={today} />}
          {line.length > 0 && <AllWeighIns line={line} onPick={pick} />}
          <div className="kit-gap" />
        </>
      )}
      {tab.startsWith('view:') && def && <DefView def={def} viewKey={tab.slice(5)} profileId={profileId} fab={false} onClose={() => setTab('overview')} />}
      {sheet === 'weighday' && <WeighInDaySheet profileId={profileId} settings={inst?.settings} onClose={() => setSheet(null)} />}
      {goalSheet && <GoalWeightSheet profileId={profileId} value={own} fromGoal={!own && weightGoal ? Number(weightGoal.measure_target) : null} onClose={() => setGoalSheet(false)} />}
    </>
  )
}

function WeightChart({ points, goal }: { points: TrendPoint[]; goal: number | null }) {
  const c = chartScale(points, W, H, goal)
  if (!points.length) return <p className="kit-note">No weigh-ins in this time.</p>
  const first = points[0]
  const last = points[points.length - 1]
  return (
    <figure className="hlt-chart">
      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} role="img"
        aria-label={`Weight from ${dayLabel(first.day)} to ${dayLabel(last.day)}: trend ${kg(first.trend)} to ${kg(last.trend)}, between ${kg(c.min)} and ${kg(c.max)}.`}>
        {c.goalY != null && <line x1={0} x2={W} y1={c.goalY} y2={c.goalY} className="hlt-goalline" />}
        {c.dots.map((d) => <circle key={d.day} cx={d.x} cy={d.y} r={2.6} className="hlt-dot" />)}
        <path d={c.line} className="hlt-trend" />
      </svg>
      <figcaption className="hlt-legend">
        <span><i className="hlt-key is-dot" aria-hidden /> weigh-ins</span>
        <span><i className="hlt-key is-line" aria-hidden /> trend</span>
        {c.goalY != null && <span><i className="hlt-key is-goal" aria-hidden /> goal</span>}
        <span className="hlt-range">{kg(c.min)} to {kg(c.max)}</span>
      </figcaption>
    </figure>
  )
}

function AllWeighIns({ line, onPick }: { line: TrendPoint[]; onPick: (d: string) => void }) {
  const [shown, setShown] = useState(30)
  const list = [...line].reverse()
  return (
    <>
      <h2 className="section-title">Every weigh-in</h2>
      <ul className="kit-list" aria-label="Every weigh-in, newest first">
        {list.slice(0, shown).map((p, i) => (
          <li key={p.day} className="kit-row">
            <button type="button" className="kit-open" onClick={() => onPick(p.day)} aria-label={`Change the weigh-in of ${dayLabel(p.day)}`}>
              <span className="row-name">{dayLabel(p.day)}</span>
              <span className="row-meta">{formatChange(list[i + 1] ? p.weight - list[i + 1].weight : null)} · trend {kg(p.trend)}</span>
            </button>
            <span className="kit-right kit-num">{kg(p.weight)}</span>
          </li>
        ))}
      </ul>
      {list.length > shown && <div className="kit-toolbar"><button type="button" className="btn" onClick={() => setShown((n) => n + 60)}>Show older weigh-ins</button></div>}
    </>
  )
}

function GoalWeightSheet({ profileId, value, fromGoal, onClose }: { profileId: string; value: number | null; fromGoal: number | null; onClose: () => void }) {
  const [text, setText] = useState(value != null ? String(value) : '')
  const [error, setError] = useState<string | null>(null)
  async function save() {
    if (!text.trim()) { await saveModuleSetting(profileId, 'health', 'goal_weight_kg', null); onClose(); return }
    const n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n) || n < 30 || n > 300) return setError('A goal weight is 30 to 300 kg.')
    await saveModuleSetting(profileId, 'health', 'goal_weight_kg', Math.round(n * 10) / 10)
    onClose()
  }
  return (
    <Sheet title="Goal weight" onClose={onClose} onSubmit={() => void save()}
      actions={<>
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <label>Goal, kg<input inputMode="decimal" autoFocus value={text} placeholder={fromGoal != null ? String(fromGoal) : '78'} onChange={(e) => { setText(e.target.value); setError(null) }} /></label>
        <p className="kit-hint">The date is estimated from the trend's weekly rate, and moves as the trend does.{fromGoal != null ? ` Empty uses your weight goal's ${fromGoal} kg.` : ' Empty means no goal.'}</p>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

/* ---------- more body measures (HLT-04) ---------------------------------------------- */

/** Put the ready-made measures into Health's Measure record (the same as
 *  Edit module's button), with Undo. */
async function addMeasureSet(profileId: string, def: NonNullable<ReturnType<typeof useModuleDef>>) {
  const next = JSON.parse(JSON.stringify(def)) as typeof def
  const e = next.entities.find((x) => x.name === MEASURE_ENTITY)
  if (!e) return
  e.fields.push(...missingFromSet(e.fields))
  await saveModuleDef(profileId, next)
  offerUndo('Body measures added', () => saveModuleDef(profileId, def))
}

/** Each measure: its latest value, how it moved, and its chart on a tap. */
function Measures({ profileId, fields, today }: { profileId: string; fields: FieldDef[]; today: string }) {
  const recs = useMeasureRecords(profileId)
  const [open, setOpen] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)
  if (!recs) return null
  return (
    <section aria-label="Body measures">
      <h2 className="section-title">Measures</h2>
      <ul className="kit-list">
        {fields.map((f) => {
          const series = measureSeries(recs, f.name)
          const last = latestMeasure(series)
          const change = last ? describeMeasureChange(last.change, f.unit) : null
          return (
            <li key={f.name} className="kit-row hlt-measure">
              <button type="button" className="kit-open" aria-expanded={open === f.name} disabled={series.length === 0}
                onClick={() => setOpen(open === f.name ? null : f.name)}>
                <span className="row-name">{f.label}</span>
                <span className="row-meta">{last ? [dayLabel(last.day), change].filter(Boolean).join(' · ') : 'Not measured yet'}</span>
              </button>
              <span className="kit-right kit-num">{last ? describeMeasure(last.value, f.unit) : ''}</span>
              {open === f.name && <MeasureChart field={f} points={series} />}
            </li>
          )
        })}
      </ul>
      <div className="kit-toolbar"><button type="button" className="btn" onClick={() => setLogging(true)}>Log measures</button></div>
      {logging && <MeasureSheet profileId={profileId} fields={fields} recs={recs} today={today} onClose={() => setLogging(false)} />}
    </section>
  )
}

const MW = 320
const MH = 96

/** One measure over time: a line through the days measured. */
function MeasureChart({ field, points }: { field: FieldDef; points: MeasurePoint[] }) {
  if (points.length < 2) return <p className="kit-note hlt-mchart">Measure again to see a line.</p>
  const vals = points.map((p) => p.value)
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5 }
  const t0 = parseISO(points[0].day).getTime()
  const span = Math.max(1, parseISO(points.at(-1)!.day).getTime() - t0)
  const xy = points.map((p) => [((parseISO(p.day).getTime() - t0) / span) * MW, MH - ((p.value - lo) / (hi - lo)) * MH] as const)
  return (
    <figure className="hlt-chart hlt-mchart">
      <svg viewBox={`-6 -6 ${MW + 12} ${MH + 12}`} role="img"
        aria-label={`${field.label} from ${dayLabel(points[0].day)} to ${dayLabel(points.at(-1)!.day)}: ${describeMeasure(points[0].value, field.unit)} to ${describeMeasure(points.at(-1)!.value, field.unit)}.`}>
        <path d={xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} className="hlt-trend" />
        {xy.map(([x, y], i) => <circle key={points[i].day} cx={x} cy={y} r={2.6} className="hlt-dot" />)}
      </svg>
      <figcaption className="hlt-legend"><span>{points.length} times</span><span className="hlt-range">{describeMeasure(lo, field.unit)} to {describeMeasure(hi, field.unit)}</span></figcaption>
    </figure>
  )
}

/** A day's measures, filled from that day's record when there is one. */
function MeasureSheet({ profileId, fields, recs, today, onClose }: { profileId: string; fields: FieldDef[]; recs: ModuleRecord[]; today: string; onClose: () => void }) {
  const [day, setDay] = useState(today)
  const of = (d: string) => recordOfDay(recs, d)
  const fill = (d: string) => Object.fromEntries(fields.map((f) => { const v = of(d)?.data[f.name]; return [f.name, v == null ? '' : String(v)] }))
  const [values, setValues] = useState<Record<string, string>>(() => fill(today))
  const [error, setError] = useState<string | null>(null)
  const existing = of(day)

  async function save() {
    const out: Record<string, number | null> = {}
    for (const f of fields) {
      const t = (values[f.name] ?? '').trim().replace(',', '.')
      if (!t) { out[f.name] = null; continue }
      const n = Number(t)
      if (!Number.isFinite(n) || n < 0 || n > (f.unit === '%' ? 100 : 1000)) return setError(`${f.label}: ${f.unit === '%' ? '0 to 100' : 'a number'}.`)
      out[f.name] = f.type === 'integer' ? Math.round(n) : Math.round(n * 10) / 10
    }
    if (!existing && Object.values(out).every((v) => v == null)) return setError('Fill in at least one.')
    await saveMeasures(profileId, day, out)
    onClose()
  }
  async function remove() {
    if (!existing) return
    await deleteMeasures(existing)
    offerUndo(`Measures of ${dayLabel(day)} deleted`, () => restoreMeasures(existing))
    onClose()
  }

  return (
    <Sheet title="Measures" onClose={onClose} onSubmit={() => void save()}
      actions={<>
        {existing && <DeleteButton onDelete={() => void remove()} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <label>Day<input type="date" value={day} max={today} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setValues(fill(e.target.value)); setError(null) } }} /></label>
        <div className="two">
          {fields.map((f, i) => (
            <label key={f.name}>{f.label}{f.unit ? `, ${f.unit}` : ''}
              <input inputMode="decimal" value={values[f.name] ?? ''} autoFocus={i === 0}
                onChange={(e) => { setValues({ ...values, [f.name]: e.target.value }); setError(null) }} />
            </label>
          ))}
        </div>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

/* ---------- the weigh-in day and its reminder (HLT-05) ----------------------------------- */

function WeighInDaySheet({ profileId, settings, onClose }: { profileId: string; settings: Record<string, unknown> | null | undefined; onClose: () => void }) {
  const plan = readWeighInPlan(settings)
  const profile = useApp((s) => s.profile)
  const [day, setDay] = useState(plan.day == null ? 'any' : String(plan.day))
  const [time, setTime] = useState(plan.time ?? '')
  // Why a reminder would not come, in one line, only when it would not.
  const [quiet, setQuiet] = useState<string | null>(null)
  useEffect(() => {
    void getReminderSettings().then((r) => {
      const views = readSettings(profile).module_views
      setQuiet(!r.on ? 'Reminders are off on this device.' : !moduleView(views, 'health').reminders ? 'Health does not send reminders (Edit module → Show).' : null)
    })
  }, [profile])

  async function save() {
    const next = { day: day === 'any' ? null : Number(day), time: time || null }
    await saveModuleSetting(profileId, 'health', 'weigh_in_day', next.day)
    await saveModuleSetting(profileId, 'health', 'weigh_in_time', next.time)
    if (profile) void rescheduleReminders(profile.id, profile.ai_persona_name)
    offerUndo(`Weigh-in: ${describeWeighInPlan(next).toLowerCase()}`, async () => {
      await saveModuleSetting(profileId, 'health', 'weigh_in_day', plan.day)
      await saveModuleSetting(profileId, 'health', 'weigh_in_time', plan.time)
    })
    onClose()
  }

  return (
    <Sheet title="Weigh-in day" onClose={onClose} onSubmit={() => void save()}
      actions={<>
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <label>Day
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="any">Any day</option>
            {WEEKDAY_ORDER.map((d) => <option key={d} value={String(d)}>{WEEKDAY_NAMES[d]}</option>)}
          </select>
        </label>
        <label>Remind me at<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        {time && quiet && <p className="kit-hint">{quiet}</p>}
      </div>
    </Sheet>
  )
}
