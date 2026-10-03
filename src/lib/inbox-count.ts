import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useApp } from './store'
import { inbox } from './day-items-rules'

/** How many tasks wait in the Inbox (no day yet), live, for the small count
 *  on Plan in the page bar (v17, CALM-04). Read with the same rule as the
 *  Inbox itself, so the two never disagree. Only the dayless tasks are read. */
export function useInboxCount(): number {
  const profileId = useApp((s) => s.profile?.id ?? null)
  return useLiveQuery(async () => {
    if (!profileId) return 0
    const rows = await db.task.where('profile_id').equals(profileId).filter((t) => !t.planned_date).toArray()
    return inbox(rows).length
  }, [profileId], 0)
}
