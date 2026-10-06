// Checks calendar links: the feed link Google Calendar reads (its window, what
// it holds and what it leaves out: nothing about health, no profile name, no
// repeat past the window), the address of a calendar to follow, the check that
// the server never fetches from a private network, the plan that makes a
// followed calendar's events on the device match its file, when a calendar
// that failed is tried again, what may go in a log, and that the server
// functions' copies of these rules are the rules themselves.
// 2026-09-28 is a Monday; 2026-10-25 the clocks go back in Europe.
import {
  shiftMonths, feedWindow, isFeedToken, feedUrl, FEED_NAME, feedEvents, buildFeed,
  isHealthTask, isHealthSeries, errorName, windowedSeries, HEALTH_MODULES, HEALTH_SECTIONS,
  normaliseCalendarUrl, ipLiteral, cleanName, parseIPv4, parseIPv6, isPublicIp,
  eventsFromIcs, eventKey, planReplace, refreshDue, fetchDue, looksLikeCalendar, MAX_URL, REFRESH_MS, RETRY_MS,
  hostOf, errorKind, logLine, withoutAddresses,
} from '../lib/calendar-links-rules.ts'
import { eventDays, parseIcs } from '../lib/ics-rules.ts'
import { occurrences } from '../lib/series-rules.ts'
import { CATEGORY_MODULE } from '../lib/colours-rules.ts'
import { MODULES } from '../modules/registry.ts'
import { stale } from '../../scripts/copy-shared.mjs'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}
const TODAY = '2026-09-28'
const AMS = 'Europe/Amsterdam'
const STAMP = '2026-09-28T10:00:00.000Z'

// ---- the window ----------------------------------------------------------------
eq('three months back', shiftMonths(TODAY, -3), '2026-06-28')
eq('twelve months ahead', shiftMonths(TODAY, 12), '2027-09-28')
eq('the 31st in a shorter month is its last day', shiftMonths('2026-05-31', -3), '2026-02-28')
eq('a leap year keeps the 29th', shiftMonths('2027-11-29', 3), '2028-02-29')
eq('across the start of a year', shiftMonths('2026-01-15', -3), '2025-10-15')
eq('the feed window', feedWindow(TODAY), { from: '2026-06-28', to: '2027-09-28' })

// ---- the feed link ---------------------------------------------------------------
const token = 'A'.repeat(20) + '-_' + 'b'.repeat(21)
eq('a 43-character base64url token is a token', isFeedToken(token), true)
eq('a padded or short one is not', [isFeedToken(token + '='), isFeedToken('abc'), isFeedToken(token.slice(1) + '+'), isFeedToken(null)], [false, false, false, false])
eq('the feed address', feedUrl('https://x.supabase.co/', token), `https://x.supabase.co/functions/v1/calendar-feed?t=${token}`)
eq('the calendar is called Hemlo, with no one\'s name', FEED_NAME, 'Hemlo')

