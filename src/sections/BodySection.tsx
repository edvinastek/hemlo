import { WeighIn } from './WeighIn'
import { Habits } from './Habits'
import { Supplements } from './Supplements'

/** Today's Body tab: the weigh-in and targets, then the day's habits and
 *  supplements. Each part lives in its own file. */
export function BodySection({ profileId, day }: { profileId: string; day: string }) {
  return (
    <>
      <WeighIn profileId={profileId} day={day} />
      <Habits profileId={profileId} day={day} />
      <Supplements profileId={profileId} day={day} />
    </>
  )
}
