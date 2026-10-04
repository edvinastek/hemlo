import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { saveSettings } from '../lib/write'
import { readSettings, type TodayCard } from '../lib/settings'
import { usePages, useUses, type PageInfo } from '../lib/pages'
import { orderByUse, pinPage, unpinPage } from '../lib/pages-rules'
import { foodRoute, hubSearch, recordName, recordRoute, recordWords, type HubModule, type HubRecord } from '../lib/hub-rules'
import { describeView, moduleView } from '../lib/module-view-rules'
import { setModuleEnabled, useModuleDefs, type ModuleEntry } from '../modules/defs'
import { ModuleBuilder } from '../modules/ModuleBuilder'
import { ModuleEditor } from '../ui/ModuleEditor'
import { EmptyState } from '../ui/EmptyState'
import { offerUndo } from '../ui/Undo'
import { FirstTip } from '../ui/Tip'
import './modules-hub.css'
import { useBackClose } from '../ui/useBackClose'

/** The Modules page (NAV-20 to NAV-22): every module that is on, as a dense
 *  grid of names, most used first, so the page bar can stay short. One
 *  search finds a module or anything a module holds. Holding a tile (or its
 *  ⋮ button) says what the module is and offers Pin to bar, Pin a card to
 *  Today, Settings and Hide. Modules that are off wait underneath, one tap
 *  from being switched on. The way to Settings sits by the title, under the
 *  one name it has everywhere. */
export function Modules() {
  const profile = useApp((s) => s.profile)
  const pages = usePages()
  const entries = useModuleDefs()
  const uses = useUses()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<PageInfo | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const building = params.get('build') === '1'

  const settings = readSettings(profile)
  const modulePages = useMemo(() => orderByUse((pages?.all ?? []).filter((p) => p.module), uses), [pages, uses])
  const byModule = new Map((entries ?? []).map((e) => [e.def.key, e]))
  const off = (entries ?? []).filter((e) => !e.enabled && e.def.key !== 'custom')

  const hubModules: HubModule[] = (entries ?? []).filter((e) => e.def.key !== 'custom').map((e) => {
    const page = (pages?.all ?? []).find((p) => p.module === e.def.key)
    return {
      key: page?.key ?? e.def.key, module: e.def.key, name: page?.label ?? e.def.name, summary: e.def.summary,
      keywords: e.def.keywords ?? [], on: e.enabled, route: page?.route ?? null,
    }
  })
  const records = useHubRecords(query.trim().length > 0, entries)
  const found = hubSearch(hubModules, records ?? [], query)

  if (!profile || !pages || !entries) return <div className="page"><div className="page-inner" /></div>

  if (editing) {
    return (
      <div className="page"><div className="page-inner">
        <ModuleEditor moduleKey={editing} tab="show" onBack={() => setEditing(null)} />
      </div></div>
    )
  }

  return (
    <div className="page">
      <div className="page-inner hub">
        <header className="page-head hub-head">
          <div className="hub-title">
            <h1 className="page-date">Modules</h1>
            <Link className="btn hub-settings" to="/more">Settings</Link>
          </div>
          <div className="hub-search">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a module, or anything in one" aria-label="Search modules and what they hold" />
          </div>
        </header>

        {query.trim() ? (
          <SearchResults found={found} query={query} onOpen={(route) => navigate(route)}
            onSwitchOn={(m) => void setModuleEnabled(profile.id, m, true)} />
        ) : (
          <>
            {modulePages.length === 0 ? (
              <EmptyState mark="⊞" title="Only the planner is on"
                action={{ label: 'Choose a module', onClick: () => document.getElementById('hub-off')?.scrollIntoView({ behavior: 'smooth' }) }}
                more={[{ label: 'Start from a template', to: '/more?page=modules&find=Starting%20layout' }]}>
                Switch one on for anything else you keep: food, habits, the household, a reading list.
              </EmptyState>
            ) : (
              <>
              <FirstTip ids={['hub-hold', 'make-yours']} />
              <ul className="hub-grid" aria-label="Modules that are on">
                {modulePages.map((p) => (
                  <Tile key={p.key} page={p} entry={byModule.get(p.module!)}
                    pinned={settings.nav.pinned.includes(p.key)}
                    carded={settings.today_cards.some((c) => c.kind === 'module' && c.key === p.module)}
                    onMenu={() => setMenu(p)} />
                ))}
              </ul>
              </>
            )}

            {/* Nothing to add: no empty section (CALM-15). */}
            {off.length > 0 && <p className="section-title" id="hub-off">Add a module</p>}
            {off.map((e) => (
              <div key={e.def.key} className="setting-row">
                <div>
                  <div className="row-name">{e.def.name}</div>
                  <div className="row-meta">{e.def.summary}</div>
                </div>
                <button type="button" className="btn" aria-label={`Switch on ${e.def.name}`}
                  onClick={() => void setModuleEnabled(profile.id, e.def.key, true)}>Switch on</button>
              </div>
            ))}
            <div className="mp-actions hub-foot">
              <button type="button" className="btn" onClick={() => setParams({ build: '1' })}>Build a module</button>
            </div>
          </>
        )}
      </div>
      {menu && (
        <TileMenu page={menu} summary={byModule.get(menu.module!)?.def.summary} onClose={() => setMenu(null)}
          onSettings={() => { setEditing(menu.module); setMenu(null) }} />
      )}
      {building && <ModuleBuilder onClose={() => setParams({})} />}
    </div>
  )
}

