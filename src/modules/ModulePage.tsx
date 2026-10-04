import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { isModuleOn } from '../lib/day'
import { search } from '../lib/search-rules'
import { EmptyState } from '../ui/EmptyState'
import { Tip } from '../ui/Tip'
import { ModuleEditor } from '../ui/ModuleEditor'
import { Habits } from '../sections/Habits'
import { Supplements } from '../sections/Supplements'
import { Chores } from '../sections/Chores'
import { Stats } from '../sections/Stats'
import { Training } from '../sections/Training'
import { Sleep } from '../sections/Sleep'
import { Projects } from '../sections/Projects'
import { Finance } from '../sections/Finance'
import { Learning } from '../sections/Learning'
import { Health } from '../sections/Health'
import type { FieldDef, ModuleDef, ViewDef } from './types'
import { PAGE_VIEW_TYPES } from './def-rules'
import { setModuleEnabled, useModuleDef } from './defs'
import { saveListOrder, useListOrder, useLookups, useRecords, type Lookups, type Rec } from './records'
import { arrange } from './list-rules'
import { OrderLine, OrderSheet, RecordSelectBar } from './RecordTools'
import { useSelection } from '../ui/useSelection'
import { DayPickSheet } from '../ui/DayPickSheet'
import { copyRecords, deleteRecords } from './records'
import { offerUndo } from '../ui/Undo'
import { InlineForm, RecordSheet, formatValue } from './RecordSheet'
import { CalendarView, ListView, TableView, Totals, recordTitle } from './views'
import type { EntityDef } from './types'
import { BoardView } from './views/Board'
import { GridView } from './views/Grid'
import { ChartView } from './views/Chart'
import { FollowedSheet } from '../ui/FollowedEvents'
import { ModuleHeadProvider, ModuleMenu, ViewBar } from './ModuleHead'
import type { CalendarEvent } from '../lib/types'
import './modules.css'

/** Modules whose page is a section of its own instead of the generic views.
 *  To give a module its own page, add ONE line here: its key and the
 *  section component (which gets the profile and today's date). Keep one
 *  module per line, in any order, so lines added on different branches
 *  merge without a clash. */
const SECTION_PAGES: Record<string, (p: { profileId: string; day: string }) => JSX.Element | null> = {
  habits: Habits,
  supplements: Supplements,
  household: Chores,
  health: Health,
  stats: Stats,
  training: Training,
  sleep: Sleep,
  projects: Projects,
  finance: Finance,
  learning: Learning,
}
/** Modules with screens of their own, outside the module pages. */
const OWN_SCREENS: Record<string, { to: string; label: string }> = {
  nutrition: { to: '/food', label: 'Open Food' },
  shopping: { to: '/shop', label: 'Open Shopping' },
}

/** A module's own page, reached from the page bar as /m/<module key>: its
 *  name, a tab for each view, and the records in that view. Built-in and
 *  built modules are drawn the same way, from their definitions. */
export function ModulePage({ moduleKey }: { moduleKey: string }) {
  const profile = useApp((s) => s.profile)
  const def = useModuleDef(moduleKey)
  // The one rule for "on" (GEN-01), live.
  const enabled = useLiveQuery(async () => (profile ? isModuleOn(profile.id, moduleKey) : false), [profile?.id, moduleKey])
  const [editing, setEditing] = useState(false)

  // A different module in the same page component starts afresh.
  useEffect(() => setEditing(false), [moduleKey])

  if (def === undefined || !profile) return <div className="page"><div className="page-inner" /></div>
  if (def === null) {
    return (
      <div className="page"><div className="page-inner">
        <EmptyState title="There is no module here" action={{ label: 'See your modules', to: '/modules' }}>
          It may have been deleted on this or another device. What it held is kept.
        </EmptyState>
      </div></div>
    )
  }

  if (editing) {
    return (
      <div className="page"><div className="page-inner">
        <ModuleEditor moduleKey={moduleKey} onBack={() => setEditing(false)} />
      </div></div>
    )
  }

  return (
    <div className="page">
      <div className="page-inner">
        {enabled === false && (
          <div className="mp-actions" style={{ borderBottom: '1px solid var(--e-rule)' }}>
            <p className="mf-hint" style={{ flex: 1 }}>This module is switched off.</p>
            <button type="button" className="btn" onClick={() => void setModuleEnabled(profile.id, moduleKey, true)}>Switch on</button>
          </div>
        )}
        <Body key={def.key} def={def} profileId={profile.id} onEdit={() => setEditing(true)} />
      </div>
    </div>
  )
}

