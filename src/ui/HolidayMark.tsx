import type { CSSProperties } from 'react'
import { byName, type HolidayMark as Mark } from '../lib/holidays-rules'
import { countryName } from '../lib/countries'
import './holidays.css'

/** Public holiday markers. Holidays are drawn as short bars in their
 *  country's colour, so they are not mistaken for the round module dots.
 *  The marks themselves are hidden from screen readers: whatever carries
 *  them (a day's header, a month cell) says the names in its title or label,
 *  using holidaysText(). */

const colour = (hex: string) => ({ '--hol': hex } as CSSProperties)

/** A day's holidays as a small mark, one piece per country.
 *  - 'bar': a short underline, for a day's header (Plan's Week).
 *  - 'top': a thin bar along the top edge of the box it sits in (Plan's
 *    Month cells; the box needs position: relative, .month-cell has it).
 *  - 'dot': tiny squares in a row, for small day squares (Year). */
export function HolidayMark({ marks, variant = 'dot' }: { marks: Mark[]; variant?: 'bar' | 'top' | 'dot' }) {
  if (marks.length === 0) return null
  return (
    <span className={`hol-mark is-${variant}`} aria-hidden="true">
      {marks.map((m) => <i key={m.country} style={colour(m.colour)} />)}
    </span>
  )
}

/** Today's header: each of the day's holidays by name, "King's Day (NL)".
 *  Countries sharing a holiday share a chip, "Christmas Day (NL, DE)", with
 *  a bar in each one's colour. */
export function HolidayChips({ marks }: { marks: Mark[] }) {
  if (marks.length === 0) return null
  return (
    <p className="hol-chips">
      {byName(marks).map((g) => (
        <span key={g.name} className="hol-chip">
          <span className="hol-mark is-chip" aria-hidden="true">
            {g.marks.map((m) => <i key={m.country} style={colour(m.colour)} />)}
          </span>
          {g.label}
        </span>
      ))}
    </p>
  )
}

/** Under Week and Month: which colour is which country, for the countries
 *  with a holiday on the page. Nothing when there are none. */
export function HolidayLegend({ countries }: { countries: { country: string; colour: string }[] }) {
  if (countries.length === 0) return null
  return (
    <div className="mod-legend hol-legend" aria-label="Public holiday colours">
      <span>Holidays</span>
      {countries.map((c) => (
        <span key={c.country} style={colour(c.colour)}>
          <i className="hol-key" aria-hidden="true" />{countryName(c.country) ?? c.country}
        </span>
      ))}
    </div>
  )
}
