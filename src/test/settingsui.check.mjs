// The rules behind Settings: search in settings, profiles (pick, name,
// delete), signing out with changes waiting, the merges list in words, the
// time zone, the height field, tips and what moved where, and the Modules
// page's search.
import { findSettings, SETTINGS_INDEX, SETTINGS_SECTIONS } from '../lib/settings-index-rules.ts'
import { pickProfile, profileNameProblem, profileDeleteProblem, signOutCheck } from '../lib/accounts-rules.ts'
import { conflictLine, shownValue } from '../lib/sync-rules.ts'
import { cleanZone, readZoneChoice, zoneToStore, zoneLabel } from '../lib/timezone-rules.ts'
import { heightFrom } from '../lib/profile-fields-rules.ts'
import { TIPS, readTipState, tipShows, dismissTip, noteFirstDay, resetTips, movedShows, readMoved, MOVED_VERSION, NO_TIPS } from '../lib/tips-rules.ts'
import { hubSearch, recordName, recordWords } from '../lib/hub-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// ---------- search in settings ------------------------------------------------------
is('five tabs, Looks among them', SETTINGS_SECTIONS, ['Modules', 'Profile', 'Looks', 'Reminders', 'Data'])
is('found by a word it is known by', findSettings('dark')[0]?.title, 'Make GetIt yours')
is('found by its own name first', findSettings('quiet')[0]?.title, 'Quiet hours')
is('several words, any order', findSettings('out sign')[0]?.title, 'Account')
is('accents and case do not matter', findSettings('TIME ZÓNE')[0]?.title, 'Time zone')
is('nothing typed, nothing found', findSettings('  '), [])
is('every entry is in a tab', SETTINGS_INDEX.every((e) => SETTINGS_SECTIONS.includes(e.section)), true)

// ---------- profiles (SET-02) ----------------------------------------------------------
const ps = [
  { id: 'a', name: 'Edvinas', is_default: true },
  { id: 'b', name: 'Sam', is_default: false },
  { id: 'c', name: 'Old', is_default: false, deleted_at: '2026-09-01' },
]
is('the open one stays open', pickProfile(ps, 'b', 'a')?.id, 'b')
is('else the one chosen last on this device', pickProfile(ps, null, 'b')?.id, 'b')
is('else the account’s own', pickProfile(ps, null, null)?.id, 'a')
is('a deleted one is never opened', pickProfile(ps, 'c', 'c')?.id, 'a')
is('a remembered one from another account is passed over', pickProfile(ps, null, 'zzz')?.id, 'a')
is('no profiles: none', pickProfile([], null, null), null)
is('a name is needed', profileNameProblem('  ', ps), 'Give the profile a name.')
is('two profiles cannot share a name', profileNameProblem('sam', ps), 'Another profile has that name.')
is('a new name is fine', profileNameProblem('Work', ps), null)
is('the account’s own cannot go', profileDeleteProblem(ps[0], ps) !== null, true)
is('another can', profileDeleteProblem(ps[1], ps), null)
is('the last one cannot', profileDeleteProblem({ id: 'x', name: 'x', is_default: false }, [{ id: 'x', name: 'x', is_default: false }]) !== null, true)

// ---------- signing out (SET-04) ---------------------------------------------------------
is('nothing waiting: go ahead', signOutCheck({ pending: 0, online: false }), { ok: true })
is('waiting and online: says how many and asks', signOutCheck({ pending: 3, online: true }).reason.startsWith('3 changes have not reached'), true)
is('waiting and offline: says there is no connection', signOutCheck({ pending: 1, online: false }).reason.includes('no connection'), true)

// ---------- the merges list (SET-07) ---------------------------------------------------
const refused = conflictLine({ table: 'module_record', field: 'data, record_date', kept: 'rejected', local_value: { data: { name: 'Fern' }, record_date: '2026-10-03' }, remote_value: 'new row violates check constraint' })
is('a refused change says refused, not kept', refused.text.startsWith('Refused by the server, so not saved'), true)
is('…and never prints [object Object]', refused.text.includes('[object Object]'), false)
is('…and says why', refused.text.endsWith('The server said: new row violates check constraint.'), true)
is('the field names read as words', refused.head, 'module record · data, record date')
is('a clash says which value stayed', conflictLine({ table: 'task', field: 'title', kept: 'local', local_value: 'Run', remote_value: 'Walk' }).text, 'Kept this device’s “Run” over “Walk” from another device.')
is('nothing reads as nothing', shownValue(null), 'nothing')
is('long values are cut', shownValue('x'.repeat(100)).length, 60)
is('a list reads as a list', shownValue(['a', 2]), '“a”, 2')

