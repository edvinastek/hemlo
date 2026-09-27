import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { ModuleEditor } from '../ui/ModuleEditor'
import { Habits } from '../sections/Habits'
import { Supplements } from '../sections/Supplements'
import { WeighIn } from '../sections/WeighIn'
import { Stats } from '../sections/Stats'
import type { ModuleDef, ViewDef } from './types'
import { PAGE_VIEW_TYPES } from './def-rules'
import { instanceFor, setModuleEnabled, useModuleDef } from './defs'
import { useLookups, useRecords, type Rec } from './records'
import { InlineForm, RecordSheet } from './RecordSheet'
import { CalendarView, ListView, TableView, Totals } from './views'
import './modules.css'

/** Modules whose page is a section the app already has. */
const SECTION_PAGES: Record<string, (p: { profileId: string; day: string }) => JSX.Element | null> = {
  habits: Habits,
  supplements: Supplements,
  health: WeighIn,
  stats: Stats,
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
  const enabled = useLiveQuery(async () => (profile ? !!(await instanceFor(profile.id, moduleKey))?.enabled : false), [profile?.id, moduleKey])
  const [editing, setEditing] = useState(false)

  // A different module in the same page component starts afresh.
  useEffect(() => setEditing(false), [moduleKey])

  if (def === undefined || !profile) return <div className="page"><div className="page-inner" /></div>
  if (def === null) {
    return (
      <div className="page"><div className="page-inner">
        <p className="empty">There is no module here. It may have been deleted. <Link className="mp-link" to="/more">Modules are in More</Link>.</p>
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
      </>
    )
  }
  const own = OWN_SCREENS[def.key]
  if (own) {
    return (
      <>
        <Head def={def} onEdit={onEdit} />
        <p className="mp-note">This module has a screen of its own.</p>
        <div className="mp-actions"><Link className="btn" to={own.to}>{own.label}</Link></div>
      </>
    )
  }
  if (def.key === 'custom') {
    return (
      <>
        <Head def={def} onEdit={onEdit} />
        <p className="empty">Build a module of your own under More, Modules: name it, pick what it tracks, and it gets a page like this one.</p>
        <div className="mp-actions"><Link className="btn" to="/more">Go to Modules</Link></div>
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

  if (!entity) {
    return (
      <>
        <Head def={def} onEdit={onEdit} />
        <p className="empty">This module has nothing to keep yet. Open Edit module and add a field: a name, a date, a number.</p>
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

  return (
    <>
      <Head def={def} onEdit={onEdit} views={views} active={view?.key} onView={setActive} />
      {recs === undefined ? null : (
        <>
          {type !== 'form' && <Totals entity={entity} recs={recs} />}
          {type === 'form' && <InlineForm key={entity.name} def={def} entity={entity} profileId={profileId} lookups={lookups} />}
          {type === 'calendar' && view && (
            <CalendarView entity={entity} view={view} recs={recs} lookups={lookups} onOpen={open} onAdd={add} />
          )}
          {type !== 'form' && type !== 'calendar' && recs.length === 0 && (
            <div className="empty">
              <p style={{ margin: 0 }}>No {noun}s yet. Tap the round + button to add the first {noun}; it shows here as soon as it is saved, with or without a connection.</p>
            </div>
          )}
          {type === 'list' && recs.length > 0 && <ListView entity={entity} recs={recs} lookups={lookups} onOpen={open} />}
          {type === 'table' && view && recs.length > 0 && (
            <TableView def={def} entity={entity} view={view} recs={recs} lookups={lookups} profileId={profileId} onOpen={open} />
          )}
        </>
      )}
      {type !== 'form' && (
        <button type="button" className="fab" aria-label={`Add ${noun}`} onClick={() => add()}>+</button>
      )}
      {sheet && (
        <RecordSheet key={sheet.rec?.id ?? `new-${sheet.day ?? ''}`} def={def} entity={sheetEntity} profileId={profileId}
          rec={sheet.rec} day={sheet.day} lookups={lookups} onClose={() => setSheet(null)} />
      )}
    </>
  )
}
