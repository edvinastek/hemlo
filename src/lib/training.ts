import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta } from './db'
import { edit } from './write'
import { queueChange } from './sync'
import { setTaskDone } from './tasks'
import { keepSeries } from './training-series'
import type { Task, WorkoutLog } from './types'
import type { Exercise, Muscle, Routine, RoutineLine } from './training-types'
import { readMuscleChoices, routineForTask, sessionSeries } from './training-rules'
import { builtinRuleOn } from '../modules/rule-switch'
import { instanceFor } from '../modules/defs'

/** Training on the device: exercises (the shared catalogue and the person's
 *  own), routines, the sets logged in a session, and the planned sessions
 *  the planner shows as tasks. Every write goes to the local copy first and
 *  is queued for the server. The arithmetic is in training-rules.ts. */

const now = () => new Date().toISOString()
type Writable = { id: string; updated_at?: string }
/** The one write path (write.ts), for the tables 029 added. */
const write = <T extends Writable>(table: 'exercise' | 'routine' | 'routine_line', row: T, changes: Partial<T>) =>
  edit(table as never, row as never, changes as never) as unknown as Promise<T>

/* ---------- exercises ------------------------------------------------------- */

/** Every exercise this person can pick: the catalogue and their own. Before
 *  the first sync after the update, the catalogue kept for the old picker is
 *  used, so the list is never empty offline. */
export async function loadExercises(): Promise<Exercise[]> {
  const rows = (await db.exercise.toArray()).filter((e) => !e.deleted_at)
  if (rows.some((r) => r.owner_id === null)) return rows
  const kept = await getMeta<{ id: string; name: string }[]>('catalogue:exercise', [])
  const seen = new Set(rows.map((r) => r.id))
  return [...rows, ...kept.filter((k) => !seen.has(k.id))
    .map((k) => ({ id: k.id, owner_id: null, name: k.name, equipment: null, notes: null, muscle: null, updated_at: '' }))]
}

export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(loadExercises, [])
}

export interface ExerciseDraft { name: string; muscle: Muscle | null; equipment: string | null; notes: string | null }

/** Add or change one of the person's own exercises. */
export async function saveExercise(userId: string, draft: ExerciseDraft, existing?: Exercise): Promise<Exercise> {
  const fields = {
    name: draft.name.trim(), muscle: draft.muscle, equipment: draft.equipment?.trim() || null, notes: draft.notes?.trim() || null,
  }
  if (existing) return write('exercise', existing, { ...fields, deleted_at: null })
  const row = { id: crypto.randomUUID(), owner_id: userId, type: null, created_at: now(), updated_at: now(), deleted_at: null } as Exercise
  return write('exercise', row, { ...fields, owner_id: userId, deleted_at: null } as Partial<Exercise>)
}

/** Delete an own exercise. Sets logged with it keep its id, so bringing it
 *  back (Undo) brings their name back too. */
export async function deleteExercise(ex: Exercise): Promise<Exercise> {
  return write('exercise', ex, { deleted_at: now() })
}
export async function restoreExercise(ex: Exercise): Promise<void> {
  const current = (await db.exercise.get(ex.id)) ?? ex
  await write('exercise', current, { deleted_at: null })
}

/* ---------- training's own settings (module_instance.settings) --------------- */

export interface TrainingSettings {
  /** Muscle groups the person chose for catalogue exercises, by id. */
  muscles: Record<string, Muscle>
  /** Series a routine had before its days changed, by series id: their
   *  past sessions still open the routine. */
  retired: Record<string, string>
}

export function readTrainingSettings(raw: Record<string, unknown> | undefined | null): TrainingSettings {
  const r = raw ?? {}
  const retired: Record<string, string> = {}
  if (r.retired_series && typeof r.retired_series === 'object' && !Array.isArray(r.retired_series)) {
    for (const [k, v] of Object.entries(r.retired_series as Record<string, unknown>)) if (typeof v === 'string') retired[k] = v
  }
  return { muscles: readMuscleChoices(r.muscles), retired }
}

export function useTrainingSettings(profileId: string | null | undefined): TrainingSettings | undefined {
  return useLiveQuery(async () => (profileId ? readTrainingSettings((await instanceFor(profileId, 'training'))?.settings) : undefined), [profileId])
}

async function patchTrainingSettings(profileId: string, change: (s: Record<string, unknown>) => Record<string, unknown>) {
  const inst = await instanceFor(profileId, 'training')
  if (!inst) return
  await edit('module_instance', inst, { settings: change({ ...(inst.settings ?? {}) }) })
}

