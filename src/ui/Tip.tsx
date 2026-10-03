import { useEffect, useId, useState } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { dismissTip, tipById, tipShows } from '../lib/tips-rules'
import { claimTip, saveTipState, tipPlaceFree, tipState, useTipState } from '../lib/tips'
import './tip.css'

const today = () => format(new Date(), 'yyyy-MM-dd')

/** A tip (ONB-13, CALM-14): one slim line with ×, where it helps:
 *  `<Tip id="first-hold" />`. At most one shows in a session, app-wide, and
 *  once it has shown it never comes back; Settings → Reminders and tips →
 *  Show tips again brings them all back. Ids are in tips-rules.ts. */
export function Tip({ id }: { id: string }) {
  const s = useTipState()
  const owner = useId()
  const tip = tipById(id)
  // Decided once, when the tip first draws: it keeps its place while it is
  // on screen even though it counts as seen from that moment.
  const [mine] = useState(() => !!tip && tipShows(id, s, today()) && claimTip(id, owner))
  const [closed, setClosed] = useState(false)
  useEffect(() => { if (mine) saveTipState(dismissTip(tipState(), id)) }, [mine, id])
  if (!mine || closed || !tip) return null
  return (
    <aside className="tip" aria-label="Tip" role="note">
      <p>
        {tip.text}
        {id === 'make-yours' && <> <Link className="tip-go" to="/more?page=looks" onClick={() => setClosed(true)}>Open Looks</Link></>}
      </p>
      <button type="button" className="tip-close" aria-label="Close tip" onClick={() => setClosed(true)}>×</button>
    </aside>
  )
}

/** Of several tips, the first that is still to be seen and may show now.
 *  The choice is kept, so the tip does not change under the person once
 *  the first one counts as seen. */
export function FirstTip({ ids }: { ids: string[] }) {
  const s = useTipState()
  const [chosen, setChosen] = useState<string | null>(null)
  const candidate = ids.find((x) => tipShows(x, s, today()) && tipPlaceFree(x)) ?? null
  useEffect(() => { if (!chosen && candidate) setChosen(candidate) }, [chosen, candidate])
  return chosen ? <Tip id={chosen} /> : null
}
