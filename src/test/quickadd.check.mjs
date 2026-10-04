// Natural-language quick add (TSK-07, quick-add-rules.ts): one line read into
// a day, a time, a length, a repeat and a section, with chips; English and
// Dutch; words it is not sure of stay in the title. 2026-10-05 is a Monday.
import { readQuickAdd, dayWords, lengthWords } from '../lib/quick-add-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}
const MON = '2026-10-05'
const ctx = { today: MON, base: MON, sections: ['Work', 'Training', 'Learning', 'Home', 'Deep work', 'Night'] }
const read = (text, more = {}) => readQuickAdd(text, { ...ctx, ...more })
const pick = (r, ...keys) => Object.fromEntries(keys.map((k) => [k, r[k]]))

// ---------- the example from the requirement ----------------------------------------
const gym = read('Gym tomorrow 18:00-19:30 every Mon Wed #Training')
eq('the example: title', gym.title, 'Gym')
eq('the example: day, time, length, section', pick(gym, 'day', 'time', 'minutes', 'section'), { day: '2026-10-06', time: '18:00', minutes: 90, section: 'Training' })
eq('the example: repeat in the repeat control’s shape', gym.repeat, { rule: 'weekly', rule_config: { weekdays: [1, 3] } })
eq('the example: chips', gym.chips, [
  { kind: 'day', label: 'Tomorrow' }, { kind: 'time', label: '18:00–19:30' },
  { kind: 'repeat', label: 'Weekly on Mon, Wed' }, { kind: 'section', label: 'Training' }])
eq('nothing to read: the line is the title', pick(read('Call the dentist'), 'title', 'day', 'dayFromRepeat', 'time', 'minutes', 'repeat', 'section', 'chips'),
  { title: 'Call the dentist', day: null, dayFromRepeat: false, time: null, minutes: null, repeat: null, section: null, chips: [] })

// ---------- taking a reading away ------------------------------------------------------
const noDay = read('Gym tomorrow 18:00-19:30 every Mon Wed #Training', { off: ['day'] })
eq('a chip tapped away: its words stay in the title', noDay.title, 'Gym tomorrow')
eq('…and the rest is still read', [noDay.time, noDay.section, noDay.chips.length], ['18:00', 'Training', 3])
eq('every reading off: the line is the title', read('Gym tomorrow 18:00 #Training', { off: ['day', 'time', 'section'] }).title, 'Gym tomorrow 18:00 #Training')

// ---------- days ------------------------------------------------------------------------
const day = (t) => read(t).day
eq('today / tomorrow', [day('Bins today'), day('Bins tomorrow'), day('Bins tmrw')], [MON, '2026-10-06', '2026-10-06'])
eq('the day after tomorrow', [day('Bins the day after tomorrow'), day('Bins overmorgen')], ['2026-10-07', '2026-10-07'])
eq('Dutch: vandaag, morgen', [day('Afval vandaag'), day('Afval morgen')], [MON, '2026-10-06'])
eq('a weekday is the next one on or after today', [day('Bins friday'), day('Bins fri'), day('Bins monday')], ['2026-10-09', '2026-10-09', MON])
eq('Dutch weekdays', [day('Sporten vrijdag'), day('Sporten op woensdag')], ['2026-10-09', '2026-10-07'])
eq('next fri is the Friday of next week', [day('Pay rent next fri'), day('Huur volgende vrijdag')], ['2026-10-16', '2026-10-16'])
eq('next sunday is the end of next week', day('Walk next sunday'), '2026-10-18')
eq('this weekend, next week', [day('Paint this weekend'), day('Paint next week')], ['2026-10-10', '2026-10-12'])
eq('23 oct, 23 October, 23rd Oct, 23 okt', [day('Party 23 oct'), day('Party 23 October'), day('Party 23rd Oct'), day('Feest 23 okt')], ['2026-10-23', '2026-10-23', '2026-10-23', '2026-10-23'])
eq('Oct 23, with a year', [day('Party Oct 23'), day('Party October 23rd, 2027'), day('Party 23 oct 2027')], ['2026-10-23', '2027-10-23', '2027-10-23'])
eq('a date gone this year is next year’s', day('Taxes 1 mar'), '2027-03-01')
eq('23/10, 23/10/2026, 23-10-2026', [day('Party 23/10'), day('Party 23/10/2026'), day('Party 23-10-2026'), day('Party 23/10/27')], ['2026-10-23', '2026-10-23', '2026-10-23', '2027-10-23'])
eq('ISO', day('Party 2026-11-02'), '2026-11-02')
eq('in 3 days, in 2 weeks, over 3 dagen, in a week', [day('Check in 3 days'), day('Check in 2 weeks'), day('Check over 3 dagen'), day('Check in a week')],
  ['2026-10-08', '2026-10-19', '2026-10-08', '2026-10-12'])
