import { isQuiet, reminderText } from '../lib/reminder-text.ts'
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
console.log(fail ? `\n${fail} failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
