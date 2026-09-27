import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject, type TouchEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { FIXED_PAGES, pageForPath, type PageInfo, type Pages } from '../lib/pages'
import { drawerLayout, fanLayout, fanRows, gridLayout, rowLayout } from '../lib/pages-rules'
import { useNarrow } from './useNarrow'
import './nav.css'

/** The page bar. Which pages it holds comes from the modules that are on
 *  (src/lib/pages.ts); how it holds them is the person's choice of style in
 *  More: one row, two or three rows, a drawer, or a fan. On a desktop it is
 *  the sidebar whatever the style, since the styles exist to fit a phone.
 *  Onboarding is the only screen without it. */
export function Nav({ pages }: { pages: Pages | undefined }) {
  const navRef = useRef<HTMLElement>(null)
  const narrow = useNarrow(899)
  const { pathname } = useLocation()
  const current = pageForPath(pathname)
  // Before the modules have loaded, the three pages that always exist.
  const bar = pages?.bar ?? FIXED_PAGES
  const style = pages?.nav.style ?? 'row'
  useNavHeight(navRef, narrow)

  if (!narrow) {
    return (
      <nav ref={navRef} className="bottom-nav nav nav-side" aria-label="Pages">
        {bar.map((p) => <PageLink key={p.key} page={p} />)}
      </nav>
    )
  }
  if (style === 'two_rows' || style === 'three_rows') return <GridBar navRef={navRef} bar={bar} rows={style === 'two_rows' ? 2 : 3} current={current} />
  if (style === 'drawer') return <DrawerBar navRef={navRef} bar={bar} current={current} pathname={pathname} />
  if (style === 'fan') return <FanBar navRef={navRef} bar={bar} current={current} pathname={pathname} />
  return <RowBar navRef={navRef} bar={bar} current={current} />
}

/** The bar's height, as --nav-h on the root, for whatever floats above it
 *  (the add button). Two or three rows make the bar taller than the fixed
 *  72 px the add button used to assume. The page itself needs nothing: it
 *  sits above the bar in the app's grid and ends where the bar begins. */
function useNavHeight(ref: RefObject<HTMLElement>, narrow: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    const root = document.documentElement
    if (!el || !narrow) { root.style.removeProperty('--nav-h'); return }
    const set = () => root.style.setProperty('--nav-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => { ro.disconnect(); root.style.removeProperty('--nav-h') }
  })
}

function PageLink({ page, className, onClick, style }: {
  page: PageInfo; className?: string; onClick?: () => void; style?: CSSProperties
}) {
  return (
    <NavLink to={page.route} end onClick={onClick} style={style}
      className={['nav-item', page.primary ? 'is-primary' : '', className ?? ''].filter(Boolean).join(' ')}>
      <span className="nav-glyph" aria-hidden="true">{page.glyph}</span>
      <span className="nav-label">{page.label}</span>
    </NavLink>
  )
}

const columns = (pages: PageInfo[]) => pages.map((p) => (p.primary ? '1.25fr' : '1fr')).join(' ')
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A strip that scrolls sideways, fading at whichever edge has more behind
 *  it, and bringing the open page into view when it changes. */
function Scroller({ children, className, style, current }: {
  children: ReactNode; className: string; style?: CSSProperties; current: string | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState('')
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const f = (el.scrollLeft > 2 ? 'l' : '') + (el.scrollLeft + el.clientWidth < el.scrollWidth - 2 ? 'r' : '')
    setFade((x) => (x === f ? x : f))
  }, [])
  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(ref.current!)
    return () => ro.disconnect()
  }, [measure])
  useEffect(() => {
    const el = ref.current
    const a = el?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!el || !a) return
    const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth'
    // Clear of the 28 px fade, so the open page is never half-faded.
    const pad = 32
    if (a.offsetLeft - pad < el.scrollLeft) el.scrollTo({ left: a.offsetLeft - pad, behavior })
    else if (a.offsetLeft + a.offsetWidth + pad > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: a.offsetLeft + a.offsetWidth - el.clientWidth + pad, behavior })
    }
  }, [current])
  return <div ref={ref} className={`nav-scroll ${className}`} style={style} data-fade={fade || undefined} onScroll={measure}>{children}</div>
}

/* ---------- one row -------------------------------------------------------- */

