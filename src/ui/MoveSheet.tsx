import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Warning } from '../lib/reorder-rules'
import { useBackClose } from './useBackClose'
import './move.css'

interface Props {
  title: string
  /** What will happen, one line each. */
  lines?: ReactNode[]
  warnings: Warning[]
  /** The button's word when there is nothing to warn about: "Move", "Swap". */
  action: string
  /** Nothing would happen: only a Close button. */
  nothing?: boolean
  onConfirm: () => Promise<unknown> | void
  onClose: () => void
}

/** The small sheet that asks before a move: what moves, and anything worth
 *  a second look (locked, fixed, work hours, a clash). Cancel is always
 *  there; the other button says "anyway" when there is a warning, so it is
 *  never pressed without reading. */
export function MoveSheet({ title, lines = [], warnings, action, nothing, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => { first.current?.focus() }, [])
  // Back and Escape are Cancel.
  useBackClose(onClose)

  async function go() {
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
    onClose()
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet move-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {lines.length > 0 && (
          <ul className="move-lines">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        )}
        {warnings.length > 0 && (
          <ul className="move-warnings" aria-label="Before you move it">
            {warnings.map((w, i) => <li key={i} className={`is-${w.kind}`}>{w.text}</li>)}
          </ul>
        )}
        <div className="sheet-actions">
          <button ref={first} type="button" className="btn" onClick={onClose}>{nothing ? 'Close' : 'Cancel'}</button>
          {!nothing && (
            <button type="button" className="btn btn-primary grow" disabled={busy} onClick={() => void go()}>
              {warnings.length > 0 ? `${action} anyway` : action}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
