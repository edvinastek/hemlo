import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import {
  finishSession, logSet, removeSet, restoreSet, routineLines, updateSet, useAllLogs, useExercises, useTrainingSettings,
} from '../lib/training'
import {
  adjustRest, clock, DEFAULT_REST_S, describeSet, describeTarget, muscleOf, MUSCLE_LABEL, prefillSets, previousSets,
  restLeft, sessionSummary, trim, type LineTarget, type Rest,
} from '../lib/training-rules'
import type { WorkoutLog } from '../lib/types'
import type { RoutineLine } from '../lib/training-types'
import { SearchPick } from '../ui/SearchPick'
import { offerUndo } from '../ui/Undo'

/** A session, logged set by set (TRN-03, TRN-04): every exercise of the
 *  routine with its sets pre-filled from last time (or the routine's target),
 *  last time's set beside each, and a rest timer that starts when a set is
 *  ticked. A session can be opened again on any day to see or change it. */

interface Block { key: string; exerciseId: string; line: RoutineLine | null }
type Draft = { kg: string; reps: string }

const FREE_LINE: LineTarget = { sets: 3, reps: null, reps_max: null, load_kg: null, seconds: null, rest_s: DEFAULT_REST_S }
const text = (n: number | null | undefined) => (n == null ? '' : trim(Number(n)))
function parse(v: string, whole: boolean): number | null | 'bad' {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || (whole && !Number.isInteger(n))) return 'bad'
  return n
}

