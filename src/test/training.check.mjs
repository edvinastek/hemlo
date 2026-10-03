// Checks Training's rules: muscle groups, own exercise names, a routine's
// targets, last time and the session's pre-filled sets, the rest timer, the
// figures for Stats, and planned sessions as a task series.
import {
  guessMuscle, muscleOf, readMuscleChoices, exerciseProblem, describeTarget, clock, lineProblems,
  previousSets, describeSet, prefillSets, restLeft, adjustRest, e1rm, setVolume, trainingSeries, bestSets,
  sessionSummary, sessionsOf, sessionSeries, sessionChange, routineForTask, TRAINING_MEASURES,
} from '../lib/training-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// Muscle groups from names.
eq('bench press is chest', guessMuscle('Bench Press'), 'chest')
eq('lateral raise is shoulders, not "lat"', guessMuscle('Dumbbell Lateral Raise'), 'shoulders')
eq('lat pulldown is back', guessMuscle('Lat Pulldown'), 'back')
eq('chest supported row is back', guessMuscle('Chest Supported Row'), 'back')
eq('Romanian deadlift is legs', guessMuscle('Romanian Deadlift'), 'legs')
eq('deadlift is back', guessMuscle('Deadlift'), 'back')
eq('curls (plural) are arms', guessMuscle('Hammer Curls'), 'arms')
eq('push-up with a hyphen is chest', guessMuscle('Push-Up'), 'chest')
eq('plank is core', guessMuscle('Side Plank'), 'core')
eq('rowing machine is cardio, not back', guessMuscle('Rowing Machine'), 'cardio')
eq('hip thrust is glutes', guessMuscle('Barbell Hip Thrust'), 'glutes')
eq('accents do not matter', guessMuscle('Squât'), 'legs')
eq('an unknown name has no guess', guessMuscle('Zercher hold'), null)
eq('the person\'s choice wins over the guess', muscleOf({ id: 'a', name: 'Bench Press' }, { a: 'arms' }), 'arms')
eq('an own exercise keeps its own group', muscleOf({ id: 'b', name: 'Bench Press', muscle: 'shoulders' }), 'shoulders')
eq('a choice that is not a group is ignored', muscleOf({ id: 'a', name: 'Bench Press' }, { a: 'toes' }), 'chest')
eq('stored choices are read strictly',
  readMuscleChoices({ '00000000-0000-0000-0000-000000000001': 'back', bad: 'chest', '00000000-0000-0000-0000-000000000002': 'toes' }),
  { '00000000-0000-0000-0000-000000000001': 'back' })
eq('stored choices that are not an object read as none', readMuscleChoices(['x']), {})

// Own exercise names.
eq('a name is needed', exerciseProblem('  ', []), 'Give the exercise a name.')
eq('a long name is refused', exerciseProblem('x'.repeat(81), []), 'Keep the name to 80 characters.')
eq('the same name in other case and accents is a duplicate', exerciseProblem('bench préss', [{ id: '1', name: 'Bench Press' }]),
  'There is already an exercise with that name.')
eq('renaming an exercise to its own name is fine', exerciseProblem('Bench Press', [{ id: '1', name: 'Bench Press' }], '1'), null)

// Targets.
const line = (x) => ({ sets: 3, reps: 8, reps_max: 12, load_kg: 40, seconds: null, rest_s: 90, ...x })
eq('a range of reps with load and rest', describeTarget(line()), '3 × 8–12 · 40 kg · rest 1:30')
eq('fixed reps', describeTarget(line({ reps_max: null, load_kg: null, rest_s: null })), '3 × 8')
eq('timed sets', describeTarget(line({ reps: null, reps_max: null, load_kg: null, seconds: 45, rest_s: 0 })), '3 × 0:45')
eq('a single set with nothing else', describeTarget({ sets: 1, reps: null, reps_max: null, load_kg: null, seconds: null, rest_s: null }), '1 set')
eq('clock past an hour', clock(3725), '1:02:05')
eq('line numbers in range pass', lineProblems(line()), {})
eq('line numbers out of range', Object.keys(lineProblems({ sets: 25, reps: 10, reps_max: 5, load_kg: -1, rest_s: 4000 })),
  ['sets', 'reps_max', 'load_kg', 'rest_s'])
