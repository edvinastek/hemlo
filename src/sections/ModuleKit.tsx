import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
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
import './kit.css'

/** Pieces the richer module pages (Training, Sleep, Projects, Finance,
 *  Learning, Health) share, so each page keeps the module's own views from
 *  its definition — the table, the month, any view added in Edit module —
 *  next to its own tabs. Nothing the generic page offered is lost. */

export interface Tab { key: string; name: string }

/** The tab a module page was last left on, kept on this device only. */
export function useTab(moduleKey: string, tabs: Tab[]): [string, (k: string) => void] {
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
 *  included) as tabs, after the page's own ones. */
export function defTabs(def: ModuleDef | null | undefined, skip: string[] = []): Tab[] {
  if (!def) return []
  return def.views.filter((v) => !v.hidden && !skip.includes(v.key) && def.entities.some((e) => e.name === v.entity))
    .map((v) => ({ key: `view:${v.key}`, name: v.name }))
}

/** One of the module's own views, drawn as the generic module page draws it,
 *  with its add button and record sheet. */
export function DefView({ def, viewKey, profileId, fab = true }: { def: ModuleDef; viewKey: string; profileId: string; fab?: boolean }) {
  const view = def.views.find((v) => v.key === viewKey)
  const entity = def.entities.find((e) => e.name === view?.entity) ?? def.entities[0]
  const recs = useRecords(profileId, def.key, entity)
  const lookups = useLookups(profileId, entity?.fields ?? [])
  const [sheet, setSheet] = useState<{ rec?: Rec; day?: string } | null>(null)
  if (!view || !entity) return <p className="empty">This view is no longer here.</p>
  const type: ViewDef['type'] = PAGE_VIEW_TYPES.includes(view.type) ? view.type : 'list'
  const open = (rec: Rec) => setSheet({ rec })
  const noun = entity.label.toLowerCase()
  return (
    <>
      {recs === undefined ? null : (
        <>
          {type !== 'form' && <Totals entity={entity} recs={recs} />}
          {type === 'calendar' && <CalendarView entity={entity} view={view} recs={recs} lookups={lookups} onOpen={open} onAdd={(day) => setSheet({ day })} />}
          {type === 'board' && <BoardView key={view.key} def={def} entity={entity} view={view} recs={recs} lookups={lookups} profileId={profileId} onOpen={open} />}
          {type === 'grid' && <GridView key={view.key} def={def} entity={entity} view={view} recs={recs} lookups={lookups} profileId={profileId} onOpen={open} />}
          {type === 'chart' && <ChartView key={view.key} entity={entity} view={view} recs={recs} />}
          {(type === 'list' || type === 'table' || type === 'form') && recs.length === 0 && (
            <p className="empty">No {noun}s yet. Tap the round + button to add the first one.</p>
          )}
          {(type === 'list' || type === 'form') && recs.length > 0 && <ListView entity={entity} recs={recs} lookups={lookups} onOpen={open} />}
          {type === 'table' && recs.length > 0 && (
            <TableView def={def} entity={entity} view={view} recs={recs} lookups={lookups} profileId={profileId} onOpen={open} />
          )}
        </>
      )}
      {fab && <button type="button" className="fab" aria-label={`Add ${noun}`} onClick={() => setSheet({})}>+</button>}
      {sheet && (
        <RecordSheet key={sheet.rec?.id ?? `new-${sheet.day ?? ''}`} def={def} entity={entity} profileId={profileId}
          rec={sheet.rec} day={sheet.day} lookups={lookups} onClose={() => setSheet(null)} />
      )}
    </>
  )
}

/** A bottom sheet with a form: a heading, the fields, and its buttons. */
export function Sheet({ title, onClose, onSubmit, children, actions, wide }: {
  title: string; onClose: () => void; onSubmit?: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean
}) {
  // Escape closes, as every sheet in the app does.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
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
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
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
