import { useEffect, useId, useRef, useState } from 'react'
import { useBackClose } from '../ui/useBackClose'
import { offerUndo } from '../ui/Undo'
import { describeMinutes } from '../lib/learning-rules'
import {
  FOCUS_LENGTHS, clock, elapsedMs, isFinished, pauseFocus, remainingMs, resumeFocus, startFocus, type FocusState,
} from '../lib/learning-focus-rules'
import { saveFocus, stopFocus, useNow } from '../lib/learning-focus'
import { unlogStudySession } from '../lib/learning'
import { Sheet } from './ModuleKit'

/** The focus timer (LRN-06) and the weekly target (LRN-05) on the Learning
 *  page: the running timer's bar, the sheet that starts one, the sheet that
 *  sets a subject's minutes a week, and the + menu's two choices. */

/** The running timer, over the study list. Counting down, it logs itself
 *  once the time is up (the next time the page is open); Stop logs what was
 *  focused so far. */
export function FocusBar({ profileId, state }: { profileId: string; state: FocusState }) {
  const running = state.paused_at == null
  const now = useNow(running)
  const done = isFinished(state, now)
  const left = remainingMs(state, now)
  const ending = useRef(false)

  async function stop() {
    if (ending.current) return
    ending.current = true
    // A countdown never logs more than its length (elapsedMs stops there).
    const rec = await stopFocus(profileId, state)
    if (!rec) { offerUndo('Under a minute: nothing logged', () => saveFocus(state)); return }
    offerUndo(`${describeMinutes(Number(rec.data.minutes))} of ${state.subject} logged`, () => unlogStudySession(rec))
  }
  // Time up while away: log it as soon as the page sees it.
  useEffect(() => { if (done) void stop() }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="lrn-focus" aria-label={`Focus timer: ${state.subject}`}>
      <div className="lrn-focus-text">
        <span className="row-name">{state.subject}</span>
        <span className="lrn-focus-clock" role="timer" aria-live="off">{clock(left ?? elapsedMs(state, now))}</span>
        <span className="row-meta">{!running ? 'Paused' : left != null ? `left of ${describeMinutes(state.length_min!)}` : 'focused'}</span>
      </div>
      <div className="lrn-focus-actions">
        <button type="button" className="btn" onClick={() => saveFocus(running ? pauseFocus(state, Date.now()) : resumeFocus(state, Date.now()))}>
          {running ? 'Pause' : 'Resume'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void stop()}>Stop</button>
      </div>
    </section>
  )
}

type Length = '25' | '50' | 'custom' | 'up'

/** Start a timer: the subject, then how long. */
export function FocusSheet({ subjects, subject, onClose }: { subjects: string[]; subject?: string; onClose: () => void }) {
  const [name, setName] = useState(subject ?? subjects[0] ?? '')
  const [length, setLength] = useState<Length>('25')
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const list = useId()

  function start() {
    if (!name.trim()) return setError('Which subject?')
    let minutes: number | null = null
    if (length === 'custom') {
      const n = Number(custom)
      if (!Number.isInteger(n) || n < 1 || n > 600) return setError('Minutes: 1 to 600.')
      minutes = n
    } else if (length !== 'up') minutes = Number(length)
    saveFocus(startFocus(name, length === 'up' ? 'up' : 'down', minutes, Date.now()))
    onClose()
  }

  return (
    <Sheet title="Focus" onClose={onClose} onSubmit={start}
      actions={<>
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Start</button>
      </>}>
      <div className="form-grid">
        <label>Subject
          <input value={name} list={list} maxLength={200} autoFocus={!name} onChange={(e) => { setName(e.target.value); setError(null) }} />
          <datalist id={list}>{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <div className="kit-seg lrn-lengths" role="group" aria-label="How long">
          {[...FOCUS_LENGTHS.map((m) => ({ key: String(m) as Length, label: `${m} min` })), { key: 'custom' as Length, label: 'Other' }, { key: 'up' as Length, label: 'Count up' }].map((o) => (
            <button key={o.key} type="button" aria-pressed={length === o.key} onClick={() => { setLength(o.key); setError(null) }}>{o.label}</button>
          ))}
        </div>
        {length === 'custom' && <label>Minutes<input inputMode="numeric" value={custom} autoFocus onChange={(e) => { setCustom(e.target.value); setError(null) }} /></label>}
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

const QUICK_TARGETS = [60, 120, 180, 300]

/** A subject's minutes a week (LRN-05): empty takes the target off. */
export function TargetSheet({ subjects, subject, value, onSave, onClose }: {
  subjects: string[]; subject?: string; value: (subject: string) => number | null
  onSave: (subject: string, minutes: number | null) => void; onClose: () => void
}) {
  const [name, setName] = useState(subject ?? subjects[0] ?? '')
  const [text, setText] = useState(() => { const v = value(subject ?? subjects[0] ?? ''); return v ? String(v) : '' })
  const [error, setError] = useState<string | null>(null)
  const list = useId()

  function save() {
    if (!name.trim()) return setError('Which subject?')
    if (!text.trim()) { onSave(name, null); onClose(); return }
    const n = Number(text)
    if (!Number.isInteger(n) || n < 1 || n > 10080) return setError('Minutes a week: 1 to 10080.')
    onSave(name, n)
    onClose()
  }

  return (
    <Sheet title="Weekly target" onClose={onClose} onSubmit={save}
      actions={<>
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save</button>
      </>}>
      <div className="form-grid">
        {subject ? <p className="row-name">{subject}</p> : (
          <label>Subject
            <input value={name} list={list} maxLength={200} onChange={(e) => {
              setName(e.target.value); setError(null)
              const v = value(e.target.value)
              setText(v ? String(v) : '')
            }} />
            <datalist id={list}>{subjects.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
        )}
        <label>Minutes a week<input inputMode="numeric" value={text} autoFocus={!!subject} placeholder="120" onChange={(e) => { setText(e.target.value); setError(null) }} /></label>
        <div className="kit-seg lrn-lengths" role="group" aria-label="Quick targets">
          {QUICK_TARGETS.map((m) => <button key={m} type="button" aria-pressed={text === String(m)} onClick={() => setText(String(m))}>{describeMinutes(m)}</button>)}
        </div>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

/** The +'s two choices on the study tab: plan a block, or focus now. */
export function AddChoice({ onBlock, onFocus, onClose }: { onBlock: () => void; onFocus: () => void; onClose: () => void }) {
  useBackClose(onClose)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet lrn-choice" role="dialog" aria-modal="true" aria-label="Add">
        <h2>Add</h2>
        <button type="button" className="lrn-choice-row" onClick={onBlock}>Study block</button>
        <button type="button" className="lrn-choice-row" onClick={onFocus}>Focus timer</button>
        <div className="sheet-actions"><button type="button" className="btn grow" onClick={onClose}>Close</button></div>
      </div>
    </>
  )
}
