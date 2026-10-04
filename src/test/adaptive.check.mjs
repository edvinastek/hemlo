// Checks the adaptive estimate of maintenance (BODY-17): when there is
// enough to go on (6 of 7 days logged and a weigh-in, in each of the last two
// or three whole weeks), the arithmetic (intake less the energy of the trend's
// change, 7,700 kcal a kilo), and the edge cases: gaps, a single weigh-in,
// big water swings, half-logged days, numbers out of reason; then when the
// offer is shown, the factor it sets, and its About.
import {
  adaptiveEstimate, shouldOffer, factorFrom, readAdaptiveChoice, offerText, aboutText, NO_CHOICE, KCAL_PER_KG,
} from '../lib/adaptive-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const near = (label, got, want, within) => {
  const ok = Math.abs(got - want) <= within
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${got}, expected ${want} ± ${within}`}`)
}

const TODAY = '2026-10-22'
const day = (back) => { const d = new Date(Date.UTC(2026, 9, 22 - back)); return d.toISOString().slice(0, 10) }
/** Intake on the days `back` days before today (1 = yesterday). */
const eat = (backs, kcal) => backs.map((b) => ({ day: day(b), kcal: typeof kcal === 'function' ? kcal(b) : kcal }))
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
/** A weigh-in every day from `from` days back, losing `perWeek` kg a week from `start`. */
const weights = (from, start, perWeek, swing = () => 0) => range(1, from).map((b) => ({ log_date: day(b), weight_kg: Math.round((start + (perWeek / 7) * (from - b) + swing(b)) * 100) / 100 }))

// Enough: three weeks, every day logged at 2,000 kcal, steady weight.
let est = adaptiveEstimate(eat(range(1, 21), 2000), weights(60, 80, 0), TODAY)
is('steady weight: maintenance is the intake', [est.ok, est.kcal, est.weeks, est.daysLogged], [true, 2000, 3, 21])
is('the window is the three whole weeks before today', [est.from, est.to], [day(21), day(1)])

// Losing 0.5 kg a week on 2,000 kcal: about 550 kcal a day more out than in.
est = adaptiveEstimate(eat(range(1, 21), 2000), weights(90, 85, -0.5), TODAY)
near('losing 0.5 kg a week on 2,000 kcal: about 2,550 maintenance', est.kcal, 2000 + (0.5 / 7) * KCAL_PER_KG, 30)
is('the rate is the trend’s', est.rate, -0.5)

// Gaining 0.25 kg a week on 3,000 kcal.
est = adaptiveEstimate(eat(range(1, 21), 3000), weights(90, 70, 0.25), TODAY)
near('gaining 0.25 kg a week on 3,000 kcal: about 2,725', est.kcal, 3000 - (0.25 / 7) * KCAL_PER_KG, 30)

// Not enough.
is('one week is not enough', adaptiveEstimate(eat(range(1, 7), 2000), weights(60, 80, 0), TODAY), { ok: false, reason: 'logs' })
is('5 of 7 days in the latest week: nothing', adaptiveEstimate(eat(range(1, 21).filter((b) => b !== 2 && b !== 4), 2000), weights(60, 80, 0), TODAY), { ok: false, reason: 'logs' })
est = adaptiveEstimate(eat(range(1, 21).filter((b) => b !== 16 && b !== 17), 2000), weights(60, 80, 0), TODAY)
is('a gap in the oldest week: the two weeks after it are used', [est.ok, est.weeks, est.from], [true, 2, day(14)])
is('6 of 7 days is enough', adaptiveEstimate(eat(range(1, 21).filter((b) => b % 7 !== 3), 2000), weights(60, 80, 0), TODAY).ok, true)
is('a single weigh-in: nothing', adaptiveEstimate(eat(range(1, 21), 2000), [{ log_date: day(3), weight_kg: 80 }], TODAY), { ok: false, reason: 'weigh-ins' })
const weekly = [{ log_date: day(2), weight_kg: 80 }, { log_date: day(9), weight_kg: 80 }]
is('a weigh-in in each of two weeks, a week apart: enough', adaptiveEstimate(eat(range(1, 14), 2000), weekly, TODAY).ok, true)
is('a week without a weigh-in: nothing', adaptiveEstimate(eat(range(1, 21), 2000), [{ log_date: day(2), weight_kg: 80 }, { log_date: day(3), weight_kg: 80 }], TODAY), { ok: false, reason: 'weigh-ins' })
is('two weigh-ins a day apart, one in each week: too little to see a trend',
  adaptiveEstimate(eat(range(1, 14), 2000), [{ log_date: day(7), weight_kg: 80 }, { log_date: day(8), weight_kg: 80.5 }], TODAY), { ok: false, reason: 'trend' })