// ---------- time zone (GEN-69) ----------------------------------------------------------
is('a zone name is kept', cleanZone('Europe/Amsterdam'), 'Europe/Amsterdam')
is('junk is not', [cleanZone('not a zone!'), cleanZone(3), cleanZone('')], [null, null, null])
is('following the phone by default', readZoneChoice(undefined), { follow: true, zone: null })
is('a chosen zone', readZoneChoice({ follow: false, zone: 'Asia/Tokyo' }), { follow: false, zone: 'Asia/Tokyo' })
is('choosing nothing is following', readZoneChoice({ follow: false, zone: 'bad zone' }), { follow: true, zone: null })
is('a new account set in Amsterdam on a phone in Vilnius moves to Vilnius', zoneToStore({ follow: true, zone: null }, 'Europe/Vilnius', 'Europe/Amsterdam'), { zone: 'Europe/Vilnius', change: true })
is('a chosen zone wins over the phone', zoneToStore({ follow: false, zone: 'Asia/Tokyo' }, 'Europe/Vilnius', 'Europe/Vilnius'), { zone: 'Asia/Tokyo', change: true })
is('nothing to change', zoneToStore({ follow: true, zone: null }, 'Europe/Amsterdam', 'Europe/Amsterdam').change, false)
is('no phone zone: the stored one stays', zoneToStore({ follow: true, zone: null }, null, 'Europe/Amsterdam'), { zone: 'Europe/Amsterdam', change: false })
is('a zone as people say it', [zoneLabel('Europe/Amsterdam'), zoneLabel('America/Argentina/Buenos_Aires'), zoneLabel('UTC')], ['Amsterdam (Europe)', 'Buenos Aires (America, Argentina)', 'UTC'])

// ---------- height (HLT-06) ---------------------------------------------------------------
is('emptied: not known, never 0', heightFrom('  '), null)
is('a height, with a comma', [heightFrom('181'), heightFrom('172,5')], [181, 172.5])
is('nonsense is refused, nothing saved', [heightFrom('0'), heightFrom('abc'), heightFrom('400')], [undefined, undefined, undefined])

// ---------- tips (ONB-12, ONB-13) and what moved (NAV-26) -----------------------------------
const t0 = noteFirstDay(NO_TIPS, '2026-10-03')
is('a tip shows until dismissed', [tipShows('hub-hold', t0, '2026-10-03'), tipShows('hub-hold', dismissTip(t0, 'hub-hold'), '2026-10-03')], [true, false])
is('Make GetIt yours waits three days', [tipShows('make-yours', t0, '2026-10-05'), tipShows('make-yours', t0, '2026-10-06')], [false, true])
is('…and never shows before the first day is known', tipShows('make-yours', NO_TIPS, '2030-01-01'), false)
is('the first day is kept once', noteFirstDay(t0, '2027-01-01').first, '2026-10-03')
is('show tips again keeps the first day', resetTips(dismissTip(t0, 'hub-hold')), { seen: [], first: '2026-10-03', moved: null })
is('an unknown tip never shows', tipShows('nope', t0, '2026-10-03'), false)
is('stored junk is cleaned', readTipState({ seen: ['hub-hold', 'nope', 3], first: 'yesterday', moved: 7 }), { seen: ['hub-hold'], first: null, moved: null })
is('every tip says something', TIPS.every((t) => t.text.length > 20 && !/[\u{1F300}-\u{1FAFF}]/u.test(t.text)), true)
is('what moved: shown to someone from before', movedShows(NO_TIPS, '2026-05-01T10:00:00Z'), true)
is('…not to someone new', movedShows(NO_TIPS, '2026-10-10T10:00:00Z'), false)
is('…and once', movedShows(readMoved(NO_TIPS), '2026-05-01'), false)
is('…per version', readMoved(NO_TIPS).moved, MOVED_VERSION)

// ---------- the Modules page's search (NAV-22) ----------------------------------------------
const mods = [
  { key: 'm:sleep', module: 'sleep', name: 'Sleep', summary: 'A sleep log against a target.', keywords: ['bed'], on: true, route: '/m/sleep' },
  { key: 'finance', module: 'finance', name: 'Finance', summary: 'A budget.', keywords: ['money'], on: false, route: null },
  { key: 'm:u_plants01', module: 'u_plants01', name: 'Plants', summary: '', keywords: [], on: true, route: '/m/u_plants01' },
]
const recs = [
  { id: 'r1', module: 'u_plants01', name: 'Fern', extra: 'water weekly bathroom', route: '/m/u_plants01?open=r1', meta: 'Plants' },
  { id: 'r2', module: 'finance', name: 'Fern pot', extra: '12', route: '/m/finance?open=r2', meta: 'Finance' },
  { id: 'r3', module: 'u_plants01', name: 'Monstera', extra: 'water', route: '/m/u_plants01?open=r3', meta: 'Plants', recent: 5 },
]
is('a module by its name', hubSearch(mods, recs, 'sle').hits.map((h) => h.item.name), ['Sleep'])
is('a module by a keyword, off ones too (to switch on)', hubSearch(mods, recs, 'money').hits.map((h) => [h.kind, h.item.name]), [['module', 'Finance']])
is('records of modules that are on, by any word', hubSearch(mods, recs, 'water').hits.map((h) => h.item.name), ['Monstera', 'Fern'])
is('records of modules that are off stay hidden', hubSearch(mods, recs, 'fern').hits.map((h) => h.item.name), ['Fern'])
is('modules before records', hubSearch(mods, recs, 'plants').hits.map((h) => h.kind), ['module'])
is('nothing typed, nothing found', hubSearch(mods, recs, '').hits, [])
is('a cap with a count of the rest', hubSearch(mods, recs, 'water', 1).more, 1)
is('a record named by its first text', recordName({ day: '2026-10-03', plant: 'Fern', _series: 'abc' }, 'Plants'), 'Fern')
is('…or its module', recordName({ day: '2026-10-03' }, 'Plants'), 'Plants')
is('its words leave out the repeat', recordWords({ plant: 'Fern', tags: ['a', 'b'], _series: 'xyz' }), 'Fern a b')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall settings checks passed')