/* ---------- a tile ------------------------------------------------------------ */

/** Holding a finger still on a tile for half a second opens its menu; moving
 *  it first is a scroll. The ⋮ button does the same for everyone else. */
function useHold(onHold: () => void) {
  const timer = useRef<number>()
  const start = useRef<{ x: number; y: number } | null>(null)
  const held = useRef(false)
  const clear = () => { window.clearTimeout(timer.current); start.current = null }
  return {
    held,
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        held.current = false
        start.current = { x: e.clientX, y: e.clientY }
        timer.current = window.setTimeout(() => {
          held.current = true
          try { navigator.vibrate?.(12) } catch { /* no vibration here */ }
          onHold()
        }, 500)
      },
      onPointerMove: (e: ReactPointerEvent) => {
        const s = start.current
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) clear()
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  }
}

function Tile({ page, entry, pinned, carded, onMenu }: {
  page: PageInfo; entry?: ModuleEntry; pinned: boolean; carded: boolean; onMenu: () => void
}) {
  const navigate = useNavigate()
  const { held, handlers } = useHold(onMenu)
  // Only what is set: no description on the tile (it is in the ⋮).
  const marks = [pinned && 'on the bar', carded && 'on Today'].filter(Boolean).join(' · ')
  return (
    <li className="hub-tile">
      <button type="button" className="hub-open" {...handlers}
        onClick={() => { if (held.current) { held.current = false; return } navigate(page.route) }}
        aria-describedby={marks ? `hub-${page.key}-meta` : undefined} title={entry?.def.summary}>
        <span className="hub-glyph" aria-hidden="true">{page.glyph}</span>
        <span className="hub-name">{page.label}</span>
        {marks && <span className="hub-meta" id={`hub-${page.key}-meta`}>{marks}</span>}
      </button>
      <button type="button" className="hub-more" aria-label={`More for ${page.label}`} aria-haspopup="dialog" onClick={onMenu}>⋮</button>
    </li>
  )
}

/* ---------- the menu ---------------------------------------------------------- */

