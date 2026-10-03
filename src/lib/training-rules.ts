/** Training's arithmetic and wording, with no database and no React, so each
 *  rule can be checked in plain Node (src/test/training.check.mjs):
 *  muscle groups, own exercises, a routine's targets, what last time was,
 *  what a session's sets start from, the rest timer, planned sessions as a
 *  task series, and the figures Stats reads (sessions, sets, volume, best
 *  sets, per exercise and muscle group). Days are 'yyyy-MM-dd'. */
import { fold } from './search-rules.ts'
import type { Muscle } from './training-types'

/* ---------- muscle groups -------------------------------------------------- */

export const MUSCLES: Muscle[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'glutes', 'core', 'full_body', 'cardio', 'mobility']
export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', glutes: 'Glutes',
  core: 'Core', full_body: 'Full body', cardio: 'Cardio', mobility: 'Mobility',
}
export const isMuscle = (v: unknown): v is Muscle => typeof v === 'string' && (MUSCLES as string[]).includes(v)

/** Words in an exercise's name that point at a muscle group, checked in this
 *  order (so "Romanian deadlift" is legs before "deadlift" makes it back, and
 *  "chest supported row" is back before "chest" makes it chest). A word
 *  ending in a space must be the whole word ("lat " is not "lateral");
 *  others may start a longer one ("curl" finds "curls"). Only a first
 *  guess: the person can set any exercise's group, and their choice wins. */
const GUESSES: [Muscle, string[]][] = [
  ['cardio', ['run', 'running', 'walk', 'cycling', 'bike', 'rowing machine', 'erg ', 'elliptical', 'swim', 'jump rope', 'skipping', 'burpee', 'sprint', 'treadmill', 'stair']],
  ['mobility', ['stretch', 'mobility', 'yoga', 'foam', 'cat cow', 'pigeon']],
  ['legs', ['squat', 'lunge', 'leg press', 'leg extension', 'leg curl', 'calf', 'calves', 'step up', 'step-up', 'romanian', 'hack ', 'sissy', 'wall sit', 'pistol', 'hamstring', 'quad']],
  ['back', ['row', 'pull up', 'pull-up', 'pullup', 'chin up', 'chin-up', 'chinup', 'lat ', 'pulldown', 'pullover', 'deadlift', 'back extension', 'good morning', 'shrug', 'face pull', 'superman']],
  ['glutes', ['glute', 'hip thrust', 'bridge', 'abduct', 'clamshell', 'donkey']],
  ['chest', ['bench', 'chest', 'push up', 'push-up', 'pushup', 'fly ', 'flye', 'flyes', 'pec ', 'dip', 'crossover']],
  ['shoulders', ['shoulder', 'overhead press', 'military', 'arnold', 'lateral raise', 'front raise', 'rear delt', 'upright row', 'handstand', 'pike']],
  ['arms', ['curl', 'tricep', 'bicep', 'skull', 'pushdown', 'hammer', 'wrist', 'kickback']],
  ['core', ['plank', 'crunch', 'sit up', 'sit-up', 'situp', 'ab ', 'abs ', 'leg raise', 'hollow', 'russian twist', 'mountain climber', 'dead bug', 'pallof', 'wood chop', 'v-up', 'l-sit', 'flutter', 'oblique']],
  ['full_body', ['clean', 'snatch', 'thruster', 'swing', 'turkish', 'complex', 'carry', 'farmer']],
]

/** A first guess at an exercise's muscle group from its name, or null. */
export function guessMuscle(name: string): Muscle | null {
  const n = ` ${fold(name)} `
  for (const [m, words] of GUESSES) {
    for (const w of words) {
      const p = fold(w)
      if (w.endsWith(' ') ? n.includes(` ${p} `) : n.includes(` ${p}`)) return m
    }
  }
  return null
}

/** An exercise's group: the person's choice for it (own exercises keep it on
 *  the row; for catalogue ones it is kept in the module's settings), else
 *  the guess. */