const task = (id, title, day, time = null, extra = {}) => ({
  id, title, planned_date: day, planned_time: time, duration_min: 45, notes: 'private note', category: 'Work', status: 'todo', ...extra,
})
const input = {
  timezone: AMS, notes: false, stamp: STAMP, today: TODAY,
  tasks: [
    task('t-timed', 'Dentist', '2026-09-30', '09:00'),
    task('t-day', 'Taxes', '2026-10-01'),
    task('t-dropped', 'Dropped', '2026-10-02', null, { status: 'dropped' }),
    task('t-deleted', 'Deleted', '2026-10-02', null, { deleted_at: STAMP }),
    task('t-old', 'Too old', '2026-06-01'),
    task('t-far', 'Too far', '2027-12-01'),
    task('t-rep', 'Gym (a repeat)', '2026-09-29', '07:00', { series_id: 's-1' }),
    task('t-none', 'No day', null),
  ],
  series: [{ id: 's-1', title: 'Gym', rule: 'weekly', rule_config: { weekdays: [2, 4] }, start_date: '2026-09-01', end_date: null,
    occurrence_count: null, time_of_day: '07:00', task_template: { duration_min: 60, notes: 'bring shoes' }, active: true }],
  exceptions: [{ series_id: 's-1', exception_date: '2026-10-06', action: 'skip', moved_to: null }],
  events: [
    { id: 'e-own', title: 'Wedding', starts_at: '2026-10-10T12:00:00.000Z', ends_at: '2026-10-10T20:00:00.000Z', all_day: false, location: 'Utrecht' },
    { id: 'e-google', title: 'From Google', starts_at: '2026-10-11T12:00:00.000Z', ends_at: null, all_day: false, location: null, subscription_id: 'sub-1' },
    { id: 'e-gone', title: 'Deleted event', starts_at: '2026-10-12T12:00:00.000Z', ends_at: null, all_day: false, location: null, deleted_at: STAMP },
    { id: 'e-allday', title: 'Holiday', starts_at: '2026-10-19T22:00:00.000Z', ends_at: '2026-10-21T22:00:00.000Z', all_day: true, location: null },
    // Repeating own events (031): one started long before the window is in; one that ended before it is not.
    { id: 'e-choir', title: 'Choir', starts_at: '2025-01-07T18:00:00.000Z', ends_at: '2025-01-07T19:30:00.000Z', all_day: false, location: null, rule: 'weekly', rule_config: { weekdays: [2] } },
    { id: 'e-ended', title: 'Old course', starts_at: '2025-01-07T18:00:00.000Z', ends_at: null, all_day: false, location: null, rule: 'weekly', rule_config: { weekdays: [2] }, end_date: '2025-03-01' },
  ],
}
const evs = feedEvents(input)
const titles = evs.map((e) => e.summary)
eq('timed and untimed tasks are in', ['Dentist', 'Taxes'].every((t) => titles.includes(t)), true)
eq('dropped, deleted, undated and out-of-window tasks are not', ['Dropped', 'Deleted', 'Too old', 'Too far', 'No day'].some((t) => titles.includes(t)), false)
eq('a repeating series goes once, with its rule, not as its tasks', [titles.filter((t) => t === 'Gym').length, titles.includes('Gym (a repeat)')], [1, false])
eq('the series keeps its rule, stops at the window\'s end, and keeps its skipped day',
  [evs.find((e) => e.summary === 'Gym').rrule, evs.find((e) => e.summary === 'Gym').exdates],
  ['FREQ=WEEKLY;BYDAY=TU,TH;WKST=MO;UNTIL=20270928T235959', [{ kind: 'local', date: '2026-10-06', time: '07:00' }]])
eq('own agenda events are in, with their place', evs.find((e) => e.summary === 'Wedding')?.location, 'Utrecht')
eq('events from a followed calendar are never sent back', titles.includes('From Google'), false)
eq('deleted events are not in', titles.includes('Deleted event'), false)
eq('an all-day event keeps its local days', [evs.find((e) => e.summary === 'Holiday').start, evs.find((e) => e.summary === 'Holiday').end],
  [{ kind: 'date', date: '2026-10-20' }, { kind: 'date', date: '2026-10-23' }])
eq('notes stay out by default, from tasks and series alike', evs.some((e) => e.description), false)
eq('a repeating own event started long ago is in once, cut to the window, at its local time', [titles.filter((t) => t === 'Choir').length, evs.find((e) => e.summary === 'Choir')?.rrule, evs.find((e) => e.summary === 'Choir')?.start],
  [1, 'FREQ=WEEKLY;BYDAY=TU;WKST=MO;UNTIL=20270928T235959', { kind: 'local', date: '2026-06-30', time: '19:00' }])
eq('one that ended before the window is not', titles.includes('Old course'), false)
eq('with notes on, they go out', feedEvents({ ...input, notes: true }).filter((e) => e.description).map((e) => e.summary).sort(), ['Dentist', 'Gym', 'Taxes'])
eq('a task keeps its section', evs.find((e) => e.summary === 'Dentist').categories, ['Work'])
const file = buildFeed(input)
eq('the file names the calendar just Hemlo, and the zone', [file.includes('X-WR-CALNAME:Hemlo\r\n'), file.includes('X-WR-TIMEZONE:Europe/Amsterdam')], [true, true])
eq('the file is CRLF and one VEVENT per event', [file.endsWith('END:VCALENDAR\r\n'), file.split('BEGIN:VEVENT').length - 1], [true, evs.length])
eq('the dentist is floating local time', file.includes('DTSTART:20260930T090000\r\n'), true)
eq('no note text anywhere in the file', /private note|bring shoes/.test(file), false)
const back = parseIcs(file, { zone: AMS, today: TODAY, mapSeries: false })
eq('the feed reads back as a calendar', back.problems, [])

