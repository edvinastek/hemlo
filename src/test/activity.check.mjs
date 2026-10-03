// Checks the activity factor (BODY-10 to BODY-16): the nine presets of
// requirements Part H5.3, the two questions that lead to them, a typed factor
// and its warnings, and training counted inside the factor or added, never
// both.
import {
  PRESETS, WORK, TRAINING, DEFAULT_FACTOR, FACTOR_MIN, FACTOR_MAX, presetFor, workOnly, presetOf,
  describeFactor, formatFactor, readFactor, factorWarning, readStoredFactor, NO_ANSWERS, readAnswers, factorFor,
} from '../lib/activity.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// The presets.
is('nine presets', PRESETS.length, 9)
is('the factors of Part H5.3', PRESETS.map((p) => p.factor), [1.3, 1.4, 1.5, 1.6, 1.65, 1.75, 1.8, 1.9, 2.2])
is('rising, no repeats', PRESETS.every((p, i) => i === 0 || p.factor > PRESETS[i - 1].factor), true)
is('unique keys', new Set(PRESETS.map((p) => p.key)).size, PRESETS.length)
is('each has an example day and steps', PRESETS.every((p) => p.example.length > 10 && /steps/.test(p.steps)), true)
is('the default is a desk job, never 1.2 (BODY-13)', DEFAULT_FACTOR, 1.4)
is('the default is a preset', presetOf(DEFAULT_FACTOR)?.key, 'desk')

// Every pair of answers leads to a preset.
let all = true
for (const w of WORK) for (const t of TRAINING) if (!PRESETS.includes(presetFor(w.value, t.value))) all = false
is('every answer pair has a preset', all, true)
const key = (w, t, walks) => presetFor(w, t, walks).key
is('desk, no exercise', key('sitting', 'none'), 'desk')
is('desk, walks or cycles daily', key('sitting', 'none', true), 'desk_walk')
is('desk, 1–2 a week', key('sitting', '1-2'), 'desk_train')
is('desk, 3–4 a week', key('sitting', '3-4'), 'desk_train')
is('desk, 5 or more', key('sitting', '5+'), 'desk_daily')
is('desk, 2 hours a day', key('sitting', '2h'), 'heavy')
is('standing, none', key('standing', 'none'), 'standing')
is('standing, 3–4', key('standing', '3-4'), 'standing_train')
is('physical job', key('physical', 'none'), 'physical')
is('physical job and daily training', key('physical', '5+'), 'heavy')
is('very heavy work', key('heavy', 'none'), 'heavy')
is('resting', key('resting', 'none'), 'resting')
is('resting but some training', key('resting', '1-2'), 'desk')
is('walking does not lift a standing job', key('standing', 'none', true), 'standing')
is('training only: the work alone', workOnly('sitting').key, 'desk')
is('work alone keeps the walk', workOnly('sitting', true).key, 'desk_walk')

// Words for a factor.
is('a preset described', describeFactor(1.6), '1.6 · desk job and 2–3 workouts a week, 6,000–9,000 steps')
is('an own factor described', describeFactor(1.45), '1.45 · your own factor')
is('not a preset', presetOf(1.45), null)
is('two decimals at most', formatFactor(1.4567), '1.46')

// A typed factor (BODY-14).
is('1.55 reads', readFactor('1.55'), { value: 1.55, warning: null })
is('a comma reads as a point', readFactor(' 1,7 '), { value: 1.7, warning: null })
is('three decimals refused', 'error' in readFactor('1.555'), true)
is('words refused', 'error' in readFactor('active'), true)
is('empty refused', 'error' in readFactor(''), true)
is('below 1.2 refused', 'error' in readFactor('1.1'), true)
is('above 2.4 refused', 'error' in readFactor('2.5'), true)
is('1.2 kept, with a warning', readFactor('1.2').value, 1.2)
is('1.2 is warned about', /bed rest/.test(readFactor('1.2').warning ?? ''), true)
is('2.3 is warned about', /hard to keep up/.test(factorWarning(2.3) ?? ''), true)
is('1.3 and 2.2 are not warned about', [factorWarning(1.3), factorWarning(2.2)], [null, null])
is('the limits', [FACTOR_MIN, FACTOR_MAX], [1.2, 2.4])

// A stored factor read for the picker.
is('nothing stored gives the default', readStoredFactor(null), 1.4)
is('a stored text number reads', readStoredFactor('1.55'), 1.55)
is('an old 1.375 stays as typed', readStoredFactor(1.375), 1.38)
is('out of range gives the default', readStoredFactor(3), 1.4)

// The answers kept with Health, and training inside or added (BODY-16).
is('nothing stored', readAnswers(undefined), NO_ANSWERS)
is('rubbish ignored', readAnswers({ work: 'pilot', training: 7, walks: 'yes', mode: 'both' }), NO_ANSWERS)
is('answers read', readAnswers({ work: 'sitting', training: '3-4', walks: true, mode: 'added' }),
  { work: 'sitting', training: '3-4', walks: true, mode: 'added' })
is('no factor without both answers', factorFor({ ...NO_ANSWERS, work: 'sitting' }), null)
is('training inside the factor', factorFor({ work: 'sitting', training: '3-4', walks: false, mode: 'inside' }), 1.6)
is('training added: the work alone', factorFor({ work: 'sitting', training: '3-4', walks: false, mode: 'added' }), 1.4)
is('never both: added drops training from a standing job', factorFor({ work: 'standing', training: '5+', walks: false, mode: 'added' }), 1.65)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
