// Checks the Health Connect sleep import (SLP-05): sessions joined into
// nights, the night given to the day it ended, naps left out, stages summed,
// nights already there or imported before left alone.
import {
  planSleepImport, joinSessions, importIds, localAt, importRange, queryWindow, describeImport,
} from '../lib/sleep-import-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

const H = 3600_000
const M = 60_000
const CEST = 7200 // Amsterdam in summer
const CET = 3600 // Amsterdam in winter
// An instant from a local Amsterdam summer clock time.
const at = (day, time, offset = CEST) => Date.parse(`${day}T${time}:00Z`) - offset * 1000
const session = (id, day1, t1, day2, t2, extra = {}) => ({
  id, start: at(day1, t1), end: at(day2, t2), startOffset: CEST, endOffset: CEST, ...extra,
})
const range = { from: '2026-09-21', to: '2026-10-04' }
const noFallback = () => { throw new Error('the session has its own offset') }

// Clock times.
eq('local time at an offset', localAt(at('2026-10-01', '23:10'), CEST), { day: '2026-10-01', time: '23:10' })
eq('a UTC instant before midnight is the next local day', localAt(Date.parse('2026-10-01T22:30:00Z'), CEST), { day: '2026-10-02', time: '00:30' })

// One ordinary night across midnight goes to the morning it ended.
{
  const p = planSleepImport([session('a', '2026-10-01', '23:10', '2026-10-02', '06:40')], [], range, noFallback)
  eq('across midnight: the wake day', p.add.map((n) => n.log_date), ['2026-10-02'])
  eq('across midnight: bed and wake', [p.add[0].went_to_bed, p.add[0].woke_at], ['23:10', '06:40'])
  eq('across midnight: hours without stages', p.add[0].hours, 7.5)
  eq('across midnight: the id is kept', p.add[0].import_id, 'hc:a')
  eq('across midnight: nothing else', [p.kept, p.before, p.naps], [0, 0, 0])
}

// A night that started after midnight is that same day's.
{
  const p = planSleepImport([session('late', '2026-10-02', '01:30', '2026-10-02', '08:00')], [], range, noFallback)
  eq('after midnight: same day', p.add.map((n) => [n.log_date, n.went_to_bed, n.woke_at, n.hours]), [['2026-10-02', '01:30', '08:00', 6.5]])
}

// Stages: awake and out-of-bed stretches are not sleep.
{
  const s = session('st', '2026-10-01', '23:00', '2026-10-02', '07:00', {
    stages: [
      { start: at('2026-10-01', '23:00'), end: at('2026-10-01', '23:30'), stage: 1 }, // awake
      { start: at('2026-10-01', '23:30'), end: at('2026-10-02', '03:00'), stage: 4 }, // light
      { start: at('2026-10-02', '03:00'), end: at('2026-10-02', '03:20'), stage: 3 }, // out of bed
      { start: at('2026-10-02', '03:20'), end: at('2026-10-02', '06:50'), stage: 5 }, // deep
      { start: at('2026-10-02', '06:50'), end: at('2026-10-02', '07:00'), stage: 7 }, // awake in bed
    ],
  })
  const p = planSleepImport([s], [], range, noFallback)
  eq('stages: only asleep stretches count', p.add[0].hours, 7)
  eq('stages: bed and wake are still the session', [p.add[0].went_to_bed, p.add[0].woke_at], ['23:00', '07:00'])
  const odd = session('st2', '2026-10-01', '23:00', '2026-10-02', '07:00', {
    stages: [{ start: at('2026-10-01', '22:00'), end: at('2026-10-02', '08:00'), stage: 2 }],
  })
  eq('stages: a stage past the session is cut to it', planSleepImport([odd], [], range, noFallback).add[0].hours, 8)
}

