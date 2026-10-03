import { useState } from 'react'
import {
  PRESETS, TRAINING, WORK, factorFor, factorWarning, formatFactor, presetFor, presetOf, readFactor, workOnly,
  type ActivityAnswers, type Training, type Work,
} from '../lib/activity'
import './activity.css'

export interface ActivityValue { answers: ActivityAnswers; factor: number }

/** How active a day is, for the calorie budget (BODY-10 to BODY-16): two
 *  short questions (work, training) lead to a lifestyle preset, shown with
 *  its factor, an example day and a step range; any preset can be picked
 *  directly, or a factor typed (1.2 to 2.4, warned outside 1.3 to 2.2). One
 *  explicit choice says whether training is inside the factor or logged and
 *  added on the day, never both. The same picker in onboarding and in More. */
export function ActivityPicker({ value, onChange }: { value: ActivityValue; onChange: (v: ActivityValue) => void }) {
  const { answers, factor } = value
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState<string | null>(null)
  const [own, setOwn] = useState(false)

  function answer(change: Partial<ActivityAnswers>) {
    const next = { ...answers, ...change }
    // Walking only changes a desk job with no other exercise.
    if (next.work !== 'sitting' || next.training !== 'none') next.walks = false
    onChange({ answers: next, factor: factorFor(next) ?? factor })
  }
  function pick(f: number) {
    // A level picked by hand stands on its own: the answers are cleared, so
    // the screen never shows two different reasons for one factor.
    onChange({ answers: { ...answers, work: null, training: null, walks: false }, factor: f })
  }
  function useTyped() {
    const r = readFactor(typed)
    if ('error' in r) { setTypedError(r.error); return }
    setTypedError(null)
    setTyped('')
    pick(r.value)
  }

  const preset = presetOf(factor)
  const fromAnswers = answers.work && answers.training
    ? (answers.mode === 'added' ? workOnly(answers.work, answers.walks) : presetFor(answers.work, answers.training, answers.walks)) : null
  const warning = factorWarning(factor)
  return (
    <div className="ap">
      <fieldset className="ap-q">
        <legend>What is your work like?</legend>
        <div className="ap-options" role="radiogroup" aria-label="What is your work like?">
          {WORK.map((w) => (
            <button key={w.value} type="button" role="radio" aria-checked={answers.work === w.value} className="ap-option"
              onClick={() => answer({ work: w.value as Work })}>{w.label}</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="ap-q">
        <legend>How much do you train?</legend>
        <div className="ap-options is-row" role="radiogroup" aria-label="How much do you train?">
          {TRAINING.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={answers.training === t.value} className="ap-option"
              onClick={() => answer({ training: t.value as Training })}>{t.label}</button>
          ))}
        </div>
      </fieldset>
      {answers.work === 'sitting' && answers.training === 'none' && (
        <label className="ap-check">
          <input type="checkbox" checked={answers.walks} onChange={(e) => answer({ walks: e.target.checked })} />
          I walk or cycle half an hour or more on most days (to work, or for its own sake)
        </label>
      )}

      <fieldset className="ap-q">
        <legend>Training is</legend>
        <div className="ap-options" role="radiogroup" aria-label="Training is">
          <button type="button" role="radio" aria-checked={answers.mode === 'inside'} className="ap-option" onClick={() => answer({ mode: 'inside' })}>
            Inside this factor <span className="ap-hint">The usual way: nothing to add on training days.</span>
          </button>
          <button type="button" role="radio" aria-checked={answers.mode === 'added'} className="ap-option" onClick={() => answer({ mode: 'added' })}>
            Logged separately and added <span className="ap-hint">The factor is for your work alone; what a session burns is added on its day.</span>
          </button>
        </div>
      </fieldset>

      <div className="ap-result" aria-live="polite">
        <span className="ap-factor">{formatFactor(factor)}</span>
        <span className="ap-text">
          <b>{preset ? preset.label : 'Your own factor'}</b>
          {preset && <span>{preset.example}. About {preset.steps} a day.</span>}
          {!preset && <span>Typed in by you.</span>}
          {fromAnswers && fromAnswers.factor !== factor && (
            <span>Your answers point to {fromAnswers.factor} ({fromAnswers.label.toLowerCase()}).{' '}
              <button type="button" className="slot-link" onClick={() => onChange({ answers, factor: fromAnswers.factor })}>Use it</button></span>
          )}
          <span className="ap-mode">{answers.mode === 'added' ? 'Training is not in this factor: add it on training days.' : 'Training is part of this factor.'}</span>
        </span>
      </div>
      {warning && <p className="ap-warn" role="status">{warning}</p>}

      <details className="ap-more" open={own}>
        <summary onClick={(e) => { e.preventDefault(); setOwn((v) => !v) }}>Pick a level yourself, or type a factor</summary>
        <div className="ap-options" role="radiogroup" aria-label="Activity level">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={Math.abs(p.factor - factor) < 0.001} className="ap-option ap-preset"
              onClick={() => pick(p.factor)}>
              <span className="ap-pf">{p.factor}</span>
              <span><b>{p.label}</b><span className="ap-hint">{p.example}. {p.steps}.</span></span>
            </button>
          ))}
        </div>
        <div className="ap-typed">
          <label>
            Your own factor, 1.2 to 2.4
            <input inputMode="decimal" value={typed} placeholder="e.g. 1.55" onChange={(e) => { setTyped(e.target.value); setTypedError(null) }} />
          </label>
          <button type="button" className="btn" disabled={!typed.trim()} onClick={useTyped}>Use</button>
        </div>
        {typedError && <p className="ap-warn" role="alert">{typedError}</p>}
        <p className="ap-hint">
          Built on FAO/WHO/UNU and EFSA: even the least active adults are planned at 1.4. Steps are a guide, not a measure.
        </p>
      </details>
    </div>
  )
}
