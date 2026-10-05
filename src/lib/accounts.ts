import { create } from 'zustand'
import { createClient, type Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { db, resetLocal } from './db'
import { isNative } from './native'
import { secureStorage } from './secure-storage'
import { push } from './sync'
import { useApp } from './store'
import { applyWidgetTicks } from './widget'
import {
  alreadyHere, canAdd, canSwitch, cleanList, displayName, forget, remember, rename, shouldRemember,
  tokenIsDead, toView, withToken, FULL_TEXT, type AccountView, type Check, type SavedAccount, type SwitchCheck,
} from './accounts-rules'

/** Several accounts on one device (More → Data → Account).
 *
 *  The local database holds one account at a time. Switching sends what is
 *  waiting, asks for the phone's unlock (or, in a browser, the other
 *  account's password), forgets the local copy, and opens the other account,
 *  which then downloads its own data like a new phone would.
 *
 *  On the phone, each account's sign-in token is kept in the phone's
 *  encrypted storage (Android Keystore), never in the database, so no export
 *  or backup can carry it. In a browser no token is kept at all. Tokens are
 *  never written to the console. */

// The name from before Visuma, kept: renaming it would lose what is stored under it.
const KEY = 'getit-accounts'

interface AccountsState {
  list: AccountView[]
  /** While switching: who the app is opening. The whole screen says so. */
  switching: { userId: string; name: string } | null
  /** Signing in to one more account: the sign-in screen shows over the app. */
  adding: boolean
}

export const useAccounts = create<AccountsState>(() => ({ list: [], switching: null, adding: false }))

// ---------- storage --------------------------------------------------------

// The module is handed back, never the plugin itself: awaiting a Capacitor
// plugin (returning it from an async function does) calls its "then", which
// native plugins do not have, and fails on the phone.
const secure = secureStorage

async function load(): Promise<SavedAccount[]> {
  try {
    if (isNative()) {
      const raw = await (await secure()).SecureStorage.getItem(KEY)
      return cleanList(raw ? JSON.parse(raw) : [], true)
    }
    const raw = window.localStorage.getItem(KEY)
    return cleanList(raw ? JSON.parse(raw) : [], false)
  } catch {
    // Unreadable (a new phone restored from somewhere, a damaged entry):
    // start again from nothing rather than stop the app.
    return []
  }
}

async function save(list: SavedAccount[]) {
  if (isNative()) {
    await (await secure()).SecureStorage.setItem(KEY, JSON.stringify(list))
    return
  }
  // A browser keeps who the accounts are, never a token.
  window.localStorage.setItem(KEY, JSON.stringify(list.map((a) => ({ ...a, token: null }))))
}

// Every change to the list goes through here, one at a time, so a token
// handed out mid-switch is never overwritten by an older one.
let chain: Promise<unknown> = Promise.resolve()
function change(fn: (list: SavedAccount[]) => SavedAccount[] | 'full'): Promise<boolean> {
  const run = chain.then(async () => {
    const list = await load()
    const next = fn(list)
    if (next === 'full') return false
    if (next !== list) await save(next)
    useAccounts.setState({ list: toView(next) })
    return true
  })
  chain = run.catch(() => undefined)
  return run.catch(() => false)
}

/** Read one account with its token, for opening it. */
async function entry(userId: string): Promise<SavedAccount | undefined> {
  await chain
  return (await load()).find((a) => a.userId === userId)
}

// ---------- following the open account --------------------------------------

let current: { id: string; email: string } | null = null
let busy = false
let started = false

/** Keep the saved list in step with the account that is open: its token
 *  changes every so often and the saved one must follow, or it stops
 *  working; signing out takes it off the list. Called once at start-up. */
export function watchAccounts() {
  if (started) return
  started = true
  void change((l) => l)

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      const gone = current
      current = null
      if (gone && !busy) void change((l) => forget(l, gone.id))
      return
    }
    if (!session) return
    const email = session.user.email ?? ''
    current = { id: session.user.id, email }
    const token = isNative() ? session.refresh_token : null
    const adding = useAccounts.getState().adding
    void change((l) => {
      if (event === 'SIGNED_IN' && shouldRemember(l, adding)) {
        const had = l.find((a) => a.userId === session.user.id)
        const name = had?.name ?? displayName(defaultProfileName(), email)
        return remember(l, { userId: session.user.id, email, name, token }, new Date().toISOString())
      }
      return withToken(l, session.user.id, token)
    })
  })

  // The list shows each account by its profile's name.
  useApp.subscribe((s, prev) => {
    if (s.profiles === prev.profiles || !current || busy) return
    const name = defaultProfileName()
    const id = current.id
    if (name) void change((l) => rename(l, id, name))
  })
}

