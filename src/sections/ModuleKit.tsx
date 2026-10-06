import { useState, type FormEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router-dom'
import { db } from '../lib/db'
import { edit } from '../lib/write'
import type { ModuleInstance } from '../lib/types'
import type { ModuleDef, ViewDef } from '../modules/types'
import { PAGE_VIEW_TYPES } from '../modules/def-rules'
import { ensureInstance } from '../modules/defs'
import { useLookups, useRecords, type Rec } from '../modules/records'
import { RecordSheet } from '../modules/RecordSheet'
import { CalendarView, ListView, TableView, Totals } from '../modules/views'
import { BoardView } from '../modules/views/Board'
import { GridView } from '../modules/views/Grid'
import { ChartView } from '../modules/views/Chart'
import { ViewBar, useModuleMenuItems } from '../modules/ModuleHead'
import { CopyToDaySheet, useListTools } from '../modules/RecordTools'
import { useBackClose } from '../ui/useBackClose'
import './kit.css'
import { planToday } from '../lib/day-edge'

/** Pieces the richer module pages (Training, Sleep, Projects, Finance,
 *  Learning, Health) share, so each page keeps the module's own views from
 *  its definition — the table, the month, any view added in Edit module —
 *  under its ⋮ → Views (v17, CALM-05), beside its own tabs. Nothing the
 *  generic page offered is lost. */

export interface Tab { key: string; name: string }

/** The tab a module page was last left on, kept on this device only. */
export function useTab(moduleKey: string, tabs: Tab[]): [string, (k: string) => void] {
  // The name from before Hemlo, kept: renaming it would lose what is stored under it.
  const storeKey = `getit:tab:${moduleKey}`
  const [tab, setTab] = useState<string>(() => {
    try { return localStorage.getItem(storeKey) ?? '' } catch { return '' }
  })
  const valid = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key ?? ''
  const pick = (k: string) => {
    setTab(k)
    try { localStorage.setItem(storeKey, k) } catch { /* private window: the tab is simply not remembered */ }
  }
  return [valid, pick]
}

/** The row of tabs under a module page's heading. */
export function ModuleTabs({ tabs, active, onTab, label = 'Views' }: { tabs: Tab[]; active: string; onTab: (k: string) => void; label?: string }) {
  if (tabs.length < 2) return null
  return (
    <div className="tabs kit-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === active} onClick={() => onTab(t.key)}>{t.name}</button>
      ))}
    </div>
  )
}

/** The module's own views (from its definition, Edit module's changes
 *  included), for the page's ⋮ → Views. */
export function defTabs(def: ModuleDef | null | undefined, skip: string[] = []): Tab[] {
  if (!def) return []
  return def.views.filter((v) => !v.hidden && !skip.includes(v.key) && def.entities.some((e) => e.name === v.entity))
    .map((v) => ({ key: `view:${v.key}`, name: v.name }))
}

/** One of the module's own views, drawn as the generic module page draws it,
 *  with its add button and record sheet; `onClose` adds the line over it
 *  with the way back to the page. */
