import { POLICY_VERSION, privacySections } from '../legal/policy'

/** The same policy the public page shows, readable inside the app. */
export function Privacy({ onBack }: { onBack?: () => void }) {
  return (
    <div className="page">
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}>
        {onBack && <button className="btn" onClick={onBack} style={{ marginBottom: 'var(--space-4)' }}>Back</button>}
        <h1 className="page-date">Privacy</h1>
        <p className="page-sub">Last changed {POLICY_VERSION}</p>
        {privacySections().map((s) => (
          <section key={s.heading} style={{ marginTop: 'var(--space-6)' }}>
            <h2 style={{ fontSize: 17, marginBottom: 'var(--space-2)' }}>{s.heading}</h2>
            {s.body.map((p) => <p key={p} style={{ margin: '0 0 var(--space-2)' }}>{p}</p>)}
          </section>
        ))}
      </div>
    </div>
  )
}
