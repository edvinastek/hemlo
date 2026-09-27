import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { moduleByKey } from '../modules/registry'
import { entityFields, recordLine } from '../lib/day-tabs'
import './day.css'

/** A module tab's records for the day, one line each: the title from the
 *  first text field, a time if the record has one. The module's own page is
 *  where records are edited; this only shows what the day holds, and links
 *  there. Tasks of the module follow on the rail below. */
export function ModuleDay({ profileId, day, moduleKey, label }: {
  profileId: string; day: string; moduleKey: string; label: string
}) {
  const rows = useLiveQuery(async () => {
    const records = (await db.module_record.where('[profile_id+module_key]').equals([profileId, moduleKey]).toArray())
      .filter((r) => r.record_date === day && !r.deleted_at)
    const def = moduleByKey.get(moduleKey) ?? (await db.module.get(moduleKey))?.definition
    return records
      .map((r) => ({ id: r.id, ...recordLine(r.data ?? {}, entityFields(def, r.entity)) }))
      .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title))
  }, [profileId, day, moduleKey], null)

  if (!rows || rows.length === 0) return null
  return (
    <section className="md" aria-labelledby={`md-${moduleKey}`}>
      <h2 className="section-title md-head" id={`md-${moduleKey}`}>
        <span>{label}</span>
        <Link className="md-open" to={`/m/${moduleKey}`}>Open {label}</Link>
      </h2>
      <ul className="md-list">
        {rows.map((r) => (
          <li key={r.id} className="md-item">
            <span className="md-time">{r.time ?? ''}</span>
            <span className="md-title">{r.title}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