eq('sets must be given', Object.keys(lineProblems({ reps: 5 })), ['sets'])

// Last time.
const logs = [
  { log_date: '2026-09-28', exercise_id: 'bp', set_number: 1, reps_achieved: 10, load_kg: 40, seconds: null },
  { log_date: '2026-09-28', exercise_id: 'bp', set_number: 2, reps_achieved: 9, load_kg: 40, seconds: null },
  { log_date: '2026-10-01', exercise_id: 'bp', set_number: 2, reps_achieved: 8, load_kg: 42.5, seconds: null },
  { log_date: '2026-10-01', exercise_id: 'bp', set_number: 1, reps_achieved: 10, load_kg: 42.5, seconds: null },
  { log_date: '2026-10-01', exercise_id: 'sq', set_number: 1, reps_achieved: 5, load_kg: 80, seconds: null },
  { log_date: '2026-10-02', exercise_id: 'bp', set_number: 1, reps_achieved: 99, load_kg: 99, seconds: null, deleted_at: 'x' },
  { log_date: '2026-10-03', exercise_id: 'bp', set_number: 1, reps_achieved: 11, load_kg: 42.5, seconds: null },
]
const prev = previousSets(logs, 'bp', '2026-10-03')
eq('last time is the latest earlier day, deleted sets left out', prev.day, '2026-10-01')
eq('its sets in set order', prev.sets.map((s) => s.set_number), [1, 2])
eq('nothing before the first day', previousSets(logs, 'bp', '2026-09-28'), { day: null, sets: [] })
eq('a set as the Previous column shows it', describeSet({ reps_achieved: 8, load_kg: 42.5, seconds: null }), '42.5 kg × 8')
eq('a bodyweight set', describeSet({ reps_achieved: 12, load_kg: 0, seconds: null }), '× 12')
eq('a timed set', describeSet({ reps_achieved: null, load_kg: null, seconds: 60 }), '1:00')
eq('an empty set', describeSet({ reps_achieved: null, load_kg: null, seconds: null }), '—')
eq('prefill takes last time set by set, then the target', prefillSets(line({ sets: 3 }), prev.sets),
  [{ set_number: 1, reps: 10, load_kg: 42.5, seconds: null }, { set_number: 2, reps: 8, load_kg: 42.5, seconds: null },
   { set_number: 3, reps: 8, load_kg: 42.5, seconds: null }])
eq('prefill with no history uses the target', prefillSets(line({ sets: 2, reps_max: null }), []),
  [{ set_number: 1, reps: 8, load_kg: 40, seconds: null }, { set_number: 2, reps: 8, load_kg: 40, seconds: null }])

// Rest timer.
eq('rest left after 30 s of 90', restLeft({ started: 0, seconds: 90 }, 30000), 60)
eq('rest never goes below nothing', restLeft({ started: 0, seconds: 90 }, 500000), 0)
eq('add 15 s to what is left', adjustRest({ started: 0, seconds: 90 }, 15, 30000), { started: 30000, seconds: 75 })
eq('take off more than is left', adjustRest({ started: 0, seconds: 90 }, -120, 30000), { started: 30000, seconds: 0 })

// Figures.
eq('estimated 1-rep max (Epley)', e1rm(100, 5), 116.7)
eq('a single is its own load', e1rm(100, 1), 100)
eq('no load, no estimate', e1rm(0, 10), 0)
eq('volume of a set', setVolume({ reps_achieved: 10, load_kg: 42.5 }), 425)
eq('sessions per day', trainingSeries(logs, 'sessions'), { '2026-09-28': 1, '2026-10-01': 1, '2026-10-03': 1 })
eq('sets per day for one exercise', trainingSeries(logs, 'sets', { exercise: 'bp' }), { '2026-09-28': 2, '2026-10-01': 2, '2026-10-03': 1 })
eq('volume per day', trainingSeries(logs, 'volume'), { '2026-09-28': 760, '2026-10-01': 1165, '2026-10-03': 467.5 })
eq('volume for a muscle group', trainingSeries(logs, 'volume', { muscle: 'legs', muscleOf: (id) => (id === 'sq' ? 'legs' : 'chest') }),
  { '2026-10-01': 400 })
