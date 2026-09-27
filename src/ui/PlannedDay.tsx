import type { CSSProperties } from 'react'
import { usePlannedRepeats } from '../lib/planned'
import { useModuleColours } from '../lib/colours'
import './colours.css'
import './planned.css'

/** On a day more than eight weeks ahead, the repeating tasks that will land
 *  on it. They are not tasks yet (the series makes those eight weeks
 *  before), so they are listed quietly, to read, not to tick. */
export function PlannedDay({ profileId, day }: { profileId: string; day: string }) {
  const planned = usePlannedRepeats(profileId, day, day).get(day) ?? []
  const colours = useModuleColours()
  if (planned.length === 0) return null
  return (
    <section className="planned-day" aria-label="Repeats to come">
      <p className="planned-day-title">Repeats to come</p>
      <p className="planned-day-why">Each becomes a task you can tick eight weeks before the day.</p>
      <ul>
        {planned.map((r) => {
          const c = colours.ofTask(r)
          return (
            <li key={`${r.seriesId}:${r.base}`}>
              <span className="planned-day-time">{r.time ?? ''}</span>
              {c ? <i className="mod-dot" style={{ '--mod': c } as CSSProperties} aria-hidden="true" /> : <i aria-hidden="true" />}
              <span className="planned-day-name">{r.title}</span>
              <span className="planned-mark" aria-hidden="true">↻</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