// Overlaps: a watch and a phone recording the same night are one night.
{
  const watch = session('w', '2026-10-01', '23:00', '2026-10-02', '06:30')
  const phone = session('p', '2026-10-01', '23:20', '2026-10-02', '07:00')
  const p = planSleepImport([watch, phone], [], range, noFallback)
  eq('overlap: one night', p.add.length, 1)
  eq('overlap: earliest bed, latest wake', [p.add[0].went_to_bed, p.add[0].woke_at], ['23:00', '07:00'])
  eq('overlap: hours counted once', p.add[0].hours, 8)
  eq('overlap: both ids kept', importIds(p.add[0].import_id), ['w', 'p'])
}

// A night split by getting up for 40 minutes is still one night.
{
  const a = session('s1', '2026-10-01', '23:00', '2026-10-02', '03:00')
  const b = session('s2', '2026-10-02', '03:40', '2026-10-02', '07:00')
  const p = planSleepImport([b, a], [], range, noFallback)
  eq('split night: one night', p.add.map((n) => [n.went_to_bed, n.woke_at]), [['23:00', '07:00']])
  eq('split night: the gap is not sleep', p.add[0].hours, 7.33)
  eq('split night: blocks', joinSessions([a, b]).length, 1)
}

// Naps: an afternoon nap on a day with a night is left out; a nap alone is not a night.
{
  const night = session('n', '2026-10-01', '23:00', '2026-10-02', '07:00')
  const nap = session('nap', '2026-10-02', '14:00', '2026-10-02', '15:00')
  const p = planSleepImport([night, nap], [], range, noFallback)
  eq('nap: the night stays', p.add.map((n) => n.import_id), ['hc:n'])
  eq('nap: counted as left out', p.naps, 1)
  const alone = planSleepImport([session('nap2', '2026-10-03', '13:00', '2026-10-03', '14:30')], [], range, noFallback)
  eq('nap alone: no night', [alone.add.length, alone.naps], [0, 1])
  // Two long sleeps ending the same day (a night shift): the longer one is the night.
  const day1 = session('d1', '2026-10-03', '00:00', '2026-10-03', '04:00')
  const day2 = session('d2', '2026-10-03', '09:00', '2026-10-03', '15:00')
  const two = planSleepImport([day1, day2], [], range, noFallback)
  eq('two sleeps: the longer is the night', [two.add.map((n) => n.import_id), two.naps], [['hc:d2'], 1])
}

// Duplicates and nights already there.
{
  const s = session('dup', '2026-10-01', '23:00', '2026-10-02', '07:00')
  eq('the same session twice is one night', planSleepImport([s, { ...s }], [], range, noFallback).add.length, 1)
  const imported = [{ id: 'r1', log_date: '2026-10-02', deleted_at: null, import_id: 'hc:x,dup' }]
  eq('imported before: skipped', [planSleepImport([s], imported, range, noFallback).add.length, planSleepImport([s], imported, range, noFallback).before], [0, 1])
  const deleted = [{ id: 'r1', log_date: '2026-10-02', deleted_at: '2026-10-03T08:00:00Z', import_id: 'hc:dup' }]
  eq('imported before and deleted since: stays deleted', planSleepImport([s], deleted, range, noFallback).add.length, 0)
  const own = [{ id: 'r2', log_date: '2026-10-02', deleted_at: null, import_id: null }]
  const p = planSleepImport([s], own, range, noFallback)
  eq('the person\'s own night wins', [p.add.length, p.kept], [0, 1])
  const gone = [{ id: 'r3', log_date: '2026-10-02', deleted_at: '2026-10-02T09:00:00Z' }]
  eq('a deleted night of their own: its row is taken back', planSleepImport([s], gone, range, noFallback).add[0].reuse, 'r3')
  eq('no row that day: a new one', planSleepImport([s], [], range, noFallback).add[0].reuse, null)
}

// The range is by wake day.
{
  const before = session('old', '2026-09-19', '23:00', '2026-09-20', '07:00')
  const first = session('first', '2026-09-20', '23:00', '2026-09-21', '07:00')
  const future = session('fut', '2026-10-04', '23:00', '2026-10-05', '07:00')
  const p = planSleepImport([before, first, future], [], range, noFallback)
  eq('range: only wake days inside it', p.add.map((n) => n.log_date), ['2026-09-21'])
}

