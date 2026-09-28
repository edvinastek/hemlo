import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { authRedirect } from '../lib/native'
import { useApp } from '../lib/store'
import { POLICY_VERSION } from '../legal/policy'
import { Privacy } from './Privacy'
import { addAccount, cancelAdd } from '../lib/accounts'
import { SavedAccounts } from '../settings/Accounts'

const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE === 'true'
const MIN_PASSWORD = 10

type Mode = 'in' | 'up' | 'reset'

/** Sign in, create an account, or ask for a password-reset link. Whichever way
 *  someone gets in, the session persists, so the app opens signed in.
 *  With `adding`, it signs in to one more account while another is open
 *  (More → Data → Account): only signing in, and Cancel goes back. */
export function Auth({ adding = false }: { adding?: boolean } = {}) {
  const linkNote = useApp((s) => s.linkNote)
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)

  if (showPolicy) return <Privacy onBack={() => setShowPolicy(false)} />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setNote(null)

    if (mode === 'reset') {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirect('recovery') })
      setBusy(false)
      // Same words whether or not the address has an account, so this form
      // cannot be used to find out who uses GetIt.
      setNote('If that address has an account, a reset link is on its way. Open it on this device.')
      return
    }

    if (adding) {
      // Checked on the side first: a wrong password leaves the open account open.
      const problem = await addAccount(email, password)
      setBusy(false)
      if (problem) setNote(problem)
      return
    }

    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: authRedirect('confirm'),
            // When and to which version of the policy consent was given: the
            // GDPR asks that explicit consent to health data can be shown.
            data: { health_consent_at: new Date().toISOString(), privacy_version: POLICY_VERSION },
          },
        })
    setBusy(false)

    if (error) {
      // The database refuses addresses that are not on the invite list; the
      // auth service reports that as a generic database error.
      const invite = /invite-only|saving new user/i.test(error.message)
      setNote(invite ? 'GetIt is invite-only for now. Ask to have your address added.' : error.message)
    } else if (mode === 'up') {
      setNote('Check your email and open the link on this device to confirm the address.')
    }
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirect('confirm') },
    })
  }

  const title = adding ? 'Add another account. The one open now stays on this device.'
    : mode === 'in' ? 'Sign in to your planner.'
    : mode === 'up' ? `Create an account. Passwords are at least ${MIN_PASSWORD} characters.`
    : 'Reset your password.'

  return (
    <div className="page">
      <div style={{ maxWidth: 360, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}>
        <h1 className="page-date" style={{ marginBottom: 4 }}>GetIt</h1>
        <p className="page-sub" style={{ marginBottom: 'var(--space-6)' }}>{title}</p>

        {!adding && mode === 'in' && <SavedAccounts onPick={(e) => { setEmail(e); setNote('Enter the password for this account.') }} />}

        {linkNote && !adding && <p className="page-sub" style={{ marginBottom: 'var(--space-4)', color: 'var(--e-ink)' }}>{linkNote}</p>}

        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <label className="label" style={labelStyle}>
            Email
            <input type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} style={field} />
          </label>
          {mode !== 'reset' && (
            <label className="label" style={labelStyle}>
              Password
              <input type="password" required minLength={mode === 'up' ? MIN_PASSWORD : undefined}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} style={field} />
            </label>
          )}
          {mode === 'up' && (
            <label className="label" style={{ ...labelStyle, gridTemplateColumns: 'auto 1fr', alignItems: 'start', gap: 10, color: 'var(--e-ink)' }}>
              <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                I agree that GetIt stores the health and fitness details I enter — weight, food,
                training — to plan with them.{' '}
                <button type="button" style={{ ...link, display: 'inline' }} onClick={() => setShowPolicy(true)}>Read the privacy policy</button>
              </span>
            </label>
          )}
          <button type="submit" disabled={busy || (mode === 'up' && !consent)} style={primary}>
            {busy ? 'Working…' : adding ? 'Add account' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        {GOOGLE_ENABLED && mode !== 'reset' && !adding && (
          <button onClick={google} style={{ ...primary, background: 'transparent', color: 'var(--e-ink)', border: '1px solid var(--e-rule)', marginTop: 'var(--space-3)' }}>
            Continue with Google
          </button>
        )}

        {note && <p className="page-sub" style={{ marginTop: 'var(--space-3)', color: 'var(--e-warn)' }}>{note}</p>}

        <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-4)', justifyItems: 'start' }}>
          {adding && <button className="page-sub" style={link} onClick={cancelAdd}>Cancel</button>}
          {!adding && mode !== 'in' && <button className="page-sub" style={link} onClick={() => { setMode('in'); setNote(null) }}>Back to sign in</button>}
          {!adding && mode === 'in' && <button className="page-sub" style={link} onClick={() => { setMode('reset'); setNote(null) }}>Forgot your password?</button>}
          {!adding && mode === 'in' && <button className="page-sub" style={link} onClick={() => { setMode('up'); setNote(null) }}>No account yet? Create one</button>}
        </div>
      </div>
    </div>
  )
}

/** Shown after a reset link has signed the person in: nothing else in the app
 *  is reachable until a new password is set. */
export function SetPassword() {
  const setRecovering = useApp((s) => s.setRecovering)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (a !== b) { setNote('The two passwords do not match.'); return }
    setBusy(true); setNote(null)
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(false)
    if (error) { setNote(error.message); return }
    setRecovering(false)
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 360, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}>
        <h1 className="page-date" style={{ marginBottom: 4 }}>New password</h1>
        <p className="page-sub" style={{ marginBottom: 'var(--space-6)' }}>At least {MIN_PASSWORD} characters.</p>
        <form onSubmit={save} style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <label className="label" style={labelStyle}>
            New password
            <input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
              value={a} onChange={(e) => setA(e.target.value)} style={field} />
          </label>
          <label className="label" style={labelStyle}>
            The same again
            <input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
              value={b} onChange={(e) => setB(e.target.value)} style={field} />
          </label>
          <button type="submit" disabled={busy} style={primary}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
        {note && <p className="page-sub" style={{ marginTop: 'var(--space-3)', color: 'var(--e-warn)' }}>{note}</p>}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, color: 'var(--e-ink-soft)' }
const field: React.CSSProperties = {
  padding: '9px 10px', border: '1px solid var(--e-rule)', borderRadius: 'var(--radius-md)',
  background: 'transparent', color: 'var(--e-ink)', fontSize: 15,
}
const primary: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--e-accent)',
  color: 'var(--e-paper)', fontSize: 15, width: '100%',
}
const link: React.CSSProperties = { color: 'var(--e-accent)' }
