/** The + menu's top items outside the app (NAV-24, WID-11), with no React
 *  and no plugin (checked in src/test/quickadd.check.mjs): the launcher
 *  shortcuts and the quick-add widget offer the same few entries the round +
 *  shows first, in the same order, and each opens that entry's sheet through
 *  a link the app routes: app.visuma.planner://open/?add=<entry key>. */

/** One entry as the phone shows it. `short` fits a launcher shortcut and a
 *  widget button (about ten letters); `label` is the + menu's own. */
export interface QuickAddItem { key: string; label: string; short: string }

/** Launchers show four shortcuts at most before scrolling, and four buttons
 *  fill a 4-cell widget. */
export const QUICK_ADD_SIZE = 4

/** The + menu's entry keys: task, inbox, food, event, m:<module>. */
const KEY = /^[a-z0-9_:-]{1,60}$/

/** Short names where the + menu's label is too long for a shortcut, chosen so
 *  two entries never read the same ("Task to Inbox" is not "Task"). */
const SHORT: Record<string, string> = {
  inbox: 'Inbox',
  'm:shopping': 'Shopping',
  'm:sleep': 'Sleep',
  'm:training': 'Training',
  'm:learning': 'Study',
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** A name of ten letters or fewer for the launcher and the widget. */
export function shortLabel(key: string, label: string): string {
  if (SHORT[key]) return SHORT[key]
  const l = clean(label)
  if (l.length <= 10) return l
  const first = l.split(' ')[0]
  return first.length >= 3 && first.length <= 10 ? first : `${l.slice(0, 9)}…`
}

/** The first few entries the + menu shows, as the phone keeps them. `shown`
 *  is arrangeAdd's list: the person's order (or most used first), hidden
 *  entries and switched-off modules already left out. */
export function quickAddItems(shown: { key: string; label: string }[], size = QUICK_ADD_SIZE): QuickAddItem[] {
  const out: QuickAddItem[] = []
  const seen = new Set<string>()
  for (const e of shown) {
    if (out.length >= size) break
    if (!KEY.test(e.key) || seen.has(e.key)) continue
    const label = clean(e.label).slice(0, 40) || 'Add'
    seen.add(e.key)
    out.push({ key: e.key, label, short: shortLabel(e.key, label) })
  }
  return out
}

/** The link a shortcut or widget button opens. */
export const addLink = (key: string) => `app.visuma.planner://open/?add=${encodeURIComponent(key)}`

/** The entry an ?add= parameter names, or null for anything that is not one. */
export function addKeyFrom(value: string | null | undefined): string | null {
  if (!value) return null
  return KEY.test(value) ? value : null
}

/** What the phone shows before the app has said: the + menu's own first
 *  entries for a new profile. Kept in step with QuickAdd.java's DEFAULTS. */
export const QUICK_ADD_DEFAULT: QuickAddItem[] = quickAddItems([
  { key: 'task', label: 'Task' },
  { key: 'inbox', label: 'Task to Inbox' },
  { key: 'food', label: 'Food' },
  { key: 'event', label: 'Event' },
])
