import type { InputHTMLAttributes } from 'react'
import { Dropdown } from './Dropdown'
import { choiceLabel, gramsLabel, type AmountChoice } from '../lib/units-rules'
import './amount.css'

/** An amount and what it is counted in: a number field, then grams (and,
 *  where it makes sense, kilos or packs) and the food's own units ("egg",
 *  "slice", "tbsp"). Up to four choices sit side by side as buttons, which is
 *  one tap; more open as a short list. The number is read in the unit chosen:
 *  "2" with "egg" is two eggs. What it comes to in grams is worked out by the
 *  caller (readAmount in units-rules.ts), so every screen counts the same way.
 *
 *  A choice with no weight (a shop word on the list: "bottle") has no
 *  "… each" hint.
 *
 *  Renders the field and the choice side by side, without a box of its own,
 *  so it slots into the row it sits in. */
export function AmountInput({
  text, choice, choices, onText, onChoice, label, groupClass, input,
}: {
  text: string
  /** The key of the choice picked: 'g', 'kg', 'packs' or 'u:egg'. */
  choice: string
  choices: AmountChoice[]
  onText: (text: string) => void
  onChoice: (key: string) => void
  /** What the number field is called for a screen reader. */
  label: string
  /** Extra class for the button group (the Stock tab's look). */
  groupClass?: string
  /** Anything else the number field needs: autoFocus, placeholder, onFocus. */
  input?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'aria-label'>
}) {
  const field = (
    <input type="text" inputMode="decimal" autoComplete="off" {...input} className={`amt-input${input?.className ? ` ${input.className}` : ''}`}
      value={text} aria-label={label} onChange={(e) => onText(e.target.value)} />
  )
  let pick
  if (choices.length <= 1) {
    pick = <span className="amt-only" aria-hidden="true">{choices[0] ? choiceLabel(choices[0], text) : 'g'}</span>
  } else if (choices.length <= 4) {
    pick = (
      <div className={`amt-units${groupClass ? ` ${groupClass}` : ''}`} role="group" aria-label="Unit">
        {choices.map((c) => (
          // The word follows the number typed: "1 onion", "2 onions" (UNIT-21).
          <button key={c.key} type="button" aria-pressed={c.key === choice} onClick={() => onChoice(c.key)}>{choiceLabel(c, text)}</button>
        ))}
      </div>
    )
  } else {
    pick = (
      <Dropdown className="amt-dd" value={choice} label="Unit"
        options={choices.map((c) => ({ value: c.key, label: choiceLabel(c, text), hint: c.key === 'g' || c.key === 'kg' || !(c.g > 0) ? undefined : `${gramsLabel(c.g)} each` }))}
        onChange={onChoice} />
    )
  }
  return <>{field}{pick}</>
}