eq('best set per day', trainingSeries(logs, 'best_e1rm', { exercise: 'bp' }), { '2026-09-28': 53.3, '2026-10-01': 56.7, '2026-10-03': 58.1 })
eq('heaviest per day', trainingSeries(logs, 'top_load', { exercise: 'bp' }), { '2026-09-28': 40, '2026-10-01': 42.5, '2026-10-03': 42.5 })
eq('an exercise\'s best set ever', bestSets(logs, 'bp').e1rm, 58.1)
eq('a day\'s summary', sessionSummary(logs.filter((l) => l.log_date === '2026-10-01')), { sets: 3, reps: 23, volume: 1165, exercises: 2 })
eq('sessions newest first, one per day and routine',
  sessionsOf([...logs, { log_date: '2026-10-01', exercise_id: 'bp', routine_id: 'r1', set_number: 1, reps_achieved: 1, load_kg: 1, seconds: null }])
    .map((s) => `${s.day}:${s.routine_id ?? '-'}:${s.sets.length}`),
  ['2026-10-03:-:1', '2026-10-01:-:3', '2026-10-01:r1:1', '2026-09-28:-:2'])
eq('every measure has a source key under training', TRAINING_MEASURES.every((m) => m.source.startsWith('training.')), true)

// Planned sessions.
const routine = { name: 'Push day', rule: 'weekly', rule_config: { weekdays: [1, 4] }, start_date: '2026-10-05', end_date: null, time_of_day: '18:00:00', minutes: 60 }
const want = sessionSeries(routine, true, '2026-10-03')
eq('a scheduled routine wants a series at its time, as Training', want,
  { title: 'Push day', rule: 'weekly', rule_config: { weekdays: [1, 4] }, start_date: '2026-10-05', end_date: null, time_of_day: '18:00',
    task_template: { category: 'Training', duration_min: 60, locked: false, notes: null } })
eq('no schedule, no series', sessionSeries({ ...routine, rule: null }, true, '2026-10-03'), null)
eq('the rule switched off, no series', sessionSeries(routine, false, '2026-10-03'), null)
eq('a deleted routine, no series', sessionSeries({ ...routine, deleted_at: 'x' }, true, '2026-10-03'), null)
eq('no start day starts today', sessionSeries({ ...routine, start_date: null }, true, '2026-10-03').start_date, '2026-10-03')
const have = { ...want, active: true, deleted_at: null }
eq('nothing changed', sessionChange(want, have), 'none')
eq('none yet: create', sessionChange(want, null), 'create')
eq('an ended series counts as none', sessionChange(want, { ...have, active: false }), 'create')
eq('not wanted any more: retire', sessionChange(null, have), 'retire')
eq('not wanted and none: nothing', sessionChange(null, null), 'none')
eq('a new time: update', sessionChange({ ...want, time_of_day: '07:00' }, have), 'update')
eq('a new name: update', sessionChange({ ...want, title: 'Push' }, have), 'update')
eq('a new length: update', sessionChange({ ...want, task_template: { ...want.task_template, duration_min: 45 } }, have), 'update')
eq('other days: replace', sessionChange({ ...want, rule_config: { weekdays: [2] } }, have), 'replace')
eq('an end day: replace', sessionChange({ ...want, end_date: '2026-12-31' }, have), 'replace')
eq('seconds in the stored time do not count as a change', sessionChange(want, { ...have, time_of_day: '18:00:00' }), 'none')

const routines = [{ id: 'r1', series_id: 's1' }, { id: 'r2', series_id: null }]
eq('a session task opens its routine by series', routineForTask({ series_id: 's1' }, routines)?.id, 'r1')
eq('an older series of the routine still finds it', routineForTask({ series_id: 's0' }, routines, { s0: 'r2' })?.id, 'r2')
eq('a task of another series opens nothing', routineForTask({ series_id: 's9' }, routines), null)
eq('a task made for a workout names its routine', routineForTask({ series_id: null, source: 'workout', source_ref: 'r2' }, routines)?.id, 'r2')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall training checks passed')
