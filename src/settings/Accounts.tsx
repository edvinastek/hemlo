import { useState } from 'react'
import { useApp } from '../lib/store'
import { isNative } from '../lib/native'
import { beginAdd, emailOf, planSwitch, removeAccount, switchTo, useAccounts } from '../lib/accounts'
import { MAX_ACCOUNTS, type AccountView } from '../lib/accounts-rules'
import './accounts.css'

/** Settings → Data and account → Account: the accounts kept on this device, switching between
 *  them, adding one and taking one off. The device holds one account's data at
 *  a time; switching downloads the other account's own. */
export function Accounts() {
  const list = useAccounts((s) => s.list)
  const currentId = useApp((s) => s.session?.user.id ?? null)
  const online = useApp((s) => s.online)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const others = list.filter((a) => a.userId !== currentId)
  const open = list.find((a) => a.userId === currentId)

  async function start(a: AccountView) {
    setNote(null); setRemoving(null); setBusy(a.userId)
    try {
      const plan = await planSwitch(a.userId)
      if (!plan.ok) { setNote(plan.reason); return }
      if (plan.ask === 'password') { setAsking(a.userId); return }
      const r = await switchTo(a.userId)
      if (r) { setNote(r.error); if (r.needPassword) setAsking(a.userId) }
    } finally {
      setBusy(null)
    }
  }

  async function withPassword(userId: string, password: string) {
    setNote(null); setBusy(userId)
    try {
      const r = await switchTo(userId, password)
      if (r) setNote(r.error)
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    setNote(null); setBusy('add')
    try {
      const r = await beginAdd()
      if (r) setNote(r)
    } finally {
      setBusy(null)
    }
  }

  async function remove(userId: string) {
    setRemoving(null); setAsking(null)
    await removeAccount(userId)
  }

  return (
    <div className="acc">
      {open && others.length > 0 && (
        <div className="setting-row">
          <div className="acc-who">
            <div className="row-name">{open.name}</div>
            <div className="row-meta">{open.masked}</div>
          </div>
          <span className="chip">Open now</span>
        </div>
      )}
      {others.map((a) => (
        <div key={a.userId} className="setting-row">
          <div className="acc-who">
            <div className="row-name">{a.name}</div>
            <div className="row-meta">{a.masked}</div>
          </div>
          <div className="row-right">
            <button className="btn" aria-label={`Remove ${a.name} from this device`} disabled={busy !== null}
              onClick={() => { setAsking(null); setRemoving(removing === a.userId ? null : a.userId) }}>Remove</button>
            <button className="btn btn-primary" aria-label={`Switch to ${a.name}`} disabled={busy !== null || !online}
              onClick={() => void start(a)}>{busy === a.userId ? 'Checking…' : 'Switch'}</button>
          </div>
          {asking === a.userId && (
            <PasswordAsk account={a} busy={busy === a.userId}
              onCancel={() => setAsking(null)} onSubmit={(p) => void withPassword(a.userId, p)} />
          )}
          {removing === a.userId && (
            <div className="acc-extra">
              <p className="row-meta">
                Take {a.name} off this device? Its data stays in the account. Opening it here again
                needs its password.
              </p>
              <div className="row-right">
                <button className="btn" onClick={() => setRemoving(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => void remove(a.userId)}>Remove</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="setting-row">
        <div>
          <div className="row-name">Add another account</div>
          <div className="row-meta">Up to {MAX_ACCOUNTS} on this device, one open at a time.</div>
        </div>
        <button className="btn" disabled={busy !== null || !online} onClick={() => void add()}>
          {busy === 'add' ? 'Checking…' : 'Add'}
        </button>
      </div>
      {!online && <p className="empty acc-note">Adding or switching accounts needs a connection.</p>}
      <p className="empty acc-note" role="status" aria-live="polite">{note ?? ''}</p>
    </div>
  )
}

function PasswordAsk({ account, busy, onCancel, onSubmit }: {
  account: AccountView; busy: boolean; onCancel: () => void; onSubmit: (password: string) => void
}) {
  const [password, setPassword] = useState('')
  return (
    <form className="acc-extra" onSubmit={(e) => { e.preventDefault(); if (password) onSubmit(password) }}>
      <label className="acc-field">
        <span className="row-meta">Password for {account.masked}</span>
        <input type="password" autoComplete="current-password" autoFocus required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <div className="row-right">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !password}>{busy ? 'Opening…' : 'Open'}</button>
      </div>
    </form>
  )
}

/** The sign-in screen: accounts still kept on this device after the open one
 *  signed out. On the phone one opens with the phone's unlock; otherwise
 *  picking one fills in its address and the password is typed as usual. */
export function SavedAccounts({ onPick }: { onPick: (email: string) => void }) {
  const list = useAccounts((s) => s.list)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  if (list.length === 0) return null

  async function pick(a: AccountView) {
    setNote(null); setBusy(a.userId)
    try {
      if (isNative() && a.hasToken) {
        const plan = await planSwitch(a.userId)
        if (plan.ok && plan.ask === 'unlock') {
          const r = await switchTo(a.userId)
          if (!r) return
          setNote(r.error)
          if (!r.needPassword) return
        }
      }
      onPick(await emailOf(a.userId))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="acc acc-saved">
      <p className="section-title">On this device</p>
      {list.map((a) => (
        <div key={a.userId} className="setting-row">
          <div className="acc-who">
            <div className="row-name">{a.name}</div>
            <div className="row-meta">{a.masked}</div>
          </div>
          <div className="row-right">
            <button className="btn" aria-label={`Remove ${a.name} from this device`} disabled={busy !== null}
              onClick={() => void removeAccount(a.userId)}>Remove</button>
            <button className="btn btn-primary" aria-label={`Open ${a.name}`} disabled={busy !== null}
              onClick={() => void pick(a)}>{busy === a.userId ? 'Opening…' : 'Open'}</button>
          </div>
        </div>
      ))}
      <p className="empty acc-note" role="status" aria-live="polite">{note ?? ''}</p>
    </div>
  )
}
