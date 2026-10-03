import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { useModulesOn } from '../lib/day'
import {
  cancelInvites, createInvite, householdMembers, joinHousehold, leaveHousehold, ownsHousehold, removeMember, setMyName,
  type Invite, type Member,
} from '../lib/household-share'
import { RowMenu } from '../sections/shop-ui'
import './shopping-settings.css'

/** Sharing the cupboard, the shopping list and the chores with the people
 *  you live with (STK-05, HSE-12): the owner makes a code, the other person
 *  types it in. Who is in a household is the server's to say, so this part
 *  needs a connection; everything shared works offline once joined. Shown
 *  while Shopping or Household is on: those are what a household shares.
 *  "Your name in the household" is the Chores page's field while Household
 *  is on (one place to change it), and here otherwise. */
export function HouseholdShare() {
  const profile = useApp((s) => s.profile)
  const online = useApp((s) => s.online)
  const on = useModulesOn()
  const navigate = useNavigate()
  const householdId = profile?.household_id ?? null
  const [members, setMembers] = useState<Member[] | null>(null)
  const [owner, setOwner] = useState(false)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)
  const [asking, setAsking] = useState<null | 'leave' | 'join' | { remove: Member }>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!householdId || !online) return
    let live = true
    Promise.all([householdMembers(householdId), ownsHousehold(householdId)])
      .then(([m, o]) => {
        if (!live) return
        setMembers(m)
        setOwner(o)
        setName(m.find((x) => x.me)?.display_name ?? '')
      })
      .catch((e) => { if (live) setNote({ text: e.message, bad: true }) })
    return () => { live = false }
  }, [householdId, online, round])

  if (!profile || !householdId || !on || !(on.has('shopping') || on.has('household'))) return null
  const choresOn = on.has('household')
  const myName = (members ?? []).find((m) => m.me)?.display_name ?? null

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setNote(null)
    try { await fn() } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'That did not work. Try again.', bad: true })
    } finally { setBusy(false); setAsking(null) }
  }

  const others = (members ?? []).filter((m) => !m.me)
  const label = (m: Member) => (m.me ? `${m.display_name ?? 'You'} (you)` : m.display_name ?? 'Someone without a name yet')

  async function share(i: Invite) {
    const text = `Join my household in GetIt: in Settings, Shopping and household, choose Join a household and type ${i.code}. It works once, for two days.`
    try {
      if (navigator.share) { await navigator.share({ text }); return }
      await navigator.clipboard.writeText(i.code)
      setNote({ text: 'The code is copied.' })
    } catch { /* closed without sharing */ }
  }

  return (
    <>
      <p className="section-title">Household</p>
      <div className="setting-row ss-block">
        <div>
          <div className="row-name">Shared with</div>
          <div className="row-meta">The cupboard, the list, prices and chores. Health and plans stay your own.</div>
          {!online && <p className="ss-note">Who is in the household shows once the phone is online.</p>}
          {online && members && (
            <ul className="ss-members">
              {members.map((m) => (
                <li key={m.user_id}>
                  <span className="ss-member">{label(m)}</span>
                  <span className="ss-role">{m.role === 'owner' ? 'owner' : 'member'}</span>
                  {owner && !m.me
                    ? <RowMenu label={`More for ${label(m)}`} items={[{ label: 'Take out of the household', warn: true, onSelect: () => setAsking({ remove: m }) }]} />
                    : <span className="shop-more-gap" />}
                </li>
              ))}
            </ul>
          )}
          {online && members && others.length === 0 && <p className="ss-note">Only you, so far.</p>}
        </div>
      </div>

      {online && members && choresOn && (
        <div className="setting-row ss-block">
          <div>
            <div className="row-name">Your name in the household</div>
            <div className="row-meta">{myName ? `“${myName}”. ` : 'Not given yet. '}It is changed on the Chores page, beside the chores you do.</div>
          </div>
          <button type="button" className="btn" onClick={() => navigate('/m/household?fold=names')}>Change it</button>
        </div>
      )}

      {online && members && !choresOn && (
        <form className="setting-row ss-block" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => { await setMyName(householdId, name); setRound((n) => n + 1); setNote({ text: 'Saved.' }) }) }}>
          <div>
            <label className="row-name" htmlFor="ss-my-name">Your name in the household</label>
            <div className="row-meta">What the others in the household see.</div>
            <div className="ss-inline">
              <input id="ss-my-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Your name" />
              <button type="submit" className="btn" disabled={busy}>Save</button>
            </div>
          </div>
        </form>
      )}

      {online && owner && (
        <div className="setting-row ss-block">
          <div>
            <div className="row-name">Invite someone</div>
            <div className="row-meta">A code for one person, for two days.</div>
            {invite ? (
              <div className="ss-code-box">
                <p className="ss-code" aria-label={`Invite code ${invite.code.split('').join(' ')}`}>{invite.code}</p>
                <div className="ss-inline">
                  <button type="button" className="btn btn-primary" onClick={() => void share(invite)}>Share the code</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { await cancelInvites(householdId); setInvite(null) })}>Cancel the code</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => setInvite(await createInvite(householdId)))}>Make a code</button>
            )}
          </div>
        </div>
      )}

      {online && members && !owner && (
        <div className="setting-row ss-block">
          <div>
            <div className="row-name">Leave this household</div>
            <div className="row-meta">You go back to your own household, with the cupboard and list you had there.</div>
            {asking === 'leave' ? (
              <div className="ss-inline">
                <button type="button" className="btn shop-warn" disabled={busy} onClick={() => void run(async () => { await leaveHousehold(householdId); setNote({ text: 'You are back in your own household.' }); setRound((n) => n + 1) })}>Leave</button>
                <button type="button" className="btn" onClick={() => setAsking(null)}>Stay</button>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => setAsking('leave')}>Leave…</button>
            )}
          </div>
        </div>
      )}

      {typeof asking === 'object' && asking && 'remove' in asking && (
        <div className="setting-row ss-block" role="alertdialog" aria-label="Take someone out">
          <div>
            <div className="row-name">Take {label(asking.remove)} out of the household?</div>
            <div className="row-meta">They go back to a household of their own. What they added here stays here.</div>
            <div className="ss-inline">
              <button type="button" className="btn shop-warn" disabled={busy}
                onClick={() => void run(async () => { await removeMember(householdId, asking.remove.user_id); setRound((n) => n + 1) })}>Take out</button>
              <button type="button" className="btn" onClick={() => setAsking(null)}>Keep</button>
            </div>
          </div>
        </div>
      )}

      <form className="setting-row ss-block" onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (asking !== 'join') { setAsking('join'); return }
        void run(async () => {
          await joinHousehold(code)
          setCode('')
          setInvite(null)
          setNote({ text: 'You are in. The household’s cupboard and list are on the Shop page now.' })
          setRound((n) => n + 1)
        })
      }}>
        <div>
          <label className="row-name" htmlFor="ss-join">Join a household</label>
          <div className="row-meta">Type the code someone in it gave you.</div>
          <div className="ss-inline">
            <input id="ss-join" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (asking === 'join') setAsking(null) }}
              maxLength={14} placeholder="ABCDE-FGHJK" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="ss-code-input" />
            <button type="submit" className={asking === 'join' ? 'btn btn-primary' : 'btn'} disabled={busy || !online || code.replace(/[^A-Z0-9]/gi, '').length !== 10}>
              {asking === 'join' ? 'Yes, join' : 'Join'}
            </button>
          </div>
          {asking === 'join' && (
            <p className="ss-note">
              Your own cupboard and list stay in your own household; leaving brings you back to them. Join?
            </p>
          )}
          {!online && <p className="ss-note">Joining needs a connection.</p>}
        </div>
      </form>
      {note && <p className={`ss-said${note.bad ? ' is-bad' : ''}`} role="status">{note.text}</p>}
    </>
  )
}