export function muscleOf(ex: { id: string; name: string; muscle?: string | null }, chosen: Record<string, string> = {}): Muscle | null {
  if (isMuscle(chosen[ex.id])) return chosen[ex.id] as Muscle
  if (isMuscle(ex.muscle)) return ex.muscle
  return guessMuscle(ex.name)
}

/** Choices made for catalogue exercises, read safely from settings. */
export function readMuscleChoices(raw: unknown): Record<string, Muscle> {
  const out: Record<string, Muscle> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[0-9a-f-]{36}$/i.test(k) && isMuscle(v)) out[k] = v
    if (Object.keys(out).length >= 2000) break
  }
  return out
}

/* ---------- own exercises -------------------------------------------------- */

export const EXERCISE_NAME_MAX = 80

/** What is wrong with a new or renamed own exercise, or null. The same name
 *  as another exercise (accents and case aside) would make two rows no one
 *  can tell apart in a picker. */
export function exerciseProblem(name: string, others: { id: string; name: string }[], selfId?: string): string | null {
  const n = name.trim()
  if (!n) return 'Give the exercise a name.'
  if (n.length > EXERCISE_NAME_MAX) return `Keep the name to ${EXERCISE_NAME_MAX} characters.`
  const f = fold(n)
  if (others.some((o) => o.id !== selfId && fold(o.name) === f)) return 'There is already an exercise with that name.'
  return null
}

/* ---------- a routine's targets -------------------------------------------- */

export interface LineTarget { sets: number; reps: number | null; reps_max: number | null; load_kg: number | null; seconds: number | null; rest_s: number | null }

/** "3 × 8–12 · 40 kg · rest 1:30" */
export function describeTarget(l: LineTarget): string {
  const reps = l.reps != null ? (l.reps_max != null && l.reps_max > l.reps ? `${l.reps}–${l.reps_max}` : `${l.reps}`) : null
  const head = reps ? `${l.sets} × ${reps}` : l.seconds != null ? `${l.sets} × ${clock(l.seconds)}` : `${l.sets} ${l.sets === 1 ? 'set' : 'sets'}`
  return [head, l.load_kg != null ? `${trim(l.load_kg)} kg` : null, l.rest_s ? `rest ${clock(l.rest_s)}` : null].filter(Boolean).join(' · ')
}

/** A number without trailing zeros: 40, 42.5. */
export const trim = (n: number) => String(Math.round(n * 100) / 100)

/** Seconds as m:ss (or h:mm:ss past an hour). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

export const DEFAULT_REST_S = 90

/** Problems with a routine line's numbers, by field. */
export function lineProblems(l: Partial<LineTarget>): Record<string, string> {
  const out: Record<string, string> = {}
  const whole = (v: unknown, min: number, max: number) => v == null || (Number.isInteger(v) && (v as number) >= min && (v as number) <= max)
  if (!whole(l.sets, 1, 20) || l.sets == null) out.sets = 'Sets: 1 to 20.'
  if (!whole(l.reps, 1, 1000)) out.reps = 'Reps: 1 to 1000.'
  if (!whole(l.reps_max, 1, 1000)) out.reps_max = 'Up to: 1 to 1000.'
  else if (l.reps_max != null && (l.reps == null || l.reps_max < l.reps)) out.reps_max = 'The top of the range is at least the reps.'
  if (l.load_kg != null && !(Number.isFinite(l.load_kg) && l.load_kg >= 0 && l.load_kg <= 1000)) out.load_kg = 'Load: 0 to 1000 kg.'
  if (!whole(l.seconds, 1, 86400)) out.seconds = 'Time: up to 24 hours.'
  if (!whole(l.rest_s, 0, 1800)) out.rest_s = 'Rest: up to 30 minutes.'
  return out
}

/* ---------- last time, and what a session starts from ---------------------- */

export interface SetLog {
  id?: string
  log_date: string
  exercise_id: string | null
  routine_id?: string | null
  set_number: number | null
  reps_achieved: number | null
  load_kg: number | null
  seconds: number | null
  deleted_at?: string | null
}

