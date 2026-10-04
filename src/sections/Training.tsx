import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useModuleDef } from '../modules/defs'
import { useBuiltinRuleOn } from '../modules/rule-switch'
import { describeSchedule, type RuleKind } from '../lib/schedule-rules'
import { RepeatPicker, type RepeatValue } from '../ui/RepeatPicker'
import { SearchPick } from '../ui/SearchPick'
import { offerUndo } from '../ui/Undo'
import {
  blankLine, blankRoutine, carryOutSessionRule, deleteRoutine, restoreRoutine, routineLines, saveRoutine,
  useAllLogs, useExercises, useRoutines,
} from '../lib/training'
import { describeTarget, lineProblems, muscleOf, MUSCLE_LABEL, sessionsOf, sessionSummary, trim } from '../lib/training-rules'
import type { Exercise, Routine, RoutineLine } from '../lib/training-types'
import { DefView, DeleteButton, ModuleTabs, Sheet, defTabs, localToday, useSearch, useTab, type Tab } from './ModuleKit'
import { ModuleMenu, useHideModuleHead } from '../modules/ModuleHead'
import { TrainingSession } from './TrainingSession'
import { TrainingExercises } from './TrainingExercises'
import { PhasesSheet, YearPhases } from './TrainingPhases'
import './training.css'

/** The Training page: routines to start or plan, a session logged set by
 *  set, exercises (the catalogue and the person's own), past sessions, and
 *  the module's own views (the log table, the month). A routine with days
 *  puts its sessions on Today and Plan as tasks; ticking one opens here. */
export function Training({ profileId }: { profileId: string; day: string }) {
  const def = useModuleDef('training')
  const today = localToday()
  const [params, setParams] = useSearch()
  const sessionId = params.get('session')
  const sessionDay = params.get('day') ?? today
  const ruleOn = useBuiltinRuleOn(profileId, 'training', 'session_task')

  // The rule "a planned session becomes a task" carried out whenever the
  // page opens or the rule is switched, so the planner matches it.
  useEffect(() => { void carryOutSessionRule(profileId, today) }, [profileId, today, ruleOn])

  const tabs: Tab[] = [
    { key: 'routines', name: 'Routines' },
    { key: 'exercises', name: 'Exercises' },
    { key: 'history', name: 'History' },
  ]
  // The log table and the month are under ⋮ → Views (CALM-05).
  const views = defTabs(def, ['sessions'])
  const [tab, setTab] = useTab('training', [...tabs, ...views])
  // A session is a page of its own: the module head steps aside.
  useHideModuleHead(!!sessionId)
  const [phases, setPhases] = useState(false)

  if (sessionId) {
    return <TrainingSession profileId={profileId} routineId={sessionId === 'free' ? null : sessionId} day={sessionDay}
      onClose={() => setParams({ session: null, day: null })} />
  }

  const start = (routineId: string | null, day = today) => setParams({ session: routineId ?? 'free', day })

  return (
    <>
      <ModuleMenu views={views} active={tab} onView={setTab}
        items={[{ label: 'Log a session without a routine', onSelect: () => start(null) }, { label: 'Phases…', onSelect: () => setPhases(true) }]} />
      <WeekFigures profileId={profileId} today={today} />
      {/* The year's phases (TRN-07), once there are any. */}
      {tab === 'routines' && <YearPhases profileId={profileId} year={Number(today.slice(0, 4))} current onOpen={() => setPhases(true)} />}
      {phases && <PhasesSheet profileId={profileId} onClose={() => setPhases(false)} />}
      <ModuleTabs tabs={tabs} active={tab} onTab={setTab} />
      {tab === 'routines' && <Routines profileId={profileId} today={today} onStart={start} />}
      {tab === 'exercises' && <TrainingExercises profileId={profileId} />}
      {tab === 'history' && <History profileId={profileId} onOpen={start} />}
      {tab.startsWith('view:') && def && <DefView def={def} viewKey={tab.slice(5)} profileId={profileId} onClose={() => setTab('routines')} />}
    </>
  )
}

