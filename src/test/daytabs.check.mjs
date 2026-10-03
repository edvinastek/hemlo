// Checks which tabs Today shows for a day: Today always, the others only when
// their part of the app is on and the day has something for it.
import { dayTabs, activeTab, tabTasks, bodyParts, recordLine, entityFields, hoursBetween } from '../lib/day-tabs.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// 2026-09-28 is a Monday, 2026-10-03 a Saturday.
const MON = '2026-09-28'
const SAT = '2026-10-03'
const base = {
  day: MON, today: MON, enabled: [], work: { on: false, days: [1, 2, 3, 4, 5] },
  tasks: [], habits: [], supplements: [], weighIn: false, sleepLog: false, review: 0, records: [],
}
const day = (over) => ({ ...base, ...over })
const keys = (input) => dayTabs(input).map((t) => t.key)
const labels = (input) => dayTabs(input).map((t) => t.label)
const task = (over) => ({ category: null, module_key: null, planned_time: null, ...over })

// Only Today.
is('a Minimal planner with an empty day has only Today', keys(day({ enabled: ['agenda'] })), ['today'])
is('a task in the day alone adds nothing', keys(day({ tasks: [task({ planned_time: '09:00' })] })), ['today'])

// Body, Habits, Supplements.
is('habits on with no habits: no tab', keys(day({ enabled: ['habits'] })), ['today'])
const daily = { schedule: 'daily', active: true }
is('habits on and one due: a Habits tab', labels(day({ enabled: ['habits'], habits: [daily] })), ['Today', 'Habits'])
is('a habit with habits off: no tab', keys(day({ habits: [daily] })), ['today'])
is('a weekdays habit is not due on Saturday', keys(day({ day: SAT, enabled: ['habits'], habits: [{ schedule: 'weekdays', active: true }] })), ['today'])
is('a weekends habit is due on Saturday', labels(day({ day: SAT, enabled: ['habits'], habits: [{ rule: 'weekends', rule_config: {}, active: true }] })), ['Today', 'Habits'])
is('a habit on chosen days is not due on others', keys(day({ day: SAT, enabled: ['habits'], habits: [{ rule: 'weekly', rule_config: { weekdays: [1, 3] }, active: true }] })), ['today'])
is('a habit not started yet is not due', keys(day({ day: SAT, enabled: ['habits'], habits: [{ rule: 'daily', rule_config: {}, start_date: '2026-10-10', active: true }] })), ['today'])
is('a three-times-a-week habit is due any day', labels(day({ day: SAT, enabled: ['habits'], habits: [{ rule: 'times_per_week', rule_config: { times: 3 }, active: true }] })), ['Today', 'Habits'])
is('an archived habit does not count', keys(day({ enabled: ['habits'], habits: [{ schedule: 'daily', active: false }] })), ['today'])
is('a deleted habit does not count', keys(day({ enabled: ['habits'], habits: [{ ...daily, deleted_at: '2026-01-01' }] })), ['today'])
is('supplements on with one active: Supplements', labels(day({ enabled: ['supplements'], supplements: [{ active: true }] })), ['Today', 'Supplements'])
is('health on, today: Body (the weigh-in can be taken)', labels(day({ enabled: ['health'] })), ['Today', 'Body'])
is('health on, a past day with no weigh-in: no tab', keys(day({ day: '2026-09-27', enabled: ['health'] })), ['today'])
is('health on, a past day with a weigh-in: Body', keys(day({ day: '2026-09-27', enabled: ['health'], weighIn: true })), ['today', 'body'])
is('health on, a day ahead: no tab', keys(day({ day: '2026-09-29', enabled: ['health'] })), ['today'])
is('a weigh-in with health off: no tab', keys(day({ weighIn: true })), ['today'])
const all = day({ enabled: ['health', 'habits', 'supplements'], habits: [daily], supplements: [{ active: true }] })
is('all three: one Body tab', labels(all), ['Today', 'Body'])
is('its parts, in order', dayTabs(all)[1].parts, ['health', 'habits', 'supplements'])
is('habits and supplements without health: Body', labels(day({ enabled: ['habits', 'supplements'], habits: [daily], supplements: [{ active: true }] })), ['Today', 'Body'])
is('body parts on a past day skip the weigh-in', bodyParts({ ...all, day: '2026-09-27' }), ['habits', 'supplements'])

// Work.
is('work hours on, a work day: Work', keys(day({ work: { on: true, days: [1, 2, 3, 4, 5] } })), ['today', 'work'])
is('work hours on, Saturday: no Work', keys(day({ day: SAT, work: { on: true, days: [1, 2, 3, 4, 5] } })), ['today'])
is('work hours off: no Work', keys(day({})), ['today'])
is('a Work task on Saturday: Work', keys(day({ day: SAT, tasks: [task({ category: 'Work' })] })), ['today', 'work'])
is('a night shift on Sunday only', keys(day({ day: '2026-10-04', work: { on: true, days: [0] } })), ['today', 'work'])

// Evening.
is('a task at 18:00: Evening', keys(day({ tasks: [task({ planned_time: '18:00' })] })), ['today', 'evening'])
is('a task at 17:59: no Evening', keys(day({ tasks: [task({ planned_time: '17:59:00' })] })), ['today'])
is('a Night task with no time: Evening', keys(day({ tasks: [task({ category: 'Night' })] })), ['today', 'evening'])
is('something to review today: Evening', keys(day({ review: 2 })), ['today', 'evening'])
is('the review is not counted for a day ahead', keys(day({ day: '2026-09-30', review: 2 })), ['today'])
is('a deleted evening task does not count', keys(day({ tasks: [task({ planned_time: '20:00', deleted_at: 'x' })] })), ['today'])

