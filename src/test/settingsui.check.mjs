// The rules behind Settings: search in settings, profiles (pick, name,
// delete), signing out with changes waiting, the merges list in words, the
// time zone, the height field, tips and what moved where, and the Modules
// page's search.
import { findSettings, SETTINGS_INDEX, SETTINGS_PAGES, pageForAddress } from '../lib/settings-index-rules.ts'
import { pickProfile, profileNameProblem, profileDeleteProblem, signOutCheck } from '../lib/accounts-rules.ts'
import { conflictLine, shownValue } from '../lib/sync-rules.ts'
import { cleanZone, readZoneChoice, zoneToStore, zoneLabel } from '../lib/timezone-rules.ts'
import { heightFrom } from '../lib/profile-fields-rules.ts'
import { TIPS, TIP_MAX, readTipState, tipShows, dismissTip, noteFirstDay, resetTips, movedShows, readMoved, MOVED_VERSION, MOVED_SINCE, NO_TIPS, noteRun, meetProfile, versionKey, WHAT_MOVED } from '../lib/tips-rules.ts'
import { hubSearch, recordName, recordWords, recordRoute, foodRoute, readFoodAddress } from '../lib/hub-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// ---------- search in settings ------------------------------------------------------
is('Settings is a short list of pages, About last', [SETTINGS_PAGES.length, SETTINGS_PAGES.map((p) => p.key).at(-1)], [11, 'about'])
is('…each with one short line', SETTINGS_PAGES.every((p) => p.line.length > 0 && p.line.length <= 40 && !p.line.endsWith('.')), true)
is('found by a word it is known by', findSettings('dark')[0]?.title, 'Looks')
is('found by its own name first', findSettings('quiet')[0]?.title, 'Quiet hours')
is('several words, any order', findSettings('out sign')[0]?.title, 'Account')
is('accents and case do not matter', findSettings('TIME ZÓNE')[0]?.title, 'Time zone')
is('nothing typed, nothing found', findSettings('  '), [])
is('found by the page it is on', findSettings('calendars').map((e) => e.title).slice(0, 2).sort(), ['Calendar links', 'Public holidays'])
is('the data credits are found', findSettings('nevo')[0]?.page, 'about')
is('every entry is on a page', SETTINGS_INDEX.every((e) => SETTINGS_PAGES.some((p) => p.key === e.page)), true)
is('every page has something to find', SETTINGS_PAGES.every((p) => SETTINGS_INDEX.some((e) => e.page === p.key)), true)
is('an address: ?page=', pageForAddress({ page: 'looks' }), 'looks')
is('…an unknown page is the list', pageForAddress({ page: 'nope' }), null)
is('…the old tabs still land', ['Modules', 'Profile', 'Looks', 'Reminders', 'Data'].map((section) => pageForAddress({ section })),
  ['modules', 'profile', 'looks', 'reminders', 'data'])
is('…?find= opens the setting’s own page, whatever the old tab said', pageForAddress({ section: 'Profile', find: 'Household' }), 'shopping')
is('…the old calendar links address', pageForAddress({ section: 'Profile', hash: '#calendar-links' }), 'calendars')
is('…nothing: the list', pageForAddress({}), null)

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
is('Make Hemlo yours waits three days', [tipShows('make-yours', t0, '2026-10-05'), tipShows('make-yours', t0, '2026-10-06')], [false, true])
is('…and never shows before the first day is known', tipShows('make-yours', NO_TIPS, '2030-01-01'), false)
is('the first day is kept once', noteFirstDay(t0, '2027-01-01').first, '2026-10-03')
is('show tips again keeps the first day', resetTips(dismissTip(t0, 'hub-hold')), { seen: [], first: '2026-10-03', moved: null, runs: {} })
is('an unknown tip never shows', tipShows('nope', t0, '2026-10-03'), false)
is('stored junk is cleaned', readTipState({ seen: ['hub-hold', 'nope', 3], first: 'yesterday', moved: 7, runs: { x: 1, 17: { at: 'soon' } } }), { seen: ['hub-hold'], first: null, moved: null, runs: {} })
is('every tip says something short, as one slim line (CALM-14)', TIPS.every((t) => t.text.length > 20 && t.text.length <= TIP_MAX && !/[\u{1F300}-\u{1FAFF}]/u.test(t.text)), true)

