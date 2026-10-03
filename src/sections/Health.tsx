import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { weighIns } from '../lib/body'
import { addDays } from '../lib/schedule-rules'
import {
  chartScale, describeRate, goalDate, lastDays, readGoalWeight, trendLine, weeklyRate, type TrendPoint,
} from '../lib/trend-rules'
import { useModuleDef } from '../modules/defs'
import { WeighIn } from './WeighIn'
import { DefView, ModuleTabs, Sheet, defTabs, localToday, saveModuleSetting, useInstance, useTab } from './ModuleKit'
import './health.css'

const dayLabel = (d: string) => format(parseISO(d), 'EEE d MMM')
const kg = (n: number) => `${n.toFixed(1)} kg`
const RANGES: { days: number | null; label: string }[] = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 365, label: 'A year' }, { days: null, label: 'All' }]
const W = 320
const H = 140

/** The Health page (HLT-02, HLT-03): the trend weight as the headline, the
 *  weekly rate and when the goal weight would be reached, a chart with each
 *  weigh-in as a dot and the trend as a line, and a weigh-in for any day,
 *  today or past, added or changed with the same form Today uses. */
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
  const tabs = [{ key: 'overview', name: 'Overview' }, ...defTabs(def)]
  const [tab, setTab] = useTab('health', tabs)

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
      <ModuleTabs tabs={tabs} active={tab} onTab={setTab} />
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
              <div className="kit-toolbar kit-chips is-scroll" role="group" aria-label="How far back">
                {RANGES.map((r) => <button key={r.label} type="button" className="kit-chip" aria-pressed={range === r.days} onClick={() => setRange(r.days)}>{r.label}</button>)}
              </div>
              <WeightChart points={shown} goal={goal} />
            </>
          )}

          <div ref={top} className="hlt-day">
            <button type="button" className="btn" aria-label="Day before" onClick={() => setDay(addDays(day, -1))}>‹</button>
            <label className="hlt-daypick">
              <span className="visually-hidden">Day of the weigh-in</span>
              <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
            </label>
            <button type="button" className="btn" aria-label="Day after" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>›</button>
            {day !== today && <button type="button" className="btn" onClick={() => setDay(today)}>Today</button>}
          </div>
          <WeighIn key={day} profileId={profileId} day={day} />

          {line.length > 8 && <AllWeighIns line={line} onPick={pick} />}
          <div className="kit-gap" />
        </>
      )}
      {tab.startsWith('view:') && def && <DefView def={def} viewKey={tab.slice(5)} profileId={profileId} fab={false} />}
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
        {list.slice(0, shown).map((p) => (
          <li key={p.day} className="kit-row">
            <button type="button" className="kit-open" onClick={() => onPick(p.day)} aria-label={`Change the weigh-in of ${dayLabel(p.day)}`}>
              <span className="row-name">{dayLabel(p.day)}</span>
              <span className="row-meta">trend {kg(p.trend)}</span>
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