// Zones: the end's own offset decides the wake day; no offset falls back to the device's.
{
  // The clocks went back on 25 October 2026: in bed at 23:00 summer time, up at 07:00 winter time.
  const s = { id: 'dst', start: at('2026-10-24', '23:00', CEST), end: at('2026-10-25', '07:00', CET), startOffset: CEST, endOffset: CET }
  const p = planSleepImport([s], [], { from: '2026-10-25', to: '2026-10-25' }, noFallback)
  eq('clocks going back: times as the clock showed', [p.add[0].went_to_bed, p.add[0].woke_at, p.add[0].hours], ['23:00', '07:00', 9])
  const bare = { id: 'bare', start: Date.parse('2026-10-01T21:00:00Z'), end: Date.parse('2026-10-02T05:00:00Z'), startOffset: null, endOffset: null }
  const q = planSleepImport([bare], [], range, () => CEST)
  eq('no offset: the device\'s is used', q.add.map((n) => [n.log_date, n.went_to_bed, n.woke_at]), [['2026-10-02', '23:00', '07:00']])
}

// Nonsense from upstream is left out.
{
  const bad = [
    { id: '', start: at('2026-10-01', '23:00'), end: at('2026-10-02', '07:00'), startOffset: CEST, endOffset: CEST },
    { id: 'back', start: at('2026-10-02', '07:00'), end: at('2026-10-01', '23:00'), startOffset: CEST, endOffset: CEST },
    { id: 'long', start: at('2026-09-29', '07:00'), end: at('2026-10-01', '07:00'), startOffset: CEST, endOffset: CEST },
    { id: 'nan', start: NaN, end: at('2026-10-01', '07:00'), startOffset: CEST, endOffset: CEST },
  ]
  eq('broken sessions: none imported', planSleepImport(bad, [], range, noFallback).add.length, 0)
  const awake = session('awake', '2026-10-01', '23:00', '2026-10-02', '07:00', {
    stages: [{ start: at('2026-10-01', '23:00'), end: at('2026-10-02', '07:00'), stage: 1 }],
  })
  eq('a session awake throughout is not a night', planSleepImport([awake], [], range, noFallback).add.length, 0)
}

// Ids, ranges and the summary line.
eq('ids read back', importIds('hc:a,b'), ['a', 'b'])
eq('a row typed by hand has no ids', importIds(null), [])
eq('another source is not ours', importIds('other:a'), [])
eq('last 14 days', importRange('2026-10-04', 14), { from: '2026-09-21', to: '2026-10-04' })
eq('last 7 days across a month', importRange('2026-10-03', 7), { from: '2026-09-27', to: '2026-10-03' })
{
  const w = queryWindow({ from: '2026-09-21', to: '2026-10-04' })
  eq('the window starts the evening before the first day', new Date(w.start).getDate(), 20)
  eq('the window ends after the last day', new Date(w.end).getDate(), 5)
  eq('the window is about 15 days', Math.round((w.end - w.start) / (24 * H)), 15)
}
eq('summary: everything', describeImport({ added: 9, kept: 3, before: 1, naps: 2 }), '9 nights added. 3 days already had a night, 1 night was imported before, 2 naps left out.')
eq('summary: one night', describeImport({ added: 1, kept: 0, before: 0, naps: 0 }), '1 night added.')
eq('summary: nothing new', describeImport({ added: 0, kept: 0, before: 2, naps: 0 }), 'No new nights. 2 nights were imported before.')
eq('minutes are whole', localAt(at('2026-10-01', '23:10') + 30 * 1000 + 59 * M - 59 * M, CEST).time, '23:10')

if (fail) {
  console.log(`\n${fail} failed`)
  process.exit(1)
}
console.log('\nall sleep import checks passed')