function RowBar({ navRef, bar, current }: { navRef: RefObject<HTMLElement>; bar: PageInfo[]; current: string | null }) {
  const split = rowLayout(bar)
  if (!split) {
    return (
      <nav ref={navRef} className="bottom-nav nav nav-row" aria-label="Pages" style={{ gridTemplateColumns: columns(bar) }}>
        {bar.map((p) => <PageLink key={p.key} page={p} />)}
      </nav>
    )
  }
  // More than five: Today and Plan hold the left, More the right, and the
  // modules scroll between them, so the three ways home never scroll away.
  return (
    <nav ref={navRef} className="bottom-nav nav nav-row nav-row-split" aria-label="Pages">
      {split.fixedLeft.map((p) => <PageLink key={p.key} page={p} />)}
      <Scroller className="nav-row-scroll" current={current}>
        {split.scroll.map((p) => <PageLink key={p.key} page={p} />)}
      </Scroller>
      {split.fixedRight.map((p) => <PageLink key={p.key} page={p} />)}
    </nav>
  )
}

/* ---------- two or three rows --------------------------------------------- */

function GridBar({ navRef, bar, rows, current }: { navRef: RefObject<HTMLElement>; bar: PageInfo[]; rows: 2 | 3; current: string | null }) {
  const g = gridLayout(bar, rows)
  return (
    <nav ref={navRef} className="bottom-nav nav nav-grid" aria-label="Pages"
      style={{ ['--rows' as string]: g.rows } as CSSProperties}>
      <div className="nav-grid-prim" style={{ gridTemplateColumns: `repeat(${g.primary.length}, 1fr)` }}>
        {g.primary.map((p) => <PageLink key={p.key} page={p} />)}
      </div>
      <Scroller className="nav-grid-rest" current={current}
        style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(54px, 1fr))`, gridTemplateRows: `repeat(${g.rows}, auto)` }}>
        {g.rest.map((p) => <PageLink key={p.key} page={p} />)}
      </Scroller>
    </nav>
  )
}

/* ---------- dialogs (drawer sheet and fan) -------------------------------- */

/** Focus moves into the dialog when it opens, Tab stays inside it, Escape
 *  closes it, and focus goes back to the button that opened it. */
function useDialog(box: RefObject<HTMLElement>, opener: RefObject<HTMLElement>, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const el = box.current
    const back = opener.current
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])]
    const first = focusables().find((a) => a.getAttribute('aria-current') === 'page') ?? focusables()[0]
    first?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const i = f.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      // Only when focus was inside: a tap on Today should not be undone.
      if (back && (!document.activeElement || document.activeElement === document.body || el?.contains(document.activeElement))) {
        back.focus({ preventScroll: true })
      }
    }
  }, [box, opener])
}

/** A swipe up (or down) on an element: vertical, and long enough to mean it. */
function useVerticalSwipe(dir: 'up' | 'down', onSwipe: () => void, canStart: () => boolean = () => true) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: TouchEvent) => {
      start.current = e.touches.length === 1 && canStart() ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current
      start.current = null
      if (!s) return
      const dx = e.changedTouches[0].clientX - s.x
      const dy = e.changedTouches[0].clientY - s.y
      if ((dir === 'up' ? -dy : dy) > 36 && Math.abs(dy) > 1.2 * Math.abs(dx)) onSwipe()
    },
  }
}

/* ---------- drawer --------------------------------------------------------- */

function DrawerBar({ navRef, bar, current, pathname }: {
  navRef: RefObject<HTMLElement>; bar: PageInfo[]; current: string | null; pathname: string
}) {
  const [open, setOpen] = useState(false)
  const handle = useRef<HTMLButtonElement>(null)
  const d = drawerLayout(bar, current)
  useEffect(() => setOpen(false), [pathname])
  const swipeUp = useVerticalSwipe('up', () => setOpen(true))

  return (
    <>
      <nav ref={navRef} className="bottom-nav nav nav-drawer" aria-label="Pages"
        style={{ gridTemplateColumns: `${columns(d.onBar)} 1fr` }} {...swipeUp}>
        <span className="nav-grabber" aria-hidden="true" />
        {d.onBar.map((p) => <PageLink key={p.key} page={p} />)}
        <button ref={handle} type="button" className="nav-item nav-handle" aria-haspopup="dialog" aria-expanded={open}
          onClick={() => setOpen((o) => !o)}>
          <span className="nav-glyph" aria-hidden="true">☰</span>
          <span className="nav-label">Modules</span>
        </button>
      </nav>
      {open && <DrawerSheet pages={d.inSheet} opener={handle} onClose={() => setOpen(false)} />}
    </>
  )
}

function DrawerSheet({ pages, opener, onClose }: { pages: PageInfo[]; opener: RefObject<HTMLElement>; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useDialog(box, opener, onClose)
  // Down closes it, but only from the top: further down, it is a scroll.
  const swipeDown = useVerticalSwipe('down', onClose, () => (box.current?.scrollTop ?? 0) <= 0)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div ref={box} className="bottom-sheet nav-sheet" role="dialog" aria-modal="true" aria-label="All pages" {...swipeDown}>
        <span className="nav-sheet-grabber" aria-hidden="true" />
        <h2>Pages</h2>
        <div className="nav-sheet-grid">
          {pages.map((p) => <PageLink key={p.key} page={p} onClick={onClose} />)}
        </div>
      </div>
    </>
  )
}

/* ---------- fan ------------------------------------------------------------ */

function FanBar({ navRef, bar, current, pathname }: {
  navRef: RefObject<HTMLElement>; bar: PageInfo[]; current: string | null; pathname: string
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const f = fanLayout(bar)
  useEffect(() => setOpen(false), [pathname])
  const here = f.fan.find((p) => p.key === current)
  const cols = [...f.left.map(() => '1.25fr'), ...(f.fan.length ? ['1fr'] : []), ...f.right.map(() => '1fr')].join(' ')

  return (
    <>
      <nav ref={navRef} className={`bottom-nav nav nav-fan${open ? ' is-open' : ''}`} aria-label="Pages" style={{ gridTemplateColumns: cols }}>
        {f.left.map((p) => <PageLink key={p.key} page={p} />)}
        {f.fan.length > 0 && (
          <button ref={button} type="button" className={`nav-item nav-fan-btn${here ? ' is-here' : ''}`}
            aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="nav-fan-disc" aria-hidden="true">{here ? here.glyph : '✦'}</span>
            <span className="nav-label">{here ? here.label : 'Modules'}</span>
          </button>
        )}
        {f.right.map((p) => <PageLink key={p.key} page={p} />)}
      </nav>
      {open && <FanLayer pages={f.fan} opener={button} navRef={navRef} onClose={() => setOpen(false)} />}
    </>
  )
}

/** The pages fan out above the centre button in rows that widen as they
 *  rise: a triangle standing on its point. Each flies out from the button
 *  with a short stagger; with reduced motion they simply appear. */
function FanLayer({ pages, opener, navRef, onClose }: {
  pages: PageInfo[]; opener: RefObject<HTMLElement>; navRef: RefObject<HTMLElement>; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useDialog(box, opener, onClose)
  // Rendered closed first, opened on the next frame, so the move is animated.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const vw = document.documentElement.clientWidth
  const btn = opener.current?.getBoundingClientRect()
  const barTop = navRef.current?.getBoundingClientRect().top ?? window.innerHeight - 60
  const slot = vw < 400 ? 72 : 78
  const perRow = Math.max(2, Math.min(5, Math.floor((vw - 16) / slot)))
  const rows = fanRows(pages.length, perRow)
  const widest = Math.max(...rows) * slot
  const bx = btn ? btn.left + btn.width / 2 : vw / 2
  const by = btn ? btn.top + btn.height / 2 : barTop
  // Centred on the button, but moved in as far as it takes to stay on screen.
  const ox = Math.min(Math.max(bx, widest / 2 + 8), vw - widest / 2 - 8)

  let index = 0
  const items = rows.flatMap((k, r) => Array.from({ length: k }, (_, i) => {
    const p = pages[index]
    const x = (i - (k - 1) / 2) * slot
    // The outer items of a row sit a little lower: a fan, not a shelf.
    const y = -(50 + r * 76) + Math.pow(x / slot, 2) * 4
    const style = {
      ['--x' as string]: `${x}px`, ['--y' as string]: `${y}px`,
      ['--fx' as string]: `${bx - ox}px`, ['--fy' as string]: `${by - barTop}px`,
      ['--d' as string]: `${index * 14}ms`,
      left: ox, top: barTop,
    } as CSSProperties
    index++
    return <PageLink key={p.key} page={p} className="fan-item" onClick={onClose} style={style} />
  }))

  return (
    <>
      <div className="fan-scrim" onClick={onClose} />
      <div ref={box} className={`fan-layer${shown ? ' is-shown' : ''}`} role="dialog" aria-modal="true" aria-label="Other pages">
        {items}
      </div>
    </>
  )
}