// Sleep.
is('sleep on, today: Sleep', keys(day({ enabled: ['sleep'] })), ['today', 'sleep'])
is('sleep on, yesterday with nothing logged: no tab', keys(day({ day: '2026-09-27', enabled: ['sleep'] })), ['today'])
is('sleep on, a logged night: Sleep', keys(day({ day: '2026-09-27', enabled: ['sleep'], sleepLog: true })), ['today', 'sleep'])
is('a sleep log with sleep off: no tab', keys(day({ sleepLog: true })), ['today'])

// Training.
is('training on and a Training task: Training', labels(day({ enabled: ['training'], tasks: [task({ category: 'Training' })] })), ['Today', 'Training'])
is('training on and a task with its module key', keys(day({ enabled: ['training'], tasks: [task({ module_key: 'training' })] })), ['today', 'm:training'])
is('training off: no tab', keys(day({ tasks: [task({ category: 'Training' })] })), ['today'])
is('training on and nothing that day: no tab', keys(day({ enabled: ['training'] })), ['today'])

// Modules on the record store and built modules.
is('a Projects record that day: Projects', labels(day({ enabled: ['projects'], records: ['projects'] })), ['Today', 'Projects'])
is('a record for a module that is off: no tab', keys(day({ records: ['projects'] })), ['today'])
is('a Learning task by section: Learning', labels(day({ enabled: ['learning'], tasks: [task({ category: 'Learning' })] })), ['Today', 'Learning'])
is('a built module is named after itself', labels(day({ enabled: ['u_abc123'], records: ['u_abc123'], names: { u_abc123: 'Plants' } })), ['Today', 'Plants'])
is('a built module by its tasks', keys(day({ enabled: ['u_abc123'], tasks: [task({ module_key: 'u_abc123' })] })), ['today', 'm:u_abc123'])
is('meal tasks never make a Nutrition tab', keys(day({ enabled: ['nutrition'], tasks: [task({ category: 'Meal', module_key: 'nutrition' })] })), ['today'])
is('a built module called Work gets a number', labels(day({ work: { on: true, days: [1] }, enabled: ['u_zzz999'], records: ['u_zzz999'], names: { u_zzz999: 'Work' } })), ['Today', 'Work', 'Work (2)'])

// Order.
const busy = day({
  enabled: ['sleep', 'habits', 'training', 'projects', 'learning', 'u_b', 'u_a'],
  habits: [daily], work: { on: true, days: [1] }, review: 1,
  tasks: [task({ category: 'Training' }), task({ category: 'Learning' })],
  records: ['projects', 'u_b', 'u_a'], names: { u_a: 'Allotment', u_b: 'Books' },
})
is('tabs follow the day', labels(busy), ['Today', 'Habits', 'Work', 'Training', 'Learning', 'Projects', 'Allotment', 'Books', 'Evening', 'Sleep'])

// Choosing, and falling back.
const tabs = dayTabs(day({ work: { on: true, days: [1] } }))
is('the chosen tab when the day has it', activeTab(tabs, 'work').key, 'work')
is('Today when the day does not', activeTab(dayTabs(day({ day: SAT, work: { on: true, days: [1] } })), 'work').key, 'today')

// What each tab lists.
const list = [
  task({ category: 'Work', planned_time: '09:00' }), task({ category: 'Training', planned_time: '07:00' }),
  task({ planned_time: '19:00' }), task({ module_key: 'u_a' }),
]
const count = (key, module) => tabTasks({ key, label: key, module }, list)?.length ?? null
is('Today lists everything', count('today'), 4)
is('Work lists the Work section', count('work'), 1)
is('Evening lists from 18:00', count('evening'), 1)
is('a module tab lists its own', [count('m:training', 'training'), count('m:u_a', 'u_a')], [1, 1])
is('Body and Sleep have no rail', [count('body'), count('sleep')], [null, null])

// A record as one line.
const fields = entityFields({ entities: [{ name: 'plant', fields: [
  { name: 'watered', type: 'date' }, { name: 'name', type: 'text' }, { name: 'at', type: 'time' },
] }] }, 'plant')
is('title from the first text field, time from the time field', recordLine({ watered: '2026-09-28', name: 'Fern', at: '08:30:00' }, fields), { title: 'Fern', time: '08:30' })
is('no text field: the first text that is not a date', recordLine({ d: '2026-09-28', note: 'Repot' }, []), { title: 'Repot', time: null })
is('nothing at all: Untitled', recordLine({ n: 3 }, []), { title: 'Untitled', time: null })
is('a datetime gives its time', recordLine({ t: 'Call', s: '2026-09-28T14:05:00' }, [{ name: 't', type: 'text' }, { name: 's', type: 'datetime' }]), { title: 'Call', time: '14:05' })
is('a flat definition with fields', entityFields({ fields: [{ name: 'a', type: 'text' }, { bad: 1 }] }, 'x').length, 1)
is('an unreadable definition is no fields', entityFields('nonsense', 'x'), [])

// Sleep hours.
is('hours across midnight', hoursBetween('23:15', '07:00'), 7.75)
is('hours in one day', hoursBetween('01:00', '08:20'), 7.33)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
