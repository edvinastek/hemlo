import { useId, useState, type ReactNode } from 'react'
import './more-options.css'

/** "More options": the one disclosure in a form (v17, CALM-06). The fields a
 *  person needs on day one stay above it; the rest wait inside, closed. It
 *  starts open when any of them already holds something, so nothing set is
 *  ever out of sight. `summary` says in a few words what is set inside
 *  ("Section Work · locked"). */
export function MoreOptions({ children, open: startOpen = false, summary, label = 'More options' }: {
  children: ReactNode
  open?: boolean
  summary?: string | null
  label?: string
}) {
  const [open, setOpen] = useState(startOpen)
  const id = useId()
  return (
    <div className={`mo${open ? ' is-open' : ''}`}>
      <button type="button" className="mo-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="mo-label">{label}</span>
        {!open && summary && <span className="mo-summary">{summary}</span>}
        <span className="mo-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div id={id} className="mo-body">{children}</div>}
    </div>
  )
}
