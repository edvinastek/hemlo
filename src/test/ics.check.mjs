// Checks calendar files (.ics): what the app writes follows RFC 5545 and
// round-trips, and a file shaped like a Google Calendar export reads back in
// the reader's own time. 2026-09-28 is a Monday; 2026-10-25 the clocks go
// back in Europe; 2028 is a leap year.
import {
  buildCalendar, escapeText, foldLine, unfold, parseLine, unescapeText, taskEvent, calendarEvent, seriesEvents,
  seriesRule, firstDay, parseIcs, parseRule, mapRule, expandRule, eventDays, wallToUtc, utcToWall, cleanZone,
  durationMinutes, uidFor, PRODID, looseRepeat, readLooseRepeat, scheduleEvent,
} from '../lib/ics-rules.ts'
import { baseDates, addDays } from '../lib/series-rules.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}
const bytes = (s) => new TextEncoder().encode(s).length
const STAMP = '2026-09-27T10:00:00.000Z'
const AMS = 'Europe/Amsterdam'

// ---- escaping and folding ---------------------------------------------------
eq('escape commas, semicolons, backslashes, newlines', escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
eq('unescape is the reverse', unescapeText(escapeText('a,b;c\\d\ne')), 'a,b;c\\d\ne')
eq('a short line is left alone', foldLine('SUMMARY:Hi'), 'SUMMARY:Hi')
const long = 'DESCRIPTION:' + 'ė'.repeat(100) + '😀'.repeat(20)
const folded = foldLine(long)
eq('every folded line is at most 75 bytes', folded.split('\r\n').every((l) => bytes(l) <= 75), true)
eq('continuation lines start with a space', folded.split('\r\n').slice(1).every((l) => l.startsWith(' ')), true)
eq('folding never splits a letter', unfold(folded)[0], long)
eq('a line of exactly 75 bytes is not folded', foldLine('X'.repeat(75)), 'X'.repeat(75))
eq('76 bytes fold into 75 + 1', foldLine('X'.repeat(76)).split('\r\n').map(bytes), [75, 2])
eq('parameters, quoted values with colons', parseLine('DTSTART;TZID="America/New York:x";VALUE=DATE-TIME:20260101T090000'),
  { name: 'DTSTART', params: { TZID: 'America/New York:x', VALUE: 'DATE-TIME' }, value: '20260101T090000' })

// ---- zones -----------------------------------------------------------------
eq('Amsterdam 09:00 in September is 07:00 UTC', new Date(wallToUtc('2026-09-28', '09:00', AMS)).toISOString(), '2026-09-28T07:00:00.000Z')
eq('Amsterdam 09:00 in December is 08:00 UTC', new Date(wallToUtc('2026-12-01', '09:00', AMS)).toISOString(), '2026-12-01T08:00:00.000Z')
eq('UTC to New York wall time', utcToWall(Date.parse('2026-09-28T13:30:00Z'), 'America/New_York'), { date: '2026-09-28', time: '09:30' })
eq('a vendor-prefixed zone is understood', cleanZone('/mozilla.org/20050126_1/Europe/Berlin'), 'Europe/Berlin')
eq('an unknown zone is null', cleanZone('Mars/Olympus'), null)
eq('durations', [durationMinutes('PT1H30M'), durationMinutes('P1D'), durationMinutes('P1W'), durationMinutes('PT45M'), durationMinutes('P')], [90, 1440, 10080, 45, null])

// ---- tasks as events --------------------------------------------------------
const task = (extra) => ({ id: 't1', title: 'Dentist, check-up', planned_date: '2026-09-28', planned_time: '09:30', duration_min: 45, notes: 'Bring card;\nask about x', ...extra })
eq('timed task', taskEvent(task()), {
  uid: 't1@getit.app', summary: 'Dentist, check-up', description: 'Bring card;\nask about x', categories: undefined,
  start: { kind: 'local', date: '2026-09-28', time: '09:30' }, end: { kind: 'local', date: '2026-09-28', time: '10:15' },
})
eq('a task with no length gets 30 minutes', taskEvent(task({ duration_min: null })).end, { kind: 'local', date: '2026-09-28', time: '10:00' })
eq('a late task ends after midnight', taskEvent(task({ planned_time: '23:30', duration_min: 90 })).end, { kind: 'local', date: '2026-09-29', time: '01:00' })
eq('untimed task is a whole day', [taskEvent(task({ planned_time: null })).start, taskEvent(task({ planned_time: null })).end],
  [{ kind: 'date', date: '2026-09-28' }, { kind: 'date', date: '2026-09-29' }])
eq('a task without a day is not in a calendar', taskEvent(task({ planned_date: null })), null)
eq('a dropped task is not in a calendar', taskEvent(task({ status: 'dropped' })), null)

const ev = calendarEvent({ id: 'e1', title: 'Flight', starts_at: '2026-09-28T05:15:00.000Z', ends_at: '2026-09-28T07:00:00.000Z', all_day: false, location: 'AMS', start_day: '2026-09-28', end_day: '2026-09-28' })
eq('agenda event keeps its exact moment, in UTC', [ev.start, ev.end], [{ kind: 'utc', iso: '2026-09-28T05:15:00.000Z' }, { kind: 'utc', iso: '2026-09-28T07:00:00.000Z' }])
const trip = calendarEvent({ id: 'e2', title: 'Holiday', starts_at: '2026-10-01T00:00', ends_at: '2026-10-03T00:00', all_day: true, location: null, start_day: '2026-10-01', end_day: '2026-10-03' })
eq('a three-day event ends the day after its last day', [trip.start, trip.end], [{ kind: 'date', date: '2026-10-01' }, { kind: 'date', date: '2026-10-04' }])

// A repeating own event (AGN-03): its rule, at its own wall-clock time, from
// the first day the rule gives, keeping its length; ending on a day or after N.
const choir = calendarEvent({ id: 'e3', title: 'Choir', starts_at: '2026-10-06T17:00:00.000Z', ends_at: '2026-10-06T18:30:00.000Z', all_day: false, location: null,
  start_day: '2026-10-06', start_time: '19:00', end_day: '2026-10-06', rule: 'weekly', rule_config: { weekdays: [2] }, end_date: null, count: null })
eq('a weekly event repeats at its local time', [choir.rrule, choir.start, choir.end],
  ['FREQ=WEEKLY;BYDAY=TU;WKST=MO', { kind: 'local', date: '2026-10-06', time: '19:00' }, { kind: 'local', date: '2026-10-06', time: '20:30' }])
eq('until a day', calendarEvent({ id: 'e3', title: 'Choir', starts_at: '2026-10-06T17:00:00.000Z', ends_at: null, all_day: false, location: null,
  start_day: '2026-10-06', start_time: '19:00', end_day: null, rule: 'weekly', rule_config: { weekdays: [2] }, end_date: '2026-12-15', count: null }).rrule, 'FREQ=WEEKLY;BYDAY=TU;WKST=MO;UNTIL=20261215T235959')
const camp = calendarEvent({ id: 'e4', title: 'Camp', starts_at: '2026-10-01T00:00', ends_at: '2026-10-02T00:00', all_day: true, location: null,
  start_day: '2026-10-01', end_day: '2026-10-02', rule: 'yearly', rule_config: {}, count: 3 })
eq('an all-day yearly event keeps its two days, three times', [camp.rrule, camp.start, camp.end],
  ['FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=1;COUNT=3', { kind: 'date', date: '2026-10-01' }, { kind: 'date', date: '2026-10-03' }])
const thu = calendarEvent({ id: 'e5', title: 'Swim', starts_at: '2026-10-06T17:00:00.000Z', ends_at: null, all_day: false, location: null,
  start_day: '2026-10-06', start_time: '19:00', end_day: null, rule: 'weekly', rule_config: { weekdays: [4] } })
eq('it starts on the first day the rule gives, an hour long', [thu.start, thu.end], [{ kind: 'local', date: '2026-10-08', time: '19:00' }, { kind: 'local', date: '2026-10-08', time: '20:00' }])

// ---- the file ----------------------------------------------------------------
const file = buildCalendar([taskEvent(task()), taskEvent(task({ id: 't2', planned_time: null })), ev], { stamp: STAMP, name: 'Hemlo, week 40', timezone: AMS })
eq('lines end in CRLF', file.split('\r\n').length > 5 && !/[^\r]\n/.test(file), true)
eq('file ends with CRLF', file.endsWith('END:VCALENDAR\r\n'), true)
eq('header', file.split('\r\n').slice(0, 7), ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Hemlo\\, week 40', 'X-WR-TIMEZONE:Europe/Amsterdam'])
eq('every line is at most 75 bytes', file.split('\r\n').every((l) => bytes(l) <= 75), true)
eq('timed task is floating local time', file.includes('DTSTART:20260928T093000\r\nDTEND:20260928T101500'), true)
eq('untimed task is VALUE=DATE', file.includes('DTSTART;VALUE=DATE:20260928\r\nDTEND;VALUE=DATE:20260929'), true)
eq('agenda event in UTC', file.includes('DTSTART:20260928T051500Z'), true)
eq('stable UID per row', file.includes('UID:t1@getit.app') && file.includes('UID:t2@getit.app'), true)
eq('DTSTAMP on each event', (file.match(/DTSTAMP:20260927T100000Z/g) ?? []).length, 3)
eq('summary escaped', file.includes('SUMMARY:Dentist\\, check-up'), true)
eq('description escaped', file.includes('DESCRIPTION:Bring card\\;\\nask about x'), true)
eq('uidFor', uidFor('abc'), 'abc@getit.app')

// ---- series as RRULE ---------------------------------------------------------
const s = (rule, extra = {}) => ({ id: 's1', title: 'Gym', rule, rule_config: {}, start_date: '2026-09-28', end_date: null, occurrence_count: null, time_of_day: '07:00', task_template: { duration_min: 60 }, ...extra })
eq('daily', seriesRule(s('daily'), false).rrule, 'FREQ=DAILY')
eq('every 3 days', seriesRule(s('daily', { rule_config: { n: 3 } }), false).rrule, 'FREQ=DAILY;INTERVAL=3')
eq('weekdays', seriesRule(s('weekdays'), false).rrule, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
eq('weekly, Monday first', seriesRule(s('weekly', { rule_config: { weekdays: [5, 1, 3] } }), false).rrule, 'FREQ=WEEKLY;BYDAY=MO,WE,FR;WKST=MO')
eq('weekly with no day picked repeats on the start day', seriesRule(s('weekly'), false).rrule, 'FREQ=WEEKLY;BYDAY=MO;WKST=MO')
eq('every 2 weeks', seriesRule(s('every_n_weeks', { rule_config: { n: 2, weekdays: [2] } }), false).rrule, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;WKST=MO')
eq('monthly on the 15th', seriesRule(s('monthly', { rule_config: { day_of_month: 15 } }), false).rrule, 'FREQ=MONTHLY;BYMONTHDAY=15')
eq('monthly on the 31st is the last day', seriesRule(s('monthly', { rule_config: { day_of_month: 31 } }), false).rrule, 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1')
eq('until, timed', seriesRule(s('daily', { end_date: '2026-10-31' }), false).rrule, 'FREQ=DAILY;UNTIL=20261031T235959')
eq('until, whole days', seriesRule(s('daily', { end_date: '2026-10-31' }), true).rrule, 'FREQ=DAILY;UNTIL=20261031')
eq('count', seriesRule(s('daily', { occurrence_count: 10 }), false).rrule, 'FREQ=DAILY;COUNT=10')
eq('custom dates as RDATE', seriesRule(s('dates', { rule_config: { dates: ['2026-10-09', '2026-10-02', 'bad'] } }), false), { rrule: null, rdates: ['2026-10-09'] })
eq('an unknown rule gives nothing', seriesRule(s('fortnightly-ish'), false), null)
eq('yearly is a yearly repeat on its day', seriesRule(s('yearly'), false).rrule, 'FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=28')
eq('weekends', seriesRule(s('weekends'), false).rrule, 'FREQ=WEEKLY;BYDAY=SA,SU')
eq('the last Friday', seriesRule({ ...s('monthly_nth'), rule_config: { nth: -1, weekday: 5 } }, false).rrule, 'FREQ=MONTHLY;BYDAY=-1FR')
eq('every 2 months on the 15th', seriesRule({ ...s('monthly'), rule_config: { day_of_month: 15, n: 2 } }, false).rrule, 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15')
eq('first day is the first the rule produces', firstDay(s('weekly', { start_date: '2026-09-27', rule_config: { weekdays: [3] } })), '2026-09-30')

const events = seriesEvents(s('weekly', { rule_config: { weekdays: [1, 3] } }), [
  { exception_date: '2026-10-05', action: 'skip', moved_to: null },
  { exception_date: '2026-10-07', action: 'move', moved_to: '2026-10-08' },
  { exception_date: '2026-10-12', action: 'change', moved_to: null, changes: { title: 'Gym, legs', planned_time: '18:00' } },
  { exception_date: '2026-10-14', action: 'skip', moved_to: null, deleted_at: '2026-09-01T00:00:00Z' },
])
eq('series: master plus one copy per moved or changed repeat', events.length, 3)
eq('series master', { start: events[0].start, rrule: events[0].rrule, exdates: events[0].exdates },
  { start: { kind: 'local', date: '2026-09-28', time: '07:00' }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE;WKST=MO', exdates: [{ kind: 'local', date: '2026-10-05', time: '07:00' }] })
eq('moved repeat keeps the uid and names its original day', [events[1].uid, events[1].recurrenceId, events[1].start],
  ['s1@getit.app', { kind: 'local', date: '2026-10-07', time: '07:00' }, { kind: 'local', date: '2026-10-08', time: '07:00' }])
eq('changed repeat', [events[2].summary, events[2].start, events[2].end],
  ['Gym, legs', { kind: 'local', date: '2026-10-12', time: '18:00' }, { kind: 'local', date: '2026-10-12', time: '19:00' }])
const sfile = buildCalendar(events, { stamp: STAMP })
eq('series file has EXDATE and RECURRENCE-ID', sfile.includes('EXDATE:20261005T070000') && sfile.includes('RECURRENCE-ID:20261007T070000'), true)
const dated = seriesEvents(s('dates', { time_of_day: null, rule_config: { dates: ['2026-10-02', '2026-10-09', '2026-11-20'] } }))
eq('custom dates: first is DTSTART, the rest RDATE', buildCalendar(dated, { stamp: STAMP }).includes('DTSTART;VALUE=DATE:20261002\r\nDTEND;VALUE=DATE:20261003\r\nRDATE;VALUE=DATE:20261009,20261120'), true)
eq('a series ended before it started gives nothing', seriesEvents(s('weekly', { rule_config: { weekdays: [3] }, end_date: '2026-09-29' })), [])

// ---- every mapped rule means the same days to both sides --------------------
// Each of the app's rules, written as RRULE, then laid out by the calendar
// reader, lands on exactly the days the app lays out itself.
const window = ['2026-09-01', '2028-12-31']
const cases = [
  s('daily'), s('daily', { rule_config: { n: 4 } }), s('weekdays', { start_date: '2026-09-26' }),
  s('weekly', { rule_config: { weekdays: [0, 3] } }), s('every_n_weeks', { start_date: '2026-09-27', rule_config: { n: 3, weekdays: [1, 4] } }),
  s('monthly', { start_date: '2026-09-10', rule_config: { day_of_month: 31 } }), s('monthly', { start_date: '2026-09-10', rule_config: { day_of_month: 30 } }),
  s('monthly', { start_date: '2027-01-30', rule_config: { day_of_month: 29 } }), s('monthly', { rule_config: { day_of_month: 3 } }),
  s('daily', { occurrence_count: 20 }), s('weekly', { end_date: '2027-03-01', rule_config: { weekdays: [2] } }),
]
for (const c of cases) {
  const first = firstDay(c)
  const rule = parseRule(seriesRule(c, true).rrule, AMS)
  const theirs = expandRule(rule, first, window[0], window[1], 5000).days
  const ours = baseDates(c, window[1]).filter((d) => d >= window[0])
  eq(`same days: ${seriesRule(c, true).rrule} from ${c.start_date}`, theirs, ours)
  const back = mapRule(rule, first)
  eq(`  and it reads back as the app's rule`, back && { rule: back.rule, cfg: back.rule_config }, { rule: c.rule, cfg: c.rule === 'monthly' ? { day_of_month: c.rule_config.day_of_month } : c.rule === 'daily' && c.rule_config.n ? { n: c.rule_config.n } : c.rule === 'weekdays' || c.rule === 'daily' ? {} : { ...(c.rule_config.n ? { n: c.rule_config.n } : {}), weekdays: [...c.rule_config.weekdays].sort((a, b) => a - b) } })
}

// ---- rules the app cannot keep as a series are laid out ---------------------
const lay = (rrule, start, from = '2026-01-01', to = '2027-12-31', cap = 100) => expandRule(parseRule(rrule, AMS), start, from, to, cap).days
eq('second Tuesday of the month', lay('FREQ=MONTHLY;BYDAY=2TU;COUNT=4', '2026-10-13'), ['2026-10-13', '2026-11-10', '2026-12-08', '2027-01-12'])
eq('last Friday of the month', lay('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3', '2026-10-30'), ['2026-10-30', '2026-11-27', '2026-12-25'])
eq('yearly birthday', lay('FREQ=YEARLY', '2020-03-05', '2026-01-01', '2028-12-31'), ['2026-03-05', '2027-03-05', '2028-03-05'])
eq('yearly, last Sunday of October', lay('FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU;COUNT=3', '2026-10-25', '2026-01-01', '2028-12-31'), ['2026-10-25', '2027-10-31', '2028-10-29'])
eq('monthly on the 31st skips short months (the standard)', lay('FREQ=MONTHLY;BYMONTHDAY=31;COUNT=4', '2026-10-31'), ['2026-10-31', '2026-12-31', '2027-01-31', '2027-03-31'])
eq('COUNT counts days before the window too', lay('FREQ=DAILY;COUNT=5', '2025-12-29'), ['2026-01-01', '2026-01-02'])
eq('cap', lay('FREQ=DAILY', '2026-01-01', '2026-01-01', '2026-12-31', 3), ['2026-01-01', '2026-01-02', '2026-01-03'])
eq('second Tuesday maps to the app\'s own rule (v18)', mapRule(parseRule('FREQ=MONTHLY;BYDAY=2TU', AMS), '2026-10-13'), { rule: 'monthly_nth', rule_config: { nth: 2, weekday: 2 } })
eq('every 2 weeks with Sunday-first weeks does not map', mapRule(parseRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU', AMS), '2026-09-27'), null)
eq('a bad rule is null', parseRule('FREQ=FORTNIGHTLY', AMS), null)

// ---- a Google Calendar export ------------------------------------------------
// Shaped like Google's: its own time zone block, alarms, a folded description,
// a weekly series with a skipped week and one moved week, an all-day event
// over three days, a UTC event, a second-Tuesday series and a cancelled one.
const google = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:Werk\\, en thuis',
  'X-WR-TIMEZONE:Europe/Amsterdam',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Amsterdam',
  'X-LIC-LOCATION:Europe/Amsterdam',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Amsterdam:20260928T090000',
  'DTEND;TZID=Europe/Amsterdam:20260928T093000',
  'RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO,WE',
  'EXDATE;TZID=Europe/Amsterdam:20261005T090000',
  'DTSTAMP:20260927T100000Z',
  'UID:standup123@google.com',
  'CREATED:20260901T100000Z',
  'DESCRIPTION:Daily stand-up\\, keep it short.\\nAgenda: blockers\\; wins. Th',
  ' is line is long enough that Google folds it onto a second line.',
  'LAST-MODIFIED:20260901T100000Z',
  'LOCATION:Room 2\\, Beringe',
  'SEQUENCE:0',
  'STATUS:CONFIRMED',
  'SUMMARY:Stand-up',
  'TRANSP:OPAQUE',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'DESCRIPTION:This is an event reminder',
  'TRIGGER:-P0DT0H10M0S',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Amsterdam:20261008T140000',
  'DTEND;TZID=Europe/Amsterdam:20261008T143000',
  'DTSTAMP:20260927T100000Z',
  'UID:standup123@google.com',
  'RECURRENCE-ID;TZID=Europe/Amsterdam:20261007T090000',
  'SUMMARY:Stand-up (moved)',
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261010',
  'DTEND;VALUE=DATE:20261013',
  'DTSTAMP:20260927T100000Z',
  'UID:trip456@google.com',
  'SUMMARY:Weekend in Vilnius',
  'TRANSP:TRANSPARENT',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261015T130000Z',
  'DTEND:20261015T141500Z',
  'DTSTAMP:20260927T100000Z',
  'UID:call789@google.com',
  'SUMMARY:Call with New York',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/New_York:20261016T090000',
  'DURATION:PT1H',
  'DTSTAMP:20260927T100000Z',
  'UID:ny@google.com',
  'SUMMARY:9 in New York',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Amsterdam:20261013T190000',
  'DTEND;TZID=Europe/Amsterdam:20261013T200000',
  'RRULE:FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270110T180000Z',
  'DTSTAMP:20260927T100000Z',
  'UID:club@google.com',
  'SUMMARY:Book club',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261020',
  'DTEND;VALUE=DATE:20261021',
  'DTSTAMP:20260927T100000Z',
  'UID:gone@google.com',
  'SUMMARY:Cancelled thing',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTAMP:20260927T100000Z',
  'UID:nostart@google.com',
  'SUMMARY:No start',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n')

const read = parseIcs(google, { zone: AMS, today: '2026-09-27' })
const byTitle = (t) => read.events.find((e) => e.summary === t)
eq('calendar name', read.calendarName, 'Werk, en thuis')
eq('events read (cancelled and startless left out, the moved week kept)', read.events.map((e) => e.summary),
  ['Stand-up', 'Stand-up (moved)', 'Weekend in Vilnius', 'Call with New York', '9 in New York', 'Book club'])
eq('the startless event is reported', read.problems.some((p) => p.includes('No start')), true)
const standup = byTitle('Stand-up')
eq('weekly series maps to the app’s rule', standup.series, { rule: 'weekly', rule_config: { weekdays: [1, 3] }, start_date: '2026-09-28', end_date: null, occurrence_count: null })
eq('skipped and moved weeks come off the series', standup.exdates, ['2026-10-05', '2026-10-07'])
eq('time and length', [standup.time, standup.minutes, standup.allDay], ['09:00', 30, false])
eq('folded, escaped description', standup.description, 'Daily stand-up, keep it short.\nAgenda: blockers; wins. This line is long enough that Google folds it onto a second line.')
eq('location unescaped', standup.location, 'Room 2, Beringe')
eq('alarm text does not leak into the event', standup.description.includes('reminder'), false)
eq('moved week is a one-off on its new day', [byTitle('Stand-up (moved)').date, byTitle('Stand-up (moved)').time, byTitle('Stand-up (moved)').series], ['2026-10-08', '14:00', null])
eq('series days in October', eventDays(standup, '2026-09-28', '2026-10-14'), ['2026-09-28', '2026-09-30', '2026-10-12', '2026-10-14'])
const weekend = byTitle('Weekend in Vilnius')
eq('all-day over three days', [weekend.allDay, weekend.date, weekend.endDate, weekend.time], [true, '2026-10-10', '2026-10-12', null])
eq('UTC event in Amsterdam time', [byTitle('Call with New York').date, byTitle('Call with New York').time, byTitle('Call with New York').minutes], ['2026-10-15', '15:00', 75])
eq('New York zone in Amsterdam time, DURATION', [byTitle('9 in New York').time, byTitle('9 in New York').endTime], ['15:00', '16:00'])
eq('second Tuesday is kept as the app\'s rule, up to UNTIL (v18)', byTitle('Book club').series, { rule: 'monthly_nth', rule_config: { nth: 2, weekday: 2 }, start_date: '2026-10-13', end_date: '2027-01-10', occurrence_count: null })

// The same file read in New York: times follow the reader.
const ny = parseIcs(google, { zone: 'America/New_York', today: '2026-09-27' })
eq('read in New York, the stand-up is at 03:00', ny.events[0].time, '03:00')
eq('read in New York, the NY event is at 09:00', ny.events.find((e) => e.summary === '9 in New York').time, '09:00')

// Asked not to keep series (agenda events), every repeat is laid out.
const flat = parseIcs(google, { zone: AMS, today: '2026-09-27', mapSeries: false })
const flatStandup = flat.events.find((e) => e.summary === 'Stand-up')
eq('laid out stand-up starts right and misses the removed weeks', flatStandup.dates.slice(0, 4), ['2026-09-28', '2026-09-30', '2026-10-12', '2026-10-14'])
eq('laid out to five years ahead at most', flatStandup.dates.at(-1) <= addDays('2026-09-27', 365 * 5), true)

// ---- our own file reads back ----------------------------------------------------
const back = parseIcs(sfile, { zone: AMS, today: '2026-09-27' })
eq('our series reads back as the same rule', back.events[0].series?.rule_config, { weekdays: [1, 3] })
eq('its skipped and moved days come off', back.events[0].exdates, ['2026-10-05', '2026-10-07', '2026-10-12'])
eq('the moved and changed ones come back as one-offs', back.events.slice(1).map((e) => [e.summary, e.date, e.time]), [['Gym', '2026-10-08', '07:00'], ['Gym, legs', '2026-10-12', '18:00']])
const round = parseIcs(file, { zone: AMS, today: '2026-09-27' })
eq('tasks read back', round.events.map((e) => [e.summary, e.date, e.time, e.minutes]),
  [['Dentist, check-up', '2026-09-28', '09:30', 45], ['Dentist, check-up', '2026-09-28', null, null], ['Flight', '2026-09-28', '07:15', 105]])

// ---- awkward files ------------------------------------------------------------
eq('not a calendar', parseIcs('hello', { zone: AMS, today: '2026-09-27' }).problems.length, 1)
eq('LF line ends and a BOM are fine', parseIcs('﻿BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261001\nSUMMARY:x\nEND:VEVENT\nEND:VCALENDAR\n', { zone: AMS, today: '2026-09-27' }).events.map((e) => [e.date, e.allDay]), [['2026-10-01', true]])
const many = ['BEGIN:VCALENDAR', ...Array.from({ length: 30 }, (_, i) => `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:202610${String(i + 1).padStart(2, '0')}\r\nSUMMARY:e${i}\r\nEND:VEVENT`), 'END:VCALENDAR'].join('\r\n')
const capped = parseIcs(many, { zone: AMS, today: '2026-09-27', maxEvents: 10 })
eq('event cap', [capped.events.length, capped.problems.length], [10, 1])
eq('hourly repeats are not followed', parseIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261001T090000\r\nRRULE:FREQ=HOURLY\r\nSUMMARY:x\r\nEND:VEVENT\r\nEND:VCALENDAR', { zone: AMS, today: '2026-09-27' }).events[0].dates, [])

// ---- v18 (GEN-26): every rule of the app back as itself ----------------------
const roundRule = (c) => {
  const first = firstDay(c)
  const r = seriesRule(c, true)
  return r.rrule ? mapRule(parseRule(r.rrule, AMS), first) : null
}
eq('weekends read back as weekends', roundRule(s('weekends', { start_date: '2026-10-03' })), { rule: 'weekends', rule_config: {} })
eq('the 2nd Tuesday read back', roundRule({ ...s('monthly_nth', { start_date: '2026-10-13' }), rule_config: { nth: 2, weekday: 2 } }), { rule: 'monthly_nth', rule_config: { nth: 2, weekday: 2 } })
eq('the last Friday every 2 months read back', roundRule({ ...s('monthly_nth', { start_date: '2026-10-30' }), rule_config: { nth: -1, weekday: 5, n: 2 } }), { rule: 'monthly_nth', rule_config: { n: 2, nth: -1, weekday: 5 } })
eq('every 3 months on the 15th read back', roundRule({ ...s('monthly'), rule_config: { day_of_month: 15, n: 3 } }), { rule: 'monthly', rule_config: { n: 3, day_of_month: 15 } })
eq('every 2 months on the 31st read back', roundRule({ ...s('monthly', { start_date: '2026-10-31' }), rule_config: { day_of_month: 31, n: 2 } }), { rule: 'monthly', rule_config: { n: 2, day_of_month: 31 } })
eq('a birthday read back', roundRule(s('yearly', { start_date: '2026-03-05' })), { rule: 'yearly', rule_config: { month: 3, day: 5 } })
eq('29 February read back', roundRule(s('yearly', { start_date: '2028-02-29' })), { rule: 'yearly', rule_config: { month: 2, day: 29 } })
for (const c of [{ ...s('monthly_nth', { start_date: '2026-10-13' }), rule_config: { nth: 2, weekday: 2 } }, s('yearly', { start_date: '2028-02-29' }), s('weekends')]) {
  const rule = parseRule(seriesRule(c, true).rrule, AMS)
  eq(`same days both ways: ${seriesRule(c, true).rrule}`, expandRule(rule, firstDay(c), window[0], window[1], 5000).days, baseDates(c, window[1]).filter((d) => d >= window[0]))
}
const pickedFile = buildCalendar(seriesEvents(s('dates', { rule_config: { dates: ['2026-10-02', '2026-10-09', '2026-11-20'] } })), { stamp: STAMP })
eq('days picked by hand come back as picked days', parseIcs(pickedFile, { zone: AMS, today: '2026-09-27' }).events[0].series,
  { rule: 'dates', rule_config: { dates: ['2026-10-02', '2026-10-09', '2026-11-20'] }, start_date: '2026-10-02', end_date: '2026-11-20', occurrence_count: null })

// Repeats an RRULE cannot say: Hemlo's own line.
eq('after: no RRULE', seriesRule(s('daily', { rule_config: { n: 7, mode: 'after' } }), false), null)
eq('after: its own line', looseRepeat({ rule: 'daily', rule_config: { n: 7, mode: 'after' } }), 'MODE=AFTER;DAYS=7')
eq('flexible: its own line', looseRepeat({ rule: 'daily', rule_config: { n: 10, mode: 'flexible' } }), 'MODE=FLEXIBLE;DAYS=10')
eq('3 times a week: its own line', looseRepeat({ rule: 'times_per_week', rule_config: { times: 3 } }), 'TIMES=3')
eq('a plain rule needs none', looseRepeat({ rule: 'weekly', rule_config: { weekdays: [1] } }), null)
eq('read back: after', readLooseRepeat('MODE=AFTER;DAYS=7'), { rule: 'daily', rule_config: { n: 7, mode: 'after' } })
eq('read back: 3 times a week', readLooseRepeat('times=3'), { rule: 'times_per_week', rule_config: { times: 3 } })
eq('read back: nonsense is nothing', readLooseRepeat('MODE=SOMETIMES;DAYS=x'), null)
eq('a loose series goes as its tasks, not as a repeat', seriesEvents(s('daily', { rule_config: { n: 7, mode: 'flexible' } })), [])

// Habits, chores, supplements and payments (scheduleEvent).
const habitX = { id: 'h1', kind: 'habit', title: 'Stretch', rule: 'weekly', rule_config: { weekdays: [1, 3] }, start_date: '2026-09-28', end_date: null, time: '07:30', minutes: 15 }
const he = scheduleEvent(habitX)
eq('a habit repeats with its RRULE', [he.rrule, he.start, he.hemlo], ['FREQ=WEEKLY;BYDAY=MO,WE;WKST=MO', { kind: 'local', date: '2026-09-28', time: '07:30' }, { kind: 'habit', repeat: null }])
const tpw = scheduleEvent({ ...habitX, rule: 'times_per_week', rule_config: { times: 3 }, start_date: '2026-10-01', time: null })
eq('3 times a week: weekly from its first Monday, all day, with its line', [tpw.rrule, tpw.start, tpw.hemlo.repeat], ['FREQ=WEEKLY;BYDAY=MO;WKST=MO', { kind: 'date', date: '2026-09-28' }, 'TIMES=3'])
const choreX = scheduleEvent({ id: 'c1', kind: 'chore', title: 'Descale the kettle', rule: 'daily', rule_config: { n: 30, mode: 'after' }, start_date: '2026-01-01', end_date: null, time: null, next: '2026-10-20' })
eq('an "after" chore: one event on its next day, with its line', [choreX.rrule ?? null, choreX.start, choreX.hemlo], [null, { kind: 'date', date: '2026-10-20' }, { kind: 'chore', repeat: 'MODE=AFTER;DAYS=30' }])
eq('…none once it has ended', scheduleEvent({ id: 'c1', kind: 'chore', title: 'x', rule: 'daily', rule_config: { n: 30, mode: 'after' }, start_date: '2026-01-01', end_date: '2026-10-01', time: null, next: '2026-10-20' }), null)
const payX = scheduleEvent({ id: 'p1', kind: 'payment', title: 'Rent due', rule: 'monthly', rule_config: { day_of_month: 1 }, start_date: '2026-10-01', end_date: null, time: null })
eq('a planned payment: monthly', payX.rrule, 'FREQ=MONTHLY;BYMONTHDAY=1')
eq('a payment once: one day', scheduleEvent({ id: 'p2', kind: 'payment', title: 'Car tax', rule: null, rule_config: null, start_date: '2026-11-15', end_date: null, time: null }).start, { kind: 'date', date: '2026-11-15' })
const xfile = buildCalendar([he, tpw, choreX], { stamp: STAMP })
eq('the file carries Hemlo\'s lines', [xfile.includes('X-HEMLO-KIND:habit'), xfile.includes('X-HEMLO-REPEAT:TIMES=3'), xfile.includes('X-HEMLO-REPEAT:MODE=AFTER;DAYS=30'), xfile.includes('X-GETIT')], [true, true, true, false])
const readBack = parseIcs(xfile, { zone: AMS, today: '2026-09-27' }).events
eq('read back: the habit with its rule', [readBack[0].kind, readBack[0].series?.rule, readBack[0].series?.rule_config], ['habit', 'weekly', { weekdays: [1, 3] }])
eq('read back: 3 times a week', [readBack[1].kind, readBack[1].repeat], ['habit', { rule: 'times_per_week', rule_config: { times: 3 } }])
eq('read back: the "after" chore', [readBack[2].kind, readBack[2].date, readBack[2].repeat], ['chore', '2026-10-20', { rule: 'daily', rule_config: { n: 30, mode: 'after' } }])
// A file written before version 21, when the app was called GetIt, has X-GETIT-… lines: they read the same.
const oldBack = parseIcs(xfile.replaceAll('X-HEMLO-', 'X-GETIT-'), { zone: AMS, today: '2026-09-27' }).events
eq('an old GetIt file reads the same', oldBack.map((e) => [e.kind, e.repeat]), readBack.map((e) => [e.kind, e.repeat]))
eq('an old GetIt file: kinds and repeats are there', oldBack.map((e) => e.kind), ['habit', 'habit', 'chore'])

console.log(fail ? `\n${fail} failed` : '\nall passed')
process.exit(fail ? 1 : 0)
