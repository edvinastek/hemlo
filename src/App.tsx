import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { UndoBar } from './ui/Undo'
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
import { ModulePage } from './modules/ModulePage'
import { Modules } from './screens/Modules'
import { WhatMoved } from './ui/WhatMoved'
import { noteProfileMet, noteThisRun } from './lib/tips'
import { usePages, pageForPath, pageAllowed, neighbour, type Pages } from './lib/pages'
import { useSwipe } from './ui/useSwipe'
import { useAccounts, watchAccounts } from './lib/accounts'
import { Switching } from './screens/Switching'
import { watchCalendarFollows } from './lib/calendar-links'
import { pickProfile } from './lib/accounts-rules'
import { rememberedProfile } from './settings/Profiles'
import { StatsAddress } from './sections/Stats'
import { watchShoppingTrip } from './lib/shopping'
import { watchLooks } from './lib/looks'

export default function App() {
  const { session, profile, recovering, setSession, setProfile, setProfiles } = useApp()

  // The pages the open profile has (from its modules), shared by the bar,
  // the routes and the swipe between pages.
  const pages = usePages()
  const appRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useSwipe(appRef, {
    enabled: !!pages?.nav.swipe,
    onSwipe: (dir) => {
      const to = pages ? neighbour(pages, pageForPath(pathname), dir) : null
      if (to) navigate(to.route)
      return !!to
    },
  })

  // Email links (confirmation, password reset) arrive once, at start-up or
  // while the app is open.
  // The accounts kept on this device follow the open one (see accounts.ts).
  useEffect(() => { listenForAuthLinks(); watchLifecycle(); watchAccounts() }, [])
  // The first run of this version here, before anyone signs in, and each
  // profile it meets, set up or not: what "What moved where" goes by.
  useEffect(() => { noteThisRun() }, [])
  useEffect(() => {
    if (profile) noteProfileMet(profile.id, readSettings(profile).onboarded || !!profile.height_cm)
  }, [profile?.id])
  // The chosen theme, mode and text size, following the open profile.
  useEffect(() => watchLooks(), [])
  const switching = useAccounts((s) => s.switching)
  const adding = useAccounts((s) => s.adding)

  // Whenever the active profile changes (or first arrives), set its reminders.
  useEffect(() => { if (profile) void refreshPlan() }, [profile?.id, profile?.ai_persona_name])

  // The home-screen widget shows the open profile's day.
  useEffect(() => { watchWidget(profile?.id ?? null) }, [profile?.id])
  // The shopping trip on the plan follows the list (SHOP-20).
  useEffect(() => watchShoppingTrip(profile?.id ?? null), [profile?.id])

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
    setProfiles(localProfiles.filter((p) => !p.deleted_at))
    // Keep the active profile the live row, not the copy taken when it was
    // chosen: otherwise an edit (height, goal, date of birth) stays invisible
    // to every screen until the app restarts, and the next edit made from the
    // stale copy writes the old values back.
    // The profile open now, else the one last chosen on this device, else the
    // account's own (SET-02); never a deleted one.
    const current = useApp.getState().profile
    setProfile(pickProfile(localProfiles, current?.id ?? null, rememberedProfile(useApp.getState().session?.user.id)))
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
  // Another account opened on this device has its own first run.
  useEffect(() => { setSetupDone(false) }, [session?.user.id])
  const setup = useLiveQuery(async () => {
    if (!profile) return undefined
    if (setupDone || readSettings(profile).onboarded) return { id: profile.id, needs: false }
    // Accounts set up before the flag existed are done if they have targets
    // or a height; targets are optional now, so the flag is the real sign.
    const targets = await db.target.where('profile_id').equals(profile.id).count()
    return { id: profile.id, needs: targets === 0 && !profile.height_cm }
  }, [profile?.id, setupDone, profile?.settings], undefined)
  // The answer counts only for the profile it was worked out for: a live
  // query keeps its last answer while the next one is read, and the answer
  // from before the profile arrived let a new account glimpse Today (and its
  // page bar) for a moment before the first-run wizard.
  const needsSetup = setup && setup.id === profile?.id ? setup.needs : undefined

  useEffect(() => watchConnection(() => useApp.getState().profiles.map((p) => p.id)), [])
  // Calendars the person follows: fetched on opening and every three hours.
  useEffect(() => watchCalendarFollows(), [session?.user.id])

  if (!hasCredentials) {
    return <div className="empty">No Supabase credentials. Copy .env.example to .env and fill it in.</div>
  }
  // Changing accounts covers everything until the other account's profile is in.
  if (switching) return <Switching userId={switching.userId} name={switching.name} />
  if (!session) return <Auth />
  if (recovering) return <SetPassword />
  if (adding) return <Auth adding />

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
    <div className="app" ref={appRef}>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/food" element={<Only page="food" pages={pages}><Food /></Only>} />
        <Route path="/shop" element={<Only page="shop" pages={pages}><Shop /></Only>} />
        <Route path="/more" element={<More />} />
        <Route path="/modules" element={<Modules />} />
        <Route path="/m/:key" element={<ModuleRoute pages={pages} />} />
        <Route path="/stats" element={<StatsAddress />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Nav pages={pages} />
      <UndoBar />
      <WhatMoved />
    </div>
  )
}

/** A page that exists only while its module is on. Switched off (here or on
 *  another device), or never there, its address leads to Today instead.
 *  Until the modules have loaded nothing is shown, so a page that does exist
 *  is never bounced away from on a cold start. */
function Only({ page, pages, children }: { page: string | null; pages: Pages | undefined; children: ReactNode }) {
  if (!pages) return null
  return pageAllowed(page, pages.all) ? <>{children}</> : <Navigate to="/" replace />
}

function ModuleRoute({ pages }: { pages: Pages | undefined }) {
  const { key = '' } = useParams()
  return (
    <Only page={pageForPath(`/m/${key}`)} pages={pages}>
      <ModulePage key={key} moduleKey={key} />
    </Only>
  )
}
