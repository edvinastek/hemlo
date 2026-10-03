import { MAX_WEEK_DAYS } from '../../lib/plan-view-rules'
import { useBackClose } from '../../ui/useBackClose'

/** "Days shown…" from Week's ⋮ (PLN-03): 1 to 14 days, one tap. It used to
 *  be a choice on the page itself; it is set once, so it lives a step down
 *  (CALM-03). */
export function DaysShownSheet({ value, onPick, onClose }: { value: number; onPick: (n: number) => void; onClose: () => void }) {
  useBackClose(onClose)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet cs-sheet" role="dialog" aria-modal="true" aria-labelledby="pd-title">
        <h2 id="pd-title">Days shown in the week</h2>
        <div className="pd-days" role="group" aria-label="Days shown">
          {Array.from({ length: MAX_WEEK_DAYS }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className="cs-chip" aria-pressed={n === value} autoFocus={n === value}
              aria-label={n === 1 ? '1 day' : `${n} days`} onClick={() => { onPick(n); onClose() }}>{n}</button>
          ))}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn grow" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  )
}