// ---- nothing about health in the feed -------------------------------------------------
// A planned meal as meals.ts makes it, a training session, a weigh-in, and the
// other health modules; each in the window, where anything else would show.
const healthy = {
  ...input,
  notes: true,
  tasks: [
    task('h-meal', 'Breakfast: Eggs · 143 kcal', '2026-10-01', '08:00', { category: 'Meal', source: 'meal', module_key: 'nutrition', notes: '2 eggs' }),
    task('h-meal-typed', 'Lunch: Salad', '2026-10-01', '12:30', { category: 'meal', source: 'manual', module_key: null }),
    task('h-train', 'Legs: squats 5×5', '2026-10-01', '18:00', { category: 'Training', source: 'manual', module_key: null }),
    task('h-train-mod', 'Deadlift 140 kg', '2026-10-02', '18:00', { category: null, module_key: 'training' }),
    task('h-weigh', 'Weigh-in 82.4 kg', '2026-10-02', '07:00', { category: 'Body', module_key: null }),
    task('h-weigh-mod', 'Waist 84 cm', '2026-10-02', null, { category: null, module_key: 'health' }),
    task('h-sleep', 'Bed by 22:30', '2026-10-03', '22:30', { category: 'Night', module_key: 'sleep' }),
    task('h-habit', 'No sugar', '2026-10-03', null, { category: null, module_key: 'habits' }),
    task('h-supp', 'Creatine 5 g', '2026-10-03', null, { category: null, module_key: 'supplements' }),
    task('h-workout', 'Workout', '2026-10-03', null, { category: null, source: 'workout' }),
    task('h-of-series', 'Run club (one day)', '2026-10-06', '19:00', { category: 'Work', series_id: 'hs-run' }),
    task('ok-work', 'Stand-up', '2026-10-01', '09:00', { category: 'Work', source: 'manual', module_key: null }),
    task('ok-learn', 'Read a chapter', '2026-10-01', null, { category: 'Learning', source: 'module', module_key: 'learning' }),
  ],
  series: [
    { id: 'hs-run', title: 'Run club', rule: 'weekly', rule_config: { weekdays: [2] }, start_date: '2026-09-01', end_date: null,
      occurrence_count: null, time_of_day: '19:00', task_template: { category: 'Work' }, module_key: 'training', active: true },
    { id: 'hs-prep', title: 'Meal prep: rice and chicken', rule: 'weekly', rule_config: { weekdays: [0] }, start_date: '2026-09-06', end_date: null,
      occurrence_count: null, time_of_day: '16:00', task_template: { category: 'Meal' }, module_key: null, active: true },
    { id: 'ok-series', title: 'Team call', rule: 'weekly', rule_config: { weekdays: [3] }, start_date: '2026-09-02', end_date: null,
      occurrence_count: null, time_of_day: '10:00', task_template: { category: 'Work' }, module_key: null, active: true },
  ],
  exceptions: [],
  events: [],
}
const healthEvs = feedEvents(healthy)
eq('only the tasks and series that are not about health are in', healthEvs.map((e) => e.summary).sort(), ['Read a chapter', 'Stand-up', 'Team call'])
const healthFile = buildFeed(healthy)
eq('a meal, a training session and a weigh-in never reach the file',
  ['Breakfast', 'kcal', 'Eggs', '2 eggs', 'Salad', 'squats', 'Deadlift', 'Weigh-in', '82.4', 'Waist', 'Bed by', 'sugar', 'Creatine', 'Workout', 'Run club', 'Meal prep']
    .filter((w) => healthFile.includes(w)), [])
eq('a planned meal, a training task and a weigh-in are health', [
  isHealthTask({ source: 'meal', category: 'Meal', module_key: 'nutrition' }),
  isHealthTask({ category: 'Training' }), isHealthTask({ category: ' body ' }), isHealthTask({ module_key: 'health' }),
], [true, true, true, true])
eq('a work task, a learning task and one with no section are not', [
  isHealthTask({ source: 'manual', category: 'Work' }), isHealthTask({ source: 'module', module_key: 'learning', category: 'Learning' }), isHealthTask({}),
], [false, false, false])
eq('a module the person built never goes in (a mood journal could be health)', [
  isHealthTask({ source: 'module', module_key: 'u_mood01', category: null }), isHealthSeries({ module_key: 'u_plants22' }),
], [true, true])
eq('a mood entry from a built module stays out of the file',
  buildFeed({ ...healthy, tasks: [task('u-mood', 'Felt anxious all day', '2026-10-02', null, { category: null, source: 'module', module_key: 'u_mood01' })] })
    .includes('anxious'), false)