function TileMenu({ page, summary, onClose, onSettings }: {
  page: PageInfo; summary?: string; onClose: () => void; onSettings: () => void
}) {
  const profile = useApp((s) => s.profile)
  const pages = usePages()
  const [confirmHide, setConfirmHide] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useBackClose(onClose)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  if (!profile || !pages) return null
  const settings = readSettings(profile)
  const moduleKey = page.module!
  const pinned = settings.nav.pinned.includes(page.key)
  const card = settings.today_cards.find((c) => c.kind === 'module' && c.key === moduleKey)
  const view = moduleView(settings.module_views, moduleKey)
  const latest = () => db.profile.get(profile.id)

  async function togglePin() {
    const p = await latest()
    if (!p) return
    const nav = readSettings(p).nav
    await saveSettings(p, { nav: pinned ? unpinPage(nav, page.key) : pinPage(nav, page.key, pages!.all) })
    onClose()
  }
  async function toggleCard() {
    const p = await latest()
    if (!p) return
    const cards = readSettings(p).today_cards
    const next: TodayCard[] = card
      ? cards.filter((c) => !(c.kind === 'module' && c.key === moduleKey))
      : [...cards, { kind: 'module' as const, key: moduleKey, size: 'small' as const, show: 'always' as const }].slice(-6)
    await saveSettings(p, { today_cards: next })
    onClose()
  }
  async function hide() {
    await setModuleEnabled(profile!.id, moduleKey, false)
    onClose()
    offerUndo(`${page.label} hidden`, () => setModuleEnabled(profile!.id, moduleKey, true))
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div ref={box} className="bottom-sheet hub-menu" role="dialog" aria-modal="true" aria-label={page.label}>
        <h2><span className="hub-glyph is-small" aria-hidden="true">{page.glyph}</span> {page.label}</h2>
        {/* What the module is, and where it shows: here rather than on the tile. */}
        {summary && <p className="mp-note hub-menu-note">{summary}</p>}
        <p className="mp-note hub-menu-note">{describeView(view)}.</p>
        {!confirmHide ? (
          <div className="hub-actions">
            <button type="button" className="hub-action" onClick={() => void togglePin()}>
              <b>{pinned ? 'Unpin from the bar' : 'Pin to bar'}</b>
            </button>
            <button type="button" className="hub-action" onClick={() => void toggleCard()}
              disabled={!card && settings.today_cards.length >= 6}>
              <b>{card ? 'Take its card off Today' : 'Pin a card to Today'}</b>
              {!card && settings.today_cards.length >= 6 && <span>Today holds six cards; take one off first.</span>}
            </button>
            <button type="button" className="hub-action" onClick={onSettings}>
              <b>Settings</b>
            </button>
            <button type="button" className="hub-action" onClick={() => setConfirmHide(true)}>
              <b>Hide</b>
              <span>Nothing is deleted.</span>
            </button>
          </div>
        ) : (
          <div className="hub-confirm" role="alertdialog" aria-label={`Hide ${page.label}`}>
            <p>
              {page.label} leaves the bar, Today, Plan, Stats and the widget. Switching a module off hides it
              everywhere and deletes nothing: switch it on again here under Add a module, and everything comes back.
            </p>
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setConfirmHide(false)}>Keep it</button>
              <button type="button" className="btn btn-primary grow" onClick={() => void hide()}>Hide {page.label}</button>
            </div>
          </div>
        )}
        {!confirmHide && <div className="sheet-actions"><button type="button" className="btn grow" onClick={onClose}>Close</button></div>}
      </div>
    </>
  )
}

/* ---------- search ------------------------------------------------------------ */

function SearchResults({ found, query, onOpen, onSwitchOn }: {
  found: ReturnType<typeof hubSearch>; query: string; onOpen: (route: string) => void; onSwitchOn: (module: string) => void
}) {
  if (found.hits.length === 0) {
    return <p className="mp-note hub-none" role="status">Nothing has all of “{query.trim()}”. Try fewer words.</p>
  }
  return (
    <ul className="hub-results" aria-label="Found">
      {found.hits.map((h) => h.kind === 'module' ? (
        <li key={`m:${h.item.key}`} className="hub-result">
          {h.item.on && h.item.route ? (
            <button type="button" onClick={() => onOpen(h.item.route!)}>
              <span className="hub-r-name">{h.item.name}</span>
              <span className="hub-r-meta">Module · {h.item.summary}</span>
            </button>
          ) : h.item.on ? (
            <div className="hub-r-off">
              <span className="hub-r-name">{h.item.name}</span>
              <span className="hub-r-meta">Module, on · it has no page of its own</span>
            </div>
          ) : (
            <div className="hub-r-off">
              <span className="hub-r-name">{h.item.name}</span>
              <span className="hub-r-meta">Module, off · {h.item.summary}</span>
              <button type="button" className="btn" onClick={() => onSwitchOn(h.item.module)}>Switch on</button>
            </div>
          )}
        </li>
      ) : (
        <li key={`r:${h.item.id}`} className="hub-result">
          <button type="button" onClick={() => onOpen(h.item.route)}>
            <span className="hub-r-name">{h.item.name}</span>
            <span className="hub-r-meta">{h.item.meta}</span>
          </button>
        </li>
      ))}
      {found.more > 0 && <li className="mp-note">{found.more} more. Add a word to narrow it down.</li>}
    </ul>
  )
}

