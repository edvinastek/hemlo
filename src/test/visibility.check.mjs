// Only what is switched on appears (GEN-01 to GEN-03, ONB-10, MOD-06): the
// one rule for which modules are on, the five switches per module, what a
// template sets, and which built-in rules the editor shows.
import { modulesOn, moduleView, defaultView, readModuleViews, templateViews, switchChange, describeView, hasSwitches, VIEW_SWITCHES } from '../lib/module-view-rules.ts'
import { templateLayout, TEMPLATES } from '../lib/templates.ts'
import { ruleShown, BUILTIN_RULES } from '../modules/def-rules.ts'
import { MODULES } from '../modules/registry.ts'
import { mergeSettings, readSettings } from '../lib/settings.ts'
import { availablePages } from '../lib/pages-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// ---------- the one rule ----------------------------------------------------------
const rows = [
  { module_key: 'core', enabled: true },
  { module_key: 'habits', enabled: true },
  { module_key: 'nutrition', enabled: false },
  { module_key: 'u_abcdef12', enabled: true },
  { module_key: 'u_gone0000', enabled: true },
  { module_key: 'u_offmod00', enabled: false },
]
const built = [
  { key: 'u_abcdef12', name: 'Plants' },
  { key: 'u_gone0000', name: 'Car', deleted_at: '2026-09-01T00:00:00Z' },
  { key: 'u_offmod00', name: 'Off' },
]
is('on: only rows switched on, and built modules that still exist', [...modulesOn(rows, built)].sort(), ['core', 'habits', 'u_abcdef12'])
is('a module with no row is off', modulesOn([], []).has('habits'), false)
is('a built module with no module row is off, even if its switch is on', modulesOn([{ module_key: 'u_nothere0', enabled: true }], []).has('u_nothere0'), false)
is('the page bar goes by the same rule', availablePages(rows, built).map((p) => p.key).filter((k) => k.startsWith('m:')), ['m:habits', 'm:u_abcdef12'])

// ---------- the switches -------------------------------------------------------------
is('five switches, in order', VIEW_SWITCHES.map((s) => s.key), ['today', 'plan', 'widget', 'stats', 'reminders'])
is('a module shows everywhere until told otherwise', moduleView({}, 'habits'), { today: true, plan: true, widget: true, stats: true, reminders: true })
is('stats and core show nothing of their own', [defaultView('stats').today, defaultView('core').plan], [false, false])
is('only the switch changed differs', moduleView({ habits: { plan: false } }, 'habits'), { today: true, plan: false, widget: true, stats: true, reminders: true })
is('stored junk is dropped', readModuleViews({ habits: { today: 'yes', plan: false }, 'Bad Key': { today: true }, x: 3 }), { habits: { plan: false } })
is('a switch change names one module and one switch', switchChange('sleep', 'widget', false), { sleep: { widget: false } })
const s1 = readSettings({ settings: { module_views: { habits: { plan: false } } } })
const s2 = mergeSettings(s1, { module_views: switchChange('habits', 'widget', false) })
is('saving one switch keeps the module’s others', s2.module_views.habits, { plan: false, widget: false })
is('Stats, core and Custom have no switches', ['stats', 'core', 'custom', 'habits'].map(hasSwitches), [false, false, false, true])
is('described: everywhere', describeView(moduleView({}, 'habits')), 'On Today, Plan and widget · in Stats, reminders')
is('described: nowhere but its page', describeView({ today: false, plan: false, widget: false, stats: false, reminders: false }), 'Only on its own page')

// ---------- templates (ONB-10) -------------------------------------------------------
const keys = MODULES.map((m) => m.key).filter((k) => k !== 'custom')
const fit = templateLayout('fitness', ['agenda', 'nutrition', 'health'], keys)
is('a template sets every module’s switches', Object.keys(fit.module_views).length, keys.length)
is('…with its own choices laid over the defaults', fit.module_views.supplements, { today: true, plan: false, widget: true, stats: true, reminders: true })
is('…and the defaults elsewhere', fit.module_views.habits, defaultView('habits'))
is('cards only for modules kept on', fit.today_cards.map((c) => c.key), ['nutrition', 'health'])
is('an unknown template falls back to the minimal one', templateLayout('nope', ['agenda'], keys).today_cards, [])
for (const t of TEMPLATES) {
  const bad = (t.cards ?? []).filter((c) => !t.modules.includes(c.key))
  is(`${t.name}: every card is of a module it switches on`, bad.map((c) => c.key), [])
  is(`${t.name}: at most 6 cards`, (t.cards ?? []).length <= 6, true)
  const viewKeys = Object.keys(t.views ?? {}).filter((k) => !keys.includes(k))
  is(`${t.name}: switches only for modules that exist`, viewKeys, [])
}
is('template switches pass the settings check unchanged', readSettings({ settings: { module_views: templateViews(keys, { sleep: { widget: false } }) } }).module_views.sleep.widget, false)

// ---------- rules the editor shows (MOD-06) ------------------------------------------
const shown = Object.entries(BUILTIN_RULES).filter(([, r]) => r.support !== 'later').map(([k]) => k)
is('a rule not carried out is not shown', ruleShown('agenda', 'no_overlap'), BUILTIN_RULES['agenda.no_overlap'].support !== 'later')
is('a rule carried out is shown', ruleShown('habits', 'daily'), true)
is('a built module’s rules are all shown', ruleShown('u_abcdef12', 'remind'), true)
is('every shown built-in rule has a note', shown.every((k) => BUILTIN_RULES[k].note.length > 10), true)

if (fail) { console.log(`\n${fail} visibility check(s) failed`); process.exit(1) }
console.log('\nall visibility checks passed')
