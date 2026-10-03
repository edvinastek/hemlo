// Checks household chores as a person reads them (chore-rules.ts) and the
// holiday pause in the schedule (schedule-rules.ts): calm words that never
// say "overdue", the due-ness bar, the page's sections, rooms, light days and
// a daily cap for flexible chores, members' names, and the starter packs.
// 2026-10-03 is a Saturday.
import {
  nearDay, choreStatus, duenessFill, lastDoneText, choreScheduleText, choreSections, choreRooms, roomsIn, readChorePrefs,
  heldBack, memberName, cleanMemberName, STARTER_PACKS, packChoresToAdd,
} from '../lib/chore-rules.ts'
import { choreState, chorePausedOn, cleanRule } from '../lib/schedule-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}
const today = '2026-10-03'
const log = (done_on, done_by = null) => ({ done_on, done_by })

is('days near today', ['2026-10-03', '2026-10-04', '2026-10-06', '2026-10-02', '2026-09-28', '2026-10-20'].map((d) => nearDay(d, today)),
  ['today', 'tomorrow', 'in 3 days', 'yesterday', '5 days ago', 'Tue 20 Oct'])

const sat = { mode: 'fixed', rule: 'weekly', rule_config: { weekdays: [6] }, every_days: null, start_date: '2026-09-01', end_date: null }
const st = (c, logs = [], day = today) => choreState(c, day, logs)
is('due today', choreStatus(sat, st(sat), today), { text: 'Due today', tone: 'due' })
is('waiting, never "overdue"', choreStatus(sat, st(sat, [], '2026-10-05'), '2026-10-05'), { text: 'Waiting 2 days', tone: 'waiting' })
is('done today', choreStatus(sat, st(sat, [log(today)]), today).text, 'Done today')
is('next week in words', choreStatus(sat, st(sat, [log(today)], '2026-10-04'), '2026-10-04').text, 'Due in 6 days')
const flex = { mode: 'flexible', rule: null, rule_config: {}, every_days: 10, start_date: null, end_date: null }
is('flexible words grow calmly', [1, 7, 10, 16].map((n) => choreStatus(flex, st(flex, [log('2026-09-23')], addDay(n)), addDay(n)).text),
  ['Fresh', 'Getting due', 'Due about now', 'Could do with doing'])
function addDay(n) { const d = new Date(Date.UTC(2026, 8, 23 + n)); return d.toISOString().slice(0, 10) }
is('a never-done flexible chore', choreStatus(flex, st(flex), today).text, 'Due about now')
is('the bar fills with the days', [duenessFill(flex, st(flex, [log('2026-09-28')])), duenessFill(flex, st(flex, [log('2026-09-13')]))], [0.5, 1])
is('a fixed chore\'s bar is full on its day', [duenessFill(sat, st(sat)), duenessFill(sat, st(sat, [log(today)]))], [1, 0])
is('last done words', [lastDoneText('2026-10-01', 'Sam', today), lastDoneText(null, null, today)], ['Last done 2 days ago by Sam', 'Not done yet'])

// Holiday pause with dates (HSE-08).
const away = { ...sat, paused_from: '2026-10-01', paused_until: '2026-10-11' }
is('paused inside its dates', [chorePausedOn(away, '2026-09-30'), chorePausedOn(away, today), chorePausedOn(away, '2026-10-12')], [false, true, false])
is('paused words', choreStatus(away, st(away), today), { text: 'Paused until 11 Oct', tone: 'paused' })
is('a paused chore says when it is back', st(away).next, '2026-10-12')
is('what fell due during the holiday is let go', st(away, [], '2026-10-12').shows, false)
is('…the next one comes as usual', st(away, [], '2026-10-17').shows, true)
const flexAway = { ...flex, paused_from: '2026-09-28', paused_until: '2026-10-07' }
is('a flexible chore\'s clock stands still while away', st(flexAway, [log('2026-09-23')], '2026-10-08').dueness, 0.5)
is('the schedule says the pause', choreScheduleText(away, '2026-09-25'), 'Weekly on Sat · paused from in 6 days until 11 Oct')
is('switched to paused for good', choreStatus({ ...sat, paused: true }, st({ ...sat, paused: true }), today).text, 'Paused')