eq('a series is health by its module or its tasks\' section', [
  isHealthSeries({ module_key: 'sleep' }), isHealthSeries({ task_template: { category: 'Meal' } }), isHealthSeries({ module_key: null, task_template: { category: 'Home' } }),
], [true, true, false])
// The lists must keep up with the app: every section that belongs to a health
// module is a health section, and every health module is a real one.
eq('every section of a health module is left out (colours-rules CATEGORY_MODULE)',
  Object.entries(CATEGORY_MODULE).filter(([, m]) => HEALTH_MODULES.includes(m)).map(([c]) => c).filter((c) => !HEALTH_SECTIONS.includes(c)), [])
eq('every health module is one the app has', HEALTH_MODULES.filter((k) => !MODULES.some((m) => m.key === k)), [])

// ---- repeats cut to the window --------------------------------------------------------
// Each series is written, read back as a calendar would, and laid out: the
// days must be exactly the app's own days in the window, none before or after.
const { from: WF, to: WT } = feedWindow(TODAY)
const series = (id, rule, rule_config, start_date, extra = {}) => ({
  id, title: id, rule, rule_config, start_date, end_date: null, occurrence_count: null, time_of_day: '07:30', task_template: {}, active: true, ...extra,
})
const laidOut = (s) => {
  const f = buildFeed({ ...input, tasks: [], series: [s], exceptions: [], events: [] })
  const r = parseIcs(f, { zone: AMS, today: TODAY, mapSeries: false })
  return r.events.flatMap((ev) => eventDays(ev, '1900-01-01', '2100-12-31', 5000)).sort()
}
const cases = [
  series('daily-2020', 'daily', {}, '2020-01-01'),
  series('every-3-days', 'daily', { n: 3 }, '2025-11-05'),
  series('fortnightly', 'every_n_weeks', { n: 2, weekdays: [1, 3] }, '2025-12-03'),
  series('the-31st', 'monthly', {}, '2025-01-31', { time_of_day: null }),
  series('weekdays-400', 'weekdays', {}, '2026-03-02', { occurrence_count: 400 }),
  series('weekly-10', 'weekly', { weekdays: [2] }, '2026-09-01', { occurrence_count: 10 }),
  series('ends-soon', 'weekly', { weekdays: [5] }, '2026-01-02', { end_date: '2026-11-20' }),
  series('picked', 'dates', { dates: ['2026-01-10', '2026-07-01', '2026-12-24', '2027-12-24'] }, '2026-01-10'),
]
for (const s of cases) {
  const days = laidOut(s)
  eq(`${s.id}: the calendar's days are the app's days in the window`, days, occurrences(s, WF, WT))
}
const dailyRepeat = feedEvents({ ...input, tasks: [], series: [cases[0]], exceptions: [] })[0]
eq('a daily repeat from 2020 starts at the window\'s start and stops at its end', [dailyRepeat.start, dailyRepeat.rrule], [{ kind: 'local', date: WF, time: '07:30' }, 'FREQ=DAILY;UNTIL=20270928T235959'])
const ten = feedEvents({ ...input, tasks: [], series: [cases[5]], exceptions: [] })[0]
eq('a repeat of ten that ends inside the window still ends after ten', [ten.rrule, laidOut(cases[5]).length], ['FREQ=WEEKLY;BYDAY=TU;WKST=MO;UNTIL=20261103T235959', 10])
const monthly = feedEvents({ ...input, tasks: [], series: [cases[3]], exceptions: [] })[0]
eq('a whole-day repeat starts on its first day in the window and stops on a date, its last one there', [monthly.start, monthly.rrule],
  [{ kind: 'date', date: '2026-06-30' }, 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20270831'])
eq('no repeat in the file runs on without an end', /RRULE:(?![^\r\n]*UNTIL=)/.test(buildFeed({ ...input, tasks: [], series: cases, exceptions: [] })), false)
eq('a repeat whose days are all before the window is left out', windowedSeries(series('old', 'weekly', { weekdays: [1] }, '2025-01-06', { occurrence_count: 3 }), WF, WT), null)
const moved = feedEvents({ ...input, tasks: [], events: [], series: [series('m', 'weekly', { weekdays: [4] }, '2026-01-01')], exceptions: [
  { series_id: 'm', exception_date: '2026-06-18', action: 'move', moved_to: '2026-07-02' },   // from before the window into it
  { series_id: 'm', exception_date: '2027-09-23', action: 'move', moved_to: '2027-10-01' },   // from inside to after it
  { series_id: 'm', exception_date: '2026-10-08', action: 'move', moved_to: '2026-10-09' },   // inside
] })
eq('a repeat moved out of the window is skipped, not shown', moved[0].exdates.map((w) => w.date), ['2027-09-23'])
eq('one moved in from before the window is an event of its own; one moved inside stays a changed repeat',
  moved.slice(1).map((e) => [e.start.date, e.recurrenceId?.date ?? null, e.uid]),
  [['2026-07-02', null, 'm-2026-06-18@getit.app'], ['2026-10-09', '2026-10-08', 'm@getit.app']])

// ---- a calendar to follow: the address -----------------------------------------------
const google = 'https://calendar.google.com/calendar/ical/anna%40gmail.com/private-0123abcd/basic.ics'
eq('Google\'s secret address is fine', normaliseCalendarUrl(`  ${google} `), { ok: true, url: google })
eq('webcal:// is read as https://', normaliseCalendarUrl('webcal://p01-caldav.icloud.com/published/2/abc'), { ok: true, url: 'https://p01-caldav.icloud.com/published/2/abc' })
const refused = (s) => { const r = normaliseCalendarUrl(s); return r.ok ? 'accepted' : 'refused' }
eq('http, ftp and javascript are refused', ['http://calendar.google.com/x.ics', 'ftp://example.com/x.ics', 'javascript:alert(1)'].map(refused), ['refused', 'refused', 'refused'])
eq('an empty or spaced address is refused', [refused(''), refused('https://example.com/a b.ics')], ['refused', 'refused'])
eq('a name and password in the address are refused', refused('https://me:pw@example.com/x.ics'), 'refused')
eq('another port is refused, 443 is fine', [refused('https://example.com:8443/x.ics'), refused('https://example.com:443/x.ics')], ['refused', 'accepted'])
eq('local names are refused', ['https://localhost/x', 'https://printer.local/x', 'https://metadata.google.internal/x', 'https://router.home.arpa/x', 'https://intranet/x'].map(refused), ['refused', 'refused', 'refused', 'refused', 'refused'])
eq('private and metadata addresses written as numbers are refused',
  ['https://127.0.0.1/x', 'https://10.1.2.3/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://[fd00:ec2::254]/x', 'https://0x7f.1/x', 'https://2130706433/x'].map(refused),
  ['refused', 'refused', 'refused', 'refused', 'refused', 'refused', 'refused'])
eq('a public address written as numbers is fine', refused('https://8.8.8.8/x.ics'), 'accepted')
eq('too long is refused', refused('https://example.com/' + 'a'.repeat(MAX_URL)), 'refused')
eq('an IP literal is found, a name is not', [ipLiteral('[2001:db8::1]'), ipLiteral('1.2.3.4'), ipLiteral('calendar.google.com')], ['2001:db8::1', '1.2.3.4', null])
eq('a calendar name is one trimmed line of at most 60', [cleanName('  Work \n shifts '), cleanName('x'.repeat(80)).length, cleanName('   ')], ['Work shifts', 60, null])

// ---- public or not ---------------------------------------------------------------------
eq('IPv4 read strictly', [parseIPv4('192.168.1.1'), parseIPv4('1.2.3'), parseIPv4('01.2.3.4'), parseIPv4('256.1.1.1')], [[192, 168, 1, 1], null, null, null])
eq('IPv6 with ::', parseIPv6('2001:db8::1'), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1])
eq('IPv6 with an IPv4 tail', parseIPv6('::ffff:10.0.0.1'), [0, 0, 0, 0, 0, 0xffff, 0x0a00, 0x0001])
eq('IPv6 in full', parseIPv6('fe80:0:0:0:1:2:3:4'), [0xfe80, 0, 0, 0, 1, 2, 3, 4])
eq('IPv6 that is not', [parseIPv6('1::2::3'), parseIPv6('fe80::1%eth0'), parseIPv6('12345::'), parseIPv6('1:2:3:4:5:6:7:8:9')], [null, null, null, null])
const pub = (list) => list.map((ip) => isPublicIp(ip))
eq('private IPv4 ranges are not public', pub(['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255',
  '192.0.0.1', '192.0.2.1', '192.168.0.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255']), Array(16).fill(false))
eq('the edges of private ranges are public', pub(['172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0', '11.0.0.0', '9.255.255.255']), Array(6).fill(true))
eq('Google\'s and Cloudflare\'s addresses are public', pub(['142.250.185.206', '1.1.1.1', '2a00:1450:4001:80e::200e', '2606:4700::6810:84e5']), [true, true, true, true])
eq('private IPv6 ranges are not public', pub(['::', '::1', 'fe80::1', 'fc00::1', 'fd00:ec2::254', 'ff02::1', '2001:db8::1', '2001::1', '100::1', '::10.0.0.1', '3fff::1']), Array(11).fill(false))
eq('IPv6 carrying a private IPv4 is not public', pub(['::ffff:127.0.0.1', '::ffff:169.254.169.254', '64:ff9b::10.0.0.1', '2002:0a00:0001::1']), [false, false, false, false])
eq('IPv6 carrying a public IPv4 is public', pub(['::ffff:8.8.8.8', '64:ff9b::8.8.8.8', '2002:0808:0808::1']), [true, true, true])
eq('rubbish is not public', pub(['', 'localhost', '1.2.3.4.5', 'g::1']), [false, false, false, false])

// ---- a followed calendar's events ------------------------------------------------------------
const W = feedWindow(TODAY)
const ics = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'X-WR-CALNAME:Work',
  'BEGIN:VEVENT', 'UID:one@google.com', 'DTSTART:20261001T070000Z', 'DTEND:20261001T080000Z', 'SUMMARY:Stand-up', 'LOCATION:Room 4', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:day@google.com', 'DTSTART;VALUE=DATE:20261005', 'DTEND;VALUE=DATE:20261007', 'SUMMARY:Conference', 'END:VEVENT',
  // A daily meeting that began long ago: only the window is laid out.
  'BEGIN:VEVENT', 'UID:daily@google.com', 'DTSTART;TZID=Europe/Amsterdam:20200101T090000', 'DTEND;TZID=Europe/Amsterdam:20200101T091500',
  'RRULE:FREQ=DAILY', 'SUMMARY:Daily', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:old@google.com', 'DTSTART:20250101T100000Z', 'SUMMARY:Last year', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261101', 'SUMMARY:No uid', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n')
const read = parseIcs(ics, { zone: AMS, today: TODAY, mapSeries: false, from: W.from, to: W.to })
const got = eventsFromIcs(read.events, { zone: AMS, ...W })
const byUid = (u) => got.events.filter((e) => e.external_uid === u)
eq('a timed event keeps its moment and length', byUid('one@google.com'), [{ external_uid: 'one@google.com', starts_at: '2026-10-01T07:00:00.000Z', ends_at: '2026-10-01T08:00:00.000Z', all_day: false, title: 'Stand-up', location: 'Room 4' }])
eq('a two-day event starts at local midnight and ends at the start of its last day', byUid('day@google.com').map((e) => [e.starts_at, e.ends_at, e.all_day]), [['2026-10-04T22:00:00.000Z', '2026-10-05T22:00:00.000Z', true]])
const daily = byUid('daily@google.com')
eq('a daily repeat from 2020 lays out every day of the window, no more', [daily.length, daily[0].starts_at, daily.at(-1).starts_at.slice(0, 10)], [458, '2026-06-28T07:00:00.000Z', '2027-09-28'])
eq('a repeat keeps its wall-clock time across the clock change', [daily.find((e) => e.starts_at.startsWith('2026-10-24')).starts_at, daily.find((e) => e.starts_at.startsWith('2026-10-26')).starts_at], ['2026-10-24T07:00:00.000Z', '2026-10-26T08:00:00.000Z'])
eq('events before the window are left out', byUid('old@google.com').length, 0)
eq('an event without a UID gets one from what it is', got.events.filter((e) => e.title === 'No uid').map((e) => e.external_uid), ['nouid:No uid|2026-11-01|'])
eq('the same event twice is kept once', eventsFromIcs([...read.events, ...read.events], { zone: AMS, ...W }).events.length, got.events.length)
eq('a cap stops the list and says so', [eventsFromIcs(read.events, { zone: AMS, ...W, max: 10 }).events.length, eventsFromIcs(read.events, { zone: AMS, ...W, max: 10 }).truncated], [10, true])
eq('a key compares moments, not spellings', eventKey({ external_uid: 'u', starts_at: '2026-10-01T07:00:00Z' }) === eventKey({ external_uid: 'u', starts_at: '2026-10-01T07:00:00.000Z' }), true)

// ---- busy whole-day events (v19, AGN-07) --------------------------------------------------------
const busyIcs = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:spain@x', 'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261017', 'TRANSP:OPAQUE', 'SUMMARY:Holiday in Spain', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:bday@x', 'DTSTART;VALUE=DATE:20261013', 'DTEND;VALUE=DATE:20261014', 'TRANSP:TRANSPARENT', 'SUMMARY:Ann’s birthday', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:plain@x', 'DTSTART;VALUE=DATE:20261014', 'SUMMARY:Bin day', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:meet@x', 'DTSTART:20261013T090000Z', 'DTEND:20261013T100000Z', 'TRANSP:OPAQUE', 'SUMMARY:Meeting', 'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n')
const busyRead = parseIcs(busyIcs, { zone: AMS, today: TODAY, mapSeries: false, from: W.from, to: W.to })
eq('TRANSP is read', busyRead.events.map((e) => e.transp), ['opaque', 'transparent', null, 'opaque'])
const busyRows = eventsFromIcs(busyRead.events, { zone: AMS, ...W }).events
eq('only a whole-day event marked busy is busy', busyRows.map((e) => [e.title, !!e.busy]),
  [['Holiday in Spain', true], ['Ann’s birthday', false], ['Meeting', false], ['Bin day', false]])
