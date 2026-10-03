import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { edit } from './write'
import { useApp } from './store'
import { ensureInstance, instanceFor } from '../modules/defs'
import { readTodayPrefs, DEFAULT_TODAY_PREFS, type TodayPrefs } from './today-prefs-rules'

/** Today's choices (layout, the + menu) in the core module's settings, under
 *  "today". Other parts of the app keep their own keys in the same row, so a
 *  write re-reads the row and changes only this key. Rules: today-prefs-rules.ts. */

const KEY = 'today'

export async function loadTodayPrefs(profileId: string): Promise<TodayPrefs> {
  const row = await instanceFor(profileId, 'core')
  return readTodayPrefs(row?.settings?.[KEY])
}

export function useTodayPrefs(): TodayPrefs {
  const profileId = useApp((s) => s.profile?.id ?? null)
  return useLiveQuery(async () => (profileId ? loadTodayPrefs(profileId) : DEFAULT_TODAY_PREFS), [profileId], DEFAULT_TODAY_PREFS)
    ?? DEFAULT_TODAY_PREFS
}

/** Changes some of Today's choices; the rest stay. Local first, then synced. */
export async function saveTodayPrefs(profileId: string, change: (now: TodayPrefs) => TodayPrefs): Promise<void> {
  const inst = await ensureInstance(profileId, 'core', true)
  const row = (await db.module_instance.get(inst.id)) ?? inst
  const next = change(readTodayPrefs(row.settings?.[KEY]))
  await edit('module_instance', row, { settings: { ...(row.settings ?? {}), [KEY]: next } })
}