/** The muscle group of a catalogue exercise, as this person sees it. */
export async function setCatalogueMuscle(profileId: string, exerciseId: string, muscle: Muscle | null): Promise<void> {
  await patchTrainingSettings(profileId, (s) => {
    const m = { ...readMuscleChoices(s.muscles) } as Record<string, string>
    if (muscle) m[exerciseId] = muscle
    else delete m[exerciseId]
    return { ...s, muscles: m }
  })
}

/* ---------- routines ---------------------------------------------------------- */

export function blankRoutine(profileId: string, sortOrder = 0): Routine {
  return {
    id: crypto.randomUUID(), profile_id: profileId, name: '', note: null, rule: null, rule_config: {}, start_date: null, end_date: null,
    time_of_day: null, minutes: null, series_id: null, goal_id: null, sort_order: sortOrder, updated_at: now(), deleted_at: null,
  }
}

export function blankLine(routineId: string, exerciseId: string | null, sortOrder: number): RoutineLine {
  return {
    id: crypto.randomUUID(), routine_id: routineId, exercise_id: exerciseId, sets: 3, reps: 10, reps_max: null, load_kg: null,
    seconds: null, rest_s: 90, note: null, sort_order: sortOrder, updated_at: now(), deleted_at: null,
  }
}

const ROUTINE_FIELDS: (keyof Routine & string)[] = ['profile_id', 'name', 'note', 'rule', 'rule_config', 'start_date', 'end_date',
  'time_of_day', 'minutes', 'goal_id', 'sort_order', 'deleted_at']
const LINE_FIELDS: (keyof RoutineLine & string)[] = ['routine_id', 'exercise_id', 'sets', 'reps', 'reps_max', 'load_kg', 'seconds',
  'rest_s', 'note', 'sort_order', 'deleted_at']

const pick = <T extends object>(row: T, keys: (keyof T)[]) => Object.fromEntries(keys.map((k) => [k, row[k]])) as Partial<T>

/** Save a routine and its lines as edited, then put its planned sessions on
 *  the planner (or take them off) to match. */
export async function saveRoutine(routine: Routine, lines: RoutineLine[], today: string): Promise<Routine> {
  const before = await db.routine.get(routine.id)
  let saved = await write('routine', before ?? routine, pick(routine, ROUTINE_FIELDS))
  const kept = new Set(lines.map((l) => l.id))
  const old = await db.routine_line.where('routine_id').equals(routine.id).toArray()
  for (const l of old) if (!kept.has(l.id) && !l.deleted_at) await write('routine_line', l, { deleted_at: now() })
  for (const [i, l] of lines.entries()) {
    const was = old.find((o) => o.id === l.id)
    await write('routine_line', was ?? l, { ...pick(l, LINE_FIELDS), routine_id: routine.id, sort_order: i, deleted_at: null })
  }
  saved = await planSessions(saved, today, true)
  return saved
}

/** Delete a routine: its planned sessions to come leave the planner; the
 *  sets logged in its past sessions stay. Undo brings both back. */
export async function deleteRoutine(routine: Routine, today: string): Promise<void> {
  const r = await write('routine', (await db.routine.get(routine.id)) ?? routine, { deleted_at: now() })
  await planSessions(r, today, true)
}
export async function restoreRoutine(routine: Routine, today: string): Promise<void> {
  const r = await write('routine', (await db.routine.get(routine.id)) ?? routine, { deleted_at: null })
  await planSessions(r, today, true)
}

export function useRoutines(profileId: string | null | undefined): Routine[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.routine.where('profile_id').equals(profileId).toArray()).filter((r) => !r.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    : [], [profileId])
}

export async function routineLines(routineId: string): Promise<RoutineLine[]> {
  return (await db.routine_line.where('routine_id').equals(routineId).toArray()).filter((l) => !l.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order)
}

/* ---------- planned sessions: the rule "a planned session becomes a task" ------ */

/** Bring a routine's series in line with the routine and the rule (see
 *  keepSeries for what `full` means). */
export async function planSessions(routine: Routine, today: string, full: boolean): Promise<Routine> {
  const ruleOn = await builtinRuleOn(routine.profile_id, 'training', 'session_task')
  const want = sessionSeries(routine, ruleOn, today)
  const res = await keepSeries(routine.profile_id, routine.series_id, want ? { ...want, module_key: 'training' } : null, today, full)
  if (res.retired) {
    const old = res.retired
    await patchTrainingSettings(routine.profile_id, (s) => ({ ...s, retired_series: { ...readTrainingSettings(s).retired, [old]: routine.id } }))
  }
  if (res.seriesId !== routine.series_id) return write('routine', routine, { series_id: res.seriesId })
  return routine
}

