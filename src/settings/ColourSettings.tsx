import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useApp } from '../lib/store'
import { readSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { MODULES } from '../modules/registry'
import { SWATCHES, DEFAULT_COLOURS, contrastNote, parseHex, swatchesFor, withColour } from '../lib/colours-rules'
import { previewTheme, useLooks } from '../lib/looks'
import { useModuleColours } from '../lib/colours'
import { search } from '../lib/search-rules'
import type { Profile } from '../lib/types'
import './colour-settings.css'

/** Settings → Looks: colour by module on or off, and each module's colour. A
 *  colour is chosen from the swatches (all readable on both the light and the
 *  dark page) or typed as a hex value, and Reset goes back to the default. */
export function ColourSettings() {
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  return <Colours key={profile.id} profile={profile} />
}

function Colours({ profile }: { profile: Profile }) {
  const settings = readSettings(profile)
  const colours = useModuleColours()
  const { built, enabled } = colours
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Colours are judged on the pages of the theme chosen in Looks (LOOK-06),
  // its light page and its dark (or black) one, and again when it changes.
  const { looks } = useLooks()
  const papers = useMemo(() => ({
    light: previewTheme(looks.theme, 'light', looks.seed).tokens.paper,
    dark: previewTheme(looks.theme, looks.mode === 'black' ? 'black' : 'dark', looks.seed).tokens.paper,
  }), [looks.theme, looks.seed, looks.mode])
  const swatches = useMemo(() => swatchesFor(papers), [papers])

  // Work and the evening colour a day without being modules, so they always
  // have a row; then the modules that are on, in the Modules list's order,
  // then the ones the person built.
  const keys = [
    'work',
    ...MODULES.map((m) => m.key).filter((k) => k !== 'custom' && enabled.includes(k)),
    ...built.map((m) => m.key).filter((k) => enabled.includes(k)),
    'evening',
  ]

  // A long list gets the one search (GEN-13): by the module's name or its
  // colour's name. With nothing typed, the list keeps its own order.
  const findable = keys.length > 8
  const shown = useMemo(() => {
    if (!query.trim()) return keys
    const items = keys.map((k) => ({ key: k, name: colours.label(k), extra: SWATCHES.find((x) => x.hex === colours.of(k))?.name ?? '' }))
    return search(items, query).map((x) => x.key)
  }, [keys.join(','), query, colours]) // eslint-disable-line react-hooks/exhaustive-deps

  async function set(key: string, hex: string | null) {
    await saveSettings(profile, { colours: withColour(settings.colours, key, hex) })
  }

  return (
    <>
      <p className="section-title">Colours</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Colour by module</div>
          <div className="row-meta">Marks each task, and each day in Plan, with the colour of what it belongs to.</div>
        </div>
        <button className="switch" role="switch" aria-checked={settings.colours.on} aria-label="Colour by module"
          onClick={() => saveSettings(profile, { colours: { on: !settings.colours.on } })} />
      </div>

      {findable && (
        <div className="cs-find">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a module or a colour"
            aria-label="Find a module or a colour" autoComplete="off" />
        </div>
      )}
      <div className={settings.colours.on ? 'cs-list' : 'cs-list is-off'}>
        {shown.length === 0 && <p className="cs-none">Nothing called “{query.trim()}”.</p>}
        {shown.map((k) => (
          <ColourRow key={k} name={colours.label(k)}
            hex={colours.of(k)} chosen={k in settings.colours.modules}
            shared={keys.filter((o) => o !== k && colours.of(o) === colours.of(k)).map(colours.label)}
            isDefault={!!DEFAULT_COLOURS[k]}
            open={open === k} onToggle={() => setOpen(open === k ? null : k)}
            onPick={(hex) => set(k, hex)} papers={papers} swatches={swatches} />
        ))}
      </div>
    </>
  )
}

function ColourRow({ name, hex, chosen, shared, isDefault, open, onToggle, onPick, papers, swatches }: {
  name: string; hex: string; chosen: boolean; shared: string[]; isDefault: boolean; open: boolean
  onToggle: () => void; onPick: (hex: string | null) => void
  papers: { light: string; dark: string }; swatches: ReturnType<typeof swatchesFor>
}) {
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const swatch = SWATCHES.find((s) => s.hex === hex)
  const note = contrastNote(hex, papers)

  function submitTyped(e: FormEvent) {
    e.preventDefault()
    const v = parseHex(typed)
    if (!v) { setError('A colour is six hex digits, like #3f6b4a.'); return }
    setError(null)
    setTyped('')
    onPick(v)
  }

  return (
    <div className="cs-row">
      <button className="cs-head" aria-expanded={open} onClick={onToggle}
        aria-label={`${name}: ${swatch?.name ?? hex}. Change colour`}>
        <i className="cs-swatch" style={{ '--mod': hex } as CSSProperties} aria-hidden="true" />
        <span className="row-name">{name}</span>
        <span className="row-meta">{swatch?.name ?? hex}{chosen ? '' : isDefault ? ' · default' : ' · automatic'}</span>
      </button>
      {note && <p className="cs-note">{note}</p>}
      {/* Allowed, but said: two modules in one colour cannot be told apart on Plan. */}
      {shared.length > 0 && <p className="cs-note is-quiet">Same colour as {shared.join(' and ')}.</p>}

      {open && (
        <div className="cs-panel">
          <div className="cs-grid" role="group" aria-label={`Colours for ${name}`}>
            {swatches.map((s) => (
              <button key={s.hex} className={`cs-pick${s.note ? ' is-faint' : ''}`} aria-label={s.note ? `${s.name}. ${s.note}` : s.name} aria-pressed={s.hex === hex}
                title={s.note ? `${s.name}: ${s.note.toLowerCase()}` : s.name} style={{ '--mod': s.hex } as CSSProperties} onClick={() => onPick(s.hex)} />
            ))}
          </div>
          <form className="cs-custom" onSubmit={submitTyped}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={hex}
              aria-label={`Hex colour for ${name}`} spellCheck={false} autoCapitalize="off" maxLength={7} />
            <button type="submit" className="btn">Use</button>
            <button type="button" className="btn" disabled={!chosen} onClick={() => onPick(null)}>Reset</button>
          </form>
          {error && <p className="cs-note">{error}</p>}
        </div>
      )}
    </div>
  )
}