export function TrainingSession({ profileId, routineId, day, onClose }: {
  profileId: string; routineId: string | null; day: string; onClose: () => void
}) {
  const routine = useLiveQuery(async () => (routineId ? (await db.routine.get(routineId)) ?? null : null), [routineId])
  const lines = useLiveQuery(async () => (routineId ? routineLines(routineId) : []), [routineId])
  const exercises = useExercises()
  const allLogs = useAllLogs(profileId)
  const settings = useTrainingSettings(profileId)
  const [extra, setExtra] = useState<string[]>([])
  const [extraSets, setExtraSets] = useState<Record<string, number>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [rest, setRest] = useState<Rest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState<string | null>(null)

  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises])
  const session = useMemo(() => (allLogs ?? []).filter((l) => l.log_date === day && (l.routine_id ?? null) === routineId), [allLogs, day, routineId])

  const blocks: Block[] = useMemo(() => {
    const out: Block[] = (lines ?? []).filter((l) => l.exercise_id).map((l) => ({ key: l.id, exerciseId: l.exercise_id!, line: l }))
    const seen = new Set(out.map((b) => b.exerciseId))
    for (const id of [...session.map((l) => l.exercise_id).filter((x): x is string => !!x), ...extra]) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ key: `x:${id}`, exerciseId: id, line: null })
    }
    return out
  }, [lines, session, extra])

  if (routine === undefined || lines === undefined || !allLogs) return null
  const title = routineId ? routine?.name ?? 'A deleted routine' : 'Session'
  const dayLabel = format(parseISO(day), 'EEEE d MMMM yyyy')
  const sum = sessionSummary(session)

  async function tick(b: Block, n: number, logged: WorkoutLog | undefined, planned: { reps: number | null; load_kg: number | null; seconds: number | null }) {
    setError(null)
    if (logged) {
      await removeSet(logged)
      offerUndo(`Set ${n} unticked`, () => restoreSet(logged))
      return
    }
    const d = drafts[`${b.key}:${n}`]
    const timed = isTimed(b.line)
    const kg = d ? parse(d.kg, false) : planned.load_kg
    const second = d ? parse(d.reps, true) : timed ? planned.seconds : planned.reps
    if (kg === 'bad' || second === 'bad' || (kg != null && kg > 1000)) {
      setError('Load is a number of kilograms; reps and seconds are whole numbers.')
      return
    }
    await logSet(profileId, day, routineId, b.exerciseId, n, {
      load_kg: kg, reps_achieved: timed ? null : second, seconds: timed ? second : null,
    })
    const restS = b.line?.rest_s ?? DEFAULT_REST_S
    if (restS > 0) setRest({ started: Date.now(), seconds: restS })
  }

  async function change(row: WorkoutLog, field: 'kg' | 'reps', value: string, timed: boolean) {
    const v = parse(value, field === 'reps')
    if (v === 'bad') { setError('Load is a number of kilograms; reps and seconds are whole numbers.'); return }
    setError(null)
    if (field === 'kg' && v !== (row.load_kg == null ? null : Number(row.load_kg))) await updateSet(row, { load_kg: v })
    if (field === 'reps') {
      if (timed && v !== row.seconds) await updateSet(row, { seconds: v })
      if (!timed && v !== row.reps_achieved) await updateSet(row, { reps_achieved: v })
    }
  }

  async function finish() {
    if (routine) await finishSession(routine, day, settings?.retired ?? {})
    setRest(null)
    setFinished(sum.sets
      ? `Done: ${sum.sets} ${sum.sets === 1 ? 'set' : 'sets'}${sum.volume ? `, ${Math.round(sum.volume).toLocaleString('en-GB')} kg lifted` : ''}.`
      : 'Nothing was logged in this session.')
  }

  const picks = (exercises ?? []).map((e) => ({ id: e.id, name: e.name, tag: e.owner_id ? 'mine' : undefined,
    meta: (() => { const m = muscleOf(e, settings?.muscles); return m ? MUSCLE_LABEL[m] : undefined })() }))

  return (
    <div className="trn-session">
      <header className="trn-session-head">
        <button type="button" className="btn" onClick={onClose} aria-label="Back to Training">‹ Training</button>
        <div className="trn-session-title">
          <h2>{title}</h2>
          <p className="row-meta">{dayLabel}{sum.sets ? ` · ${sum.sets} ${sum.sets === 1 ? 'set' : 'sets'} logged` : ''}</p>
        </div>
      </header>
      {routine?.note && <p className="trn-session-note">{routine.note}</p>}
      {finished && <p className="kit-note" role="status">{finished} <button type="button" className="slot-link" onClick={onClose}>Back to Training</button></p>}
      {error && <p className="kit-note is-warn" role="alert">{error}</p>}

      {blocks.length === 0 && (
        <p className="empty">{routineId ? 'This routine has no exercises yet. Add one below.' : 'Add the first exercise to log its sets.'}</p>
      )}

      {blocks.map((b) => {
        const ex = byId.get(b.exerciseId)
        const target = b.line ?? FREE_LINE
        const prev = previousSets(allLogs, b.exerciseId, day)
        const planned = prefillSets(target, prev.sets)
        const logged = session.filter((l) => l.exercise_id === b.exerciseId)
        const most = Math.max(planned.length, ...logged.map((l) => l.set_number ?? 0), extraSets[b.key] ?? 0)
        const timed = isTimed(b.line)
        const m = ex ? muscleOf(ex, settings?.muscles) : null
        return (
          <section key={b.key} className="trn-block" aria-label={ex?.name ?? 'Exercise'}>
            <div className="trn-block-head">
              <h3>{ex?.name ?? 'An exercise no longer in the list'}</h3>
              <p className="row-meta">{[m ? MUSCLE_LABEL[m] : null, b.line ? describeTarget(b.line) : null,
                prev.day ? `last time ${format(parseISO(prev.day), 'd MMM')}` : 'first time'].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="trn-sets" role="table" aria-label={`Sets of ${ex?.name ?? 'the exercise'}`}>
              <div className="trn-set is-head" role="row">
                <span role="columnheader">Set</span><span role="columnheader">Previous</span>
                <span role="columnheader">kg</span><span role="columnheader">{timed ? 'Seconds' : 'Reps'}</span>
                <span role="columnheader"><span className="visually-hidden">Done</span></span>
              </div>
              {Array.from({ length: most }, (_, i) => i + 1).map((n) => {
                const row = logged.find((l) => l.set_number === n)
                const p = planned[n - 1] ?? planned[planned.length - 1] ?? { set_number: n, reps: null, load_kg: null, seconds: null }
                const before = prev.sets.find((s) => s.set_number === n)
                const key = `${b.key}:${n}`
                const d = drafts[key] ?? {
                  kg: text(row ? row.load_kg : p.load_kg),
                  reps: text(row ? (timed ? row.seconds : row.reps_achieved) : timed ? p.seconds : p.reps),
                }
                const setDraft = (patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [key]: { ...d, ...patch } }))
                return (
                  <div key={n} className={`trn-set${row ? ' is-done' : ''}`} role="row">
                    <span className="trn-set-n" role="cell">{n}</span>
                    <span className="trn-prev" role="cell">{before ? describeSet(before) : '—'}</span>
                    <span role="cell">
                      <input inputMode="decimal" aria-label={`Set ${n}, kilograms`} value={d.kg} placeholder="kg"
                        onChange={(e) => setDraft({ kg: e.target.value })}
                        onBlur={(e) => { if (row) void change(row, 'kg', e.target.value, timed) }} />
                    </span>
                    <span role="cell">
                      <input inputMode="numeric" aria-label={`Set ${n}, ${timed ? 'seconds' : 'reps'}`} value={d.reps} placeholder={timed ? 's' : 'reps'}
                        onChange={(e) => setDraft({ reps: e.target.value })}
                        onBlur={(e) => { if (row) void change(row, 'reps', e.target.value, timed) }} />
                    </span>
                    <span role="cell">
                      <button type="button" className="trn-tick" aria-pressed={!!row} aria-label={`Set ${n} ${row ? 'done, untick' : 'done'}`}
                        onClick={() => void tick(b, n, row, p)}>✓</button>
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="trn-block-foot">
              <button type="button" className="slot-link" onClick={() => setExtraSets((x) => ({ ...x, [b.key]: most + 1 }))}>Add a set</button>
              {!b.line && !logged.length && (
                <button type="button" className="slot-link" onClick={() => setExtra((x) => x.filter((id) => id !== b.exerciseId))}>Remove</button>
              )}
            </div>
          </section>
        )
      })}

      <div className="trn-addex">
        <SearchPick items={picks} label="Add an exercise to this session" placeholder="Add an exercise to this session" limit={20}
          onPick={(it) => setExtra((x) => (x.includes(it.id) ? x : [...x, it.id]))} />
      </div>
      <div className="kit-toolbar trn-finish">
        <button type="button" className="btn btn-primary" onClick={() => void finish()}>Finish session</button>
      </div>
      <div className="kit-gap" />
      {rest && <RestBar rest={rest} onChange={setRest} />}
    </div>
  )
}

const isTimed = (line: RoutineLine | null) => !!line && line.seconds != null && line.reps == null

/** The rest timer: counts down from a ticked set, with a little more or less,
 *  and Skip. When it runs out the phone buzzes once (where it can). */
function RestBar({ rest, onChange }: { rest: Rest; onChange: (r: Rest | null) => void }) {
  const [now, setNow] = useState(Date.now())
  const buzzed = useRef(false)
  useEffect(() => {
    buzzed.current = false
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [rest])
  const left = restLeft(rest, now)
  useEffect(() => {
    if (left > 0 || buzzed.current) return
    buzzed.current = true
    try { navigator.vibrate?.([200, 100, 200]) } catch { /* no vibration here */ }
    const t = window.setTimeout(() => onChange(null), 6000)
    return () => window.clearTimeout(t)
  }, [left])
  return (
    <div className="trn-rest" role="timer" aria-live={left === 0 ? 'assertive' : 'off'} aria-label="Rest timer">
      <span className="trn-rest-time">{left > 0 ? <>Rest <b>{clock(left)}</b></> : <b>Rest over</b>}</span>
      <button type="button" className="btn" aria-label="15 seconds less" onClick={() => onChange(adjustRest(rest, -15, Date.now()))}>−15</button>
      <button type="button" className="btn" aria-label="15 seconds more" onClick={() => onChange(adjustRest(rest, 15, Date.now()))}>+15</button>
      <button type="button" className="btn" onClick={() => onChange(null)}>{left > 0 ? 'Skip' : 'Close'}</button>
    </div>
  )
}