/** The sets of an exercise on the last day before `before` that has any,
 *  by set number (1, 2, 3…), for the "Previous" column. */
export function previousSets<T extends SetLog>(logs: T[], exerciseId: string, before: string): { day: string | null; sets: T[] } {
  let day: string | null = null
  for (const l of logs) {
    if (l.deleted_at || l.exercise_id !== exerciseId || l.log_date >= before) continue
    if (!day || l.log_date > day) day = l.log_date
  }
  if (!day) return { day: null, sets: [] }
  const sets = logs.filter((l) => !l.deleted_at && l.exercise_id === exerciseId && l.log_date === day)
    .sort((a, b) => (a.set_number ?? 99) - (b.set_number ?? 99))
  return { day, sets }
}

/** "40 kg × 10", "× 12", "0:45" — a set as the Previous column shows it. */
export function describeSet(s: Pick<SetLog, 'reps_achieved' | 'load_kg' | 'seconds'>): string {
  const parts: string[] = []
  if (s.load_kg != null && Number(s.load_kg) > 0) parts.push(`${trim(Number(s.load_kg))} kg`)
  if (s.reps_achieved != null) parts.push(`× ${s.reps_achieved}`)
  if (s.seconds != null && s.reps_achieved == null) parts.push(clock(s.seconds))
  return parts.join(' ') || '—'
}

export interface PlannedSet { set_number: number; reps: number | null; load_kg: number | null; seconds: number | null }

/** The sets a session starts with for one routine line: as many as the line
 *  asks for (or as last time had, if more were done), each pre-filled with
 *  what that set was last time, else the routine's target. */
export function prefillSets(line: LineTarget, previous: Pick<SetLog, 'set_number' | 'reps_achieved' | 'load_kg' | 'seconds'>[]): PlannedSet[] {
  const byNumber = new Map<number, (typeof previous)[number]>()
  previous.forEach((p, i) => byNumber.set(p.set_number ?? i + 1, p))
  const count = Math.max(line.sets, 1)
  const out: PlannedSet[] = []
  for (let n = 1; n <= count; n++) {
    const p = byNumber.get(n) ?? previous[previous.length - 1]
    out.push({
      set_number: n,
      reps: p?.reps_achieved ?? line.reps ?? null,
      load_kg: p?.load_kg != null ? Number(p.load_kg) : line.load_kg ?? null,
      seconds: p?.seconds ?? line.seconds ?? null,
    })
  }
  return out
}

/* ---------- the rest timer -------------------------------------------------- */

export interface Rest { started: number; seconds: number }

/** Seconds of rest left at `now` (ms), never below 0. Worked out from when it
 *  started, so a phone that slept in between still shows the right time. */
export const restLeft = (r: Rest, now: number) => Math.max(0, Math.ceil(r.seconds - (now - r.started) / 1000))

/** The timer with time added or taken off, never below nothing. */
export function adjustRest(r: Rest, by: number, now: number): Rest {
  const left = restLeft(r, now)
  return { started: now, seconds: Math.max(0, Math.min(3600, left + by)) }
}

/* ---------- figures (Stats, TRN-08) ----------------------------------------- */

/** Estimated one-rep max (Epley), the usual way to compare sets of different
 *  reps: load × (1 + reps / 30). A single is its own load. */
export function e1rm(load: number, reps: number): number {
  if (!(load > 0) || !(reps > 0)) return 0
  return reps === 1 ? load : Math.round(load * (1 + reps / 30) * 10) / 10
}

/** Reps × load of one set; a set without load counts no volume. */
export const setVolume = (s: Pick<SetLog, 'reps_achieved' | 'load_kg'>) =>
  (s.reps_achieved ?? 0) * (s.load_kg != null ? Number(s.load_kg) : 0)

/** The measures Training gives Stats, by source key. `per` says which item
 *  a measure can be split by (an exercise or a muscle group). */
