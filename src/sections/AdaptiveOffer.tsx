import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { adaptiveNow, notNowAdaptive, takeAdaptive } from '../lib/body'
import { aboutText, offerText } from '../lib/adaptive-rules'
import { pickProfile } from '../lib/body-rules'
import { MoreMenu } from '../ui/MoreMenu'
import { PlainSheet } from '../modules/ModuleHead'
import { offerUndo } from '../ui/Undo'
import './adaptive.css'

/** The adaptive estimate of maintenance (BODY-17), as a quiet offer under
 *  the targets: one line, Use and Not now, and how it was worked out in its
 *  ⋮ → About, never on the screen. Shown only for today, and only when the
 *  last two or three weeks have enough logs and weigh-ins and the estimate
 *  differs from what the targets rest on (adaptive-rules.ts). */
export function AdaptiveOffer({ profileId, day, today }: { profileId: string; day: string; today: string }) {
  const { profile: active, profiles } = useApp()
  const profile = pickProfile(profiles, active, profileId)
  // Read again when the day's logs, weigh-ins or the profile change.
  const tick = useLiveQuery(async () => [
    await db.food_log.where('profile_id').equals(profileId).count(),
    await db.body_log.where('profile_id').equals(profileId).count(),
    (await db.profile.get(profileId))?.updated_at ?? '',
    (await db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'health').first())?.updated_at ?? '',
  ].join('|'), [profileId])
  const now = useLiveQuery(async () => {
    const fresh = (await db.profile.get(profileId)) ?? profile
    return fresh && day === today ? adaptiveNow(fresh, today) : null
  }, [profileId, day, today, tick])
  const [about, setAbout] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (note) return <p className="adapt-note" role="status">{note}</p>
  if (!now?.offer || !now.est.ok || now.bmr === null || now.current === null) return null
  const est = now.est
  const base = now.bmr
  const current = now.current

  async function use() {
    const fresh = (await db.profile.get(profileId)) ?? profile
    if (!fresh) return
    const done = await takeAdaptive(fresh, est.kcal, base, today)
    if (!done) return
    setNote(done.note)
    offerUndo(`Maintenance set to ${est.kcal.toLocaleString('en-GB')} kcal`, async () => { await done.undo(); setNote(null) })
  }

  return (
    <div className="adapt" role="group" aria-label="Maintenance from your logs">
      <p className="adapt-line">{offerText(est.kcal)}</p>
      <div className="adapt-actions">
        <button type="button" className="btn" onClick={() => void notNowAdaptive(profileId, today)}>Not now</button>
        <button type="button" className="btn" onClick={() => void use()}>Use</button>
        <MoreMenu className="adapt-more" label="More about this estimate" items={[{ label: 'About this estimate', onSelect: () => setAbout(true) }]} />
      </div>
      {about && (
        <PlainSheet title="Maintenance from your logs" onClose={() => setAbout(false)}>
          {aboutText(est, base, current).map((t) => <p key={t} className="adapt-about">{t}</p>)}
        </PlainSheet>
      )}
    </div>
  )
}
