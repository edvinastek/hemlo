import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { dismissTip, tipById, tipShows } from '../lib/tips-rules'
import { saveTipState, useTipState } from '../lib/tips'
import './tip.css'

/** A tip shown once, where it is useful (ONB-13): `<Tip id="first-hold" />`.
 *  It goes for good with "Got it"; Settings → Reminders → Tips brings them
 *  all back. Anyone may place one; ids are in tips-rules.ts. */
export function Tip({ id }: { id: string }) {
  const s = useTipState()
  const tip = tipById(id)
  if (!tip || !tipShows(id, s, format(new Date(), 'yyyy-MM-dd'))) return null
  return (
    <aside className="tip" aria-label="Tip" role="note">
      <p>{tip.text}</p>
      <div className="tip-actions">
        {id === 'make-yours' && <Link className="tip-go" to="/more?section=Looks" onClick={() => saveTipState(dismissTip(s, id))}>Open Looks</Link>}
        <button type="button" className="tip-ok" onClick={() => saveTipState(dismissTip(s, id))}>Got it</button>
      </div>
    </aside>
  )
}

/** Of several tips, the first that is still to be seen: one at a time, so
 *  a page never opens under a pile of them. */
export function FirstTip({ ids }: { ids: string[] }) {
  const s = useTipState()
  const today = format(new Date(), 'yyyy-MM-dd')
  const id = ids.find((x) => tipShows(x, s, today))
  return id ? <Tip id={id} /> : null
}
