import { useEffect, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { edit } from '../lib/write'
import { hoursBetween } from '../lib/day-tabs'
import type { SleepLog } from '../lib/types'
import { useSleepSettings } from '../lib/sleep'
import { compareNight, describeLate, describeVsTarget } from '../lib/sleep-rules'
import './day.css'

const QUALITY = [1, 2, 3, 4, 5]

/** Today's Sleep tab: the night logged against this day (the morning it
 *  ended), or a short form to log it. The full log and its target live on the
 *  Sleep page; this is the one entry a morning needs. */
export function SleepDay({ profileId, day }: { profileId: string; day: string }) {
  const rows = useLiveQuery(
    () => db.sleep_log.where('[profile_id+log_date]').equals([profileId, day]).toArray(),
    [profileId, day], null)
  // One row per profile and day on the server; a deleted one still holds the
  // slot, so it is brought back rather than a second made.
  const row = rows?.find((r) => !r.deleted_at) ?? null
  const held = rows?.[0] ?? null
  // The night against the target (SLP-02): hours short or over, bed late or early.
  const target = useSleepSettings(profileId)

  const [bed, setBed] = useState('')
  const [woke, setWoke] = useState('')
  const [quality, setQuality] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setBed(row?.went_to_bed?.slice(0, 5) ?? '')
    setWoke(row?.woke_at?.slice(0, 5) ?? '')
    setQuality(row?.quality ?? null)
    setEditing(false)
  }, [day, row?.id, row?.updated_at])

  if (!rows) return null
  const hours = bed && woke ? hoursBetween(bed, woke) : null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!bed || !woke) return
    const changes: Partial<SleepLog> = {
      profile_id: profileId, log_date: day, went_to_bed: bed, woke_at: woke,
      hours: hoursBetween(bed, woke), quality, deleted_at: null,
    }
    const base = held ?? ({ id: crypto.randomUUID() } as SleepLog)
    await edit('sleep_log', base, changes)
    setEditing(false)
  }

  if (row && !editing) {
    return (
      <section className="sleep-day" aria-labelledby="sleep-title">
        <h2 className="section-title" id="sleep-title">Sleep</h2>
        <div className="setting-row">
          <div>
            <div className="row-name">
              {row.went_to_bed?.slice(0, 5) ?? '—'} to {row.woke_at?.slice(0, 5) ?? '—'}
            </div>
            <div className="row-meta">
              {[row.hours != null ? `${Number(row.hours).toFixed(1)} h` : null,
                row.quality != null ? `quality ${row.quality} of 5` : null].filter(Boolean).join(' · ')}
            </div>
            {target && (() => {
              const c = compareNight(row, target)
              const line = [c.vsTarget != null ? `${describeVsTarget(c.vsTarget)} of ${target.target_hours} h` : null, describeLate(c.bedLate, 'bed') || null]
                .filter(Boolean).join(' · ')
              return line ? <div className="row-meta">{line}</div> : null
            })()}
          </div>
          <button className="btn" onClick={() => setEditing(true)}>Change</button>
        </div>
      </section>
    )
  }

  return (
    <section className="sleep-day" aria-labelledby="sleep-title">
      <h2 className="section-title" id="sleep-title">Sleep</h2>
      <form className="sleep-form" onSubmit={save}>
        <label>
          <span>To bed</span>
          <input type="time" value={bed} onChange={(e) => setBed(e.target.value)} aria-label="Went to bed" />
        </label>
        <label>
          <span>Woke</span>
          <input type="time" value={woke} onChange={(e) => setWoke(e.target.value)} aria-label="Woke at" />
        </label>
        <div className="sleep-quality" role="group" aria-label="Quality, 1 to 5">
          <span>Quality</span>
          <div>
            {QUALITY.map((q) => (
              <button key={q} type="button" aria-pressed={quality === q}
                onClick={() => setQuality(quality === q ? null : q)}>{q}</button>
            ))}
          </div>
        </div>
        <div className="sleep-actions">
          <span className="row-meta">{hours != null
            ? `${hours.toFixed(1)} h${target ? ` · ${describeVsTarget(Math.round((hours - target.target_hours) * 100) / 100)} of ${target.target_hours} h` : ''}`
            : 'Both times give the hours.'}</span>
          {row && <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>}
          <button type="submit" className="btn btn-primary" disabled={!bed || !woke}>Save</button>
        </div>
      </form>
    </section>
  )
}
