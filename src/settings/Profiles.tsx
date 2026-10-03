import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { edit } from '../lib/write'
import { readSettings } from '../lib/settings'
import { PROFILE_MEMORY, profileDeleteProblem, profileNameProblem } from '../lib/accounts-rules'
import { cleanZone, readZoneChoice, zoneLabel, type ZoneChoice } from '../lib/timezone-rules'
import { phoneZone, saveZoneChoice, zoneChoice } from '../lib/timezone'
import { offerUndo } from '../ui/Undo'
import { SearchPick, type PickItem } from '../ui/SearchPick'
import type { Profile } from '../lib/types'
import './accounts.css'

/** Remember which profile this device opened last. The device holds one
 *  account at a time, and a remembered profile that is not among its
 *  profiles is passed over, so one key is enough. */
export function rememberProfile(_userId: string | undefined, profileId: string) {
  try { localStorage.setItem(PROFILE_MEMORY, profileId) } catch { /* not kept: fine */ }
}
export function rememberedProfile(_userId?: string | undefined): string | null {
  try { return localStorage.getItem(PROFILE_MEMORY) } catch { return null }
}

/** More → Profile → Profiles (SET-02): the account's profiles, each with its
 *  own modules and data. Switch (remembered on this device), rename, add,
 *  and delete one that is not the account's own. A new profile starts with
 *  only the planner on and goes through the first-run setup. */
export function Profiles() {
  const { profile, session, setProfile } = useApp()
  const profiles = useLiveQuery(() => db.profile.toArray(), [], [] as Profile[])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  if (!profile) return null
  const live = profiles.filter((p) => !p.deleted_at)

  function open(p: Profile) {
    setProfile(p)
    rememberProfile(session?.user.id, p.id)
  }

  async function rename(p: Profile) {
    const problem = profileNameProblem(draft, live.filter((x) => x.id !== p.id))
    if (problem) { setNote(problem); return }
    await edit('profile', p, { name: draft.trim() })
    setRenaming(null)
    setNote(null)
  }

  async function add() {
    const problem = profileNameProblem(newName, live)
    if (problem) { setNote(problem); return }
    const now = new Date().toISOString()
    // A profile of this account in its household. Its settings start empty,
    // so it is not set up yet: opening it runs the first-run setup, where
    // its own template switches its modules on.
    const fresh = {
      id: crypto.randomUUID(), household_id: profile!.household_id, user_id: session?.user.id ?? null,
      name: newName.trim(), sex: null, birth_date: null, height_cm: null, activity_level: 1.375, goal: 'recomp',
      timezone: phoneZone() ?? 'UTC', day_start: '06:00', day_end: '22:00', ai_persona_name: profile!.ai_persona_name,
      is_default: false, country: profile!.country ?? null, city: profile!.city ?? null, settings: {},
      updated_at: now, deleted_at: null,
    } as Profile
    const saved = await edit<Profile>('profile', fresh, { ...fresh })
    setAdding(false)
    setNewName('')
    setNote(`${saved.name} added. Open it to set it up.`)
  }

  async function remove(p: Profile) {
    const problem = profileDeleteProblem(p, live)
    if (problem) { setNote(problem); return }
    if (p.id === profile!.id) {
      const other = live.find((x) => x.is_default) ?? live.find((x) => x.id !== p.id)
      if (other) open(other)
    }
    const gone = await edit('profile', p, { deleted_at: new Date().toISOString() })
    setDeleting(null)
    offerUndo(`${p.name} deleted`, () => edit('profile', gone, { deleted_at: null }))
  }

  return (
    <>
      <p className="section-title">Profiles</p>
      {live.map((p) => {
        const current = p.id === profile.id
        const set = readSettings(p)
        return (
          <div key={p.id} className="setting-row pr-row">
            {renaming === p.id ? (
              <div className="pr-edit">
                <input value={draft} maxLength={40} aria-label={`New name for ${p.name}`} autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void rename(p); if (e.key === 'Escape') setRenaming(null) }} />
                <button type="button" className="btn" onClick={() => setRenaming(null)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => void rename(p)}>Save</button>
              </div>
            ) : (
              <>
                <div>
                  <div className="row-name">{p.name}{p.is_default && <span className="chip pr-chip">account’s own</span>}</div>
                  <div className="row-meta">
                    {[set.onboarded ? null : 'not set up yet', p.timezone ? zoneLabel(p.timezone) : null].filter(Boolean).join(' · ')}
                  </div>
                  {deleting === p.id && (
                    <div className="pr-confirm" role="alertdialog" aria-label={`Delete ${p.name}`}>
                      <p className="row-meta">
                        {p.name} leaves every device, with its plan and logs. You have 8 seconds to undo it.
                      </p>
                      <div className="row-right">
                        <button type="button" className="btn" onClick={() => setDeleting(null)}>Keep it</button>
                        <button type="button" className="btn btn-primary" onClick={() => void remove(p)}>Delete {p.name}</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="row-right pr-tools">
                  <button type="button" className="btn" onClick={() => { setRenaming(p.id); setDraft(p.name); setNote(null) }}
                    aria-label={`Rename ${p.name}`}>Rename</button>
                  {!p.is_default && live.length > 1 && deleting !== p.id && (
                    <button type="button" className="btn" onClick={() => setDeleting(p.id)} aria-label={`Delete ${p.name}`}>Delete</button>
                  )}
                  <button type="button" className={current ? 'btn btn-primary' : 'btn'} aria-pressed={current}
                    disabled={current} onClick={() => open(p)}>{current ? 'Open now' : 'Switch'}</button>
                </div>
              </>
            )}
          </div>
        )
      })}
      {adding ? (
        <div className="setting-row">
          <div className="pr-edit">
            <input value={newName} maxLength={40} placeholder="A name: Sam, Work, Training block" aria-label="Name of the new profile" autoFocus
              onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
            <button type="button" className="btn" onClick={() => { setAdding(false); setNote(null) }}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => void add()}>Add</button>
          </div>
        </div>
      ) : (
        <div className="setting-row">
          <div>
            <div className="row-name">Another profile</div>
            <div className="row-meta">Its own modules, plan and logs in the same account: someone you plan for, or a second life.</div>
          </div>
          <button type="button" className="btn" onClick={() => { setAdding(true); setNote(null) }}>Add</button>
        </div>
      )}
      {note && <p className="mp-note" role="status">{note}</p>}
      <TimeZone profileId={profile.id} stored={profile.timezone} />
    </>
  )
}