is('today is left out (not over yet)', adaptiveEstimate([...eat(range(1, 12), 2000), { day: TODAY, kcal: 2000 }], weights(60, 80, 0), TODAY), { ok: false, reason: 'logs' })

// Big water swings: ±1.5 kg day to day around a steady weight.
est = adaptiveEstimate(eat(range(1, 21), 2200), weights(60, 80, 0, (b) => (b % 2 ? 1.5 : -1.5)), TODAY)
near('big water swings around a steady weight: still about the intake', est.kcal, 2200, 150)
// A salty weekend: +2 kg on the last two days only.
est = adaptiveEstimate(eat(range(1, 21), 2200), weights(60, 80, 0, (b) => (b <= 2 ? 2 : 0)), TODAY)
near('two heavy days at the end move it by far less than 2 kg would', est.kcal, 2200, 600)

// Half-logged days count as not logged.
est = adaptiveEstimate(eat(range(1, 21), (b) => (b === 5 ? 600 : 2000)), weights(60, 80, 0), TODAY)
is('a day at under half the usual is not counted', [est.ok, est.daysLogged, est.intake], [true, 20, 2000])

// Out of reason.
is('an estimate below 1,200 kcal is not offered', adaptiveEstimate(eat(range(1, 21), 900), weights(60, 80, 0), TODAY), { ok: false, reason: 'range' })

// The offer.
est = adaptiveEstimate(eat(range(1, 21), 2000), weights(90, 85, -0.5), TODAY)
is('offered when it differs from the targets’ basis', shouldOffer(est, 2200, 1600, NO_CHOICE, TODAY), true)
is('not when it is within 50 kcal', shouldOffer(est, est.kcal - 30, 1600, NO_CHOICE, TODAY), false)
is('not for two weeks after "Not now"', [shouldOffer(est, 2200, 1600, { ...NO_CHOICE, declined_on: day(13) }, TODAY), shouldOffer(est, 2200, 1600, { ...NO_CHOICE, declined_on: day(14) }, TODAY)], [false, true])
is('not without targets to compare with', shouldOffer(est, null, null, NO_CHOICE, TODAY), false)
is('not when the factor would be outside 1.2–2.4', shouldOffer(est, 2200, 900, NO_CHOICE, TODAY), false)
is('the factor: maintenance ÷ resting energy, two decimals', [factorFrom(2450, 1500), factorFrom(2450, 900), factorFrom(2450, 0)], [1.63, null, null])
is('the line', offerText(2450), 'Your logs suggest about 2,450 kcal maintenance')
is('what was chosen, read safely', [readAdaptiveChoice({ accepted_kcal: 2450, accepted_on: '2026-10-01', declined_on: 'soon' }), readAdaptiveChoice(null)],
  [{ accepted_kcal: 2450, accepted_on: '2026-10-01', declined_on: null }, NO_CHOICE])
const about = aboutText(est, 1500, 2200)
is('the About says how: days, intake, trend, kcal a kilo, the factor', [about.length, /21 of 21 days/.test(about[0]), /7,700 kcal/.test(about[1]), /1\.7/.test(about[3])], [5, true, true, true])

console.log(fail ? `\n${fail} failed` : '\nAll adaptive maintenance checks passed')
process.exit(fail ? 1 : 0)