eq('marked busy later: the row changes', planReplace([{ id: '1', ...busyRows[1] }], [{ ...busyRows[1], busy: true }]).update, [{ id: '1', changes: { busy: true } }])
eq('a row kept before busy was read is free, the same as before', planReplace([{ id: '1', ...busyRows[2] }], [busyRows[2]]).unchanged, 1)

// ---- replacing a calendar's events -------------------------------------------------------------
const inc = (uid, start, title = uid) => ({ external_uid: uid, starts_at: start, ends_at: null, all_day: false, title, location: null })
const loc = (id, uid, start, title = uid) => ({ id, ...inc(uid, start, title) })
const plan = planReplace(
  [loc('1', 'a', '2026-10-01T07:00:00.000Z'), loc('2', 'b', '2026-10-02T07:00:00.000Z', 'old title'), loc('3', 'gone', '2026-10-03T07:00:00.000Z'),
    loc('4', 'a', '2026-10-01T07:00:00Z')],
  [inc('a', '2026-10-01T07:00:00Z'), inc('b', '2026-10-02T07:00:00.000Z', 'new title'), inc('c', '2026-10-04T07:00:00.000Z')])
eq('a new event is added', plan.add.map((e) => e.external_uid), ['c'])
eq('a changed event keeps its row and changes only what changed', plan.update, [{ id: '2', changes: { title: 'new title' } }])
eq('an event gone from the file goes, and so does a second copy', plan.remove.sort(), ['3', '4'])
eq('an event the same as before is left alone', plan.unchanged, 1)
eq('a moved event is a new one (its start is part of what it is)', planReplace([loc('1', 'a', '2026-10-01T07:00:00.000Z')], [inc('a', '2026-10-01T08:00:00.000Z')]), { add: [inc('a', '2026-10-01T08:00:00.000Z')], update: [], remove: ['1'], unchanged: 0 })
eq('an empty file empties the calendar', planReplace([loc('1', 'a', '2026-10-01T07:00:00.000Z')], []).remove, ['1'])
eq('the same end written two ways is no change', planReplace([{ ...loc('1', 'a', '2026-10-01T07:00:00.000Z'), ends_at: '2026-10-01T08:00:00Z' }], [{ ...inc('a', '2026-10-01T07:00:00.000Z'), ends_at: '2026-10-01T08:00:00.000Z' }]).unchanged, 1)

