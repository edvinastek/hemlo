// Checks calendar links: the feed link Google Calendar reads (its window, what
// it holds and what it leaves out), the address of a calendar to follow, the
// check that the server never fetches from a private network, the plan that
// makes a followed calendar's events on the device match its file, and that
// the server functions' copies of these rules are the rules themselves.
// 2026-09-28 is a Monday; 2026-10-25 the clocks go back in Europe.
import {
  shiftMonths, feedWindow, isFeedToken, feedUrl, feedName, feedEvents, buildFeed,
  normaliseCalendarUrl, ipLiteral, cleanName, parseIPv4, parseIPv6, isPublicIp,
  eventsFromIcs, eventKey, planReplace, refreshDue, looksLikeCalendar, MAX_URL, REFRESH_MS,
} from '../lib/calendar-links-rules.ts'
import { parseIcs } from '../lib/ics-rules.ts'
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
eq('the calendar is named after the profile', feedName('  Anna '), 'GetIt – Anna')
eq('a profile without a name', feedName(''), 'GetIt')

const task = (id, title, day, time = null, extra = {}) => ({
  id, title, planned_date: day, planned_time: time, duration_min: 45, notes: 'private note', category: 'Work', status: 'todo', ...extra,
})
const input = {
  profileName: 'Anna', timezone: AMS, notes: false, stamp: STAMP, today: TODAY,
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
  ],
}
const evs = feedEvents(input)
const titles = evs.map((e) => e.summary)
eq('timed and untimed tasks are in', ['Dentist', 'Taxes'].every((t) => titles.includes(t)), true)
eq('dropped, deleted, undated and out-of-window tasks are not', ['Dropped', 'Deleted', 'Too old', 'Too far', 'No day'].some((t) => titles.includes(t)), false)
eq('a repeating series goes once, with its rule, not as its tasks', [titles.filter((t) => t === 'Gym').length, titles.includes('Gym (a repeat)')], [1, false])
eq('the series keeps its rule and skipped day', [evs.find((e) => e.summary === 'Gym').rrule, evs.find((e) => e.summary === 'Gym').exdates], ['FREQ=WEEKLY;BYDAY=TU,TH;WKST=MO', [{ kind: 'local', date: '2026-10-06', time: '07:00' }]])
eq('own agenda events are in, with their place', evs.find((e) => e.summary === 'Wedding')?.location, 'Utrecht')
eq('events from a followed calendar are never sent back', titles.includes('From Google'), false)
eq('deleted events are not in', titles.includes('Deleted event'), false)
eq('an all-day event keeps its local days', [evs.find((e) => e.summary === 'Holiday').start, evs.find((e) => e.summary === 'Holiday').end],
  [{ kind: 'date', date: '2026-10-20' }, { kind: 'date', date: '2026-10-23' }])
eq('notes stay out by default, from tasks and series alike', evs.some((e) => e.description), false)
eq('with notes on, they go out', feedEvents({ ...input, notes: true }).filter((e) => e.description).map((e) => e.summary).sort(), ['Dentist', 'Gym', 'Taxes'])
eq('a task keeps its section', evs.find((e) => e.summary === 'Dentist').categories, ['Work'])
const file = buildFeed(input)
eq('the file names the calendar and the zone', [file.includes('X-WR-CALNAME:GetIt – Anna'), file.includes('X-WR-TIMEZONE:Europe/Amsterdam')], [true, true])
eq('the file is CRLF and one VEVENT per event', [file.endsWith('END:VCALENDAR\r\n'), file.split('BEGIN:VEVENT').length - 1], [true, evs.length])
eq('the dentist is floating local time', file.includes('DTSTART:20260930T090000\r\n'), true)
eq('no note text anywhere in the file', /private note|bring shoes/.test(file), false)
const back = parseIcs(file, { zone: AMS, today: TODAY, mapSeries: false })
eq('the feed reads back as a calendar', back.problems, [])

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
eq('a calendar file looks like one', [looksLikeCalendar('﻿\r\nBEGIN:VCALENDAR\r\n'), looksLikeCalendar('<!doctype html>'), looksLikeCalendar('')], [true, false, false])

// ---- the server functions run these same rules ----------------------------------------------------
eq('supabase/functions/_shared is up to date (node scripts/copy-shared.mjs)', stale(), [])

console.log(fail ? `\n${fail} failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