export const TRAINING_MEASURES = [
  { source: 'training.sessions', label: 'Sessions', unit: '', per: [] as string[], summary: 'sum' as const },
  { source: 'training.sets', label: 'Sets', unit: '', per: ['exercise', 'muscle'], summary: 'sum' as const },
  { source: 'training.reps', label: 'Reps', unit: '', per: ['exercise', 'muscle'], summary: 'sum' as const },
  { source: 'training.volume', label: 'Volume', unit: 'kg', per: ['exercise', 'muscle'], summary: 'sum' as const },
  { source: 'training.best_e1rm', label: 'Best set (estimated 1-rep max)', unit: 'kg', per: ['exercise'], summary: 'max' as const },
  { source: 'training.top_load', label: 'Heaviest load', unit: 'kg', per: ['exercise'], summary: 'max' as const },
]
export type TrainingMeasure = 'sessions' | 'sets' | 'reps' | 'volume' | 'best_e1rm' | 'top_load'

/** A value per day for one measure, optionally only for one exercise or one
 *  muscle group. A day with no sets is not in it (unknown is not zero). */
export function trainingSeries(logs: SetLog[], measure: TrainingMeasure,
  filter: { exercise?: string; muscle?: Muscle; muscleOf?: (exerciseId: string) => Muscle | null } = {}): Record<string, number> {
  const out: Record<string, number> = {}
  const days = new Set<string>()
  for (const l of logs) {
    if (l.deleted_at) continue
    if (filter.exercise && l.exercise_id !== filter.exercise) continue
    if (filter.muscle && (!l.exercise_id || filter.muscleOf?.(l.exercise_id) !== filter.muscle)) continue
    const d = l.log_date
    switch (measure) {
      case 'sessions': days.add(d); break
      case 'sets': out[d] = (out[d] ?? 0) + 1; break
      case 'reps': out[d] = (out[d] ?? 0) + (l.reps_achieved ?? 0); break
      case 'volume': out[d] = (out[d] ?? 0) + setVolume(l); break
      case 'best_e1rm': {
        const v = e1rm(Number(l.load_kg ?? 0), l.reps_achieved ?? 0)
        if (v > 0) out[d] = Math.max(out[d] ?? 0, v)
        break
      }
      case 'top_load': {
        const v = Number(l.load_kg ?? 0)
        if (v > 0) out[d] = Math.max(out[d] ?? 0, v)
        break
      }
    }
  }
  if (measure === 'sessions') for (const d of days) out[d] = 1
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 100) / 100
  return out
}

/** One exercise's record: its best set ever, and its heaviest. */
export function bestSets(logs: SetLog[], exerciseId: string): { best: SetLog | null; e1rm: number; heaviest: SetLog | null } {
  let best: SetLog | null = null
  let bestV = 0
  let heaviest: SetLog | null = null
  for (const l of logs) {
    if (l.deleted_at || l.exercise_id !== exerciseId) continue
    const v = e1rm(Number(l.load_kg ?? 0), l.reps_achieved ?? 0)
    if (v > bestV) { bestV = v; best = l }
    if (l.load_kg != null && Number(l.load_kg) > 0 && (!heaviest || Number(l.load_kg) > Number(heaviest.load_kg))) heaviest = l
  }
  return { best, e1rm: bestV, heaviest }
}

/** A day's session at a glance: sets, reps and volume, and the exercises. */
export function sessionSummary(logs: SetLog[]): { sets: number; reps: number; volume: number; exercises: number } {
  const live = logs.filter((l) => !l.deleted_at)
  return {
    sets: live.length,
    reps: live.reduce((a, l) => a + (l.reps_achieved ?? 0), 0),
    volume: Math.round(live.reduce((a, l) => a + setVolume(l), 0) * 10) / 10,
    exercises: new Set(live.map((l) => l.exercise_id ?? '')).size,
  }
}

/** Past sessions, newest first: one per day and routine (sets logged
 *  without a routine make their own "free" session for the day). */
