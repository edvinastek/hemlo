import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useApp } from './store'
import { readSettings, type NavSettings } from './settings'
import { pageList, type PageList } from './pages-rules'

export type { PageInfo, PageList } from './pages-rules'
export { pageForPath, pageAllowed, neighbour, FIXED_PAGES } from './pages-rules'

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
