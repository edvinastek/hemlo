import { useEffect } from 'react'
import { create } from 'zustand'
import './undo.css'

/** Undo for 8 seconds after a delete, drag, swap, move, copy or bulk action
 *  (GEN-54). Anything can offer one: `offerUndo('Task deleted', () => …)`.
 *  A newer offer replaces the one showing, as on Android's own snackbars. */

const SHOW_MS = 8000

interface UndoOffer { id: number; label: string; undo: () => unknown }
interface UndoState { offer: UndoOffer | null; busy: boolean }

const useUndo = create<UndoState>(() => ({ offer: null, busy: false }))
let next = 1

export function offerUndo(label: string, undo: () => unknown) {
  useUndo.setState({ offer: { id: next++, label, undo }, busy: false })
}

export function clearUndo() {
  useUndo.setState({ offer: null, busy: false })
}

/** The bar, mounted once (App.tsx). It sits above the page bar and to the
 *  left of the round + button, so it never covers either. */
export function UndoBar() {
  const offer = useUndo((s) => s.offer)
  const busy = useUndo((s) => s.busy)

  useEffect(() => {
    if (!offer) return
    const t = window.setTimeout(() => {
      if (useUndo.getState().offer?.id === offer.id) clearUndo()
    }, SHOW_MS)
    return () => window.clearTimeout(t)
  }, [offer])

  if (!offer) return <div className="undo-live" aria-live="polite" />

  async function run() {
    if (!offer || busy) return
    useUndo.setState({ busy: true })
    try {
      await offer.undo()
    } finally {
      if (useUndo.getState().offer?.id === offer.id) clearUndo()
    }
  }

  return (
    <div className="undo-live" aria-live="polite">
      <div className="undo-bar" role="status">
        <span className="undo-label">{offer.label}</span>
        <button type="button" className="undo-btn" disabled={busy} onClick={() => void run()}>Undo</button>
        <button type="button" className="undo-close" aria-label="Dismiss" onClick={clearUndo}>×</button>
      </div>
    </div>
  )
}
