import { create } from 'zustand'
import { getMeta, onResetLocal, setMeta } from './db'
import { features, isNative } from './native'
import { secureStorage } from './secure-storage'
import { useApp } from './store'
import { OPEN_PRICES_API, SHARE_AGENT, appQuery, authBody, authProblem, readAuth } from './open-prices-rules'

/** The person's Open Food Facts account on this device, for sharing prices
 *  with Open Prices (PRICE-05). Off until the person turns it on in
 *  Settings → Shopping and household and signs in.
 *
 *  The password goes once, to Open Prices' own sign-in (run by Open Food
 *  Facts), and is never kept. What comes back is a token: in the phone's
 *  secure storage in the Android app, in this tab's session storage in a
 *  browser (gone when the tab closes). It belongs to the GetIt account that
 *  signed it in; another GetIt account on the same phone does not see it.
 *  Signing out, turning sharing off, or signing out of GetIt forgets it. */

const KEY = 'getit.openprices'
const ON = 'openprices:on'

interface Saved { owner: string; user: string; token: string }

export interface OffAccount {
  /** Sharing switched on on this device. */
  on: boolean
  /** The Open Food Facts user name signed in, or null. */
  user: string | null
  /** Read from storage yet. */
  ready: boolean
}

export const useOffAccount = create<OffAccount>(() => ({ on: false, user: null, ready: false }))

const secure = secureStorage
const owner = () => useApp.getState().session?.user.id ?? null

async function readSaved(): Promise<Saved | null> {
  try {
    const raw = isNative()
      ? await (await secure()).SecureStorage.getItem(KEY)
      : window.sessionStorage.getItem(KEY)
    const s = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) as Saved : null
    if (!s || typeof s.token !== 'string' || typeof s.user !== 'string') return null
    // Signed in by another GetIt account on this phone: not this person's.
    return s.owner && s.owner === owner() ? s : null
  } catch {
    return null
  }
}

async function writeSaved(s: Saved | null): Promise<void> {
  if (isNative()) {
    const { SecureStorage } = await secure()
    if (s) await SecureStorage.setItem(KEY, JSON.stringify(s))
    else await SecureStorage.removeItem(KEY)
    return
  }
  if (s) window.sessionStorage.setItem(KEY, JSON.stringify(s))
  else window.sessionStorage.removeItem(KEY)
}

/** Reads the switch and who is signed in. */
export async function loadOffAccount(): Promise<void> {
  const [on, saved] = await Promise.all([getMeta<boolean>(ON, false), readSaved()])
  useOffAccount.setState({ on: !!on, user: saved?.user ?? null, ready: true })
}

/** The token for a request, or null when nobody is signed in. */
export async function offToken(): Promise<string | null> {
  return (await readSaved())?.token ?? null
}

/** Turns sharing on or off on this device. Off signs out as well. */
export async function setSharing(on: boolean): Promise<void> {
  await setMeta(ON, on)
  if (!on) await signOutOff()
  useOffAccount.setState({ on })
}

const platform = () => features().openPrices

/** Signs in with an Open Food Facts user name and password. Null on
 *  success, else what went wrong in words. */
export async function signInOff(user: string, password: string): Promise<string | null> {
  const me = owner()
  if (!me) return 'Sign in to GetIt first.'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return authProblem(0)
  let res: Response
  try {
    res = await fetch(`${OPEN_PRICES_API}/auth?${appQuery(platform())}`, {
      method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'X-User-Agent': SHARE_AGENT },
      body: authBody(user, password),
    })
  } catch {
    return authProblem(0)
  }
  if (!res.ok) return authProblem(res.status)
  const got = readAuth(await res.json().catch(() => null))
  if (!got) return authProblem(500)
  await writeSaved({ owner: me, user: got.user, token: got.token })
  useOffAccount.setState({ user: got.user })
  return null
}

/** Signs out: Open Prices is asked to end the session (if it can be
 *  reached), and the token is forgotten on this device either way. */
export async function signOutOff(): Promise<void> {
  const saved = await readSaved()
  if (saved && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    try {
      await fetch(`${OPEN_PRICES_API}/session?${appQuery(platform())}`, {
        method: 'DELETE', credentials: 'omit',
        headers: { Authorization: `Bearer ${saved.token}`, 'X-User-Agent': SHARE_AGENT },
      })
    } catch { /* forgotten here anyway */ }
  }
  await writeSaved(null).catch(() => undefined)
  useOffAccount.setState({ user: null })
}

/** The token was refused (it ran out, or the password changed): forget it,
 *  so the person is asked to sign in again. */
export async function forgetOffToken(): Promise<void> {
  await writeSaved(null).catch(() => undefined)
  useOffAccount.setState({ user: null })
}

// Signing out of GetIt (or another account signing in) forgets the token too.
onResetLocal(async () => {
  await writeSaved(null)
  useOffAccount.setState({ on: false, user: null })
})
