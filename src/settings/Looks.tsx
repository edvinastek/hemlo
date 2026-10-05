import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useApp } from '../lib/store'
import { readSettings, type LookSettings } from '../lib/settings'
import { saveSettings } from '../lib/write'
import { parseHex } from '../lib/colours-rules'
import { useLooks, previewTheme } from '../lib/looks'
import { appIcon, features, isIos, setAppIcon } from '../lib/native'
import {
  DENSITIES, FONT_PAIRINGS, ICONS, OWN, SEEDS, SYSTEM, TEXT_SIZES, THEMES, adjustedNote, checkTokens, cssVars, iconShapes, pairingIn, pairingsFor,
  type AppIcon, type ResolvedTheme, type Shade, type TextSize, type ThemeMode,
} from '../lib/theme-rules'
import type { Profile } from '../lib/types'
import './looks.css'

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Follow the phone' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'black', label: 'Black' },
]
const DEFAULT_SEED = '#4777d2'

/** Settings → Looks (LOOK-01 to LOOK-12, LOOK-20): the theme, light or dark,
 *  the person's own colour, text size, row density, the font pairing a theme
 *  offers, and the app icon. Every choice shows
 *  at once on the whole app; the two small pages at the top show the chosen
 *  theme in both its light and dark shade. All of it is free. */
export function LooksSettings() {
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  return <Looks key={profile.id} profile={profile} />
}