// What moved where: only for someone who used Hemlo before this version.
const ID = '22222222-2222-4222-8222-222222222222'
const ID2 = '33333333-3333-4333-8333-333333333333'
const RUN = '2026-11-01T09:00:00.000Z'
is('version keys', [versionKey('0.17.0'), versionKey('0.16.2'), versionKey('1.2.0')], ['17', '16', '1'])
const ran = noteRun(NO_TIPS, MOVED_VERSION, RUN)
is('a version’s first run is noted once', noteRun(ran, MOVED_VERSION, '2027-01-01T00:00:00.000Z').runs[MOVED_VERSION].at, RUN)
is('…and only the last three versions are kept', Object.keys(['13', '14', '15', '16'].reduce((s, v) => noteRun(s, v, RUN), NO_TIPS).runs), ['14', '15', '16'])
const old = meetProfile(ran, MOVED_VERSION, ID, true)
is('a profile met is noted once, as it was then', meetProfile(old, MOVED_VERSION, ID, false).runs[MOVED_VERSION].met[ID], true)
is('updating from an earlier version: shown', movedShows(old, { id: ID, created_at: '2026-05-01T10:00:00Z' }), true)
is('…also when the profile’s age is not known', movedShows(old, { id: ID }), true)
is('…once', movedShows(readMoved(old), { id: ID, created_at: '2026-05-01T10:00:00Z' }), false)
is('…per version', readMoved(NO_TIPS).moved, MOVED_VERSION)
const fresh = meetProfile(ran, MOVED_VERSION, ID2, false)
is('a brand-new account, met in its first-run setup: never', movedShows(fresh, { id: ID2, created_at: '2026-11-01T09:05:00Z' }), false)
is('…not even once it is set up', movedShows(meetProfile(fresh, MOVED_VERSION, ID2, true), { id: ID2 }), false)
is('a profile made after this version first ran here: never', movedShows(meetProfile(ran, MOVED_VERSION, ID2, true), { id: ID2, created_at: '2026-11-01T09:00:01Z' }), false)
is('an account made since the release, on its second device: never',
  movedShows(meetProfile(noteRun(NO_TIPS, MOVED_VERSION, '2027-03-01T00:00:00.000Z'), MOVED_VERSION, ID2, true), { id: ID2, created_at: `${MOVED_SINCE}T12:00:00Z` }), false)
is('before this version has run here (an older build): never', movedShows(meetProfile(noteRun(NO_TIPS, '16', RUN), '16', ID, true), { id: ID }), false)
is('a profile this version never met: never', movedShows(old, { id: ID2 }), false)
is('runs survive being stored', readTipState(JSON.parse(JSON.stringify(old))).runs[MOVED_VERSION], { at: RUN, met: { [ID]: true } })
is('every move says where it went', WHAT_MOVED.every((m) => m.was && m.now && !/[\u{1F300}-\u{1FAFF}]/u.test(m.now)), true)

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
is('a record opens in its module page', recordRoute('plants', 'r1'), '/m/plants?open=r1')
is('Food and Shopping records open their own screens', [recordRoute('nutrition', 'r1'), recordRoute('shopping', 'r2')], ['/food', '/shop'])
is('a recipe and a food on the Food page', [foodRoute('recipe', 'a'), foodRoute('food', 'b')], ['/food?recipe=a', '/food?food=b'])
const addr = (q) => readFoodAddress(new URLSearchParams(q))
is('the Food page opens a recipe on Recipes', addr('recipe=a'), { section: 'Recipes', recipe: 'a', food: null })
is('a food on Foods', addr('food=b'), { section: 'Foods', recipe: null, food: 'b' })
is('a tab by name, else Day', [addr('tab=foods').section, addr('').section, addr('tab=nope').section], ['Foods', 'Day', 'Day'])
is('a cap with a count of the rest', hubSearch(mods, recs, 'water', 1).more, 1)
is('a record named by its first text', recordName({ day: '2026-10-03', plant: 'Fern', _series: 'abc' }, 'Plants'), 'Fern')
is('…or its module', recordName({ day: '2026-10-03' }, 'Plants'), 'Plants')
is('its words leave out the repeat', recordWords({ plant: 'Fern', tags: ['a', 'b'], _series: 'xyz' }), 'Fern a b')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall settings checks passed')