eq('the day’s words leave the title', [read('Bins on friday').title, read('Party 23 oct, bring cake').title], ['Bins', 'Party, bring cake'])
eq('day chips', [read('x friday').chips[0].label, read('x 23 oct 2027').chips[0].label], ['Fri 9 Oct', 'Sat 23 Oct 2027'])
eq('not a day: 31/2', pick(read('Party 31/2'), 'day', 'title'), { day: null, title: 'Party 31/2' })

// ---------- times and lengths -----------------------------------------------------------
const tm = (t) => pick(read(t), 'time', 'minutes')
eq('18:00 and 18.00', [tm('Gym 18:00'), tm('Gym 18.00')], [{ time: '18:00', minutes: null }, { time: '18:00', minutes: null }])
eq('6pm, 6:30 pm, 7am, 12am, 12pm', [read('a 6pm').time, read('a 6:30 pm').time, read('a at 7am').time, read('a 12am').time, read('a 12pm').time], ['18:00', '18:30', '07:00', '00:00', '12:00'])
eq('at 18, om 18, om 9 uur, 18u30', [read('Gym at 18').time, read('Sporten om 18').time, read('Sporten om 9 uur').time, read('Sporten 18u30').time], ['18:00', '18:00', '09:00', '18:30'])
eq('noon', read('Lunch with Sam noon').time, '12:00')
eq('a range: 18-19:30', tm('Gym 18-19:30'), { time: '18:00', minutes: 90 })
eq('a range: 6-7pm, 9am to 5pm', [tm('a 6-7pm'), tm('Work 9am to 5pm')], [{ time: '18:00', minutes: 60 }, { time: '09:00', minutes: 480 }])
eq('a range: from 18 to 19, van 9 tot 17', [tm('Shift from 18 to 19'), tm('Werk van 9 tot 17')], [{ time: '18:00', minutes: 60 }, { time: '09:00', minutes: 480 }])
eq('a range across midnight', tm('Party 22:00-01:00'), { time: '22:00', minutes: 180 })
eq('a range’s chip', read('Gym 18-19:30').chips, [{ kind: 'time', label: '18:00–19:30' }])
eq('for 45 min, 45 minutes, 45min', [tm('Read for 45 min').minutes, tm('Read 45 minutes').minutes, tm('Read 45min').minutes], [45, 45, 45])
eq('1h30, 1 h, 2 hours, 1.5h, voor 1 uur', [tm('Run 1h30').minutes, tm('Run for 1 h').minutes, tm('Run 2 hours').minutes, tm('Run 1.5h').minutes, tm('Hardlopen voor 1 uur').minutes], [90, 60, 120, 90, 60])
eq('an hour, half an hour, anderhalf uur', [tm('Walk for an hour').minutes, tm('Walk half an hour').minutes, tm('Wandelen anderhalf uur').minutes], [60, 30, 90])
eq('length leaves the title, with its "for"', read('Read for 45 min').title, 'Read')
eq('a length chip', read('Read for 1h30').chips, [{ kind: 'length', label: '1 h 30' }])
eq('a range wins over a second length', pick(read('Gym 18-19:30 for 45 min'), 'minutes', 'title'), { minutes: 90, title: 'Gym for 45 min' })
eq('only the first time is read', pick(read('Gym 18:00 or 19:00'), 'time', 'title'), { time: '18:00', title: 'Gym or 19:00' })

// ---------- repeats ---------------------------------------------------------------------
const rp = (t, more) => read(t, more).repeat
eq('every day, daily, elke dag', [rp('Stretch every day'), rp('Stretch daily'), rp('Rekken elke dag')], [
  { rule: 'daily', rule_config: {} }, { rule: 'daily', rule_config: {} }, { rule: 'daily', rule_config: {} }])
eq('every weekday, weekdays, elke werkdag', [rp('Stand-up every weekday'), rp('Stand-up weekdays'), rp('Stand-up elke werkdag')].map((r) => r.rule), ['weekdays', 'weekdays', 'weekdays'])
eq('every week: on the start day', rp('Review every week'), { rule: 'weekly', rule_config: { weekdays: [1] } })
eq('every month: on the start date', rp('Rent every month'), { rule: 'monthly', rule_config: { day_of_month: 5 } })
eq('every month from a typed day', rp('Rent every month 23 oct'), { rule: 'monthly', rule_config: { day_of_month: 23 } })
eq('every year', rp('Birthday 23 oct every year'), { rule: 'yearly', rule_config: { month: 10, day: 23 } })
eq('every 2 days, every 3 weeks, every 2 months', [rp('Water every 2 days'), rp('Report every 3 weeks'), rp('Bills every 2 months')], [
  { rule: 'daily', rule_config: { n: 2 } }, { rule: 'every_n_weeks', rule_config: { n: 3, weekdays: [1] } }, { rule: 'monthly', rule_config: { day_of_month: 5, n: 2 } }])
