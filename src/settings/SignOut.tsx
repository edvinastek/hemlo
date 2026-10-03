import { useState } from 'react'
import { db } from '../lib/db'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { push } from '../lib/sync'
import { signOutCheck } from '../lib/accounts-rules'

/** Sign out (SET-04): changes still waiting are sent first. If they cannot
 *  go (no connection, or the server is slow), it says how many would be lost
 *  and asks, instead of wiping them with the device's copy. */
export function SignOut() {
  const online = useApp((s) => s.online)
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setWarning(null)
    try {
      if (navigator.onLine && (await db.pending.count()) > 0) await push().catch(() => 0)
      const check = signOutCheck({ pending: await db.pending.count(), online: navigator.onLine })
      if (!check.ok) { setWarning(check.reason); return }
      await supabase.auth.signOut()
    } finally { setBusy(false) }
  }

  return (
    <div className="setting-row" style={{ alignItems: 'start' }}>
      <div>
        <div className="row-name">Sign out</div>
        <div className="row-meta">Waiting changes go first; then this device’s copy is cleared.</div>
        {warning && (
          <div className="pr-confirm" role="alertdialog" aria-label="Changes not sent">
            <p className="row-meta" style={{ color: 'var(--e-warn)' }}>{warning}</p>
            <div className="row-right">
              <button type="button" className="btn" onClick={() => setWarning(null)}>Stay signed in</button>
              {online && <button type="button" className="btn" disabled={busy} onClick={() => void start()}>Try again</button>}
              <button type="button" className="btn" style={{ color: 'var(--e-warn)' }} onClick={() => void supabase.auth.signOut()}>
                Sign out and lose them
              </button>
            </div>
          </div>
        )}
      </div>
      {!warning && <button type="button" className="btn" disabled={busy} onClick={() => void start()}>{busy ? 'Sending…' : 'Sign out'}</button>}
    </div>
  )
}
