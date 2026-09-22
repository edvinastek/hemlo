import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Route, Routes } from 'react-router-dom'
import { supabase, hasCredentials } from './lib/supabase'
import { useApp } from './lib/store'
import { db } from './lib/db'
import { sync, watchConnection } from './lib/sync'
import { Nav } from './ui/Nav'
import { Today } from './screens/Today'
import { Auth } from './screens/Auth'
import { Plan } from './screens/Plan'
import { Food } from './screens/Food'
import { Shop } from './screens/Shop'
import { More } from './screens/More'
import { Onboarding } from './screens/Onboarding'

export default function App() {
  const { session, profile, setSession, setProfile, setProfiles } = useApp()

  // Session first: the app opens signed in wherever it was left.
  useEffect(() => {
    if (!hasCredentials) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Profiles come from the local copy as a live query, so the app is usable
  // the moment they land rather than after the whole catalogue has downloaded.
  const localProfiles = useLiveQuery(() => db.profile.toArray(), [], undefined)

  useEffect(() => {
    if (!localProfiles) return
    setProfiles(localProfiles)
    const current = useApp.getState().profile
    const stillThere = current && localProfiles.some((p) => p.id === current.id)
    if (!stillThere) setProfile(localProfiles.find((p) => p.is_default) ?? localProfiles[0] ?? null)
  }, [localProfiles])

  // Network second.
  useEffect(() => {
    if (!session) return
    void (async () => {
      const local = await db.profile.toArray()
      await sync(local.map((p) => p.id))
    })()
  }, [session?.user.id])

  // Setup is complete once a target exists: that is the first thing in the app
  // that cannot exist without a height, a weight and a goal.
  const [setupDone, setSetupDone] = useState(false)
  const needsSetup = useLiveQuery(async () => {
    if (!profile || setupDone) return false
    const targets = await db.target.where('profile_id').equals(profile.id).count()
    return targets === 0 && !profile.height_cm
  }, [profile?.id, setupDone], undefined)

  useEffect(() => watchConnection(() => useApp.getState().profiles.map((p) => p.id)), [])

  if (!hasCredentials) {
    return <div className="empty">No Supabase credentials. Copy .env.example to .env and fill it in.</div>
  }
  if (!session) return <Auth />

  // The first run asks for the few things nothing can be calculated without,
  // and the nav stays away until it is done.
  if (profile && needsSetup === true) {
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
      {!profile && <p className="empty">Setting up your profile…</p>}
    </div>
  )
}