// ---- when to fetch again, and what a calendar file looks like ------------------------------------
const now = Date.parse('2026-09-28T12:00:00Z')
eq('never fetched is due', refreshDue(null, now), true)
eq('fetched an hour ago is not due', refreshDue('2026-09-28T11:00:00Z', now), false)
eq('fetched three hours ago is due', refreshDue(new Date(now - REFRESH_MS).toISOString(), now), true)
eq('a time in the future (a wrong clock) is due', refreshDue('2026-09-29T12:00:00Z', now), true)
eq('a calendar that failed is not asked for again within the hour', fetchDue({ lastSyncedAt: null, failedAt: now - 20 * 60000, now }), false)
eq('an hour after failing it is tried again', fetchDue({ lastSyncedAt: null, failedAt: now - RETRY_MS, now }), true)
eq('Refresh now tries at once, failed or not', fetchDue({ lastSyncedAt: null, failedAt: now - 60000, now, force: true }), true)
eq('with no failure, it is due by its last fetch', [fetchDue({ lastSyncedAt: null, now }), fetchDue({ lastSyncedAt: '2026-09-28T11:00:00Z', now })], [true, false])
eq('a failure time in the future (a clock put back) does not hold it up', fetchDue({ lastSyncedAt: null, failedAt: now + 2 * RETRY_MS, now }), true)
eq('a calendar file looks like one', [looksLikeCalendar('﻿\r\nBEGIN:VCALENDAR\r\n'), looksLikeCalendar('<!doctype html>'), looksLikeCalendar('')], [true, false, false])

