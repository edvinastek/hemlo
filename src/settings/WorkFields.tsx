import { useState } from 'react'
import type { Commute, WorkHours } from '../lib/settings'
import { span } from '../lib/work-rules'
import './planning.css'

const WEEK: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']]

/** Work or school hours and the commute, as used by first-run setup and by
 *  More. Both are off unless ticked: plenty of people have no fixed hours, and
 *  a planner that assumed nine to five would plan their day wrong. */
export function WorkFields({ work, commute, onWork, onCommute }: {
  work: WorkHours
  commute: Commute
  onWork: (change: Partial<WorkHours>) => void
  onCommute: (change: Partial<Commute>) => void
}) {
  const length = span(work.start, work.end)
  const overnight = length > 0 && work.end < work.start

  function toggleDay(d: number) {
    onWork({ days: work.days.includes(d) ? work.days.filter((x) => x !== d) : [...work.days, d] })
  }

  return (
    <div className="wf">
      <Check checked={work.on} onChange={(on) => onWork({ on })}
        label="I have work or school hours"
        hint="Added to your plan as a repeating block on those days." />

      {work.on && (
        <div className="wf-body">
          <div className="wf-grid">
            <label>Start
              <input type="time" value={work.start} onChange={(e) => e.target.value && onWork({ start: e.target.value })} />
            </label>
            <label>End
              <input type="time" value={work.end} onChange={(e) => e.target.value && onWork({ end: e.target.value })} />
            </label>
          </div>
          <div className="wf-days" role="group" aria-label="Days">
            {WEEK.map(([d, name]) => (
              <button key={d} type="button" className="wf-day" aria-pressed={work.days.includes(d)}
                onClick={() => toggleDay(d)}>{name}</button>
            ))}
          </div>
          <p className="wf-note">
            {length === 0 ? 'Start and end are the same time, so nothing is added.'
              : work.days.length === 0 ? 'Pick at least one day.'
              : `${Math.floor(length / 60)} h${length % 60 ? ` ${length % 60} min` : ''}${overnight ? ', ending the next morning' : ''}.`}
          </p>
          <Check checked={work.locked} onChange={(locked) => onWork({ locked })}
            label="Keep these hours free of other tasks"
            hint="Locked: nothing else is planned across them." />

          <Check checked={commute.on} onChange={(on) => onCommute({ on })}
            label="Plan my commute too"
            hint="A travel block before and after, on the same days." />
          {commute.on && (
            <div className="wf-grid wf-three">
              <label>Before, min
                <input type="number" inputMode="numeric" min={0} max={600} step={5} value={commute.before_min || ''}
                  placeholder="0" onChange={(e) => onCommute({ before_min: clampMinutes(e.target.value) })} />
              </label>
              <label>After, min
                <input type="number" inputMode="numeric" min={0} max={600} step={5} value={commute.after_min || ''}
                  placeholder="0" onChange={(e) => onCommute({ after_min: clampMinutes(e.target.value) })} />
              </label>
              <label>One way, km
                <KmInput km={commute.km} onChange={(km) => onCommute({ km })} />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const clampMinutes = (v: string) => Math.min(600, Math.max(0, Math.round(Number(v) || 0)))
const cleanKm = (v: string) => {
  const n = Number(v.replace(',', '.'))
  return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.min(2000, n)
}

/** Typed as text so "12," and "12." survive half-typed; a number field
 *  would read them as empty and wipe the box mid-word. */
function KmInput({ km, onChange }: { km: number | null; onChange: (km: number | null) => void }) {
  const [text, setText] = useState(km == null ? '' : String(km))
  return (
    <input type="text" inputMode="decimal" value={text} placeholder="optional"
      onChange={(e) => { setText(e.target.value); onChange(cleanKm(e.target.value)) }} />
  )
}

/** A tick box with its label and a quieter line under it, the whole row tappable. */
export function Check({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string
}) {
  return (
    <label className="wf-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="wf-check-label">{label}</span>
        {hint && <span className="wf-check-hint">{hint}</span>}
      </span>
    </label>
  )
}