const dayText = (d: string | null | undefined) => { try { return d ? format(parseISO(d.slice(0, 10)), 'd MMM yyyy') : '' } catch { return '' } }

/** What the search looks through, read only once something is typed: the
 *  records of every module, habits, supplements, the household's chores,
 *  the person's own events and goals. Read from the local copy, so it finds
 *  things offline too. */
function useHubRecords(active: boolean, entries: ModuleEntry[] | undefined): HubRecord[] | undefined {
  const profile = useApp((s) => s.profile)
  const userId = useApp((s) => s.session?.user.id ?? null)
  return useLiveQuery(async () => {
    if (!active || !profile || !entries) return []
    const name = new Map(entries.map((e) => [e.def.key, e.def.name]))
    const out: HubRecord[] = []
    const stamp = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0)
    for (const r of await db.module_record.where('profile_id').equals(profile.id).toArray()) {
      if (r.deleted_at) continue
      out.push({
        id: r.id, module: r.module_key, name: recordName(r.data, name.get(r.module_key) ?? r.module_key), extra: recordWords(r.data),
        route: recordRoute(r.module_key, r.id), meta: [name.get(r.module_key), dayText(r.record_date)].filter(Boolean).join(' · '),
        recent: stamp(r.updated_at),
      })
    }
    for (const h of await db.habit.where('profile_id').equals(profile.id).toArray()) {
      if (h.deleted_at) continue
      out.push({ id: h.id, module: 'habits', name: h.name, extra: h.note ?? '', route: '/m/habits', meta: 'Habits', recent: stamp(h.updated_at) })
    }
    for (const x of await db.supplement.where('profile_id').equals(profile.id).toArray()) {
      if (x.deleted_at) continue
      out.push({ id: x.id, module: 'supplements', name: x.name, extra: x.dose_text ?? '', route: '/m/supplements', meta: 'Supplements', recent: stamp(x.updated_at) })
    }
    for (const c of await db.chore.where('household_id').equals(profile.household_id).toArray()) {
      if (c.deleted_at) continue
      out.push({ id: c.id, module: 'household', name: c.name, extra: [c.room, c.note].filter(Boolean).join(' '), route: '/m/household', meta: 'Household', recent: stamp(c.updated_at) })
    }
    for (const e of await db.calendar_event.where('profile_id').equals(profile.id).toArray()) {
      if (e.deleted_at || e.subscription_id) continue
      out.push({ id: e.id, module: 'agenda', name: e.title, extra: e.location ?? '', route: `/m/agenda?open=${e.id}`, meta: ['Agenda', dayText(e.starts_at)].join(' · '), recent: stamp(e.updated_at) })
    }
    // Recipes and the person's own foods open on the Food page.
    for (const r of await db.recipe.toArray()) {
      if (r.deleted_at) continue
      out.push({ id: r.id, module: 'nutrition', name: r.name, extra: r.role ?? '', route: foodRoute('recipe', r.id), meta: 'Recipe' })
    }
    if (userId) {
      for (const f of await db.food.where('owner_id').equals(userId).toArray()) {
        if (f.deleted_at) continue
        out.push({ id: f.id, module: 'nutrition', name: f.name, extra: f.name_nl ?? '', route: foodRoute('food', f.id), meta: 'Your food' })
      }
    }
    for (const g of await db.goal.where('profile_id').equals(profile.id).toArray()) {
      if (g.deleted_at) continue
      out.push({ id: g.id, module: 'projects', name: g.title, extra: '', route: '/m/projects', meta: 'Goal', recent: stamp(g.updated_at) })
    }
    return out
  }, [active, profile?.id, profile?.household_id, entries, userId])
}
