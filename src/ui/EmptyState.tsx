import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './empty-state.css'

export interface EmptyAction {
  label: string
  /** A button's action, or… */
  onClick?: () => void
  /** …a page to go to. */
  to?: string
}

/** A designed empty page or list (GEN-67, ONB-14): what it is for in one
 *  sentence, the one main thing to do, and a second way in where there is
 *  one (a template, an import). Anyone may use it.
 *
 *  `mark` is the module's own glyph, drawn large and quiet, so an empty page
 *  still says whose page it is. */
export function EmptyState({ mark, title, children, action, more, compact }: {
  mark?: string
  title: string
  /** One sentence (CALM-11): what this is for, or what appears here. */
  children?: ReactNode
  action?: EmptyAction
  /** Second ways in: a template, an import, a link to learn more. */
  more?: EmptyAction[]
  /** Inside a list rather than a whole page: less room. */
  compact?: boolean
}) {
  return (
    <section className={`es${compact ? ' is-compact' : ''}`} aria-label={title}>
      {mark && <span className="es-mark" aria-hidden="true">{mark}</span>}
      <h2 className="es-title">{title}</h2>
      {children && <p className="es-text">{children}</p>}
      {action && <ActionButton a={action} primary />}
      {more && more.length > 0 && (
        <div className="es-more">
          {more.map((m) => <ActionButton key={m.label} a={m} />)}
        </div>
      )}
    </section>
  )
}

function ActionButton({ a, primary }: { a: EmptyAction; primary?: boolean }) {
  const cls = primary ? 'btn btn-primary es-main' : 'es-link'
  if (a.to) return <Link className={cls} to={a.to} onClick={a.onClick}>{a.label}</Link>
  return <button type="button" className={cls} onClick={a.onClick}>{a.label}</button>
}