function Body({ def, profileId, onEdit }: { def: ModuleDef; profileId: string; onEdit: () => void }) {
  const Section = SECTION_PAGES[def.key]
  const own = OWN_SCREENS[def.key]
  return (
    <ModuleHeadProvider def={def} onEdit={onEdit}>
      {(head) => Section ? (
        <>
          {head}
          <Section profileId={profileId} day={format(new Date(), 'yyyy-MM-dd')} />
        </>
      ) : own ? (
        <>
          {head}
          <EmptyState mark={def.glyph} title="This module has a screen of its own" action={{ label: own.label, to: own.to }}>
            {def.summary}
          </EmptyState>
        </>
      ) : def.key === 'custom' ? (
        <>
          {head}
          <EmptyState mark="+" title="Build a module of your own" action={{ label: 'Build a module', to: '/modules?build=1' }}>
            A reading list, the car, plants: name it, pick what it tracks, and it gets a page like this one.
          </EmptyState>
        </>
      ) : <Generic def={def} profileId={profileId} onEdit={onEdit} head={head} />}
    </ModuleHeadProvider>
  )
}

type Sheet = { rec?: Rec; day?: string; entity: string; copy?: Record<string, unknown> } | null

function Generic({ def, profileId, onEdit, head }: { def: ModuleDef; profileId: string; onEdit: () => void; head: ReactNode }) {
  const views = def.views.filter((v) => !v.hidden && def.entities.some((e) => e.name === v.entity))
  const [activeKey, setActive] = useState<string | undefined>(views[0]?.key)
  const view = views.find((v) => v.key === activeKey) ?? views[0]
  const entity = def.entities.find((e) => e.name === view?.entity) ?? def.entities[0]
  const recs = useRecords(profileId, def.key, entity)
  const lookups = useLookups(profileId, entity?.fields ?? [])
  const [sheet, setSheet] = useState<Sheet>(null)
  const [query, setQuery] = useState('')
  const [ordering, setOrdering] = useState(false)
  const [copying, setCopying] = useState<Rec | null>(null)
  // The search over a module's records (GEN-13): offered once there are
  // enough of them to look through.
  const viewType = view?.type
  const searchable = !!recs && recs.length >= SEARCH_FROM && (viewType === 'list' || viewType === 'table' || viewType === 'board')
  // The view's own sort and filter (competitor review 4.2), kept per view.
  const orderKey = `${entity?.name ?? ''}:${view?.key ?? ''}`
  const order = useListOrder(profileId, def.key, orderKey, entity?.fields ?? [])
  const textOf = (f: FieldDef, v: unknown) => formatValue(f, v, lookups)
  const sortsHere = viewType === 'list' || viewType === 'table' || viewType === 'board'
  const arranged = useMemo(() => (recs && entity && order ? arrange(recs, entity.fields, sortsHere ? order : { filter: order.filter }, textOf) : recs),
    [recs, entity, order, sortsHere, lookups]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useRecordSearch(entity, arranged, lookups, searchable ? query : '')
  // Hold a record to select it and others (GEN-52): lists and tables.
  const picks = viewType === 'list' || viewType === 'table'
  const sel = useSelection(picks ? arranged ?? [] : [])
  // ?open=<id>: a record found by the Modules page's search opens in its sheet.
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !recs || !entity) return
    const rec = recs.find((r) => r.id === openId)
    if (rec) setSheet({ rec, entity: entity.name })
    setParams({}, { replace: true })
  }, [openId, recs, entity, setParams])

  if (!entity) {
    return (
      <>
        {head}
        <EmptyState mark={def.glyph ?? Array.from(def.name)[0]?.toUpperCase()} title="Nothing to keep yet" action={{ label: 'Add its first field', onClick: onEdit }}>
          A module keeps records made of fields: a name, a date, a number.
        </EmptyState>
      </>
    )
  }
  if (entity.table && !['calendar_event', 'sleep_log', 'workout_log', 'goal'].includes(entity.table)) {
    return <>{head}<p className="empty">These records are kept on another screen.</p></>
  }

  const open = (rec: Rec) => setSheet({ rec, entity: entity.name })
  const arrangedHere = !!order && !!(order.filter || (sortsHere && order.sort))
  const add = (day?: string) => setSheet({ day, entity: entity.name })
  const type: ViewDef['type'] = view && PAGE_VIEW_TYPES.includes(view.type) ? view.type : 'list'
  const noun = entity.label.toLowerCase()
  const sheetEntity = sheet ? def.entities.find((e) => e.name === sheet.entity) ?? entity : entity
  const empty = recs !== undefined && recs.length === 0

  return (
    <>
      {head}
      {/* The module's views are under the page's ⋮ (CALM-05); the first is the page. */}
      <ModuleMenu views={views.length > 1 ? views.map((v) => ({ key: v.key, name: v.name })) : undefined} active={view?.key} onView={(k) => { sel.stop(); setActive(k) }}
        items={[
          type !== 'form' && !empty && { label: sortsHere ? 'Sort and filter…' : 'Filter…', onSelect: () => setOrdering(true) },
          picks && !empty && sel.menuItem(`Select ${plural(noun)}`),
        ]}
        exportSource={{ dataset: `m:${def.key}:${entity.name}` }} calendar={type === 'calendar' || entity.table === 'calendar_event'} />
      {ordering && order && (
        <OrderSheet profileId={profileId} moduleKey={def.key} viewKey={orderKey} entity={entity} order={order} sortable={sortsHere} onClose={() => setOrdering(false)} />
      )}
      {view && views[0] && view.key !== views[0].key && <ViewBar name={view.name} onClose={() => setActive(views[0].key)} />}
      {recs === undefined || shown === undefined ? null : empty && type !== 'form' ? (
        // One add on the page: the round + (CALM-01); the empty page offers the
        // other way in, a file.
        <EmptyState mark={def.glyph ?? Array.from(def.name)[0]?.toUpperCase()} title={`No ${plural(noun)} yet`}
          more={[{ label: 'Import from a file', to: '/more?section=Data' }]}>
          Tap the round + button to add the first {noun}.
        </EmptyState>
      ) : (
        <>
          {searchable && <Tip id="records-search" />}
          {searchable && (
            <div className="mp-search">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${recs.length} ${plural(noun)}`} aria-label={`Search ${plural(noun)}`} />
            </div>
          )}
          {arrangedHere && <OrderLine order={order!} fields={entity.fields} onClear={() => void saveListOrder(profileId, def.key, orderKey, {})} />}
          {searchable && query.trim() && shown.length === 0 && <p className="mp-note">No {noun} has all of “{query.trim()}”.</p>}
          {!query.trim() && arrangedHere && shown.length === 0 && <p className="mp-note">No {noun} passes this filter.</p>}
          {type !== 'form' && <Totals entity={entity} recs={shown} />}
          {type === 'form' && <InlineForm key={entity.name} def={def} entity={entity} profileId={profileId} lookups={lookups} />}
          {type === 'calendar' && view && (
            <CalendarView entity={entity} view={view} recs={arranged ?? recs} lookups={lookups} onOpen={open} onAdd={add} />
          )}
          {type === 'board' && view && (
            <BoardView key={view.key} def={def} entity={entity} view={view} recs={shown} lookups={lookups} profileId={profileId} onOpen={open} />
          )}
          {type === 'grid' && view && (
            <GridView key={view.key} def={def} entity={entity} view={view} recs={arranged ?? recs} lookups={lookups} profileId={profileId} onOpen={open} />
          )}
          {type === 'chart' && view && <ChartView key={view.key} entity={entity} view={view} recs={arranged ?? recs} />}
          {type === 'list' && shown.length > 0 && <ListView entity={entity} recs={shown} lookups={lookups} onOpen={open} sel={sel} />}
          {type === 'table' && view && shown.length > 0 && (
            <TableView def={def} entity={entity} view={view} recs={shown} lookups={lookups} profileId={profileId} onOpen={open} sel={sel} />
          )}
          {sel.selecting && <RecordSelectBar def={def} entity={entity} profileId={profileId} sel={sel} shown={shown} lookups={lookups} />}
        </>
      )}
      {type !== 'form' && (
        <button type="button" className="fab" aria-label={`Add ${noun}`} onClick={() => add()}>+</button>
      )}
      {/* An event from a calendar the person follows is shown, not edited. */}
      {sheet?.rec?.row.subscription_id ? (
        <FollowedSheet event={sheet.rec.row as unknown as CalendarEvent} onClose={() => setSheet(null)} />
      ) : sheet && (
        <RecordSheet key={sheet.rec?.id ?? `new-${sheet.day ?? ''}-${sheet.copy ? 'copy' : ''}`} def={def} entity={sheetEntity} profileId={profileId}
          rec={sheet.rec} day={sheet.day} start={sheet.copy} lookups={lookups} onClose={() => setSheet(null)}
          onDuplicate={(values) => setSheet({ entity: sheetEntity.name, copy: values })}
          onCopyTo={(rec) => { setSheet(null); setCopying(rec) }} />
      )}
      {/* Copy to day: the record's sheet closes first, so no sheet is on a sheet (CALM-10). */}
      {copying && (
        <DayPickSheet title={`Copy ${noun} to`} onClose={() => setCopying(null)} onPick={(d) => {
          const rec = copying
          setCopying(null)
          if (!d) return
          void copyRecords(profileId, def, sheetEntity, [rec], d).then(({ made }) => {
            if (made.length) offerUndo(`${entity.label} copied`, () => deleteRecords(profileId, def, sheetEntity, made))
          })
        }} />
      )}
    </>
  )
}

/** How many records a module page holds before it offers a search. */
const SEARCH_FROM = 6

const plural = (noun: string) => (/(s|x|ch|sh)$/.test(noun) ? `${noun}es` : /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`)

/** Records that have every word typed, best first, by THE search
 *  (search-rules.ts): found by their title and by anything else filled in.
 *  With nothing typed, the records in the page's own order. */
function useRecordSearch(entity: EntityDef | undefined, recs: Rec[] | undefined, lookups: Lookups, query: string): Rec[] | undefined {
  return useMemo(() => {
    if (!recs || !entity || !query.trim()) return recs
    const items = recs.map((r) => ({
      rec: r,
      name: recordTitle(entity, r, lookups),
      extra: entity.fields.filter((f) => !f.hidden && f.type !== 'formula').map((f) => formatValue(f, r.values[f.name], lookups)).join(' '),
    }))
    return search(items, query).map((x) => x.rec)
  }, [entity, recs, lookups, query])
}