/** Every zone the phone knows, for choosing one by hand. */
function zones(): PickItem[] {
  let list: string[] = []
  try { list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [] } catch { list = [] }
  if (!list.length) list = ['UTC', 'Europe/Amsterdam', 'Europe/London', 'Europe/Vilnius', 'America/New_York', 'Asia/Tokyo']
  return list.map((z) => ({ id: z, name: zoneLabel(z), extra: z }))
}

/** The time zone (GEN-69): the phone's, or one chosen. */
function TimeZone({ profileId, stored }: { profileId: string; stored: string | null }) {
  const [choice, setChoice] = useState<ZoneChoice>(readZoneChoice(null))
  useEffect(() => { void zoneChoice(profileId).then(setChoice) }, [profileId])
  const phone = phoneZone()
  async function save(next: ZoneChoice) {
    setChoice(next)
    await saveZoneChoice(profileId, next)
  }
  return (
    <>
      <div className="setting-row">
        <div>
          <div className="row-name">Time zone</div>
          <div className="row-meta">
            {choice.follow
              ? `Follows this phone: ${phone ? zoneLabel(phone) : 'unknown'}.`
              : `Set to ${choice.zone ? zoneLabel(choice.zone) : 'none'}${phone && phone !== choice.zone ? `; this phone is on ${zoneLabel(phone)}` : ''}.`}
            {' '}Used for the link that shows GetIt in Google Calendar. The app shows the phone’s own clock.
          </div>
        </div>
        <button type="button" className="switch" role="switch" aria-checked={choice.follow} aria-label="Time zone follows this phone"
          onClick={() => void save(choice.follow ? { follow: false, zone: cleanZone(stored) ?? phone ?? 'UTC' } : { follow: true, zone: null })} />
      </div>
      {!choice.follow && (
        <div className="setting-row">
          <div style={{ minWidth: 0 }}>
            <SearchPick items={zones()} label="Time zone" placeholder="Type a city"
              value={choice.zone ? zoneLabel(choice.zone) : null}
              onPick={(z) => void save({ follow: false, zone: z.id })} />
          </div>
        </div>
      )}
    </>
  )
}
