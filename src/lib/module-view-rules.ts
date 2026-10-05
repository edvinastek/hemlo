/** Where each module shows itself, chosen per module by the person (GEN-03).
 *  A module that is switched off shows nowhere, whatever these say; these
 *  only decide where a module that is on appears. Pure. */

export interface ModuleView {
  /** Its items (due habits, chores, planned sessions…) on Today's list. */
  today: boolean
  /** Its items on Plan's Day, Week, Month and Year views. */
  plan: boolean
  /** Its items on the home-screen Today widget. */
  widget: boolean
  /** A card for it on the Stats page and its measures in the stats builder. */
  stats: boolean
  /** Reminders for its timed items (the device's reminder switch must be on too). */
  reminders: boolean
}

const ALL_ON: ModuleView = { today: true, plan: true, widget: true, stats: true, reminders: true }

/** What a module does before the person changes anything. Everything is
 *  shown: the person switched the module on, so they want to see it. Stats
 *  shows nothing of itself on the planner. */
export function defaultView(moduleKey: string): ModuleView {
  if (moduleKey === 'stats' || moduleKey === 'core') return { today: false, plan: false, widget: false, stats: false, reminders: false }
  return { ...ALL_ON }
}

const KEY = /^[a-z0-9_]{1,40}$/

/** Stored choices, checked: unknown modules and non-booleans are dropped,
 *  missing switches take the module's default. */
export function readModuleViews(v: unknown): Record<string, Partial<ModuleView>> {
  const out: Record<string, Partial<ModuleView>> = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!KEY.test(k) || !x || typeof x !== 'object') continue
    const m: Partial<ModuleView> = {}
    for (const f of ['today', 'plan', 'widget', 'stats', 'reminders'] as (keyof ModuleView)[]) {
      const b = (x as Record<string, unknown>)[f]
      if (typeof b === 'boolean') m[f] = b
    }
    if (Object.keys(m).length) out[k] = m
  }
  return out
}

/** The effective switches for one module. */
export function moduleView(views: Record<string, Partial<ModuleView>>, moduleKey: string): ModuleView {
  return { ...defaultView(moduleKey), ...(views[moduleKey] ?? {}) }
}

/* ---------- the one "is this module on" rule (GEN-01) ---------------------- */

/** What the rule needs from a module_instance row and from a module someone
 *  built (a `module` row). */
export interface SwitchRow { module_key: string; enabled: boolean }
export interface BuiltRow { key: string; builtin?: boolean; deleted_at?: string | null }

const BUILT = /^u_[a-z0-9]{6,24}$/

/** The modules switched on, as a set of keys. THE rule every screen, list,
 *  menu, tab, picker, search source, Stats card, widget row, export list and
 *  colour list goes by (GEN-01):
 *  - a module counts as on only when its switch row says so; a profile with
 *    no row for a module has never switched it on;
 *  - a module someone built must also still exist (not deleted), so a tab or
 *    a menu never leads to a page that is gone. */
export function modulesOn(rows: SwitchRow[], built: BuiltRow[]): Set<string> {
  const live = new Set(built.filter((m) => !m.builtin && !m.deleted_at).map((m) => m.key))
  const on = new Set<string>()
  for (const r of rows) {
    if (!r.enabled) continue
    if (BUILT.test(r.module_key) && !live.has(r.module_key)) continue
    on.add(r.module_key)
  }
  return on
}

/* ---------- the switches, as the person sees them (GEN-03) ----------------- */

export type ViewSwitch = keyof ModuleView

/** The five switches, in the order Edit module shows them, with what each
 *  one does in plain words. */
export const VIEW_SWITCHES: { key: ViewSwitch; label: string; hint: string }[] = [
  { key: 'today', label: 'Show on Today', hint: 'Its items appear in Today’s list on the days they are due.' },
  { key: 'plan', label: 'Show on Plan', hint: 'Its items appear on Plan’s day, week, month and year.' },
  { key: 'widget', label: 'Show on the widget', hint: 'Its items appear on the Today widget on the home screen.' },
  { key: 'stats', label: 'Count in Stats', hint: 'It has a card on Stats, and its figures can go in a chart.' },
  { key: 'reminders', label: 'Send reminders', hint: 'Its timed items remind you, when reminders are on for this device.' },
]

/** The switches this app shows: "Show on the widget" only where there are
 *  home-screen widgets (the Android app; a browser too, as the switch is the
 *  account's and works on the person's Android phone). The iPhone app has no
 *  widget yet, so it leaves the switch out and its value untouched. */
export function switchesHere(widgets: boolean) {
  return widgets ? VIEW_SWITCHES : VIEW_SWITCHES.filter((s) => s.key !== 'widget')
}

/** Modules whose switches mean nothing: the planner itself, and Stats, which
 *  shows the others rather than items of its own. */
export const hasSwitches = (moduleKey: string) => moduleKey !== 'core' && moduleKey !== 'stats' && moduleKey !== 'custom'

/** A change of one switch, as the value to merge into settings.module_views. */
export function switchChange(moduleKey: string, key: ViewSwitch, on: boolean): Record<string, Partial<ModuleView>> {
  return { [moduleKey]: { [key]: on } }
}

/** Every module's switches set back to what a template wants: the defaults
 *  with the template's own choices laid over them. Modules the template does
 *  not mention get their defaults, so starting again from a template leaves
 *  no switch of the old layout behind. */
export function templateViews(keys: string[], overrides: Record<string, Partial<ModuleView>> = {}): Record<string, Partial<ModuleView>> {
  const out: Record<string, Partial<ModuleView>> = {}
  for (const k of keys) out[k] = { ...defaultView(k), ...(overrides[k] ?? {}) }
  return out
}

/** One line for a module's row: where it shows, or that it shows nowhere
 *  but its own page. */
export function describeView(v: ModuleView, widgets = true): string {
  const places = [v.today && 'Today', v.plan && 'Plan', widgets && v.widget && 'widget'].filter(Boolean) as string[]
  const where = places.length ? `On ${places.join(', ').replace(/, ([^,]*)$/, ' and $1')}` : 'Only on its own page'
  const extra = [v.stats ? 'in Stats' : '', v.reminders ? 'reminders' : ''].filter(Boolean)
  return extra.length ? `${where} · ${extra.join(', ')}` : where
}
