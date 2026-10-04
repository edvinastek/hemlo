// Checks training phases (TRN-07): weeks and last days, what a phase must
// have, bands across a year with overlapping phases stacked, the phase a day
// is in, and the words used.
import {
  phaseEnd, phaseWeeks, phaseProblem, phaseFields, orderPhases, yearBands, phaseOn, describePhase, shortDay, nextPhaseStart,
} from '../lib/training-phase-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

eq('six weeks from Monday 5 January end on Sunday 15 February', phaseEnd('2026-01-05', 6), '2026-02-15')
eq('and are six weeks long', phaseWeeks({ start_date: '2026-01-05', end_date: '2026-02-15' }), 6)
eq('a phase ending mid-week rounds up', phaseWeeks({ start_date: '2026-01-05', end_date: '2026-01-14' }), 2)
eq('no end: one week', phaseWeeks({ start_date: '2026-01-05', end_date: null }), 1)

const ok = { name: 'Strength', start: '2026-01-05', weeks: '6', colour: '#c43f3e' }
eq('a good phase', phaseProblem(ok), null)
eq('no name', phaseProblem({ ...ok, name: ' ' }), 'Give the phase a name.')
eq('no day', phaseProblem({ ...ok, start: '' }), 'Pick the day it starts.')
eq('zero weeks', phaseProblem({ ...ok, weeks: 0 }), 'Weeks: 1 to 52.')
eq('half a week', phaseProblem({ ...ok, weeks: '1.5' }), 'Weeks: 1 to 52.')
eq('a year and more', phaseProblem({ ...ok, weeks: 53 }), 'Weeks: 1 to 52.')
eq('a colour not offered', phaseProblem({ ...ok, colour: '#123456' }), 'Pick one of the colours.')
eq('no colour is fine (the accent)', phaseProblem({ ...ok, colour: null }), null)
eq('the row a draft makes', phaseFields({ ...ok, name: ' Strength ' }), { name: 'Strength', start_date: '2026-01-05', end_date: '2026-02-15', colour: '#c43f3e' })

const p = (id, start, weeks, x = {}) => ({ id, profile_id: 'p', name: id, start_date: start, end_date: phaseEnd(start, weeks), colour: null, template: {}, ...x })
const phases = [
  p('Peak', '2026-03-02', 4), p('Base', '2025-11-03', 12), p('Strength', '2026-02-02', 6),
  p('Gone', '2026-05-04', 2, { deleted_at: 'x' }), p('Next year', '2027-01-04', 4), p('Deload', '2026-12-21', 3),
]
eq('in order of start, deleted left out', orderPhases(phases).map((x) => x.id), ['Base', 'Strength', 'Peak', 'Deload', 'Next year'])
const bands = yearBands(phases, 2026)
eq('the bands of 2026', bands.map((b) => b.phase.id), ['Base', 'Strength', 'Peak', 'Deload'])
eq('Base began the year before', [bands[0].from, bands[0].before, bands[0].after], [0, true, false])
eq('Strength and Peak overlap: Peak on a second lane', bands.map((b) => b.lane), [0, 0, 1, 0])
eq('Deload runs on into 2027', [bands[3].after, bands[3].to], [true, 1])
const strength = bands[1]
eq('Strength starts at day 32 of 365', Math.round(strength.from * 365), 32)
eq('and ends after day 74', Math.round(strength.to * 365), 74)
eq('a phase that ends before it starts is left out', yearBands([p('Odd', '2026-03-02', 1, { end_date: '2026-03-01' })], 2026), [])

eq('the phase of a day, and its week', ((x) => [x.phase.id, x.week, x.weeks])(phaseOn(phases, '2026-02-17')), ['Strength', 3, 6])
eq('two overlap: the later one', phaseOn(phases, '2026-03-04').phase.id, 'Peak')
eq('no phase that day', phaseOn(phases, '2026-06-01'), null)
eq('in words', describePhase(phases[2], 2026), '6 weeks · 2 Feb to 15 Mar')
eq('another year is named', describePhase(phases[1], 2026), '12 weeks · 3 Nov 2025 to 25 Jan')
eq('one week', describePhase(p('One', '2026-01-05', 1)), '1 week · 5 Jan to 11 Jan')
eq('a short day', shortDay('2026-10-04'), '4 Oct')
eq('a new phase starts the day after the last one ends', nextPhaseStart(phases, '2026-02-10'), '2027-02-01')
eq('none ahead: today', nextPhaseStart([], '2026-02-10'), '2026-02-10')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nphases: all ok')
