import { WeighIn } from './WeighIn'
import type { BodyPart } from '../lib/day-tabs'

const ALL: BodyPart[] = ['health', 'habits', 'supplements']

/** What only Today's Body tab has: the weigh-in and the targets. The day's
 *  habits and supplements are items on the rail beside it (the tab filters
 *  the one list to them), so they are never drawn twice on Today
 *  (competitor review 5.1 #2); their history lives on their own pages. */
export function BodySection({ profileId, day, parts = ALL }: { profileId: string; day: string; parts?: BodyPart[] }) {
  return parts.includes('health') ? <WeighIn profileId={profileId} day={day} /> : null
}
