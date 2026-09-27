import { WeighIn } from './WeighIn'
import { Habits } from './Habits'
import { Supplements } from './Supplements'
import type { BodyPart } from '../lib/day-tabs'

const ALL: BodyPart[] = ['health', 'habits', 'supplements']

/** Today's Body tab: the weigh-in and targets, then the day's habits and
 *  supplements. Only the parts the day has are shown (day-tabs.ts decides);
 *  each part lives in its own file. */
export function BodySection({ profileId, day, parts = ALL }: { profileId: string; day: string; parts?: BodyPart[] }) {
  return (
    <>
      {parts.includes('health') && <WeighIn profileId={profileId} day={day} />}
      {parts.includes('habits') && <Habits profileId={profileId} day={day} />}
      {parts.includes('supplements') && <Supplements profileId={profileId} day={day} />}
    </>
  )
}
