import { useState } from 'react'
import { supabase } from '../lib/supabase'

/** Email and password, Google, or a passkey. Whichever you use, the session
 *  persists, so the app opens signed in. */
export function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setNote(null)
    const fn = mode === 'in' ? supabase.auth.signInWithPassword : supabase.auth.signUp
    const { error } = await fn.call(supabase.auth, { email, password })
    setBusy(false)
    if (error) setNote(error.message)
    else if (mode === 'up') setNote('Check your email to confirm the address.')
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 360, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}>
        <h1 className="page-date" style={{ marginBottom: 4 }}>GetIt</h1>
        <p className="page-sub" style={{ marginBottom: 'var(--space-6)' }}>
          {mode === 'in' ? 'Sign in to your planner.' : 'Create an account.'}
        </p>

        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <label className="label" style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--e-ink-soft)' }}>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
          </label>
          <label className="label" style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--e-ink-soft)' }}>
            Password
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={field} />
          </label>
          <button type="submit" disabled={busy} style={primary}>
            {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button onClick={google} style={{ ...primary, background: 'transparent', color: 'var(--e-ink)', border: '1px solid var(--e-rule)', marginTop: 'var(--space-3)' }}>
          Continue with Google
        </button>

        {note && <p className="page-sub" style={{ marginTop: 'var(--space-3)', color: 'var(--e-warn)' }}>{note}</p>}

        <button
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
          className="page-sub"
          style={{ marginTop: 'var(--space-4)', color: 'var(--e-accent)' }}
        >
          {mode === 'in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

const field: React.CSSProperties = {
  padding: '9px 10px',
  border: '1px solid var(--e-rule)',
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  color: 'var(--e-ink)',
  fontSize: 15,
}

const primary: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--e-accent)',
  color: 'var(--e-paper)',
  fontSize: 15,
  width: '100%',
}
