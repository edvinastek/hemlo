// Day start and day end (GEN-70, day-edge-rules.ts): the person's day, which
// calendar day "today" is a little after midnight, the order of a day that
// runs past midnight, and where the edges are drawn on the rail.
import {
  calendarDay, cleanClock, dayEdges, dayOrderKey, edgeOf, edgeSlots, inNightTail, planDay, wakingMinutes,
} from '../lib/day-edge-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min)

// ---------- reading the stored times ----------------------------------------------
eq('the server keeps seconds', cleanClock('06:00:00'), '06:00')
eq('one-digit hours', cleanClock('6:30'), '06:30')
eq('not a time', [cleanClock('25:00'), cleanClock('noon'), cleanClock(null), cleanClock(7)], [null, null, null, null])
eq('the defaults', dayEdges(null), { start: '06:00', end: '22:00', cutoff: '00:00' })
eq('a broken value falls back', dayEdges({ day_start: 'x', day_end: '23:30:00' }), { start: '06:00', end: '23:30', cutoff: '00:00' })

// ---------- which day it is --------------------------------------------------------
const owl = { day_start: '09:00:00', day_end: '01:30:00' }
eq('the default day: just after midnight is the new day', planDay(at(2026, 10, 10, 0, 40), null), '2026-10-10')
eq('a day ending at 01:30: 00:40 is still the day before', planDay(at(2026, 10, 10, 0, 40), owl), '2026-10-09')
eq('…and at 01:30 the new day begins', planDay(at(2026, 10, 10, 1, 30), owl), '2026-10-10')
eq('…across a month end', planDay(at(2026, 11, 1, 1, 0), owl), '2026-10-31')
eq('…across a year end', planDay(at(2027, 1, 1, 0, 5), owl), '2026-12-31')
eq('…on the night the clocks go back (25 Oct 2026)', planDay(at(2026, 10, 25, 1, 0), owl), '2026-10-24')
eq('…on the night the clocks go forward (29 Mar 2026)', planDay(at(2026, 3, 29, 0, 30), owl), '2026-03-28')
eq('a day ending at midnight is the calendar day', planDay(at(2026, 10, 10, 0, 10), { day_start: '07:00', day_end: '00:00' }), '2026-10-10')
eq('the cut-off never passes noon', dayEdges({ day_start: '14:00', day_end: '13:00' }).cutoff, '12:00')
eq('…so at 12:30 it is the new day', planDay(at(2026, 10, 10, 12, 30), { day_start: '14:00', day_end: '13:00' }), '2026-10-10')
eq('a moment that cannot be read is now', planDay(new Date('nope'), null), calendarDay(new Date()))
eq('in the night tail', [inNightTail(at(2026, 10, 10, 0, 40), owl), inNightTail(at(2026, 10, 10, 23, 0), owl), inNightTail(at(2026, 10, 10, 0, 40), null)], [true, false, false])

// ---------- the order of a day -----------------------------------------------------
const owlEdges = dayEdges(owl)
eq('after midnight sorts last in a late day', ['23:00', '00:40', '10:00'].sort((a, b) => dayOrderKey(a, owlEdges.cutoff).localeCompare(dayOrderKey(b, owlEdges.cutoff))), ['10:00', '23:00', '00:40'])
eq('in the default day, midnight is first', dayOrderKey('00:40', '00:00'), '00:40')
eq('no time sorts after every time', dayOrderKey(null, '01:30'), '99:99')
eq('the cut-off itself is the morning', dayOrderKey('01:30', '01:30'), '01:30')

// ---------- the edges ---------------------------------------------------------------
const def = dayEdges(null)
eq('before 06:00 is early, from 22:00 late', [edgeOf('05:30', def), edgeOf('06:00', def), edgeOf('21:59', def), edgeOf('22:00', def)], ['early', null, null, 'late'])
eq('a late day: 00:40 is inside it, 03:00 is early', [edgeOf('00:40', owlEdges), edgeOf('03:00', owlEdges), edgeOf('23:30', owlEdges), edgeOf('08:59', owlEdges)], [null, 'early', null, 'early'])
eq('no time has no edge', edgeOf(null, def), null)
eq('a day ending at midnight has nothing late', edgeOf('23:50', dayEdges({ day_start: '07:00', day_end: '00:00' })), null)
eq('a day of the same start and end has no edges', edgeOf('03:00', dayEdges({ day_start: '08:00', day_end: '08:00' })), null)
eq('slots: nothing outside, nothing drawn', edgeSlots(['07:00', '12:00'], def), { start: null, end: null })
eq('slots: an early run and a late one', edgeSlots(['05:00', '05:30', '09:00', '22:30'], def), { start: 2, end: 3 })
eq('slots: only early items', edgeSlots(['05:00'], def), { start: 1, end: null })
eq('slots: only late items', edgeSlots(['23:00'], def), { start: null, end: 0 })
eq('waking minutes', [wakingMinutes(def), wakingMinutes(owlEdges), wakingMinutes(dayEdges({ day_start: '08:00', day_end: '08:00' }))], [960, 990, 960])

if (fail) { console.log(`\n${fail} day edge check(s) failed`); process.exit(1) }
console.log('\nall day edge checks passed')
