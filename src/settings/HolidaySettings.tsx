import { useState, type CSSProperties } from 'react'
import { useApp } from '../lib/store'
import { readSettings, type HolidaySettings as Holidays } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { countryName } from '../lib/countries'
import { SWATCHES } from '../lib/colours-rules'
import {
  HOLIDAY_COUNTRIES, MAX_COUNTRIES, countryColours, hasHolidays,
  withCountry, withCountryColour, withoutCountry,
} from '../lib/holidays-rules'
import { SearchPick } from '../ui/SearchPick'
import type { Profile } from '../lib/types'
import './colour-settings.css'
import './holiday-settings.css'

/** Settings → Calendars: the countries whose public holidays show on Today and in
 *  Plan, up to six, each in its own colour. Worked out on the phone, so they
 *  show offline too. With none chosen, the person's own country is offered
 *  with one tap. */
export function HolidaySettings() {
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  return <HolidayList key={profile.id} profile={profile} />
}

function HolidayList({ profile }: { profile: Profile }) {
  const settings = readSettings(profile).holidays
  const colours = countryColours(settings)
  const [open, setOpen] = useState<string | null>(null)
  const own = hasHolidays(profile.country) ? profile.country!.toUpperCase() : null
  const items = HOLIDAY_COUNTRIES
    .filter((c) => !settings.countries.includes(c.code))
    .map((c) => ({ id: c.code, name: c.name, tag: c.code }))

  const save = (next: Holidays) => saveSettings(profile, { holidays: next })

  return (
    <>
      <p className="section-title">Public holidays</p>

      <div className="hs-list">
        {settings.countries.map((code) => {
          const hex = colours.get(code)!
          const name = countryName(code) ?? code
          return (
            <CountryRow key={code} code={code} name={name} hex={hex}
              shared={settings.countries.filter((o) => o !== code && colours.get(o) === hex).map((o) => countryName(o) ?? o)}
              open={open === code} onToggle={() => setOpen(open === code ? null : code)}
              onPick={(h) => save(withCountryColour(settings, code, h))}
              onRemove={() => { if (open === code) setOpen(null); save(withoutCountry(settings, code)) }} />
          )
        })}
      </div>

      {settings.countries.length === 0 && own && (
        <div className="setting-row">
          <div>
            <div className="row-name">{countryName(own)}</div>
            <div className="row-meta">Your country, from your profile.</div>
          </div>
          <button className="btn" onClick={() => save(withCountry(settings, own))}>Add</button>
        </div>
      )}

      {settings.countries.length < MAX_COUNTRIES ? (
        <div className="hs-add">
          <SearchPick items={items} label="Add a country's holidays" placeholder="Type to add a country"
            onPick={(c) => save(withCountry(settings, c.id))} />
        </div>
      ) : (
        <p className="hs-intro">That is six. Remove one to add another.</p>
      )}
      {/* The data's source and licence (CC BY-SA 3.0) are named in Settings → About. */}
    </>
  )
}

function CountryRow({ code, name, hex, shared, open, onToggle, onPick, onRemove }: {
  code: string; name: string; hex: string; shared: string[]; open: boolean
  onToggle: () => void; onPick: (hex: string) => void; onRemove: () => void
}) {
  const swatch = SWATCHES.find((s) => s.hex === hex)
  return (
    <div className="cs-row">
      <div className="hs-line">
        <button className="cs-head" aria-expanded={open} onClick={onToggle}
          aria-label={`${name} holidays: ${swatch?.name ?? hex}. Change colour`}>
          <i className="cs-swatch" style={{ '--mod': hex } as CSSProperties} aria-hidden="true" />
          <span className="row-name">{name}</span>
          <span className="row-meta">{code} · {swatch?.name ?? hex}</span>
        </button>
        <button className="btn hs-remove" onClick={onRemove} aria-label={`Remove ${name}`}>Remove</button>
      </div>
      {shared.length > 0 && <p className="cs-note is-quiet">Same colour as {shared.join(' and ')}.</p>}
      {open && (
        <div className="cs-panel">
          <div className="cs-grid" role="group" aria-label={`Colours for ${name}`}>
            {SWATCHES.map((s) => (
              <button key={s.hex} className="cs-pick" aria-label={s.name} aria-pressed={s.hex === hex}
                title={s.name} style={{ '--mod': s.hex } as CSSProperties} onClick={() => onPick(s.hex)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