// ---- what may go in a log: never the secret address --------------------------------------------
const denoError = new TypeError(`error sending request for url (${google}): client error (Connect): dns error`)
eq('the log names the server, not the address', hostOf(google), 'calendar.google.com')
eq('a bad address has no server to name', [hostOf('not an address'), hostOf(null)], ['no host', 'no host'])
eq('the log line says what kind of error, never its message', logLine('calendar-fetch', denoError, hostOf(google)), 'calendar-fetch: TypeError at calendar.google.com')
eq('a database error is logged by its code', [errorKind({ name: 'PostgrestError', code: '42501', message: 'x' }), errorKind({ code: 'PGRST116', message: 'x' })], ['PostgrestError 42501', 'code PGRST116'])
eq('something that is not an error is logged as unknown', [errorKind('text with https://x.com/private'), errorKind(null)], ['unknown error', 'unknown error'])
eq('an address in a message is taken out', withoutAddresses(denoError.message).includes('private-0123abcd'), false)
eq('an address without https:// is taken out too', withoutAddresses('failed at calendar.google.com/calendar/ical/x/private-1/basic.ics now'), 'failed at the address now')
eq('a message without one is left alone', withoutAddresses('The calendar’s server answered 500. It will be tried again later.'), 'The calendar’s server answered 500. It will be tried again later.')

