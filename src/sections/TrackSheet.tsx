import type { ReactNode } from 'react'
import { useBackClose } from '../ui/useBackClose'
import '../ui/tasksheet.css'

/** The bottom sheet the habit, supplement and chore editors open in: the
 *  app's own sheet look, Back, Escape and the scrim close it (CALM-10), and
 *  the first field takes the focus. Opened from a page, never on top of
 *  another sheet. */
export function TrackSheet({ label, onClose, onSubmit, children }: {
  label: string
  onClose: () => void
  onSubmit: () => void
  children: ReactNode
}) {
  useBackClose(onClose)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className="bottom-sheet track-sheet" role="dialog" aria-modal="true" aria-label={label}
        onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
        <h2>{label}</h2>
        <div className="form-grid">{children}</div>
      </form>
    </>
  )
}

/** A row of choices where one is picked, as pressed buttons. */
export function Choices<V extends string>({ label, value, options, onChange }: {
  label: string
  value: V
  options: { value: V; label: string }[]
  onChange: (v: V) => void
}) {
  return (
    <div className="ts-field">
      <span className="ts-field-name">{label}</span>
      <div className="track-choices" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="track-choice"
            onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

/** An on/off row with the app's switch. */
export function SwitchRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="track-switch">
      <div>
        <div className="track-switch-name">{label}</div>
        {hint && <div className="row-meta">{hint}</div>}
      </div>
      <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
    </div>
  )
}