function Looks({ profile }: { profile: Profile }) {
  const looks = readSettings(profile).looks
  const live = useLooks()
  const save = (change: Partial<LookSettings>) => void saveSettings(profile, { looks: change })
  const shade = live.theme.shade
  const darkShade: Shade = looks.mode === 'black' ? 'black' : 'dark'
  const seed = looks.seed ?? DEFAULT_SEED

  const cards = [
    ...THEMES.map((t) => ({ key: t.key, name: t.name, desc: t.desc })),
    { key: OWN, name: 'Your colour', desc: 'Pick one colour; the rest is worked out and checked for you.' },
    ...(live.phoneAccent ? [{ key: SYSTEM, name: 'Phone colours', desc: 'Follows your wallpaper’s colours, as other apps do.' }] : []),
  ]
  const current = cards.some((c) => c.key === looks.theme) ? looks.theme : 'notebook'

  const light = previewTheme(current, 'light', seed)
  const dark = previewTheme(current, darkShade, seed)
  const note = current === OWN ? adjustedNote(live.theme.adjusted, shade) : null

  return (
    <div className="lk">
      <div className="lk-intro">
        <div className="lk-previews">
          <Preview theme={light} label={`${light.name}, light`} here={shade === 'light'} />
          <Preview theme={dark} label={`${dark.name}, ${darkShade}`} here={shade !== 'light'} />
        </div>
      </div>

      <div className="lk-block">
        <div className="row-name" id="lk-theme">Theme</div>
        <div className="lk-themes" role="radiogroup" aria-labelledby="lk-theme">
          {cards.map((c) => {
            const t = previewTheme(c.key, shade, seed).tokens
            return (
              <button key={c.key} type="button" role="radio" aria-checked={current === c.key} className="lk-theme"
                onClick={() => save(c.key === OWN && !looks.seed ? { theme: c.key, seed: DEFAULT_SEED } : { theme: c.key })}>
                <span className="lk-strip" aria-hidden="true">
                  <span style={{ background: t.paper, flexGrow: 3 }} />
                  <span style={{ background: t.ink }} />
                  <span style={{ background: t.accent }} />
                  <span style={{ background: t.tint }} />
                </span>
                <span className="lk-theme-name">{c.name}</span>
                <span className="lk-theme-desc">{c.desc}</span>
              </button>
            )
          })}
        </div>
        {current === OWN && <OwnColour seed={seed} onPick={(hex) => save({ theme: OWN, seed: hex })} />}
        {note && <p className="lk-note" role="status">{note}</p>}
      </div>

      <div className="lk-block">
        <div className="row-name" id="lk-mode">Light or dark</div>
        <div className="lk-seg" role="radiogroup" aria-labelledby="lk-mode">
          {MODES.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={looks.mode === m.key}
              onClick={() => save({ mode: m.key })}>{m.label}</button>
          ))}
        </div>
        <p className="row-meta">
          {looks.mode === 'system' ? `The phone is set to ${live.systemDark ? 'dark' : 'light'} now.` : 'Black: dark on pure black, kind to OLED screens.'}
        </p>
      </div>

      <div className="lk-block">
        <div className="row-name" id="lk-size">Text size</div>
        <div className="lk-seg" role="radiogroup" aria-labelledby="lk-size">
          {TEXT_SIZES.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={looks.text_size === t.key}
              onClick={() => save({ text_size: t.key as TextSize })}>
              <span style={{ fontSize: `${Math.round(14 * t.scale)}px` }}>{t.label}</span>
            </button>
          ))}
        </div>
        <p className="row-meta">
          {features().phoneTextSize
            ? `On top of the ${isIos() ? 'iPhone’s own text size' : 'phone’s own font size'}${live.phoneScale !== 1 ? ` (set to ${Math.round(live.phoneScale * 100)}% there)` : ''}.`
            : 'The whole page grows or shrinks with it.'}
        </p>
      </div>

      <div className="lk-block">
        <div className="row-name" id="lk-density">Rows</div>
        <div className="lk-seg is-two" role="radiogroup" aria-labelledby="lk-density">
          {DENSITIES.map((d) => (
            <button key={d.key} type="button" role="radio" aria-checked={looks.density === d.key}
              onClick={() => save({ density: d.key })}>{d.label}</button>
          ))}
        </div>
      </div>

      {/* Only where the theme offers another pairing (LOOK-12): the serif and sans stay the default everywhere. */}
      {pairingsFor(current).length > 1 && (
        <div className="lk-block">
          <div className="row-name" id="lk-fonts">Fonts</div>
          <div className="lk-seg is-two" role="radiogroup" aria-labelledby="lk-fonts">
            {FONT_PAIRINGS.filter((f) => pairingsFor(current).includes(f.key)).map((f) => (
              <button key={f.key} type="button" role="radio" aria-checked={pairingIn(current, looks.fonts) === f.key}
                onClick={() => save({ fonts: f.key })}>
                <span style={{ fontFamily: f.key === 'sans' ? 'var(--font-sans)' : 'Spectral, Georgia, serif' }}>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The iPhone app keeps its one icon (alternate icons there are later work). */}
      {!isIos() && <IconPicker chosen={looks.icon} onSaved={(key) => save({ icon: key })} />}

      <Readability theme={live.theme} />
    </div>
  )
}

/** A small Today page in a theme's colours. */
function Preview({ theme, label, here }: { theme: ResolvedTheme; label: string; here: boolean }) {
  const t = theme.tokens
  // React names color-scheme in camel case; the rest are custom properties.
  const { 'color-scheme': colorScheme, ...vars } = cssVars(t, theme.shade)
  const style = { ...vars, colorScheme } as unknown as CSSProperties
  return (
    <figure className={`lk-preview${here ? ' is-here' : ''}`} style={style} aria-label={`Preview: ${label}`}>
      <div className="lk-pv-head">
        <span className="lk-pv-date">Saturday 3</span>
        <span className="lk-pv-left">2 left</span>
      </div>
      <div className="lk-pv-rows">
        <span className="lk-pv-rail" aria-hidden="true"><span className="lk-pv-dot" /></span>
        <div className="lk-pv-row"><span className="lk-pv-box" /><span className="lk-pv-time">07:30</span><span>Run</span></div>
        <div className="lk-pv-row is-tint"><span className="lk-pv-box" /><span className="lk-pv-time">09:00</span><span>Shop</span></div>
        <div className="lk-pv-row is-done"><span className="lk-pv-box is-on" /><span className="lk-pv-time" /><span>Read</span></div>
        <div className="lk-pv-warn">Pushed 2×</div>
      </div>
      <div className="lk-pv-heat" aria-hidden="true">{t.heat.map((h, i) => <span key={i} style={{ background: h }} />)}</div>
      <figcaption>{label}</figcaption>
    </figure>
  )
}

function OwnColour({ seed, onPick }: { seed: string; onPick: (hex: string) => void }) {
  const [typed, setTyped] = useState(seed)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setTyped(seed) }, [seed])
  function submit(e: FormEvent) {
    e.preventDefault()
    const hex = parseHex(typed)
    if (!hex) { setError('A colour is six hex digits, like #3f6b4a.'); return }
    setError(null)
    onPick(hex)
  }
  return (
    <div className="lk-own">
      <div className="lk-seeds" role="radiogroup" aria-label="Your colour">
        {SEEDS.map((s) => (
          <button key={s.hex} type="button" role="radio" aria-checked={seed === s.hex} aria-label={s.name}
            className="lk-seed" style={{ background: s.hex }} onClick={() => onPick(s.hex)} />
        ))}
      </div>
      <form className="lk-hex" onSubmit={submit}>
        <label className="lk-wheel">
          <span className="visually-hidden">Pick from a colour wheel</span>
          <input type="color" value={seed} onChange={(e) => onPick(e.target.value.toLowerCase())} />
        </label>
        <label className="lk-hex-field">
          <span className="visually-hidden">Hex colour</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="text" autoComplete="off"
            spellCheck={false} aria-invalid={!!error} aria-describedby={error ? 'lk-hex-error' : undefined} />
        </label>
        <button className="btn" type="submit">Use</button>
      </form>
      {error && <p className="lk-error" id="lk-hex-error" role="alert">{error}</p>}
    </div>
  )
}

