import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useApp } from '../lib/store'
import { search } from '../lib/search-rules'
import {
  deleteExercise, restoreExercise, saveExercise, setCatalogueMuscle, useAllLogs, useExercises, useTrainingSettings,
} from '../lib/training'
import {
  bestSets, describeSet, exerciseProblem, guessMuscle, muscleOf, MUSCLE_LABEL, MUSCLES, trim,
} from '../lib/training-rules'
import type { Exercise, Muscle } from '../lib/training-types'
import type { WorkoutLog } from '../lib/types'
import { offerUndo } from '../ui/Undo'
import { DeleteButton, Sheet } from './ModuleKit'

/** Every exercise to pick from: the shared catalogue and the person's own
 *  (TRN-02), found with the one search, filtered by muscle group. An own
 *  exercise can be changed or deleted; any exercise can be given the muscle
 *  group the person counts it under. */
export function TrainingExercises({ profileId }: { profileId: string }) {
  const userId = useApp((s) => s.session?.user.id ?? null)
  const exercises = useExercises()
  const settings = useTrainingSettings(profileId)
  const logs = useAllLogs(profileId)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<Muscle | 'mine' | 'all'>('all')
  const [open, setOpen] = useState<Exercise | 'new' | null>(null)

  const lastDone = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of logs ?? []) if (l.exercise_id && (m.get(l.exercise_id) ?? '') < l.log_date) m.set(l.exercise_id, l.log_date)
    return m
  }, [logs])

  const shown = useMemo(() => {
    const list = (exercises ?? []).filter((e) => {
      if (group === 'mine') return !!e.owner_id
      if (group === 'all') return true
      return muscleOf(e, settings?.muscles) === group
    })
    return search(list.map((e) => ({ ...e, extra: [e.equipment, MUSCLE_LABEL[muscleOf(e, settings?.muscles) ?? 'full_body']].filter(Boolean).join(' '),
      mine: !!e.owner_id, recent: lastDone.has(e.id) ? Date.parse(lastDone.get(e.id)!) : 0 })), query)
  }, [exercises, group, query, settings?.muscles, lastDone])

  if (!exercises || !settings) return null
  return (
    <>
      <div className="kit-toolbar">
        <input className="kit-search grow" type="search" value={query} placeholder="Search exercises" aria-label="Search exercises"
          onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="kit-toolbar kit-chips is-scroll" role="group" aria-label="Muscle group">
        {(['all', 'mine', ...MUSCLES] as const).map((g) => (
          <button key={g} type="button" className="kit-chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
            {g === 'all' ? 'All' : g === 'mine' ? 'Mine' : MUSCLE_LABEL[g]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty">{group === 'mine' && !query ? 'Exercises you add yourself show here. Tap the round + button to add one.' : 'No exercise matches. Tap the round + button to add it as your own.'}</p>
      ) : (
        <ul className="kit-list" aria-label="Exercises">
          {shown.map((e) => {
            const m = muscleOf(e, settings.muscles)
            const guessed = m && !e.muscle && !settings.muscles[e.id]
            const last = lastDone.get(e.id)
            return (
              <li key={e.id} className="kit-row">
                <button type="button" className="kit-open" onClick={() => setOpen(e)}>
                  <span className="row-name">{e.name}{e.owner_id && <span className="row-chip">mine</span>}</span>
                  <span className="row-meta">{[m ? `${MUSCLE_LABEL[m]}${guessed ? ' (guessed)' : ''}` : 'No muscle group', e.equipment,
                    last ? `last done ${format(parseISO(last), 'd MMM')}` : null].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="kit-gap" />
      <button type="button" className="fab" aria-label="New exercise" onClick={() => setOpen('new')}>+</button>
      {open && userId && (
        <ExerciseSheet key={open === 'new' ? 'new' : open.id} exercise={open === 'new' ? null : open} userId={userId} profileId={profileId}
          all={exercises} chosen={settings.muscles} logs={logs ?? []} startName={open === 'new' ? query : ''} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

function ExerciseSheet({ exercise, userId, profileId, all, chosen, logs, startName, onClose }: {
  exercise: Exercise | null; userId: string; profileId: string; all: Exercise[]; chosen: Record<string, Muscle>; logs: WorkoutLog[]
  startName: string; onClose: () => void
}) {
  const own = !exercise || exercise.owner_id === userId
  const [name, setName] = useState(exercise?.name ?? startName)
  const [muscle, setMuscle] = useState<Muscle | ''>(exercise ? muscleOf(exercise, chosen) ?? '' : '')
  const [equipment, setEquipment] = useState(exercise?.equipment ?? '')
  const [notes, setNotes] = useState(exercise?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const record = exercise ? bestSets(logs, exercise.id) : null
  const guess = guessMuscle(name)

  async function save() {
    setBusy(true)
    try {
      if (own) {
        const problem = exerciseProblem(name, all, exercise?.id)
        if (problem) { setError(problem); setBusy(false); return }
        if (equipment.length > 40) { setError('Keep the equipment to 40 characters.'); setBusy(false); return }
        await saveExercise(userId, { name, muscle: muscle || null, equipment, notes }, exercise ?? undefined)
      } else if (exercise) {
        // A catalogue exercise: only the group it counts under, kept for this profile.
        await setCatalogueMuscle(profileId, exercise.id, muscle || null)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!exercise) return
    setBusy(true)
    await deleteExercise(exercise)
    offerUndo(`${exercise.name} deleted`, () => restoreExercise(exercise))
    onClose()
  }

  return (
    <Sheet title={!exercise ? 'New exercise' : own ? 'Edit exercise' : exercise.name} onClose={onClose} onSubmit={() => void save()}
      actions={<>
        {exercise && own && <DeleteButton onDelete={() => void remove()} disabled={busy} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </>}>
      <div className="form-grid">
        {own ? (
          <label>Name
            <input value={name} maxLength={80} autoFocus={!exercise} onChange={(e) => { setName(e.target.value); setError(null) }} />
          </label>
        ) : <p className="kit-hint">From the shared list of exercises. Choose the muscle group it counts under for you.</p>}
        <label>Muscle group
          <select value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle | '')}>
            <option value="">{own && guess ? `Not set (looks like ${MUSCLE_LABEL[guess]})` : 'Not set'}</option>
            {MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}
          </select>
        </label>
        {own && (
          <>
            <label>Equipment<input value={equipment} maxLength={40} placeholder="Barbell, dumbbells, cable, none" onChange={(e) => setEquipment(e.target.value)} /></label>
            <label>Notes<textarea value={notes} maxLength={1000} placeholder="Set-up, cues" onChange={(e) => setNotes(e.target.value)} /></label>
          </>
        )}
      </div>
      {record && (record.best || record.heaviest) && (
        <p className="kit-hint trn-record">
          {record.best && <>Best set {describeSet(record.best)} on {format(parseISO(record.best.log_date), 'd MMM yyyy')} (about {trim(record.e1rm)} kg for one rep). </>}
          {record.heaviest && <>Heaviest {trim(Number(record.heaviest.load_kg))} kg.</>}
        </p>
      )}
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}
