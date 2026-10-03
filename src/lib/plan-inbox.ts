import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useApp } from './store'
import { inbox } from './day-items-rules'

/** How many tasks wait in the Inbox (no day yet). Since v17 Today no longer
 *  carries an Inbox pill; the count is on Plan's Inbox tab and in Today's ⋮,
 *  and this hook is there for a badge on Plan's item in the page bar. */
export function useInboxCount(): number {
  const profileId = useApp((s) => s.profile?.id ?? null)
  return useLiveQuery(async () => {
    if (!profileId) return 0
    const rows = await db.task.where('profile_id').equals(profileId).filter((t) => !t.planned_date).toArray()
    return inbox(rows).length
  }, [profileId], 0) ?? 0
}