eq('every other week, om de week', [rp('Bins every other week'), rp('Container om de week')].map((r) => [r.rule, r.rule_config.n]), [['every_n_weeks', 2], ['every_n_weeks', 2]])
eq('every Mon, Wed and Fri', rp('Gym every Mon, Wed and Fri'), { rule: 'weekly', rule_config: { weekdays: [1, 3, 5] } })
eq('elke maandag en donderdag', rp('Sporten elke maandag en donderdag'), { rule: 'weekly', rule_config: { weekdays: [1, 4] } })
eq('on Mondays, maandags', [rp('Yoga on mondays'), rp('Yoga maandags')], [{ rule: 'weekly', rule_config: { weekdays: [1] } }, { rule: 'weekly', rule_config: { weekdays: [1] } }])
const tue = read('Swim every tue thu')
eq('a weekly repeat not on today starts on its first day', [tue.day, tue.dayFromRepeat, tue.chips], ['2026-10-06', true, [{ kind: 'repeat', label: 'Weekly on Tue, Thu, from Tomorrow' }]])
eq('…from the day in view, not only today', read('Swim every fri', { base: '2026-10-10' }).day, '2026-10-16')
eq('…and a repeat on today’s weekday keeps the day', read('Gym every mon wed').day, null)
eq('a repeat leaves the title', read('Gym every Mon Wed').title, 'Gym')
eq('repeat taken away: its words stay', pick(read('Gym every Mon Wed', { off: ['repeat'] }), 'repeat', 'title', 'day'), { repeat: null, title: 'Gym every Mon Wed', day: null })

// ---------- sections --------------------------------------------------------------------
eq('#Training, any case', [read('Gym #training').section, read('Gym #TRAINING').section], ['Training', 'Training'])
eq('a section of two words', pick(read('Write #deep work now'), 'section', 'title'), { section: 'Deep work', title: 'Write now' })
eq('an unknown section stays in the title', pick(read('Gym #fitness'), 'section', 'title'), { section: null, title: 'Gym #fitness' })
eq('a # inside a word is not a section', read('Call C#Work').section, null)
eq('a longer word is not the section', read('Gym #Trainingday').section, null)

// ---------- never eat words it is not sure of -------------------------------------------
const keep = (t) => read(t).title === t
eq('sun and sat alone are words', [keep('Buy sun cream'), keep('Sat down with Ann')], [true, true])
eq('…but on sat is a day', pick(read('Party on sat'), 'day', 'title'), { day: '2026-10-10', title: 'Party' })
eq('may and mar first are words', [keep('May 2 people come'), keep('Mar 4 the car')], [true, true])
eq('5-6 reps is not a time', keep('Squats 5-6 reps'), true)
eq('a bare number is not a time', keep('Buy 12 eggs'), true)
eq('a price is not a time', keep('Pay €18.00 to Sam'), true)
eq('a fraction is not a date', keep('Add 1/2 cup sugar'), true)
eq('Weekly review as the first word stays', pick(read('Weekly review'), 'repeat', 'title'), { repeat: null, title: 'Weekly review' })
eq('…but water plants weekly repeats', read('Water plants weekly').repeat?.rule, 'weekly')
eq('do, ma, zo (Dutch short day names) stay', [keep('Do the dishes'), keep('Call ma'), keep('Zo moe')], [true, true, true])
eq('18 uur alone is not a length', pick(read('Eten 18 uur'), 'minutes', 'title'), { minutes: null, title: 'Eten 18 uur' })
eq('a second day stays in the title', pick(read('Move tuesday or friday'), 'day', 'title'), { day: '2026-10-06', title: 'Move or friday' })
eq('only the readings come out: commas tidied', read('Dentist, tomorrow, 9:30').title, 'Dentist')
eq('a line that is only readings has no title', read('tomorrow 18:00').title, '')

// ---------- while it is being typed -------------------------------------------------------
eq('half a word is not read', [read('Gym tom').chips.length, read('Gym 18:0').chips.length, read('Gym every').chips.length, read('Gym #Tra').chips.length], [0, 0, 0, 0])
eq('a lead word goes with its reading', [read('Gym at 18:00').title, read('Gym om 18:00').title, read('Lunch 12:30 for 45 min').title], ['Gym', 'Gym', 'Lunch'])
eq('a time and a length together', pick(read('Lunch 12:30 for 45 min'), 'time', 'minutes', 'chips'),
  { time: '12:30', minutes: 45, chips: [{ kind: 'time', label: '12:30' }, { kind: 'length', label: '45 min' }] })

// ---------- words for chips ---------------------------------------------------------------
eq('day words', [dayWords(MON, MON), dayWords('2026-10-06', MON), dayWords('2026-12-01', MON), dayWords('2027-01-02', MON)], ['Today', 'Tomorrow', 'Tue 1 Dec', 'Sat 2 Jan 2027'])
eq('length words', [lengthWords(45), lengthWords(60), lengthWords(90)], ['45 min', '1 h', '1 h 30'])

if (fail) { console.log(`\n${fail} quick add check(s) failed`); process.exit(1) }
console.log('\nall quick add checks passed')
