import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useApp } from './store'
import { readSettings, type NavSettings } from './settings'
import { countUse, pageList, type PageList } from './pages-rules'

export type { PageInfo, PageList } from './pages-rules'
export { pageForPath, pageAllowed, neighbour, FIXED_PAGES, MODULES_PAGE } from './pages-rules'

export interface Pages extends PageList {
  nav: NavSettings
}

/** The open profile's pages, live: switching a module on or off in More, or
 *  a change arriving from another device, reshapes the bar at once.
 *  Undefined until the local copy has answered, so nothing redirects away
 *  from a page before it is known whether that page exists. */
export function usePages(): Pages | undefined {
  const profile = useApp((s) => s.profile)
  const data = useLiveQuery(async () => {
    if (!profile) return null
    const [instances, built] = await Promise.all([
      db.module_instance.where('profile_id').equals(profile.id).toArray(),
      db.module.toArray(),
    ])
    return { instances, built }
  }, [profile?.id], undefined)
  if (!profile || !data) return undefined
  const nav = readSettings(profile).nav
  return { ...pageList(data.instances, data.built, nav), nav }
}

/* ---------- how often each page is opened, on this device ------------------ */

// The name from before Hemlo, kept: renaming it would lose what is stored under it.
const USES_KEY = 'getit-page-uses'
type Uses = Record<string, number>
const listeners = new Set<() => void>()

function readUses(): Uses {
  try {
    const raw = JSON.parse(localStorage.getItem(USES_KEY) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw as Record<string, unknown>)
      .filter(([k, v]) => /^[a-z0-9_:]{1,44}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0)) as Uses
  } catch { return {} }
}

/** A page was opened: counted for the Modules page's "most used first"
 *  (NAV-20). Kept on this device only: it is a convenience, not data, and
 *  a private window or cleared storage simply starts the count again. */
export function noteUse(key: string) {
  try { localStorage.setItem(USES_KEY, JSON.stringify(countUse(readUses(), key))) } catch { /* not kept: fine */ }
  listeners.forEach((fn) => fn())
}

/** The counts, kept current while a screen shows them. */
export function useUses(): Uses {
  const [uses, setUses] = useState<Uses>(readUses)
  useEffect(() => {
    const fn = () => setUses(readUses())
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  return uses
}
