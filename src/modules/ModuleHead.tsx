import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ModuleDef } from './types'
import type { MenuItem } from '../ui/MoreMenu'
import { PageMenu } from '../ui/PageMenu'
import { useExport, type ExportSource } from '../ui/ExportLink'
import { useBackClose } from '../ui/useBackClose'
import './module-head.css'

/** A module page's head (v17, CALM-03): the glyph, the name and one ⋮.
 *  The ⋮ always holds Export…, Edit module and About this module; a page
 *  with views of its own adds "Views…", and a page with set-once choices
 *  (starter packs, time slots) adds those. The section that draws the page
 *  fills the ⋮ by rendering <ModuleMenu>, which is drawn into the head;
 *  a page that draws none gets the plain one. */

export interface ViewChoice { key: string; name: string }

interface HeadContext {
  def: ModuleDef
  onEdit: () => void
  /** Where a section's <ModuleMenu> is drawn: the head's right-hand end. */
  slot: HTMLElement | null
  /** A section's menu says it is there (+1) or gone (-1). */
  claim: (by: 1 | -1) => void
  /** A section hides the head while it shows a page of its own (the stats
   *  builder, a training session, one project). */
  hide: (on: boolean) => void
  /** Items a view inside the page adds to the ⋮ (Sort and filter, Select). */
  extra: MenuItem[]
  setExtra: (items: MenuItem[]) => void
}

const Ctx = createContext<HeadContext | null>(null)

/** The head and what the page beneath it says about it. */
export function ModuleHeadProvider({ def, onEdit, children }: { def: ModuleDef; onEdit: () => void; children: (head: ReactNode) => ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [claims, setClaims] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [extra, setExtra] = useState<MenuItem[]>([])
  const value: HeadContext = {
    def, onEdit, slot,
    claim: (by) => setClaims((n) => n + by),
    hide: setHidden,
    extra, setExtra,
  }
  const head = hidden ? null : (
    <header className="page-head mp-head">
      <div className="mp-title">
        <span className="mp-glyph" aria-hidden>{def.glyph ?? Array.from(def.name)[0]?.toUpperCase()}</span>
        <h1 className="page-date">{def.name}</h1>
        <span ref={setSlot} className="mp-menu-slot" />
        {claims === 0 && <ModuleMenu inline />}
      </div>
    </header>
  )
  return <Ctx.Provider value={value}>{children(head)}</Ctx.Provider>
}

/** The datasets a module's Export… offers: its first entity, with its other
 *  entities (and the household's done history beside its chores) as a
 *  choice at the top of the sheet. */
export function moduleExport(def: ModuleDef, entity?: string): ExportSource | null {
  const first = entity ?? def.entities[0]?.name
  if (!first) return null
  return {
    dataset: `m:${def.key}:${first}`,
    more: [...def.entities.filter((e) => e.name !== first).map((e) => `m:${def.key}:${e.name}`), ...(def.key === 'household' ? ['m:household:chore_log'] : [])],
  }
}

/** The page's ⋮, drawn in the module head. `views` are the module's own
 *  views (table, board, month); `items` the page's own choices, listed
 *  first. `exportSource` replaces what Export… saves (null: nothing to
 *  export); left out, it is the module's records. */
export function ModuleMenu({ views, active, onView, items = [], exportSource, calendar = false, inline = false }: {
  views?: ViewChoice[]
  active?: string
  onView?: (key: string) => void
  items?: (MenuItem | null | false)[]
  exportSource?: ExportSource | null
  calendar?: boolean
  /** Drawn where it stands instead of in the head (the head's own fallback). */
  inline?: boolean
}) {
  const ctx = useContext(Ctx)
  const [sheet, setSheet] = useState<null | 'views' | 'about'>(null)
  const claim = ctx?.claim
  // Before the first paint, so the head never shows the plain ⋮ first.
  useLayoutEffect(() => {
    if (inline || !claim) return
    claim(1)
    return () => claim(-1)
  }, [inline]) // eslint-disable-line react-hooks/exhaustive-deps
  const source = exportSource === undefined ? (ctx ? moduleExport(ctx.def) : null) : exportSource
  const exp = useExport(source, calendar)
  if (!ctx) return null
  const { def, onEdit } = ctx
  const menu = (
    <PageMenu label={`More for ${def.name}`} items={[
      views && views.length > 0 && onView ? { label: 'Views…', onSelect: () => setSheet('views') } : null,
      ...items,
      ...ctx.extra,
      exp.item,
      { label: 'Edit module', onSelect: onEdit },
      { label: 'About this module', onSelect: () => setSheet('about') },
    ]} sheets={<>
      {exp.sheet}
      {sheet === 'views' && views && onView && (
        <ViewsSheet views={views} active={active} onPick={(k) => { setSheet(null); onView(k) }} onClose={() => setSheet(null)} />
      )}
      {sheet === 'about' && <AboutSheet def={def} onEdit={() => { setSheet(null); onEdit() }} onClose={() => setSheet(null)} />}
    </>} />
  )
  if (inline) return menu
  return ctx.slot ? createPortal(menu, ctx.slot) : null
}

/** Items a view drawn inside a module page adds to the page's one ⋮ (CALM-03),
 *  while it is on screen. `key` says when the items have changed. */
export function useModuleMenuItems(items: (MenuItem | null | false)[], key: string) {
  const setExtra = useContext(Ctx)?.setExtra
  const list = items.filter((x): x is MenuItem => !!x)
  useLayoutEffect(() => {
    if (!setExtra) return
    setExtra(list)
    return () => setExtra([])
  }, [key, setExtra]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Hide the module head while `on` (a page of the section's own is open). */
export function useHideModuleHead(on: boolean) {
  const hide = useContext(Ctx)?.hide
  useLayoutEffect(() => {
    if (!hide) return
    hide(on)
    return () => hide(false)
  }, [on, hide])
}

/** A plain bottom sheet: a heading, what it holds, and Close. Back and
 *  Escape close it (CALM-10). */
export function PlainSheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useBackClose(onClose)
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="bottom-sheet mh-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div className="sheet-actions">
          {actions}
          <button type="button" className="btn grow" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  )
}

function ViewsSheet({ views, active, onPick, onClose }: { views: ViewChoice[]; active?: string; onPick: (k: string) => void; onClose: () => void }) {
  return (
    <PlainSheet title="Views" onClose={onClose}>
      <div className="mh-views" role="group" aria-label="Views">
        {views.map((v) => (
          <button key={v.key} type="button" className="mh-view" aria-pressed={v.key === active} onClick={() => onPick(v.key)}>{v.name}</button>
        ))}
      </div>
    </PlainSheet>
  )
}

function AboutSheet({ def, onEdit, onClose }: { def: ModuleDef; onEdit: () => void; onClose: () => void }) {
  return (
    <PlainSheet title={def.name} onClose={onClose} actions={<button type="button" className="btn" onClick={onEdit}>Edit module</button>}>
      <p className="mh-about">{def.summary || 'A module of your own.'}</p>
    </PlainSheet>
  )
}

/** The line over one of the module's own views, with the way back to the
 *  page (a module with no tabs has no other way back). */
export function ViewBar({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="mh-viewbar">
      <span className="mh-viewname">{name}</span>
      <button type="button" className="mh-viewclose" onClick={onClose}>Close view</button>
    </div>
  )
}

/** A quiet "+ Set budgets" line where an empty block would stand (CALM-15):
 *  the block is offered where it belongs instead of drawn empty. */
export function QuietAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="mh-quiet" onClick={onClick}><span aria-hidden>+</span>{label}</button>
}
