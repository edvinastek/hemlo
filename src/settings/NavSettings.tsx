import { Link } from 'react-router-dom'
import { useApp } from '../lib/store'
import { saveSettings } from '../lib/write'
import { readSettings, type NavSettings as Nav, type NavStyle } from '../lib/settings'
import { usePages } from '../lib/pages'
import { isFixed, type PageInfo } from '../lib/pages-rules'
import './nav-settings.css'

const STYLES: { key: NavStyle; label: string }[] = [
  { key: 'row', label: 'One row' },
  { key: 'two_rows', label: 'Two rows' },
  { key: 'three_rows', label: 'Three rows' },
  { key: 'drawer', label: 'Drawer' },
  { key: 'fan', label: 'Fan' },
  { key: 'hub', label: 'Hub' },
]

/** From this many pages besides Today, Plan and More, the hub style is
 *  suggested: a bar of more than five is a crowd (NAV-20). */
const HUB_FROM = 5

/** The page bar: its style, which pages it shows and in what order, and
 *  whether a sideways swipe turns the page. Pages come from the modules that
 *  are on (listed below this in More); Today, Plan and More are always there. */
export function NavSettings() {
  const profile = useApp((s) => s.profile)
  const pages = usePages()
  if (!profile) return null
  const nav = readSettings(profile).nav
  const save = (change: Partial<Nav>) => void saveSettings(profile, { nav: change })

  const all = pages?.all ?? []
  const hidden = new Set(nav.hidden)
  const moduleCount = all.filter((p) => p.module).length
  const hub = nav.style === 'hub'
  // Only the pages between Plan and More move; Today and Plan lead and More
  // closes whatever is stored, so moving them would do nothing.
  const movable = all.filter((p) => !isFixed(p.key))

  function move(p: PageInfo, dir: -1 | 1) {
    const i = movable.findIndex((x) => x.key === p.key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= movable.length) return
    const next = [...movable]
    ;[next[i], next[j]] = [next[j], next[i]]
    save({ order: ['today', 'plan', ...next.map((x) => x.key), 'more'] })
  }

  function show(p: PageInfo, on: boolean) {
    const next = on ? nav.hidden.filter((k) => k !== p.key) : [...nav.hidden, p.key]
    save({ hidden: next })
  }

  return (
    <div className="nv">
      <p className="section-title">Page bar</p>
      <div className="setting-row nv-block">
        <div>
          <div className="row-name">Style</div>
          <div className="row-meta">
            How the pages sit at the bottom of the screen. Today and Plan always come first.
            {hub
              ? ' Hub: Today, Plan, up to two pages you pin, Stats, and the Modules page with everything else.'
              : moduleCount >= HUB_FROM ? ` With ${moduleCount} modules on, Hub keeps the bar short: the rest wait on the Modules page.` : ''}
          </div>
          <div className="nv-styles" role="radiogroup" aria-label="Page bar style">
            {STYLES.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={nav.style === s.key}
                className="nv-style" onClick={() => save({ style: s.key })}>
                <Preview style={s.key} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {hub ? (
        <div className="setting-row">
          <div>
            <div className="row-name">Pages</div>
            <div className="row-meta">
              {nav.pinned.length
                ? `Pinned: ${nav.pinned.map((k) => all.find((p) => p.key === k)?.label).filter(Boolean).join(' and ')}. `
                : 'Nothing pinned yet. '}
              Hold a module on the Modules page and choose Pin to bar.
            </div>
          </div>
          <Link className="btn" to="/modules">Modules</Link>
        </div>
      ) : (
      <div className="setting-row nv-block">
        <div>
          <div className="row-name">Pages</div>
          <div className="row-meta">
            Each module that is on has a page. Move them to change the order; switch one off to keep it
            off the bar without turning its module off.
          </div>
          <ul className="nv-pages" aria-label="Pages on the bar">
            {all.map((p) => {
              const fixed = isFixed(p.key)
              const i = movable.findIndex((x) => x.key === p.key)
              const on = !hidden.has(p.key)
              return (
                <li key={p.key} className={`nv-page${on ? '' : ' is-off'}${p.primary ? ' is-primary' : ''}`}>
                  <span className="nv-glyph" aria-hidden="true">{p.glyph}</span>
                  <span className="nv-name">
                    {p.label}
                    {fixed && <span className="nv-fixed">always there</span>}
                  </span>
                  {!fixed && (
                    <span className="nv-moves">
                      <button type="button" className="nv-move" aria-label={`Move ${p.label} up`}
                        disabled={i <= 0} onClick={() => move(p, -1)}>↑</button>
                      <button type="button" className="nv-move" aria-label={`Move ${p.label} down`}
                        disabled={i >= movable.length - 1} onClick={() => move(p, 1)}>↓</button>
                    </span>
                  )}
                  {!fixed && (
                    <button type="button" className="switch" role="switch" aria-checked={on}
                      aria-label={`Show ${p.label} on the bar`} onClick={() => show(p, !on)} />
                  )}
                </li>
              )
            })}
          </ul>
          {(nav.order.length > 0 || nav.hidden.length > 0) && (
            <button type="button" className="btn nv-reset" onClick={() => save({ order: [], hidden: [] })}>
              Back to the usual order
            </button>
          )}
        </div>
      </div>
      )}

      <div className="setting-row">
        <div>
          <div className="row-name">Swipe between pages</div>
          <div className="row-meta">
            Swipe sideways on a page to open the next one on the bar. Swipes on the days, the tabs and
            wide tables still move those.
          </div>
        </div>
        <button type="button" className="switch" role="switch" aria-checked={nav.swipe}
          aria-label="Swipe between pages" onClick={() => save({ swipe: !nav.swipe })} />
      </div>
    </div>
  )
}

/** A thumbnail of each style, drawn rather than described: the bottom of a
 *  phone, with Today and Plan in their colour. */
function Preview({ style }: { style: NavStyle }) {
  const W = 56
  const H = 40
  const shapes: JSX.Element[] = []
  const rect = (x: number, y: number, w: number, h: number, cls: string, r = 1.5) =>
    shapes.push(<rect key={shapes.length} x={x} y={y} width={w} height={h} rx={r} className={cls} />)
  const dot = (cx: number, cy: number, r: number, cls: string) =>
    shapes.push(<circle key={shapes.length} cx={cx} cy={cy} r={r} className={cls} />)

  if (style === 'row') {
    rect(4, 31, 9, 6, 'pv-p'); rect(15, 31, 9, 6, 'pv-p')
    for (let i = 0; i < 3; i++) rect(27 + i * 9, 32, 6, 4, 'pv-o')
  } else if (style === 'two_rows' || style === 'three_rows') {
    const rows = style === 'two_rows' ? 2 : 3
    const top = rows === 2 ? 26 : 20
    rect(4, top, 9, 37 - top, 'pv-p'); rect(15, top, 9, 37 - top, 'pv-p')
    for (let r = 0; r < rows; r++) for (let i = 0; i < 4; i++) rect(27 + i * 6.5, top + r * 6 + 0.5, 4.5, 4, 'pv-o')
  } else if (style === 'drawer') {
    rect(6, 8, 44, 18, 'pv-sheet', 3)
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) rect(10 + i * 10, 12 + r * 7, 6, 4, 'pv-o')
    rect(4, 31, 9, 6, 'pv-p'); rect(15, 31, 9, 6, 'pv-p'); rect(40, 32, 12, 4, 'pv-o')
  } else if (style === 'hub') {
    // A short bar, and the grid of the Modules page above it.
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) rect(10 + i * 13, 7 + r * 9, 10, 7, 'pv-sheet', 1.5)
    rect(4, 31, 9, 6, 'pv-p'); rect(15, 31, 9, 6, 'pv-p'); rect(27, 32, 6, 4, 'pv-o'); rect(36, 32, 6, 4, 'pv-o')
    rect(45, 31, 7, 6, 'pv-c', 1.5)
  } else {
    rect(4, 31, 9, 6, 'pv-p'); rect(15, 31, 9, 6, 'pv-p'); rect(44, 32, 7, 4, 'pv-o')
    dot(33, 32, 4, 'pv-c')
    // The triangle: one row of two, then three, above the centre button.
    dot(29, 22, 2.3, 'pv-o'); dot(37, 22, 2.3, 'pv-o')
    dot(25, 14, 2.3, 'pv-o'); dot(33, 14, 2.3, 'pv-o'); dot(41, 14, 2.3, 'pv-o')
  }
  return (
    <svg className="nv-preview" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="4" className="pv-frame" />
      <line x1="1" x2={W - 1} y1="28.5" y2="28.5" className="pv-rule" />
      {shapes}
    </svg>
  )
}