/** The launcher icons (LOOK-10). Only the Android app can change its icon;
 *  a browser shows the choice but explains it; the iPhone app hides it. */
function IconPicker({ chosen, onSaved }: { chosen: string; onSaved: (key: string) => void }) {
  const native = features().appIcons
  const [device, setDevice] = useState<{ key: string; pending: string | null } | null>(null)
  useEffect(() => { void appIcon().then(setDevice) }, [])
  const shown = device?.pending ?? device?.key ?? chosen

  async function pick(icon: AppIcon) {
    if (!native) return
    if (await setAppIcon(icon.key)) {
      setDevice(await appIcon())
      onSaved(icon.key)
    }
  }

  return (
    <div className="lk-block">
      <div className="row-name" id="lk-icon">App icon</div>
      <div className="lk-icons" role="radiogroup" aria-labelledby="lk-icon">
        {ICONS.map((i) => (
          <button key={i.key} type="button" role="radio" aria-checked={shown === i.key} disabled={!native}
            className="lk-icon" onClick={() => void pick(i)}>
            <IconArt icon={i} />
            <span>{i.name}</span>
          </button>
        ))}
      </div>
      <p className="row-meta">
        {native
          ? 'It shows once you leave the app; shortcuts to GetIt may need adding again.'
          : 'The icon can be changed in the Android app.'}
      </p>
      {device?.pending && device.pending !== device.key && (
        <p className="lk-note" role="status">The {ICONS.find((i) => i.key === device.pending)?.name ?? 'new'} icon appears when you leave GetIt.</p>
      )}
    </div>
  )
}

/** The icon as the launcher draws it, in a circle. */
export function IconArt({ icon, size = 48 }: { icon: AppIcon; size?: number }) {
  const colour = { rail: icon.rail, ink: icon.ink, dot: icon.dot }
  return (
    <svg width={size} height={size} viewBox="18 18 72 72" aria-hidden="true" className="lk-icon-art">
      <circle cx="54" cy="54" r="36" fill={icon.bg} />
      {iconShapes(icon.kind).map((s, n) => (
        <rect key={n} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} fill={colour[s.colour]}
          transform={s.rot ? `rotate(${s.rot} ${s.ox} ${s.oy})` : undefined} />
      ))}
    </svg>
  )
}

/** The contrast figures of what is on screen now (LOOK-05). */
function Readability({ theme }: { theme: ResolvedTheme }) {
  const results = checkTokens(theme.tokens)
  const pass = results.every((r) => r.pass)
  const pick = (label: string) => results.find((r) => r.label === label)?.ratio ?? 0
  return (
    <div className="lk-block">
      <div className="lk-check">
        <span className="lk-check-head">Readability: {pass ? 'every check passes' : 'needs attention'}</span>
        <span className="row-meta">
          Text {pick('Text')}:1 · labels {pick('Labels')}:1 · accent {pick('Accent text and buttons')}:1 ·
          warnings {pick('Warnings')}:1. Needed: text 4.5:1, marks and chart lines 3:1.
        </span>
      </div>
    </div>
  )
}