// ---- the server functions run these same rules ----------------------------------------------------
eq('supabase/functions/_shared is up to date (node scripts/copy-shared.mjs)', stale(), [])

eq('a timeout keeps its plain name, so the app can say it took too long', [errorName(new DOMException('x', 'TimeoutError')), errorName({ name: 'Bad name!' })], ['TimeoutError', 'Error'])
eq('the app\'s own wording keeps "https://"; a real address is taken out', [
  withoutAddresses('Only secure addresses (https://) can be followed.'),
  withoutAddresses('error sending request for url (https://calendar.google.com/calendar/ical/x/private-abc/basic.ics)'),
], ['Only secure addresses (https://) can be followed.', 'error sending request for url (the address)'])

// v18 (GEN-22, GEN-26): an "after" or flexible series has no calendar rule;
// its tasks go out as they are, never as "every 7 days".
const looseFeed = feedEvents({ ...input, events: [],
  tasks: [task('t-water', 'Water the plants', '2026-10-02', null, { series_id: 's-water' }), task('t-water-old', 'Water the plants', '2026-09-25', null, { series_id: 's-water', status: 'done' })],
  series: [{ id: 's-water', title: 'Water the plants', rule: 'daily', rule_config: { n: 7, mode: 'flexible' }, start_date: '2026-09-25', end_date: null,
    occurrence_count: null, time_of_day: null, task_template: {}, active: true }], exceptions: [] })
eq('a flexible series goes out as its tasks, with no RRULE', looseFeed.map((e) => [e.start.date, e.rrule ?? null]), [['2026-10-02', null], ['2026-09-25', null]])

console.log(fail ? `\n${fail} failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