export function DefView({ def, viewKey, profileId, fab = true, onClose, repeat = true }: {
  def: ModuleDef; viewKey: string; profileId: string; fab?: boolean; onClose?: () => void
  /** Offer "Change repeat" for several records (not for Finance's entries). */
  repeat?: boolean
}) {
  const view = def.views.find((v) => v.key === viewKey)
  const entity = def.entities.find((e) => e.name === view?.entity) ?? def.entities[0]
  const recs = useRecords(profileId, def.key, entity)
  const lookups = useLookups(profileId, entity?.fields ?? [])
  const [sheet, setSheet] = useState<{ rec?: Rec; day?: string; copy?: Record<string, unknown> } | null>(null)
  const [copying, setCopying] = useState<Rec | null>(null)
  const type: ViewDef['type'] = view && PAGE_VIEW_TYPES.includes(view.type) ? view.type : 'list'
  // Sort and filter, and hold to select (GEN-52), as on a built module's page;
  // their items go in the page's one ⋮ (CALM-03).
  const tools = useListTools({ def, entity, viewKey, viewType: type, profileId, recs, lookups, repeat })
  useModuleMenuItems(tools.menu, `${viewKey}|${tools.menu.map((m) => (m ? m.label : '')).join('|')}`)
  if (!view || !entity) return <p className="empty">This view is no longer here.</p>
  const open = (rec: Rec) => setSheet({ rec })
  const noun = entity.label.toLowerCase()
  const list = tools.arranged ?? recs
  return (
    <>
      {onClose && <ViewBar name={view.name} onClose={() => { tools.sel.stop(); onClose() }} />}
      {recs === undefined || list === undefined ? null : (
        <>
          {tools.line}
          {tools.filteredOut && <p className="mp-note">No {noun} passes this filter.</p>}
          {type !== 'form' && <Totals entity={entity} recs={list} />}
          {type === 'calendar' && <CalendarView entity={entity} view={view} recs={list} lookups={lookups} onOpen={open} onAdd={(day) => setSheet({ day })} />}
          {type === 'board' && <BoardView key={view.key} def={def} entity={entity} view={view} recs={list} lookups={lookups} profileId={profileId} onOpen={open} />}
          {type === 'grid' && <GridView key={view.key} def={def} entity={entity} view={view} recs={list} lookups={lookups} profileId={profileId} onOpen={open} />}
          {type === 'chart' && <ChartView key={view.key} entity={entity} view={view} recs={list} />}
          {(type === 'list' || type === 'table' || type === 'form') && recs.length === 0 && (
            <p className="empty">No {noun}s yet. Tap the round + button to add the first one.</p>
          )}
          {(type === 'list' || type === 'form') && list.length > 0 && <ListView entity={entity} recs={list} lookups={lookups} onOpen={open} sel={type === 'list' ? tools.sel : undefined} />}
          {type === 'table' && list.length > 0 && (
            <TableView def={def} entity={entity} view={view} recs={list} lookups={lookups} profileId={profileId} onOpen={open} sel={tools.sel} />
          )}
          {tools.overlays(list)}
        </>
      )}
      {fab && <button type="button" className="fab" aria-label={`Add ${noun}`} onClick={() => setSheet({})}>+</button>}
      {sheet && (
        <RecordSheet key={sheet.rec?.id ?? `new-${sheet.day ?? ''}-${sheet.copy ? 'copy' : ''}`} def={def} entity={entity} profileId={profileId}
          rec={sheet.rec} day={sheet.day} start={sheet.copy} lookups={lookups} onClose={() => setSheet(null)}
          onDuplicate={(values) => setSheet({ copy: values })} onCopyTo={(rec) => { setSheet(null); setCopying(rec) }} />
      )}
      {copying && <CopyToDaySheet def={def} entity={entity} profileId={profileId} rec={copying} onClose={() => setCopying(null)} />}
    </>
  )
}

/** A bottom sheet with a form: a heading, the fields, and its buttons. */
export function Sheet({ title, onClose, onSubmit, children, actions, wide }: {
  title: string; onClose: () => void; onSubmit?: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean
}) {
  // Back and Escape close it, as every sheet in the app does (CALM-10).
  useBackClose(onClose)
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit?.() }
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <form className={`bottom-sheet kit-sheet${wide ? ' is-wide' : ''}`} role="dialog" aria-label={title} onSubmit={submit} noValidate>
        <h2>{title}</h2>
        {children}
        {actions && <div className="sheet-actions kit-actions">{actions}</div>}
      </form>
    </>
  )
}

/** Delete, then "Delete for good" to be sure; the caller offers Undo after. */
export function DeleteButton({ onDelete, label = 'Delete', disabled }: { onDelete: () => void; label?: string; disabled?: boolean }) {
  const [sure, setSure] = useState(false)
  return sure
    ? <button type="button" className="btn kit-danger" disabled={disabled} onClick={onDelete}>Delete for good</button>
    : <button type="button" className="btn" disabled={disabled} onClick={() => setSure(true)}>{label}</button>
}

/** The profile's switch row for a module, live (undefined while loading). */
export function useInstance(profileId: string | null | undefined, moduleKey: string): ModuleInstance | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return null
    return (await db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === moduleKey).first()) ?? null
  }, [profileId, moduleKey])
}

/** Keep one of a module's own settings (module_instance.settings[key]) for
 *  this profile. It syncs with the profile; the module's other settings, and
 *  Edit module's changes, stay as they are. */
export async function saveModuleSetting(profileId: string, moduleKey: string, key: string, value: unknown): Promise<void> {
  const inst = await ensureInstance(profileId, moduleKey, true)
  const current = (await db.module_instance.get(inst.id)) ?? inst
  await edit('module_instance', current, { settings: { ...(current.settings ?? {}), [key]: value } })
}

/** Today as 'yyyy-MM-dd' on this device's calendar. */
export function localToday(now: Date = new Date()): string {
  // The person's day (GEN-70): just after midnight it can still be yesterday.
  return planToday(now)
}

/** The URL parameters of the page this section is on (/m/<key>?session=…),
 *  so a link from a task or a notification can open a part of the page.
 *  `update` changes several at once; null removes one. */
export function useSearch(): [URLSearchParams, (change: Record<string, string | null>) => void] {
  const [params, setParams] = useSearchParams()
  const update = (change: Record<string, string | null>) => {
    setParams((p) => {
      const next = new URLSearchParams(p)
      for (const [k, v] of Object.entries(change)) {
        if (v === null) next.delete(k)
        else next.set(k, v)
      }
      return next
    }, { replace: true })
  }
  return [params, update]
}
