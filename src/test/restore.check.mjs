// A backup brings the profile back whole (SET-06, DATA-06): the body fields,
// the settings (note templates, stats views, looks, Today's cards, where each
// module shows), the country and the city.
import { restoredProfile, PROFILE_FIELDS } from '../lib/restore-rules.ts'
import { readSettings } from '../lib/settings.ts'
import { readFileSync } from 'node:fs'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const settings = {
  onboarded: true,
  note_templates: [{ id: 'tpl_reading', name: 'Reading reflection', body: 'What stayed with me:' }],
  stats_views: [{ id: 'v1', name: 'Protein by day', measure: 'nutrition:protein_g', agg: 'avg', group: 'day', range: 'month', chart: 'bar' }],
  looks: { theme: 'sage', mode: 'dark', seed: null, icon: 'night', text_size: 'large' },
  today_cards: [{ kind: 'module', key: 'u_old0001', size: 'small', show: 'always' }],
  module_views: { habits: { plan: false }, u_old0001: { widget: false } },
  colours: { on: true, modules: { u_old0001: '#335577' } },
}
const source = { id: 'p-old', name: 'Edvinas', height_cm: 181, timezone: 'Europe/Vilnius', country: 'lt', city: '  Reuver  ', settings, is_default: true, household_id: 'h-old' }
const current = { id: 'p-new', settings: { onboarded: true, looks: { theme: 'notebook' } } }
const fresh = new Map([['u_old0001', 'u_new0001']])
const remap = (v) => (typeof v === 'string' ? fresh.get(v) ?? v : Array.isArray(v) ? v.map(remap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)])) : v)
const out = restoredProfile(source, current, remap)
is('body fields come back', [out.name, out.height_cm, out.timezone], ['Edvinas', 181, 'Europe/Vilnius'])
is('country and city come back, cleaned', [out.country, out.city], ['LT', 'Reuver'])
is('ids and the household do not', ['id', 'household_id', 'is_default'].some((k) => k in out), false)
const st = readSettings(out)
is('note templates come back', st.note_templates.map((t) => t.name).includes('Reading reflection'), true)
is('looks come back', [st.looks.theme, st.looks.mode, st.looks.text_size], ['sage', 'dark', 'large'])
is('Today’s cards come back, pointing at the module’s new key', st.today_cards.map((c) => c.key), ['u_new0001'])
is('where each module shows comes back, under the new key', [st.module_views.habits, st.module_views.u_new0001], [{ plan: false }, { widget: false }])
is('a module colour follows its module', st.colours.modules.u_new0001, '#335577')
is('a restore never sends the person back through setup', readSettings(restoredProfile({ settings: { onboarded: false } }, current)).onboarded, true)
is('a file with no settings leaves them alone', 'settings' in restoredProfile({ name: 'x' }, current), false)
is('the profile fields list', PROFILE_FIELDS.includes('ai_persona_name'), true)
// The export holds the whole profile row, settings included (bundle.ts).
const bundleSrc = readFileSync(new URL('../lib/bundle.ts', import.meta.url), 'utf8')
is('the backup exports every profile row whole', /table === 'profile' \? rows/.test(bundleSrc), true)
is('the restore uses these rules', /restoredProfile\(source, current, remap\)/.test(bundleSrc), true)

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall restore checks passed')