/** Carry out the rule for every routine: after the rule is switched on or
 *  off, and when the Training page opens. Only adds or removes series. */
export async function carryOutSessionRule(profileId: string, today: string): Promise<void> {
  const routines = await db.routine.where('profile_id').equals(profileId).toArray()
  for (const r of routines) await planSessions(r, today, false)
}

/* ---------- sessions: logging set by set ---------------------------------------- */

export function useDayLogs(profileId: string | null | undefined, day: string): WorkoutLog[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.workout_log.where('log_date').equals(day).toArray()).filter((l) => l.profile_id === profileId && !l.deleted_at)
    : [], [profileId, day])
}

/** Every logged set of the profile, for last time, history and the figures. */
export function useAllLogs(profileId: string | null | undefined): WorkoutLog[] | undefined {
  return useLiveQuery(async () => profileId
    ? (await db.workout_log.where('profile_id').equals(profileId).toArray()).filter((l) => !l.deleted_at)
    : [], [profileId])
}

export interface SetValues { reps_achieved: number | null; load_kg: number | null; seconds: number | null }

/** Tick a set: it is logged on the day, in the routine's session. */
export async function logSet(profileId: string, day: string, routineId: string | null, exerciseId: string | null,
  setNumber: number, v: SetValues): Promise<WorkoutLog> {
  const row: WorkoutLog = {
    id: crypto.randomUUID(), profile_id: profileId, log_date: day, exercise_id: exerciseId, workout_id: null, routine_id: routineId,
    set_number: setNumber, reps_achieved: v.reps_achieved, load_kg: v.load_kg, seconds: v.seconds, note: null,
    updated_at: now(), deleted_at: null,
  }
  await db.workout_log.put(row)
  await queueChange('workout_log', row, ['profile_id', 'log_date', 'exercise_id', 'routine_id', 'set_number', 'reps_achieved', 'load_kg', 'seconds', 'deleted_at'])
  return row
}

export async function updateSet(row: WorkoutLog, v: Partial<SetValues>): Promise<WorkoutLog> {
  return edit<WorkoutLog>('workout_log', (await db.workout_log.get(row.id)) ?? row, v)
}

/** Untick a set. Kept with a date on it, so the removal reaches every device. */
export async function removeSet(row: WorkoutLog): Promise<void> {
  await edit('workout_log', (await db.workout_log.get(row.id)) ?? row, { deleted_at: now() })
}
export async function restoreSet(row: WorkoutLog): Promise<void> {
  await edit('workout_log', (await db.workout_log.get(row.id)) ?? row, { deleted_at: null })
}

/** The planned-session task of a routine on a day, if the planner has one. */
export async function sessionTask(routine: Routine, day: string, retired: Record<string, string> = {}): Promise<Task | null> {
  const ids = new Set([routine.series_id, ...Object.entries(retired).filter(([, r]) => r === routine.id).map(([s]) => s)].filter(Boolean))
  const tasks = await db.task.where('[profile_id+planned_date]').equals([routine.profile_id, day]).toArray()
  return tasks.find((t) => !t.deleted_at && ((t.series_id && ids.has(t.series_id)) || (t.source === 'workout' && t.source_ref === routine.id))) ?? null
}

/** Finish a session: its task on the planner, if there is one, is ticked. */
export async function finishSession(routine: Routine, day: string, retired: Record<string, string>): Promise<Task | null> {
  const t = await sessionTask(routine, day, retired)
  if (t && t.status !== 'done') return setTaskDone(t, true)
  return t
}

/** Where ticking a planned-session task leads (GEN-38): the session view
 *  for that routine and day, or null for any other task. For Today, Plan
 *  and the widget, which navigate there when such a task is ticked. */
export async function sessionLinkForTask(task: Task): Promise<string | null> {
  if (task.module_key !== 'training' && task.source !== 'workout') return null
  const routines = (await db.routine.where('profile_id').equals(task.profile_id).toArray()).filter((r) => !r.deleted_at)
  const inst = await instanceFor(task.profile_id, 'training')
  const r = routineForTask(task, routines, readTrainingSettings(inst?.settings).retired)
  return r ? sessionLink(r.id, task.planned_date) : null
}

export const sessionLink = (routineId: string | null, day: string | null) =>
  `/m/training?session=${encodeURIComponent(routineId ?? 'free')}${day ? `&day=${day}` : ''}`
