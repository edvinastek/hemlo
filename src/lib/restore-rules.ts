/** What a backup brings back to the profile it is read into (SET-06,
 *  DATA-06). Pure. The file holds the profile row whole; a restore used to
 *  take only the body fields and drop the settings, country and city, so
 *  note templates, saved stats views, looks, pinned cards and where each
 *  module shows were lost. Now they come back. */
import { readSettings, type ProfileSettings } from './settings.ts'
import { cleanCity, cleanCountry } from './countries.ts'

/** Profile fields a restore carries over. Ids, the household and the default
 *  flag belong to the account the file is read into, not the one it came from. */
export const PROFILE_FIELDS = ['name', 'sex', 'birth_date', 'height_cm', 'activity_level', 'goal', 'timezone', 'day_start', 'day_end', 'ai_persona_name'] as const

/** The changes to make to the open profile. `remap` turns ids from another
 *  account into this one's (a book's recipes, a built module's key in a
 *  stats view). The settings are the file's, checked; the person is already
 *  set up here, so a restore never sends them back through the first run. */
export function restoredProfile(
  source: Record<string, unknown>, current: { settings?: unknown }, remap: (v: unknown) => unknown = (v) => v,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of PROFILE_FIELDS) if (f in source) out[f] = source[f]
  if ('country' in source) out.country = cleanCountry(source.country as string | null)
  if ('city' in source) out.city = cleanCity(source.city as string | null)
  if (source.settings && typeof source.settings === 'object') {
    const was = readSettings({ settings: current.settings as Partial<ProfileSettings> | null })
    const raw = remap(source.settings) as Record<string, unknown>
    // Settings kept per module are keyed by the module: a built module read
    // into another account has a new key, and its settings follow it.
    const rekey = (o: unknown) => (o && typeof o === 'object' && !Array.isArray(o)
      ? Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, v]) => [String(remap(k)), v])) : o)
    const colours = raw.colours as Record<string, unknown> | undefined
    const keyed = { ...raw, module_views: rekey(raw.module_views), ...(colours ? { colours: { ...colours, modules: rekey(colours.modules) } } : {}) }
    const file = readSettings({ settings: keyed as Partial<ProfileSettings> })
    out.settings = { ...file, onboarded: file.onboarded || was.onboarded }
  }
  return out
}