function defaultProfileName(): string {
  const { profiles } = useApp.getState()
  return (profiles.find((p) => p.is_default) ?? profiles[0])?.name ?? ''
}

// ---------- sending what is waiting ----------------------------------------

/** Send everything waiting and say how much is left. Ticks made on the
 *  home-screen widget go first: forgetting the local copy clears them too. */
async function drain(): Promise<number> {
  if (isNative()) await applyWidgetTicks().catch(() => 0)
  if (navigator.onLine) await push().catch(() => 0)
  return db.pending.count()
}

async function deviceSecure(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    return (await BiometricAuth.checkBiometry()).deviceIsSecure
  } catch {
    return false
  }
}

/** Whether switching to this account can go ahead now, and what it will ask
 *  for. Sends what is waiting first. */
export async function planSwitch(userId: string): Promise<SwitchCheck> {
  const target = await entry(userId)
  if (!target) return { ok: false, reason: 'That account is no longer on this device.' }
  const pending = await drain()
  return canSwitch({
    targetId: userId, currentId: current?.id ?? null, online: navigator.onLine, pending,
    native: isNative(), deviceSecure: await deviceSecure(), hasToken: Boolean(target.token),
  })
}

/** Whether another account can be added now. Sends what is waiting first. */
export async function planAdd(): Promise<Check> {
  const pending = await drain()
  const list = await load()
  return canAdd({ list, currentId: current?.id ?? null, online: navigator.onLine, pending })
}

// ---------- the phone's unlock ---------------------------------------------

async function unlock(name: string): Promise<'ok' | 'cancelled' | 'failed'> {
  const { BiometricAuth, BiometryError, BiometryErrorType } = await import('@aparajita/capacitor-biometric-auth')
  try {
    await BiometricAuth.authenticate({
      reason: `Switch to ${name}`,
      androidTitle: 'Switch account',
      androidSubtitle: `Open ${name} in Visuma`,
      // The phone's PIN, pattern or password works as well as a fingerprint or face.
      allowDeviceCredential: true,
      androidConfirmationRequired: false,
    })
    return 'ok'
  } catch (e) {
    const cancelled = [BiometryErrorType.userCancel, BiometryErrorType.appCancel, BiometryErrorType.systemCancel]
    if (e instanceof BiometryError && cancelled.includes(e.code)) return 'cancelled'
    return 'failed'
  }
}

// ---------- opening another account -----------------------------------------

let spare = 0
/** A second sign-in client that keeps nothing and touches nothing, used to
 *  check a token or password before anything on the device changes. */
function scratchClient() {
  return createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `visuma-check-${++spare}` },
  })
}

type Opened = { session: Session } | { error: string; dead?: boolean }

/** Sign the other account in on the side, so a wrong password or a dead
 *  token leaves the open account exactly as it was. */
async function openAside(how: { token: string } | { email: string; password: string }): Promise<Opened> {
  const side = scratchClient()
  try {
    const { data, error } = 'token' in how
      ? await side.auth.refreshSession({ refresh_token: how.token })
      : await side.auth.signInWithPassword({ email: how.email, password: how.password })
    if (error || !data.session) {
      if ('token' in how) {
        return tokenIsDead(error)
          ? { error: 'This account was signed out on this device. Enter its password to open it.', dead: true }
          : { error: 'The server could not be reached. Nothing changed.' }
      }
      if (error && tokenIsDead(error)) return { error: 'That password is not right for this account. Nothing changed.' }
      return { error: 'The server could not be reached. Nothing changed.' }
    }
    return { session: data.session }
  } finally {
    await side.auth.dispose?.().catch(() => undefined)
  }
}

/** The switch itself, once the other account is known to open: keep the
 *  current account's newest token, forget the local copy, hand the new
 *  session to the app. The app's first sync then downloads everything. */