/** This week at a glance, Monday to today: sessions, sets and volume. */
function WeekFigures({ profileId, today }: { profileId: string; today: string }) {
  const logs = useAllLogs(profileId)
  if (!logs?.length) return null
  const d = parseISO(today)
  const monday = format(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)), 'yyyy-MM-dd')
  const week = logs.filter((l) => l.log_date >= monday && l.log_date <= today)
  const s = sessionSummary(week)
  const sessions = new Set(week.map((l) => l.log_date)).size
  return (
    <div className="kit-figures" aria-label="This week, Monday to today">
      <div className="kit-figure"><span className="k">Sessions</span><span className="v">{sessions}</span><span className="s">this week</span></div>
      <div className="kit-figure"><span className="k">Sets</span><span className="v">{s.sets}</span><span className="s">this week</span></div>
      <div className="kit-figure"><span className="k">Volume</span><span className="v">{Math.round(s.volume).toLocaleString('en-GB')}</span><span className="s">kg this week</span></div>
    </div>
  )
}

/* ---------- routines ---------------------------------------------------------- */

function Routines({ profileId, today, onStart }: { profileId: string; today: string; onStart: (id: string | null) => void }) {
  const routines = useRoutines(profileId)
  const exercises = useExercises()
  const [editing, setEditing] = useState<{ routine: Routine; lines: RoutineLine[]; isNew: boolean } | null>(null)
  const names = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e.name])), [exercises])
  const counts = useLineCounts(routines)

  async function open(r: Routine) {
    setEditing({ routine: r, lines: await routineLines(r.id), isNew: false })
  }
  const add = () => {
    const r = blankRoutine(profileId, routines?.length ?? 0)
    setEditing({ routine: r, lines: [], isNew: true })
  }
  if (!routines) return null

  return (
    <>
      {routines.length === 0 ? (
        <div className="empty">
          <p style={{ margin: 0 }}>A routine is a workout you repeat. Tap the round + button to make one.</p>
          <div className="trn-empty-actions">
            <button type="button" className="btn" onClick={() => onStart(null)}>Log a session without one</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="kit-list" aria-label="Routines">
            {routines.map((r) => {
              const n = counts.get(r.id) ?? 0
              const when = r.rule
                ? `${describeSchedule({ rule: r.rule as RuleKind, rule_config: r.rule_config ?? {}, start_date: r.start_date ?? today, end_date: r.end_date })}${r.time_of_day ? ` at ${r.time_of_day.slice(0, 5)}` : ''}`
                : 'Not planned'
              return (
                <li key={r.id} className="kit-row">
                  <button type="button" className="kit-open" onClick={() => void open(r)} aria-label={`Edit ${r.name}`}>
                    <span className="row-name">{r.name}</span>
                    <span className="row-meta">{[n ? `${n} ${n === 1 ? 'exercise' : 'exercises'}` : null, when, r.minutes ? `${r.minutes} min` : null].filter(Boolean).join(' · ')}</span>
                  </button>
                  <div className="kit-right">
                    <button type="button" className="btn btn-primary" onClick={() => onStart(r.id)}>Start</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="New routine" onClick={add}>+</button>
      {editing && (
        <RoutineSheet key={editing.routine.id} start={editing} exercises={exercises ?? []} names={names} today={today}
          onClose={() => setEditing(null)} />
      )}
    </>
  )
}

/** How many exercises each routine has, live. */
function useLineCounts(routines: Routine[] | undefined): Map<string, number> {
  const [counts, setCounts] = useState(new Map<string, number>())
  const key = (routines ?? []).map((r) => `${r.id}:${r.updated_at}`).join(',')
  useEffect(() => {
    let live = true
    void (async () => {
      const m = new Map<string, number>()
      for (const r of routines ?? []) m.set(r.id, (await routineLines(r.id)).length)
      if (live) setCounts(m)
    })()
    return () => { live = false }
  }, [key])
  return counts
}

const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300]
const num = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function RoutineSheet({ start, exercises, names, today, onClose }: {
  start: { routine: Routine; lines: RoutineLine[]; isNew: boolean }; exercises: Exercise[]; names: Map<string, string>; today: string; onClose: () => void
}) {
  const [r, setR] = useState<Routine>(start.routine)
  const [lines, setLines] = useState<RoutineLine[]>(start.lines)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const first = r.start_date ?? today
  const repeat: RepeatValue = { rule: r.rule, rule_config: r.rule_config ?? {}, end_date: r.end_date }
  const picks = useMemo(() => exercises.map((e) => ({ id: e.id, name: e.name, tag: e.owner_id ? 'mine' : undefined,
    meta: (() => { const m = muscleOf(e); return m ? MUSCLE_LABEL[m] : undefined })() })), [exercises])

  const setLine = (id: string, change: Partial<RoutineLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...change } : l)))
  const move = (i: number, by: number) => setLines((ls) => {
    const j = i + by
    if (j < 0 || j >= ls.length) return ls
    const next = [...ls]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  async function save() {
    if (!r.name.trim()) return setError('Give the routine a name.')
    if (r.name.trim().length > 80) return setError('Keep the name to 80 characters.')
    for (const [i, l] of lines.entries()) {
      if (!l.exercise_id) return setError(`Pick the exercise on line ${i + 1}, or remove that line.`)
      const p = Object.values(lineProblems(l))
      if (p.length) return setError(`${names.get(l.exercise_id) ?? `Line ${i + 1}`}: ${p[0]}`)
    }
    if (r.rule && r.end_date && r.end_date < first) return setError('The last day is before the first.')
    if (r.minutes != null && !(Number.isInteger(r.minutes) && r.minutes >= 1 && r.minutes <= 600)) return setError('Length: 1 to 600 minutes.')
    setBusy(true)
    try {
      await saveRoutine({ ...r, name: r.name.trim(), start_date: r.rule ? first : r.start_date }, lines, today)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.')
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    await deleteRoutine(start.routine, today)
    offerUndo(`${start.routine.name} deleted`, () => restoreRoutine(start.routine, today))
    onClose()
  }

  return (
    <Sheet title={start.isNew ? 'New routine' : 'Edit routine'} onClose={onClose} onSubmit={() => void save()} wide
      actions={<>
        {!start.isNew && <DeleteButton onDelete={() => void remove()} disabled={busy} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </>}>
      <div className="form-grid">
        <label>Name
          <input value={r.name} maxLength={80} autoFocus={start.isNew} placeholder="Push day, Full body A" onChange={(e) => { setR({ ...r, name: e.target.value }); setError(null) }} />
        </label>
      </div>

      <h3 className="trn-sub">Exercises</h3>
      {lines.length === 0 && <p className="kit-hint">Add the exercises in the order you do them. Each has its sets, reps (or a range), load and rest.</p>}
      <ol className="trn-lines">
        {lines.map((l, i) => (
          <li key={l.id} className="trn-line">
            <div className="trn-line-head">
              <span className="trn-line-n" aria-hidden>{i + 1}</span>
              <div className="trn-line-pick">
                <SearchPick items={picks} label={`Exercise ${i + 1}`} placeholder="Find an exercise" limit={20}
                  value={l.exercise_id ? names.get(l.exercise_id) ?? 'Exercise' : null}
                  onPick={(it) => setLine(l.id, { exercise_id: it.id })} />
              </div>
              <div className="trn-line-moves">
                <button type="button" aria-label={`Move ${names.get(l.exercise_id ?? '') ?? 'line'} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label={`Move ${names.get(l.exercise_id ?? '') ?? 'line'} down`} disabled={i === lines.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" aria-label={`Remove ${names.get(l.exercise_id ?? '') ?? 'line'}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>×</button>
              </div>
            </div>
            <div className="trn-line-nums form-grid">
              <label>Sets<input inputMode="numeric" value={l.sets} onChange={(e) => setLine(l.id, { sets: Math.trunc(num(e.target.value) ?? 0) })} /></label>
              <label>Reps<input inputMode="numeric" value={l.reps ?? ''} placeholder="—" onChange={(e) => setLine(l.id, { reps: num(e.target.value) })} /></label>
              <label>Up to<input inputMode="numeric" value={l.reps_max ?? ''} placeholder="—" onChange={(e) => setLine(l.id, { reps_max: num(e.target.value) })} /></label>
              <label>kg<input inputMode="decimal" value={l.load_kg ?? ''} placeholder="—" onChange={(e) => setLine(l.id, { load_kg: num(e.target.value) })} /></label>
              <label>Seconds<input inputMode="numeric" value={l.seconds ?? ''} placeholder="—" onChange={(e) => setLine(l.id, { seconds: num(e.target.value) })} /></label>
              <label>Rest
                <select value={l.rest_s ?? 90} onChange={(e) => setLine(l.id, { rest_s: Number(e.target.value) })}>
                  {[...new Set([...REST_CHOICES, l.rest_s ?? 90])].sort((a, b) => a - b).map((s) => (
                    <option key={s} value={s}>{s === 0 ? 'None' : s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="kit-hint">{describeTarget(l)}</p>
          </li>
        ))}
      </ol>
      <button type="button" className="btn trn-addline" onClick={() => setLines((ls) => [...ls, blankLine(r.id, null, ls.length)])}>Add an exercise</button>

      <h3 className="trn-sub">On the planner</h3>
      <RepeatPicker value={repeat} start={first} today={today} noneLabel="Not planned"
        kinds={['daily', 'weekdays', 'weekends', 'weekly', 'every_n_weeks', 'monthly', 'monthly_nth', 'yearly', 'dates']}
        onChange={(v) => setR({ ...r, rule: v.rule as Routine['rule'], rule_config: v.rule_config, end_date: v.end_date, start_date: v.rule ? first : null })} />
      {r.rule && (
        <div className="form-grid trn-when">
          <div className="two">
            <label>First day<input type="date" value={first} onChange={(e) => e.target.value && setR({ ...r, start_date: e.target.value })} /></label>
            <label>Time<input type="time" value={r.time_of_day?.slice(0, 5) ?? ''} onChange={(e) => setR({ ...r, time_of_day: e.target.value || null })} /></label>
          </div>
          <label>Length, minutes<input inputMode="numeric" value={r.minutes ?? ''} placeholder="60"
            onChange={(e) => { const v = num(e.target.value); setR({ ...r, minutes: v == null || Number.isNaN(v) ? null : Math.trunc(v) }) }} /></label>
          <p className="kit-hint">Each session becomes a task on its day{r.time_of_day ? ` at ${r.time_of_day.slice(0, 5)}` : ''}. Ticking it opens the session here.</p>
        </div>
      )}

      <div className="form-grid trn-note">
        <label>Note<textarea value={r.note ?? ''} maxLength={4000} placeholder="Warm-up, cues, what to change next time"
          onChange={(e) => setR({ ...r, note: e.target.value || null })} /></label>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

/* ---------- history ------------------------------------------------------------ */

function History({ profileId, onOpen }: { profileId: string; onOpen: (routineId: string | null, day: string) => void }) {
  const logs = useAllLogs(profileId)
  const routines = useRoutines(profileId)
  const [shown, setShown] = useState(60)
  const sessions = useMemo(() => sessionsOf(logs ?? []), [logs])
  const names = new Map((routines ?? []).map((r) => [r.id, r.name]))
  if (!logs) return null
  if (sessions.length === 0) {
    return <p className="empty">Past sessions show here, newest first, once a set is logged. Tap one to see or change it.</p>
  }
  return (
    <>
      <ul className="kit-list" aria-label="Past sessions">
        {sessions.slice(0, shown).map((s) => {
          const sum = sessionSummary(s.sets)
          return (
            <li key={`${s.day}|${s.routine_id}`} className="kit-row">
              <button type="button" className="kit-open" onClick={() => onOpen(s.routine_id, s.day)}>
                <span className="row-name">{s.routine_id ? names.get(s.routine_id) ?? 'A deleted routine' : 'Session'}</span>
                <span className="row-meta">{format(parseISO(s.day), 'EEE d MMM yyyy')} · {sum.sets} {sum.sets === 1 ? 'set' : 'sets'} · {sum.exercises} {sum.exercises === 1 ? 'exercise' : 'exercises'}</span>
              </button>
              <span className="kit-right kit-num">{sum.volume > 0 ? `${trim(Math.round(sum.volume)).toString()} kg` : ''}</span>
            </li>
          )
        })}
      </ul>
      {sessions.length > shown && (
        <div className="kit-toolbar"><button type="button" className="btn" onClick={() => setShown((n) => n + 60)}>Show older sessions</button></div>
      )}
      <div className="kit-gap" />
    </>
  )
}
