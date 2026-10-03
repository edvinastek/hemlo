import { isQuiet, reminderText, quietEnd, placeReminder, itemReminderText, itemRoute, canTickFromReminder, reminderViews, notificationId } from '../lib/reminder-text.ts'
import { dayItems } from '../lib/day-items-rules.ts'
let fail = 0
const is = (l, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++
  console.log(`${ok?'ok  ':'FAIL'}  ${l}: ${JSON.stringify(g)}${ok?'':` (wanted ${JSON.stringify(w)})`}`) }
const at = (h, m = 0) => { const d = new Date(2026, 8, 22, h, m); return d }
is('23:00 is inside 22:00-07:00', isQuiet(at(23), '22:00', '07:00'), true)
is('03:00 is inside 22:00-07:00', isQuiet(at(3), '22:00', '07:00'), true)
is('09:00 is outside', isQuiet(at(9), '22:00', '07:00'), false)
is('07:00 exactly is outside', isQuiet(at(7), '22:00', '07:00'), false)
is('a window that does not wrap', isQuiet(at(13), '12:00', '14:00'), true)
const task = { title: 'Calisthenics A', planned_time: '16:30:00', push_count: 0 }
is('plain reminder', reminderText(task, 'Nova'), { title: 'Nova', body: 'Calisthenics A at 16:30.' })
is('after three pushes it offers', reminderText({ ...task, push_count: 3 }, 'Nova'),
   { title: 'Nova', body: 'Calisthenics A has moved 3 times. Want a new time for it?' })
is('no persona set', reminderText(task, null).title, 'GetIt')
is('the extension limit decides when it asks', reminderText({ ...task, push_count: 3 }, 'Nova', 5).body, 'Calisthenics A at 16:30.')

// Quiet hours: dropped, or held until they end (REM-04).
const q = { quietFrom: '22:00', quietTo: '07:00' }
is('outside quiet hours: at its time', placeReminder(at(9), q)?.getHours(), 9)
is('inside, by default: dropped', placeReminder(at(23), q), null)
const held = placeReminder(at(23, 30), { ...q, quietDelay: true })
is('inside, held: 07:00 the next morning', [held.getDate(), held.getHours(), held.getMinutes()], [23, 7, 0])
const early = placeReminder(at(5, 15), { ...q, quietDelay: true })
is('after midnight, held: 07:00 the same morning', [early.getDate(), early.getHours()], [22, 7])
is('quiet hours end, worked out', quietEnd(at(12, 30), '14:00').getHours(), 14)

// Every module's items, following "Send reminders" (REM-02).
const views = reminderViews(['habits', 'household', 'agenda'], { household: { reminders: false }, agenda: { plan: false } })
is('reminders follow the switch, not where it shows', views, { habits: { plan: true }, household: { plan: false }, agenda: { plan: true } })
const day = '2026-10-05'
const src = {
  today: day, enabled: ['habits', 'household', 'agenda'], views,
  tasks: [{ id: 't1', profile_id: 'p', title: 'Call', planned_date: day, planned_time: '10:00', status: 'todo', deleted_at: null, module_key: null, category: null, sort_order: 0, source: 'manual' }],
  habits: [{ id: 'h1', name: 'Stretch', schedule: 'daily', rule: 'daily', rule_config: {}, start_date: '2026-10-01', time_of_day: '07:30', active: true, deleted_at: null, sort_order: 0 }],
  habitLogs: [], chores: [{ id: 'c1', household_id: 'x', name: 'Bins', mode: 'fixed', rule: 'daily', rule_config: {}, start_date: '2026-10-01', time_of_day: '19:00', assignees: [], rotation: 'none', paused: false, deleted_at: null }],
  choreLogs: [], supplements: [], supplementLogs: [],
  events: [{ id: 'e1', profile_id: 'p', title: 'Dentist', starts_at: `${day}T14:00:00`, ends_at: `${day}T14:30:00`, all_day: false, location: null, deleted_at: null }],
  records: [],
}
const items = dayItems([day], 'plan', src).filter((i) => i.time)
is('tasks, habits and events remind; chores with reminders off do not', items.map((i) => i.kind).sort(), ['event', 'habit', 'task'])
is('a habit says it is time', itemReminderText({ kind: 'habit', title: 'Stretch', time: '07:30', meta: '' }, null).body, 'Time for Stretch.')
is('a chore says it is due', itemReminderText({ kind: 'chore', title: 'Bins', time: '19:00', meta: '' }, 'Ava'), { title: 'Ava', body: 'Bins is due at 19:00.' })
is('an event says when', itemReminderText({ kind: 'event', title: 'Dentist', time: '14:00', meta: '' }, null).body, 'Dentist at 14:00.')

// Tapping opens the item; Done only where a tick means something (REM-03).
is('a task today opens Today', itemRoute({ kind: 'task', module_key: null, ref: { id: 't1' }, day }, day), '/')
is('a task another day opens Plan', itemRoute({ kind: 'task', module_key: null, ref: { id: 't1' }, day }, '2026-10-04'), '/plan')
is('an event opens on Agenda', itemRoute({ kind: 'event', module_key: 'agenda', ref: { id: 'e1' }, day }, day), '/m/agenda?open=e1')
is('a record opens on its module', itemRoute({ kind: 'record', module_key: 'u_plants01', ref: { id: 'r1' }, day }, day), '/m/u_plants01?open=r1')
is('tasks, habits and chores can be ticked from a reminder', ['task', 'habit', 'chore', 'event', 'record'].map(canTickFromReminder), [true, true, true, false, false])
is('notification ids: stable, positive, distinct per day', [notificationId('a:1') === notificationId('a:1'), notificationId('a:1') > 0, notificationId('a:1') !== notificationId('a:2')], [true, true, true])

console.log(fail ? `\n${fail} failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
