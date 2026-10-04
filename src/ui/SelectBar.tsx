import { useEffect, useState, type ReactNode } from 'react'
import { countWords, deleteNeedsAsk } from '../lib/selection-rules'
import './books.css'

/** The bar at the bottom of a list in select mode: how many are ticked,
 *  "Select all shown", Done, and what can be done with the ticked rows. It
 *  sticks to the bottom of the page, above the page bar. While it is up the
 *  round add button is hidden, so it never sits over an action.
 *
 *  With useSelection (src/ui/useSelection.ts) it takes one spread:
 *  `<SelectBar {...sel.bar(shown, 'tasks')}>…actions…</SelectBar>`. */
export function SelectBar({ count, noun, allShown, anyShown, onAll, onDone, status = null, children }: {
  count: number
  /** "recipes", "foods": the plural; one is said as "recipe". */
  noun: string
  /** Every row on screen is ticked already. */
  allShown: boolean
  anyShown: boolean
  onAll: () => void
  onDone: () => void
  /** What the last action did, read out to screen readers. */
  status?: { text: string; bad?: boolean } | null
  children: ReactNode
}) {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('is-selecting')
    return () => root.classList.remove('is-selecting')
  }, [])

  const [count0, ...rest] = countWords(count, noun).split(' ')
  return (
    <div className="sb-bar" role="region" aria-label="Selected rows" data-no-swipe>
      <div className="sb-top">
        <span className="sb-count" aria-live="polite"><b>{count0}</b> {rest.join(' ')}</span>
        <button type="button" className="slot-link" onClick={onAll} disabled={!anyShown}>
          {allShown ? 'Clear shown' : 'Select all shown'}
        </button>
        <button type="button" className="btn sb-done" onClick={onDone}>Done</button>
      </div>
      <div className="sb-actions">{children}</div>
      <p className={`sb-status${status?.bad ? ' is-bad' : ''}`} role="status">{status?.text ?? ''}</p>
    </div>
  )
}

/** One action on the ticked rows: off while none is ticked. */
export function SelectAction({ count, onClick, children }: { count: number; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="btn" disabled={count === 0} onClick={onClick}>{children}</button>
}

/** Delete, always last in the bar (GEN-53). One row goes at once, with Undo;
 *  several ask once more on the same button ("Delete 4? Tap again"). */
export function SelectDelete({ count, onDelete, label = 'Delete' }: { count: number; onDelete: () => void; label?: string }) {
  const [sure, setSure] = useState(false)
  // A new choice of rows asks again.
  useEffect(() => { setSure(false) }, [count])
  return (
    <button type="button" className="btn sb-delete" disabled={count === 0} onBlur={() => setSure(false)}
      onClick={() => {
        if (!sure && deleteNeedsAsk(count)) { setSure(true); return }
        setSure(false)
        onDelete()
      }}>
      {sure ? `${label} ${count}? Tap again` : label}
    </button>
  )
}
