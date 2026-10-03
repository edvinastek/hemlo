import { useEffect, useMemo, useState } from 'react'
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
import type { ModuleDef, ViewDef } from './types'
import { PAGE_VIEW_TYPES } from './def-rules'
import { setModuleEnabled, useModuleDef } from './defs'
import { useLookups, useRecords, type Lookups, type Rec } from './records'
import { InlineForm, RecordSheet, formatValue } from './RecordSheet'
import { ExportLink } from '../ui/ExportLink'
import { CalendarView, ListView, TableView, Totals, recordTitle } from './views'
import type { EntityDef } from './types'
import { BoardView } from './views/Board'
import { GridView } from './views/Grid'
import { ChartView } from './views/Chart'
import { FollowedSheet } from '../ui/FollowedEvents'
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
            <p className="mf-hint" style={{ flex: 1 }}>This module is switched off, so it has no place on the page bar.</p>
            <button type="button" className="btn" onClick={() => void setModuleEnabled(profile.id, moduleKey, true)}>Switch on</button>
          </div>
        )}
        <Body key={def.key} def={def} profileId={profile.id} onEdit={() => setEditing(true)} />
      </div>
    </div>
  )
}

function Head({ def, onEdit, views, active, onView }: {
  def: ModuleDef; onEdit: () => void; views?: ViewDef[]; active?: string; onView?: (k: string) => void
}) {
  return (
    <header className="page-head mp-head">
      <div className="mp-title">
        <span className="mp-glyph" aria-hidden>{def.glyph ?? Array.from(def.name)[0]?.toUpperCase()}</span>
        <h1 className="page-date">{def.name}</h1>
        <button type="button" className="btn mp-edit" onClick={onEdit}>Edit module</button>
      </div>
      {def.summary && <p className="page-sub">{def.summary}</p>}
      {views && views.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Views">
          {views.map((v) => (
            <button key={v.key} role="tab" aria-selected={v.key === active} onClick={() => onView?.(v.key)}>{v.name}</button>
          ))}
        </div>
      )}
    </header>
  )
}

function Body({ def, profileId, onEdit }: { def: ModuleDef; profileId: string; onEdit: () => void }) {
  const Section = SECTION_PAGES[def.key]
  if (Section) {
    return (
      <>
        <Head def={def} onEdit={onEdit} />
        <Section profileId={profileId} day={format(new Date(), 'yyyy-MM-dd')} />
        {def.entities[0] && <ExportLink source={{
          dataset: `m:${def.key}:${def.entities[0].name}`,
          // The module's other things to save: its other entities, and the
          // household's done history beside its chores.
          more: [...def.entities.slice(1).map((e) => `m:${def.key}:${e.name}`), ...(def.key === 'household' ? [`m:household:chore_log`] : [])],
        }} />}
      </>
    )
  }
  const own = OWN_SCREENS[def.key]
  if (own) {
    return (
      <>
        <Head def={def} onEdit={onEdit} />
        <EmptyState mark={def.glyph} title="This module has a screen of its own" action={{ label: own.label, to: own.to }}>
          {def.summary}
        </EmptyState>
      </>
    )
  }
  if (def.key === 'custom') {
    return (
      <>
        <Head def={def} onEdit={onEdit} />
        <EmptyState mark="+" title="Build a module of your own" action={{ label: 'Build a module', to: '/modules?build=1' }}>
          A reading list, the car, plants: name it, pick what it tracks, and it gets a page like this one.
        </EmptyState>
      </>
    )
  }
  return <Generic def={def} profileId={profileId} onEdit={onEdit} />
}

type Sheet = { rec?: Rec; day?: string; entity: string } | null

