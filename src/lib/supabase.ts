import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

/** One client for web, Android and Windows. The session is persisted so the
 *  app opens signed in, which matters most on the phone. */
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // PKCE: an email link carries a one-time code, not a session, so a link
    // opened on another device or forwarded by mistake cannot sign anyone in.
    flowType: 'pkce',
    // Links are handled explicitly (see auth-links.ts) so the app can tell a
    // password reset from a sign-up confirmation.
    detectSessionInUrl: false,
  },
})

export const hasCredentials = Boolean(url && key)
