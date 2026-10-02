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