// Sections and rooms.
const chores = [
  { ...sat, id: 'a', name: 'Bathroom', room: 'Bathroom', sort_order: 0 },
  { ...flex, id: 'b', name: 'Hoover', room: 'Living room', sort_order: 1 },
  { ...sat, id: 'c', name: 'Bins', room: null, sort_order: 2, rule_config: { weekdays: [1] }, start_date: today },
  { ...sat, id: 'd', name: 'Windows', room: 'Outside', sort_order: 3, rule: 'monthly', rule_config: { day_of_month: 20 }, start_date: today },
  { ...sat, id: 'e', name: 'Plants', room: 'Living room', sort_order: 4, paused: true },
]
const entries = chores.map((c) => ({ chore: c, state: st(c, c.id === 'b' ? [log('2026-09-30')] : []) }))
is('now, this week, later, paused', choreSections(entries, today).map((s) => [s.key, s.entries.map((e) => e.chore.id)]),
  [['now', ['a']], ['soon', ['c', 'b']], ['later', ['d']], ['paused', ['e']]])
is('by room, no room last', choreRooms(chores).map((r) => [r.room, r.chores.map((c) => c.id)]),
  [['Bathroom', ['a']], ['Living room', ['b', 'e']], ['Outside', ['d']], [null, ['c']]])
is('rooms in use', roomsIn([{ room: ' Kitchen ' }, { room: 'Bathroom' }, { room: null }, { room: 'Kitchen' }]), ['Bathroom', 'Kitchen'])

// Light days and a cap (HSE-09).
is('prefs are checked', readChorePrefs({ light_days: [5, 5, 9, 'x'], cap: 3 }), { light_days: [5], cap: 3 })
is('every day light means none', readChorePrefs({ light_days: [0, 1, 2, 3, 4, 5, 6], cap: 0 }), { light_days: [], cap: null })
const items = [
  { id: 'f1', mode: 'flexible', dueness: 1.4, doneToday: false },
  { id: 'f2', mode: 'flexible', dueness: 1.1, doneToday: false },
  { id: 'f3', mode: 'flexible', dueness: 2, doneToday: false },
  { id: 'x', mode: 'fixed', dueness: 1, doneToday: false },
  { id: 'f4', mode: 'flexible', dueness: 0, doneToday: true },
]
is('a light day holds back every flexible chore not done', [...heldBack(items, '2026-10-02', { light_days: [5], cap: null })].sort(), ['f1', 'f2', 'f3'])
is('a cap of 2 keeps the most due (one already done counts)', [...heldBack(items, today, { light_days: [5], cap: 2 })].sort(), ['f1', 'f2'])
is('no prefs, nothing held', heldBack(items, today, { light_days: [], cap: null }).size, 0)

// Members (HSE-07).
const members = [{ user_id: 'u1', display_name: 'Edvinas' }, { user_id: 'u2', display_name: null }]
is('names', [memberName(members, 'u1', 'u2'), memberName(members, 'u2', 'u2'), memberName(members, 'u2', 'u1'), memberName(members, 'u9', 'u1')],
  ['Edvinas', 'Me', 'Member 2', 'A former member'])
is('a name is tidied and kept short', [cleanMemberName('  Sam   K '), cleanMemberName(''), cleanMemberName('x'.repeat(41))], ['Sam K', null, null])

// Starter packs (HSE-10).
is('two packs', STARTER_PACKS.map((p) => p.name), ['Studio flat', 'Family house'])
is('every pack chore has a valid schedule', STARTER_PACKS.every((p) => p.chores.every((c) =>
  c.mode === 'fixed' ? cleanRule(c.rule, c.rule_config).rule === c.rule : (c.every_days ?? 0) >= 1)), true)
is('adding a pack twice makes no doubles', packChoresToAdd(STARTER_PACKS[0], [{ name: 'wash up', room: 'kitchen' }]).length, STARTER_PACKS[0].chores.length - 1)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