export function sessionsOf<T extends SetLog>(logs: T[]): { day: string; routine_id: string | null; sets: T[] }[] {
  const map = new Map<string, { day: string; routine_id: string | null; sets: T[] }>()
  for (const l of logs) {
    if (l.deleted_at) continue
    const k = `${l.log_date}|${l.routine_id ?? ''}`
    const s = map.get(k) ?? { day: l.log_date, routine_id: l.routine_id ?? null, sets: [] }
    s.sets.push(l)
    map.set(k, s)
  }
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day) || String(a.routine_id).localeCompare(String(b.routine_id)))
}

/* ---------- planned sessions as a task series (TRN-05) ----------------------- */

export interface RoutinePlan {
  name: string
  rule: string | null
  rule_config: object
  start_date: string | null
  end_date: string | null
  time_of_day: string | null
  minutes: number | null
  deleted_at?: string | null
}

export interface SeriesShape {
  title: string
  rule: string
  rule_config: object
  start_date: string
  end_date: string | null
  time_of_day: string | null
  task_template: { category?: string | null; duration_min?: number | null; locked?: boolean; notes?: string | null }
  active: boolean
  deleted_at: string | null
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null)
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** What a routine's planned sessions should be as a task series: none when
 *  it has no schedule, is deleted, or the rule "a planned session becomes a
 *  task" is off. */
export function sessionSeries(r: RoutinePlan, ruleOn: boolean, today: string): Omit<SeriesShape, 'active' | 'deleted_at'> | null {
  if (!ruleOn || r.deleted_at || !r.rule) return null
  return {
    title: r.name.trim() || 'Training',
    rule: r.rule,
    rule_config: r.rule_config ?? {},
    start_date: r.start_date ?? today,
    end_date: r.end_date,
    time_of_day: hhmm(r.time_of_day),
    task_template: { category: 'Training', duration_min: r.minutes ?? null, locked: false, notes: null },
  }
}

/** How a series on the planner has to change to match what is wanted (a
 *  routine's sessions, the bedtime block, a study block):
 *  - 'none': nothing;
 *  - 'create': a series is wanted and there is none;
 *  - 'retire': there is one and none is wanted;
 *  - 'update': the same days, but the name, time or length changed (the
 *    series and the sessions still to come take the change);
 *  - 'replace': the days changed: the old series ends before today and a
 *    new one starts, so sessions already done stay where they were. */
export function sessionChange(want: Omit<SeriesShape, 'active' | 'deleted_at'> | null, have: (Pick<SeriesShape, 'title' | 'rule' | 'rule_config' | 'start_date' | 'end_date' | 'time_of_day' | 'task_template' | 'active' | 'deleted_at'>) | null):
  'none' | 'create' | 'retire' | 'update' | 'replace' {
  const live = have && !have.deleted_at && have.active ? have : null
  if (!want) return live ? 'retire' : 'none'
  if (!live) return 'create'
  if (live.rule !== want.rule || !same(live.rule_config, want.rule_config) || live.start_date !== want.start_date
    || (live.end_date ?? null) !== (want.end_date ?? null)) return 'replace'
  if (live.title !== want.title || hhmm(live.time_of_day) !== want.time_of_day
    || (live.task_template?.duration_min ?? null) !== (want.task_template.duration_min ?? null)
    || !!live.task_template?.locked !== !!want.task_template.locked) return 'update'
  return 'none'
}

/** The routine a planned-session task opens: found by its series. */
export function routineForTask<R extends { id: string; series_id: string | null; deleted_at?: string | null }>(
  task: { series_id: string | null; source?: string | null; source_ref?: string | null; module_key?: string | null },
  routines: R[], retired: Record<string, string> = {}): R | null {
  if (task.source === 'workout' && task.source_ref) return routines.find((r) => r.id === task.source_ref) ?? null
  if (!task.series_id) return null
  const direct = routines.find((r) => r.series_id === task.series_id)
  if (direct) return direct
  // A series the routine had before its days changed.
  const was = retired[task.series_id]
  return was ? routines.find((r) => r.id === was) ?? null : null
}
