// Stands in for src/lib/supabase.ts while the store screenshots are taken
// (scripts/store-shots.mjs): signed in as an invented demo person, and every
// request answered at once with nothing, so the app runs on the demo week
// seeded into this browser's local copy and never touches the network.
export const DEMO_USER = {
  id: '00000000-0000-4000-8000-0000000000d1',
  email: 'demo@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  // Agreed to the current policy, so no notice covers the screen.
  user_metadata: { privacy_version: '9999-12-31', policy_read: '9999-12-31', health_consent_at: '2026-01-01T00:00:00Z' },
  created_at: '2026-01-01T00:00:00Z',
}
const session = {
  access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: DEMO_USER,
}

/** A query that can be chained any way and answers with no rows. */
function query(answer: { data: unknown; error: unknown }): unknown {
  const target = () => undefined
  const proxy: unknown = new Proxy(target, {
    get(_, prop) {
      if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ ...answer, count: 0, status: 200 }).then(ok)
      if (prop === 'single' || prop === 'maybeSingle') return () => query({ data: null, error: answer.error })
      return () => proxy
    },
    apply() { return proxy },
  })
  return proxy
}

const auth = new Proxy({}, {
  get(_, prop) {
    if (prop === 'onAuthStateChange') return () => ({ data: { subscription: { unsubscribe() { /* nothing to stop */ } } } })
    return async () => ({ data: { session, user: DEMO_USER }, error: null })
  },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = {
  auth,
  from: () => query({ data: [], error: null }),
  rpc: () => query({ data: null, error: { message: 'Demo: no server' } }),
  functions: { invoke: async () => ({ data: null, error: { message: 'Demo: no server' } }) },
  storage: { from: () => query({ data: null, error: { message: 'Demo: no server' } }) },
  channel: () => query({ data: null, error: null }),
  removeChannel: async () => undefined,
}

export const hasCredentials = true
