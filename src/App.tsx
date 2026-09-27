import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import { Route, Routes } from 'react-router-dom'
import { supabase, hasCredentials } from './lib/supabase'
import { useApp } from './lib/store'
import { db, resetLocal, localOwner, setMeta } from './lib/db'
import { sync, watchConnection } from './lib/sync'
import { Nav } from './ui/Nav'
import { Today } from './screens/Today'
import { Auth, SetPassword } from './screens/Auth'
import { listenForAuthLinks } from './lib/auth-links'
import { watchLifecycle, refreshPlan } from './lib/lifecycle'
import { applyWidgetTicks, watchWidget } from './lib/widget'
import { Plan } from './screens/Plan'
import { Food } from './screens/Food'
import { Shop } from './screens/Shop'
import { More } from './screens/More'
import { Onboarding } from './screens/Onboarding'
import { readSettings } from './lib/settings'

export default function App() {
  const { session, profile, recovering, setSession, setProfile, setProfiles } = useApp()

  // Email links (confirmation, password reset) arrive once, at start-up or
  // while the app is open.
  useEffect(() => { listenForAuthLinks(); watchLifecycle() }, [])

  // Whenever the active profile changes (or first arrives), set its reminders.
  useEffect(() => { if (profile) void refreshPlan() }, [profile?.id, profile?.ai_persona_name])

  // The home-screen widget shows the open profile's day.
  useEffect(() => { watchWidget(profile?.id ?? null) }, [profile?.id])

  // Session first: the app opens signed in wherever it was left.
  //
  // The local copy belongs to exactly one account. Signing out forgets it, and
  // a different account signing in on the same device starts from nothing —
  // otherwise the next person on a shared laptop would open the app to someone
  // else's weight log.
  useEffect(() => {
    if (!hasCredentials) return
    const adopt = async (s: Session | null) => {
      if (s) {
        const owner = await localOwner()
        if (owner && owner !== s.user.id) {
          await resetLocal()
          setProfile(null)
          setProfiles([])
        }
        await setMeta('owner', s.user.id)
      }
      setSession(s)
    }
    supabase.auth.getSession().then(({ data }) => void adopt(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') {
        void resetLocal().then(() => { setProfile(null); setProfiles([]); setSession(null) })
        return
      }
      void adopt(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Profiles come from the local copy as a live query, so the app is usable
  // the moment they land rather than after the whole catalogue has downloaded.
  const localProfiles = useLiveQuery(() => db.profile.toArray(), [], undefined)

  useEffect(() => {
    if (!localProfiles) return
    setProfiles(localProfiles)
    // Keep the active profile the live row, not the copy taken when it was
    // chosen: otherwise an edit (height, goal, date of birth) stays invisible
    // to every screen until the app restarts, and the next edit made from the
    // stale copy writes the old values back.
    const current = useApp.getState().profile
    const fresh = current ? localProfiles.find((p) => p.id === current.id) : undefined
    setProfile(fresh ?? localProfiles.find((p) => p.is_default) ?? localProfiles[0] ?? null)
  }, [localProfiles])

  // Network second.
  useEffect(() => {
    if (!session) return
    void (async () => {
      const local = await db.profile.toArray()
      // Ticks made on the widget while the app was closed go up with this sync.
      await applyWidgetTicks()
      await sync(local.map((p) => p.id))
      await refreshPlan()
    })()
  }, [session?.user.id])

  // Setup is complete once a target exists: that is the first thing in the app
  // that cannot exist without a height, a weight and a goal.
  const [setupDone, setSetupDone] = useState(false)
  const needsSetup = useLiveQuery(async () => {
    if (!profile || setupDone) return false
    if (readSettings(profile).onboarded) return false
    // Accounts set up before the flag existed are done if they have targets
    // or a height; targets are optional now, so the flag is the real sign.
    const targets = await db.target.where('profile_id').equals(profile.id).count()
    return targets === 0 && !profile.height_cm
  }, [profile?.id, setupDone, profile?.settings], undefined)

  useEffect(() => watchConnection(() => useApp.getState().profiles.map((p) => p.id)), [])

  if (!hasCredentials) {
    return <div className="empty">No Supabase credentials. Copy .env.example to .env and fill it in.</div>
  }
  if (!session) return <Auth />
  if (recovering) return <SetPassword />

  // Until the profile has landed and it is known whether setup is done, show
  // nothing that could be tapped: a new account would otherwise glimpse an
  // empty Today before the first-run wizard takes over.
  if (!profile || needsSetup === undefined) {
    return <div className="app"><p className="empty">Setting up your profile…</p></div>
  }

  // The first run asks for the few things nothing can be calculated without,
  // and the nav stays away until it is done.
  if (needsSetup === true) {
    return <Onboarding onDone={() => setSetupDone(true)} />
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/food" element={<Food />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/more" element={<More />} />
      </Routes>
      <Nav />
    </div>
  )
}
