import { CHOICES, statusOf, type Choice, type SharingRow } from '../lib/sharing-rules'
import './sharing.css'

/** A recipe's status as a small chip: Private, Waiting for review, Shared
 *  with everyone, or Not accepted (with the reviewer's note under it). */
export function SharingStatus({ recipe, withNote = true }: { recipe: SharingRow; withNote?: boolean }) {
  const s = statusOf(recipe)
  return (
    <>
      <span className={`sh-chip is-${s.tone}`}>{s.label}</span>
      {withNote && s.note && <div className="sh-note">“{s.note}”</div>}
    </>
  )
}

/** "Who can see it": Only me, or Propose to everyone. Under it, what saving
 *  will do, and why proposing is not possible yet when a food only the
 *  author can see is in the recipe. */
export function SharingChoice({ value, onChange, recipe, effect, blocking }: {
  value: Choice
  onChange: (c: Choice) => void
  /** The saved recipe, for its status; none while it is new. */
  recipe: SharingRow | null
  effect: string | null
  /** Names of the person's own foods in it. */
  blocking: string[]
}) {
  return (
    <fieldset className="sh-choice">
      <legend>Who can see it {recipe && <SharingStatus recipe={recipe} withNote={false} />}</legend>
      {recipe && statusOf(recipe).note && <div className="sh-note">Not accepted: “{statusOf(recipe).note}”</div>}
      {CHOICES.map((c) => (
        <label key={c.value} className="sh-option">
          <input type="radio" name="sharing" value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
          <span>
            <span className="sh-option-name">{c.label}</span>
            <span className="sh-option-hint">{c.hint}</span>
          </span>
        </label>
      ))}
      {value === 'propose' && blocking.length > 0 ? (
        <p className="sh-block" role="alert">
          A recipe for everyone can only use foods from the shared list, because no one else can see the
          foods you added yourself. Swap {blocking.join(', ')} for one from the list, or keep it to yourself.
        </p>
      ) : effect && <p className="sh-effect" aria-live="polite">{effect}</p>}
    </fieldset>
  )
}
