// Checks cook mode's rules (REC-12): steps split one by one, timers read
// from a step's words (English and Dutch, ranges to their upper bound), the
// clock, and a running timer that keeps time by when it ends.
import {
  splitSteps, stepTimers, readNumber, durationText, clockText, startTimer, timeLeft, pauseTimer, resumeTimer, isDue, toRing, MAX_TIMER,
} from '../lib/cook-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const secs = (s) => stepTimers(s).map((t) => t.seconds)

// Steps.
is('one step a line, empty lines dropped', splitSteps('Boil the water.\n\nAdd the pasta.\r\nDrain.'), ['Boil the water.', 'Add the pasta.', 'Drain.'])
is('numbering and bullets taken off', splitSteps('1. Boil.\n2) Add.\nStep 3: Drain.\nStap 4. Serveer.\n- Eat.\n• Wash up.'),
  ['Boil.', 'Add.', 'Drain.', 'Serveer.', 'Eat.', 'Wash up.'])
is('steps numbered on one line are split', splitSteps('1. Boil the water. 2. Add pasta, cook 10 min. 3. Drain.'), ['Boil the water.', 'Add pasta, cook 10 min.', 'Drain.'])
is('a number inside a step is not a step number', splitSteps('Bake at 180 degrees for 2 hours.'), ['Bake at 180 degrees for 2 hours.'])
is('no steps', [splitSteps(''), splitSteps(null), splitSteps('   \n ')], [[], [], []])

// Numbers.
is('numbers as written', ['20', '1.5', '1,5', '1½', '1 1/2', '½', 'twenty', 'een', 'anderhalf'].map(readNumber), [20, 1.5, 1.5, 1.5, 1.5, 0.5, 20, 1, 1.5])

// Timers in English.
is('simmer 20 min', secs('Simmer 20 min.'), [1200])
is('bake for 1 hour', secs('Bake for 1 hour until golden.'), [3600])
is('a range takes the upper bound', secs('Cook 10-12 minutes, stirring.'), [720])
is('an en dash range', secs('Roast 25–30 mins'), [1800])
is('"to" ranges too', secs('Fry for 2 to 3 minutes per side'), [180])
is('hours and minutes together', secs('Braise 1 hour 30 minutes.'), [5400])
is('an hour and minutes with "and"', secs('Slow cook for 2 hours and 15 minutes'), [8100])
is('1½ hours', secs('Bake 1½ hours'), [5400])
is('1.5 hrs', secs('Rest 1.5 hrs'), [5400])
is('seconds', secs('Blend for 30 seconds'), [30])
is('words: five minutes, an hour', secs('Leave five minutes, then bake an hour.'), [300, 3600])
is('half an hour', secs('Chill for half an hour'), [1800])
is('a minute or two', secs('Toast a minute or two'), [120])
is('1h30', secs('Oven 1h30'), [5400])
is('two timers in one step, in order', secs('Boil 10 min, then simmer 25 min.'), [600, 1500])
is('no unit, no timer', secs('Preheat the oven to 200 degrees. Use 2 eggs.'), [])
is('a temperature is not a timer', secs('Bake at 180°C for 25 min'), [1500])
is('"min" inside a word is not a timer', secs('Add the mint and cumin.'), [])
is('"h" inside a word is not a timer', secs('Add 2 handfuls of spinach'), [])
is('more than a day is not a timer', secs('Leave 48 hours to ferment'), [])
is('overnight has no timer', secs('Soak overnight'), [])
is('"a few minutes" is not a time', secs('Simmer for a few minutes'), [])
is('2 cm is not a time', secs('Cut into 2 cm pieces'), [])
is('written together: 45mins', secs('Bake 45mins'), [2700])
is('a timer and a later one, not added together', secs('Leave for 1 hour, then 15 minutes more'), [3600, 900])
is('the text a timer came from', stepTimers('Simmer for 10-12 minutes').map((t) => t.text), ['10-12 minutes'])

// Timers in Dutch.
is('20 minuten', secs('Laat 20 minuten sudderen.'), [1200])
is('1 uur', secs('Bak 1 uur in de oven.'), [3600])
is('8 à 10 minuten', secs('Kook 8 à 10 minuten.'), [600])
is('10 tot 12 minuten', secs('Bak 10 tot 12 minuten'), [720])
is('een half uur', secs('Laat een half uur rusten.'), [1800])
is('anderhalf uur', secs('Stoof anderhalf uur.'), [5400])
is('1 uur en 15 minuten', secs('Garen 1 uur en 15 minuten'), [4500])
is('een kwartier', secs('Laat een kwartier staan'), [900])
is('30 seconden', secs('Mix 30 seconden'), [30])
is('twee minuten', secs('Roer twee minuten'), [120])

// Words and the clock.
is('durations in words', [durationText(1200), durationText(5400), durationText(45), durationText(3600)], ['20 min', '1 h 30 min', '45 s', '1 h'])
is('the clock', [clockText(1199.2), clockText(3900), clockText(0), clockText(-3)], ['20:00', '1:05:00', '0:00', '0:00'])

// A running timer keeps time by when it ends.
const t0 = 1_000_000
const t = startTimer('a', 'Simmer', 600, t0)
is('ten minutes left at the start', timeLeft(t, t0), 600)
is('four minutes later, six left, whatever happened in between', timeLeft(t, t0 + 240_000), 360)
const p = pauseTimer(t, t0 + 240_000)
is('paused, the time stands still', [timeLeft(p, t0 + 900_000), isDue(p, t0 + 900_000)], [360, false])
const r = resumeTimer(p, t0 + 900_000)
is('resumed, it ends six minutes later', [timeLeft(r, t0 + 900_000), r.endsAt], [360, t0 + 900_000 + 360_000])
is('due at zero, never below', [isDue(t, t0 + 600_000), timeLeft(t, t0 + 700_000)], [true, 0])
is('rings once', [toRing([t], t0 + 600_000).length, toRing([{ ...t, rang: true }], t0 + 600_000).length, toRing([t], t0 + 599_000).length], [1, 0, 0])
is('a day at most', MAX_TIMER, 86400)

console.log(fail ? `\n${fail} failed` : '\nAll cook mode checks passed')
process.exit(fail ? 1 : 0)
