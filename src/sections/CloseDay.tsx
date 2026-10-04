import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { flexibleSeriesIds } from '../lib/series'
import { carry } from '../lib/rail-actions'
import { withBusy } from '../lib/busy'
import { addDays } from '../lib/review-rules'
import { closePlan, closeWords, leftToday, whyStays, type CloseTarget } from '../lib/close-day-rules'
import type { Task } from '../lib/types'
import { useBackClose } from '../ui/useBackClose'
import { offerUndo } from '../ui/Undo'
import './planday.css'

/** Close the day (TOD-23): today's unfinished tasks, moved to tomorrow or
 *  the Inbox in one go, or one by one. Locked and fixed tasks, planned meals
 *  and flexible repeats stay, each with a short note; a repeat cannot go to
 *  the Inbox. Every move has an Undo. From the evening review and Today's
 *  ⋮. Back and Escape close it. */
export function CloseDay({ profileId, day, onClose }: { profileId: string; day: string; onClose: () => void }) {
  useBackClose(onClose)
  const [busy, setBusy] = useState(false)
  const data = useLiveQuery(async () => {
    const rows = await db.task.where('[profile_id+planned_date]').equals([profileId, day]).toArray()
    return { left: leftToday(rows, profileId, day), flexible: await flexibleSeriesIds(profileId) }
  }, [profileId, day])
  if (!data) return null
  const { left, flexible } = data
  const toTomorrow = closePlan(left, 'tomorrow', flexible)
  const toInbox = closePlan(left, 'inbox', flexible)

  async function move(list: Task[], target: CloseTarget, stayed: number, all: boolean) {
    if (busy || list.length === 0) return
    setBusy(true)
    try {
      const undo = await carry(list, target, day)
      const words = closeWords(list, target, stayed)
      // A busy all-day event tomorrow is said with the Undo (AGN-07).
      offerUndo(target === 'tomorrow' ? await withBusy(words, profileId, [addDays(day, 1)]) : words, undo)
      if (all) onClose()
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet pd-sheet" role="dialog" aria-modal="true" aria-labelledby="cd-title" data-no-swipe>
        <h2 id="cd-title">Close the day</h2>
        {left.length === 0 ? (
          <p className="pd-empty">Nothing left today.</p>
        ) : (
          <ul className="pd-list">
            {left.map((t) => {
              const stays = whyStays(t, 'tomorrow', flexible)
              const inbox = !whyStays(t, 'inbox', flexible)
              return (
                <li key={t.id} className="pd-row">
                  <span className="pd-main">
                    <span className="pd-name">{t.title || 'Untitled task'}</span>
                    <span className="pd-meta">{[t.planned_time?.slice(0, 5), t.duration_min ? `${t.duration_min} min` : null, stays ? `${stays}, stays` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  {!stays && (
                    <span className="pd-choice">
                      <button type="button" className="chip pd-chip" disabled={busy} onClick={() => void move([t], 'tomorrow', 0, false)}>Tomorrow</button>
                      {inbox && <button type="button" className="chip pd-chip" disabled={busy} onClick={() => void move([t], 'inbox', 0, false)}>Inbox</button>}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          {toInbox.move.length > 0 && (
            <button type="button" className="btn" disabled={busy}
              onClick={() => void move(toInbox.move, 'inbox', toInbox.stay.length, true)}>Move all to Inbox</button>
          )}
          {toTomorrow.move.length > 0 && (
            <button type="button" className="btn btn-primary pd-wide" disabled={busy}
              onClick={() => void move(toTomorrow.move, 'tomorrow', toTomorrow.stay.length, true)}>Move all to tomorrow</button>
          )}
        </div>
      </div>
    </>
  )
}