function Generic({ def, profileId, onEdit }: { def: ModuleDef; profileId: string; onEdit: () => void }) {
  const views = def.views.filter((v) => !v.hidden && def.entities.some((e) => e.name === v.entity))
  const [activeKey, setActive] = useState<string | undefined>(views[0]?.key)
  const view = views.find((v) => v.key === activeKey) ?? views[0]
  const entity = def.entities.find((e) => e.name === view?.entity) ?? def.entities[0]
  const recs = useRecords(profileId, def.key, entity)
  const lookups = useLookups(profileId, entity?.fields ?? [])
  const [sheet, setSheet] = useState<Sheet>(null)
  const [query, setQuery] = useState('')
  // The search over a module's records (GEN-13): offered once there are
  // enough of them to look through.
  const viewType = view?.type
  const searchable = !!recs && recs.length >= SEARCH_FROM && (viewType === 'list' || viewType === 'table' || viewType === 'board')
  const shown = useRecordSearch(entity, recs, lookups, searchable ? query : '')
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
        <Head def={def} onEdit={onEdit} />
        <EmptyState mark={def.glyph ?? Array.from(def.name)[0]?.toUpperCase()} title="Nothing to keep yet" action={{ label: 'Add its first field', onClick: onEdit }}>
          A module keeps records made of fields: a name, a date, a number. Add the first, and it can hold records.
        </EmptyState>
      </>
    )
  }
  if (entity.table && !['calendar_event', 'sleep_log', 'workout_log', 'goal'].includes(entity.table)) {
    return <><Head def={def} onEdit={onEdit} /><p className="empty">These records are kept on another screen.</p></>
  }

  const open = (rec: Rec) => setSheet({ rec, entity: entity.name })
  const add = (day?: string) => setSheet({ day, entity: entity.name })
  const type: ViewDef['type'] = view && PAGE_VIEW_TYPES.includes(view.type) ? view.type : 'list'
  const noun = entity.label.toLowerCase()
  const sheetEntity = sheet ? def.entities.find((e) => e.name === sheet.entity) ?? entity : entity
  const empty = recs !== undefined && recs.length === 0

  return (
    <>
      <Head def={def} onEdit={onEdit} views={views} active={view?.key} onView={setActive} />
      {recs === undefined || shown === undefined ? null : empty && type !== 'form' ? (
        <EmptyState mark={def.glyph ?? Array.from(def.name)[0]?.toUpperCase()} title={`No ${plural(noun)} yet`}
          action={{ label: `Add the first ${noun}`, onClick: () => add() }}
          more={[{ label: 'Import from a file', to: '/more?section=Data' }]}>
          {def.summary ? `${def.summary} ` : ''}Each {noun} you add shows here as soon as it is saved, with or without a connection.
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
          {searchable && query.trim() && shown.length === 0 && <p className="mp-note">No {noun} has all of “{query.trim()}”.</p>}
          {type !== 'form' && <Totals entity={entity} recs={shown} />}
          {type === 'form' && <InlineForm key={entity.name} def={def} entity={entity} profileId={profileId} lookups={lookups} />}
          {type === 'calendar' && view && (
            <CalendarView entity={entity} view={view} recs={recs} lookups={lookups} onOpen={open} onAdd={add} />
          )}
          {type === 'board' && view && (
            <BoardView key={view.key} def={def} entity={entity} view={view} recs={shown} lookups={lookups} profileId={profileId} onOpen={open} />
          )}
          {type === 'grid' && view && (
            <GridView key={view.key} def={def} entity={entity} view={view} recs={recs} lookups={lookups} profileId={profileId} onOpen={open} />
          )}
          {type === 'chart' && view && <ChartView key={view.key} entity={entity} view={view} recs={recs} />}
          {type === 'list' && shown.length > 0 && <ListView entity={entity} recs={shown} lookups={lookups} onOpen={open} />}
          {type === 'table' && view && shown.length > 0 && (
            <TableView def={def} entity={entity} view={view} recs={shown} lookups={lookups} profileId={profileId} onOpen={open} />
          )}
        </>
      )}
      <ExportLink source={{ dataset: `m:${def.key}:${entity.name}` }} calendar={type === 'calendar' || entity.table === 'calendar_event'} />
      {type !== 'form' && (
        <button type="button" className="fab" aria-label={`Add ${noun}`} onClick={() => add()}>+</button>
      )}
      {/* An event from a calendar the person follows is shown, not edited. */}
      {sheet?.rec?.row.subscription_id ? (
        <FollowedSheet event={sheet.rec.row as unknown as CalendarEvent} onClose={() => setSheet(null)} />
      ) : sheet && (
        <RecordSheet key={sheet.rec?.id ?? `new-${sheet.day ?? ''}`} def={def} entity={sheetEntity} profileId={profileId}
          rec={sheet.rec} day={sheet.day} lookups={lookups} onClose={() => setSheet(null)} />
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
