import { useEffect, useState, type CSSProperties } from 'react'
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

/** Where the bar goes while a bottom sheet is open: the sheet's top edge,
 *  in pixels from the top of the window, or null with no sheet. */
function useSheetTop(active: boolean): number | null {
  const [top, setTop] = useState<number | null>(null)
  useEffect(() => {
    if (!active) { setTop(null); return }
    const place = () => {
      const sheets = [...document.querySelectorAll<HTMLElement>('.bottom-sheet')]
      const next = sheets.length ? Math.round(Math.min(...sheets.map((el) => el.getBoundingClientRect().top))) : null
      setTop((t) => (t === next ? t : next))
    }
    place()
    // A sheet opening, closing or growing while the bar shows moves it.
    const watch = new MutationObserver(place)
    watch.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', place)
    const id = window.setInterval(place, 400)
    return () => { watch.disconnect(); window.removeEventListener('resize', place); window.clearInterval(id) }
  }, [active])
  return top
}

/** Room the bar needs above a sheet: its height and a gap each side. */
const BAR_ROOM = 48 + 16

/** The bar, mounted once (App.tsx). It sits above the page bar and to the
 *  left of the round + button, so it never covers either. While a bottom
 *  sheet is open it moves above the sheet, so it never covers the sheet's
 *  buttons (Save, Close): just over the sheet's top edge when there is
 *  room, else at the top of the screen. */
export function UndoBar() {
  const offer = useUndo((s) => s.offer)
  const busy = useUndo((s) => s.busy)
  const sheetTop = useSheetTop(!!offer)

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
      <div className={`undo-bar${sheetTop !== null ? ' is-over-sheet' : ''}`} role="status" style={placeOver(sheetTop)}>
        <span className="undo-label">{offer.label}</span>
        <button type="button" className="undo-btn" disabled={busy} onClick={() => void run()}>Undo</button>
        <button type="button" className="undo-close" aria-label="Dismiss" onClick={clearUndo}>×</button>
      </div>
    </div>
  )
}

/** The bar's place over an open sheet: its bottom 8 px above the sheet's
 *  top, or at the top of the screen when the sheet leaves too little room. */
function placeOver(sheetTop: number | null): CSSProperties | undefined {
  if (sheetTop === null) return undefined
  if (sheetTop >= BAR_ROOM + 24) return { bottom: `calc(100% - ${sheetTop - 8}px)`, top: 'auto' }
  return { top: 'calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 8px)', bottom: 'auto' }
}
