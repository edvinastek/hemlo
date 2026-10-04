import { useState, type CSSProperties } from 'react'
import { SWATCHES } from '../lib/colours-rules'
import {
  describePhase, nextPhaseStart, phaseColour, phaseOn, phaseProblem, phaseWeeks, shortDay, yearBands,
} from '../lib/training-phase-rules'
import { deletePhase, restorePhase, savePhase, usePhases } from '../lib/training-phases'
import type { Phase } from '../lib/training-types'
import { offerUndo } from '../ui/Undo'
import { DeleteButton, Sheet, localToday } from './ModuleKit'
import './training-phases.css'

/** Training phases (TRN-07): blocks of weeks ("Strength, 6 weeks") drawn as
 *  bands across the year, on Plan's Year view and on Training, and kept in
 *  Training's ⋮ → Phases. Nothing shows until the person adds a phase. */

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** The year's phases as bands across twelve months, with today marked and
 *  each phase named under them. Draws nothing in a year without phases (or
 *  while Training is off). `current`: Training's own line, "Strength · week
 *  3 of 6", over the bands. Self-contained so Plan's Year view needs only
 *  one line to show it. */
export function YearPhases({ profileId, year, current = false, onOpen }: {
  profileId: string; year: number; current?: boolean
  /** A tap on a phase: Training opens its phases. */
  onOpen?: () => void
}) {
  const phases = usePhases(profileId)
  const today = localToday()
  if (!phases) return null
  const bands = yearBands(phases, year)
  if (!bands.length) return null
  const lanes = Math.max(...bands.map((b) => b.lane)) + 1
  const now = phaseOn(phases, today)
  const first = Date.UTC(year, 0, 1)
  const todayAt = today.startsWith(`${year}-`)
    ? (Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10))) - first) / (Date.UTC(year + 1, 0, 1) - first)
    : null
  const said = bands.map((b) => `${b.phase.name}, ${describePhase(b.phase, year)}`).join('; ')

  return (
    <section className="yp" aria-labelledby={`yp-${year}`}>
      <p className="section-title" id={`yp-${year}`}>Training phases, {year}</p>
      {current && now && (
        <p className="yp-now"><span className="row-name">{now.phase.name}</span> <span className="row-meta">week {now.week} of {now.weeks}</span></p>
      )}
      <div className="yp-strip" role="img" aria-label={said} style={{ '--yp-lanes': lanes } as CSSProperties}>
        <div className="yp-months" aria-hidden="true">{MONTH_LETTERS.map((m, i) => <span key={i}>{m}</span>)}</div>
        <div className="yp-lanes">
          {bands.map((b) => (
            <span key={b.phase.id} className={`yp-band${b.before ? ' is-before' : ''}${b.after ? ' is-after' : ''}`}
              style={{ left: `${b.from * 100}%`, width: `${(b.to - b.from) * 100}%`, top: `calc(${b.lane} * var(--yp-lane))`, '--yp-colour': phaseColour(b.phase) } as CSSProperties}>
              <span className="yp-band-name">{b.phase.name}</span>
            </span>
          ))}
          {todayAt != null && <span className="yp-today" style={{ left: `${todayAt * 100}%` }} />}
        </div>
      </div>
      <ul className="yp-list">
        {bands.map((b) => {
          const row = <><span className="yp-dot" style={{ background: phaseColour(b.phase) }} aria-hidden="true" />
            <span className="row-name">{b.phase.name}</span><span className="row-meta">{describePhase(b.phase, year)}</span></>
          return <li key={b.phase.id}>{onOpen ? <button type="button" className="yp-item" onClick={onOpen}>{row}</button> : <span className="yp-item">{row}</span>}</li>
        })}
      </ul>
    </section>
  )
}

/** Training's ⋮ → Phases: the list, and a phase added or changed in the
 *  same sheet (never a sheet on a sheet). */
export function PhasesSheet({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const phases = usePhases(profileId)
  const [editing, setEditing] = useState<Phase | 'new' | null>(null)
  if (!phases) return null
  if (editing) return <PhaseForm profileId={profileId} phase={editing === 'new' ? null : editing} phases={phases} onDone={() => setEditing(null)} />
  const today = localToday()
  return (
    <Sheet title="Phases" onClose={onClose}
      actions={<>
        <button type="button" className="btn grow" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>New phase</button>
      </>}>
      {phases.length === 0 ? <p className="kit-note">A phase is a block of weeks, such as six weeks of strength.</p> : (
        <ul className="kit-list yp-sheet-list">
          {phases.map((p) => (
            <li key={p.id} className="kit-row">
              <button type="button" className="kit-open" onClick={() => setEditing(p)}>
                <span className="row-name"><span className="yp-dot" style={{ background: phaseColour(p) }} aria-hidden="true" /> {p.name}</span>
                <span className="row-meta">{describePhase(p, Number(today.slice(0, 4)))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

function PhaseForm({ profileId, phase, phases, onDone }: { profileId: string; phase: Phase | null; phases: Phase[]; onDone: () => void }) {
  const today = localToday()
  const [name, setName] = useState(phase?.name ?? '')
  const [start, setStart] = useState(phase?.start_date ?? nextPhaseStart(phases, today))
  const [weeks, setWeeks] = useState(String(phase ? phaseWeeks(phase) : 6))
  const [colour, setColour] = useState<string | null>(phase?.colour ?? SWATCHES[(phases.length * 3) % SWATCHES.length].hex)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const draft = { name, start, weeks, colour }
    const problem = phaseProblem(draft)
    if (problem) return setError(problem)
    await savePhase(profileId, draft, phase ?? undefined)
    onDone()
  }
  async function remove() {
    if (!phase) return
    await deletePhase(phase)
    offerUndo(`${phase.name} deleted`, () => restorePhase(phase))
    onDone()
  }

  return (
    <Sheet title={phase ? 'Phase' : 'New phase'} onClose={onDone} onSubmit={() => void save()}
      actions={<>
        {phase && <DeleteButton onDelete={() => void remove()} />}
        <button type="button" className="btn grow" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        <label>Name<input value={name} maxLength={60} autoFocus={!phase} placeholder="Strength" onChange={(e) => { setName(e.target.value); setError(null) }} /></label>
        <div className="two">
          <label>Starts<input type="date" value={start} onChange={(e) => { setStart(e.target.value); setError(null) }} /></label>
          <label>Weeks<input inputMode="numeric" value={weeks} onChange={(e) => { setWeeks(e.target.value); setError(null) }} /></label>
        </div>
        {/^\d+$/.test(weeks) && Number(weeks) >= 1 && Number(weeks) <= 52 && /^\d{4}-\d{2}-\d{2}$/.test(start) && (
          <p className="kit-hint">Ends {shortDay(new Date(Date.parse(`${start}T00:00:00Z`) + (Number(weeks) * 7 - 1) * 86400000).toISOString().slice(0, 10))}</p>
        )}
        <div className="yp-swatches" role="radiogroup" aria-label="Colour">
          {SWATCHES.map((s) => (
            <button key={s.hex} type="button" role="radio" aria-checked={colour === s.hex} aria-label={s.name}
              className="yp-swatch" style={{ background: s.hex }} onClick={() => setColour(s.hex)} />
          ))}
        </div>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}