async function openInto(session: Session, name: string): Promise<string | null> {
  busy = true
  useAccounts.setState({ switching: { userId: session.user.id, name } })
  try {
    const { data } = await supabase.auth.getSession()
    const leaving = data.session
    if (leaving && isNative()) await change((l) => withToken(l, leaving.user.id, leaving.refresh_token))

    // Last look: anything queued since the check is sent, or the switch stops here.
    if ((await drain()) > 0) {
      useAccounts.setState({ switching: null })
      return 'A change was made while switching and has not been sent yet. Nothing changed; try again in a moment.'
    }

    useAccounts.setState({ adding: false })
    await resetLocal()
    const app = useApp.getState()
    app.setProfile(null)
    app.setProfiles([])

    const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
    if (error) {
      // The device's copy is already gone, and the open account is still
      // the old one: starting again downloads it afresh.
      window.location.reload()
      return null
    }
    current = { id: session.user.id, email: session.user.email ?? '' }
    await change((l) => remember(l, {
      userId: session.user.id, email: session.user.email ?? '', name,
      token: isNative() ? session.refresh_token : null,
    }, new Date().toISOString()))

    // In a browser the account left behind keeps no token here, so its
    // session is ended on the server instead of being left open. This is the
    // account's own sign-out, not an administrator's.
    if (leaving && !isNative()) void supabase.auth.admin.signOut(leaving.access_token, 'local').catch(() => undefined)
    return null
  } catch {
    useAccounts.setState({ switching: null })
    return 'Switching stopped part way. Nothing waiting was lost.'
  } finally {
    busy = false
  }
}

export type SwitchResult = { error: string; needPassword?: boolean } | null

/** Switch to a saved account. On the phone, with no password, the phone's
 *  unlock is asked for; with a password (a browser, or a phone without a
 *  screen lock) that is checked instead. Returns what went wrong when it did
 *  not switch (and whether the password is now needed), or null when the
 *  switch is under way. */
export async function switchTo(userId: string, password?: string): Promise<SwitchResult> {
  const plan = await planSwitch(userId)
  if (!plan.ok) return { error: plan.reason }
  const target = await entry(userId)
  if (!target) return { error: 'That account is no longer on this device.' }

  let opened: Opened
  if (plan.ask === 'unlock' && password === undefined) {
    const answer = await unlock(target.name)
    if (answer === 'cancelled') return { error: 'Cancelled. Nothing changed.' }
    if (answer === 'failed') return { error: 'The phone was not unlocked. Nothing changed.' }
    opened = await openAside({ token: target.token! })
    if ('error' in opened && opened.dead) {
      await change((l) => withToken(l, userId, null))
      return { error: opened.error, needPassword: true }
    }
  } else {
    if (!password) return { error: 'Enter the password for this account.', needPassword: true }
    opened = await openAside({ email: target.email, password })
  }
  if ('error' in opened) return { error: opened.error, needPassword: password !== undefined }
  if (opened.session.user.id !== userId) return { error: 'That signed in to a different account. Nothing changed.' }
  const failed = await openInto(opened.session, target.name)
  return failed ? { error: failed } : null
}

/** Start adding an account: once nothing is waiting, the sign-in screen
 *  shows over the app. The open account is kept on the list. */
export async function beginAdd(): Promise<string | null> {
  const plan = await planAdd()
  if (!plan.ok) return plan.reason
  const { data } = await supabase.auth.getSession()
  const s = data.session
  if (s) {
    const ok = await change((l) => remember(l, {
      userId: s.user.id, email: s.user.email ?? '', name: displayName(defaultProfileName(), s.user.email ?? ''),
      token: isNative() ? s.refresh_token : null,
    }, new Date().toISOString()))
    if (!ok) return FULL_TEXT
  }
  useAccounts.setState({ adding: true })
  return null
}

export function cancelAdd() { useAccounts.setState({ adding: false }) }

/** Sign in to one more account from the sign-in screen. The password is
 *  checked on the side first, so a mistake leaves the open account open. */
export async function addAccount(email: string, password: string): Promise<string | null> {
  const list = await load()
  if (alreadyHere(list, email, current?.email ?? null)) return 'That account is already on this device.'
  const plan = await planAdd()
  if (!plan.ok) return plan.reason
  const opened = await openAside({ email, password })
  if ('error' in opened) return opened.error
  if (list.some((a) => a.userId === opened.session.user.id) || opened.session.user.id === current?.id) {
    return 'That account is already on this device.'
  }
  return openInto(opened.session, displayName('', opened.session.user.email ?? email))
}

/** Take an account off this device. Its data stays in the account. On the
 *  phone its token is ended on the server too, so it cannot be used again. */
export async function removeAccount(userId: string): Promise<void> {
  if (userId === current?.id) return
  const target = await entry(userId)
  await change((l) => forget(l, userId))
  if (target?.token) {
    const opened = await openAside({ token: target.token })
    if ('session' in opened) await supabase.auth.admin.signOut(opened.session.access_token, 'local').catch(() => undefined)
  }
}

/** The switching screen is done once the new account's profile has landed. */
export function switchDone() { useAccounts.setState({ switching: null }) }

/** The email of a saved account, for filling in the sign-in form in a browser. */
export async function emailOf(userId: string): Promise<string> {
  return (await entry(userId))?.email ?? ''
}
