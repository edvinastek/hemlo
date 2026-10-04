import { useState, type FormEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { choresFor } from '../lib/chores'
import { cachedMembers } from '../lib/household'
import { nextSortOrder } from '../lib/tracking-rules'
import { supplementSlots } from '../lib/tracking'
import { addItem, matchTyped } from '../lib/shopping'
import { parseItem } from '../lib/shopping-rules'
import { HabitSheet } from '../sections/Habits'
import { ChoreSheet } from '../sections/Chores'
import { SupplementSheet } from '../sections/Supplements'
import { WeighIn } from '../sections/WeighIn'
import { offerUndo } from './Undo'
import { useBackClose } from './useBackClose'

/** The add sheets the round + opens in place (HAB-22, decision #4 of the
 *  competitor review): a habit, a chore, a supplement, a weigh-in and a
 *  shopping item, each the same sheet its own page opens, so adding one is
 *  one tap from Today or Plan and not a trip to the page. The + menu closes
 *  first: never a sheet on a sheet (CALM-10). Back and Escape close each. */
export type QuickAdd = 'habit' | 'chore' | 'supplement' | 'weighin' | 'shopping'

export function QuickAddSheet({ what, day, onClose }: { what: QuickAdd; day: string; onClose: () => void }) {
  // The module sheets close on Escape themselves; Back is added here.
  useBackClose(onClose)
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  if (what === 'habit') return <QuickHabit profileId={profile.id} today={day} onClose={onClose} />
  if (what === 'chore') return <QuickChore householdId={profile.household_id} profileId={profile.id} today={day} onClose={onClose} />
  if (what === 'supplement') return <QuickSupplement profileId={profile.id} today={day} onClose={onClose} />
  if (what === 'weighin') {
    return (
      <PlainSheet label="Weigh-in" onClose={onClose} done>
        <WeighIn profileId={profile.id} day={day} history={false} />
      </PlainSheet>
    )
  }
  return <QuickShopItem onClose={onClose} />
}

function QuickHabit({ profileId, today, onClose }: { profileId: string; today: string; onClose: () => void }) {
  const order = useLiveQuery(async () => nextSortOrder((await db.habit.where('profile_id').equals(profileId).toArray()).filter((h) => !h.deleted_at)), [profileId])
  if (order === undefined) return null
  return <HabitSheet profileId={profileId} habit={null} today={today} nextOrder={order} onClose={onClose} />
}

function QuickChore({ householdId, profileId, today, onClose }: { householdId: string; profileId: string; today: string; onClose: () => void }) {
  const userId = useApp((s) => s.session?.user.id ?? null)
  const data = useLiveQuery(async () => ({ chores: await choresFor(householdId), members: await cachedMembers(householdId) }), [householdId, profileId])
  if (!data) return null
  return (
    <ChoreSheet householdId={householdId} chore={null} chores={data.chores} members={data.members} userId={userId}
      today={today} nextOrder={nextSortOrder(data.chores)} onClose={onClose} />
  )
}

function QuickSupplement({ profileId, today, onClose }: { profileId: string; today: string; onClose: () => void }) {
  const data = useLiveQuery(async () => ({
    slots: await supplementSlots(profileId),
    order: nextSortOrder((await db.supplement.where('profile_id').equals(profileId).toArray()).filter((x) => !x.deleted_at && x.active)),
  }), [profileId])
  if (!data) return null
  return <SupplementSheet profileId={profileId} supplement={null} slots={data.slots} today={today} nextOrder={data.order} onClose={onClose} />
}

/** One line, the way the shopping list's own field takes it: "2 kg apples",
 *  "6 eggs", "toilet paper". It goes on the main list, matched to a food
 *  when one has that name; Undo takes it off. */
function QuickShopItem({ onClose }: { onClose: () => void }) {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = parseItem(text)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile || !parsed || busy) return
    setBusy(true)
    try {
      const food = await matchTyped(profile.household_id, userId, parsed.name)
      const r = await addItem(profile, { ...parsed, food_id: food?.id ?? null, list: null })
      offerUndo(r.merged ? `More ${parsed.name} on the list` : `${parsed.name} on the list`, r.undo)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <PlainSheet label="Shopping item" onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => void save(e)}>
        <label>What to buy
          <input className="serif" value={text} onChange={(e) => setText(e.target.value)} placeholder="2 kg apples" autoFocus
            autoComplete="off" enterKeyHint="done" maxLength={140} />
        </label>
        <div className="sheet-actions">
          <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary grow" disabled={!parsed || busy}>Add to the list</button>
        </div>
      </form>
    </PlainSheet>
  )
}

/** A bottom sheet with a title and a Close, for what has no sheet of its own. */
function PlainSheet({ label, onClose, children, done }: { label: string; onClose: () => void; children: ReactNode; done?: boolean }) {
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={label} data-no-swipe>
        <h2>{label}</h2>
        {children}
        {done && (
          <div className="sheet-actions">
            <button type="button" className="btn grow" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </>
  )
}
