import { NavLink } from 'react-router-dom'

/** Five items, and they never change. Onboarding is the only screen without it. */
const ITEMS = [
  { to: '/', label: 'Today', glyph: '◉' },
  { to: '/plan', label: 'Plan', glyph: '▤' },
  { to: '/food', label: 'Food', glyph: '◍' },
  { to: '/shop', label: 'Shop', glyph: '⛬' },
  { to: '/more', label: 'More', glyph: '⋯' },
]

export function Nav() {
  return (
    <nav className="bottom-nav nav">
      {ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
