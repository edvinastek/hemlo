/** Several accounts on one phone: the list of accounts kept on the device and
 *  what switching between them needs. Pure: no database, no Supabase, no
 *  Capacitor, so every rule is checked by hand in src/test/accounts.check.mjs.
 *
 *  The local database still holds one account at a time. Switching sends
 *  everything waiting, forgets the local copy and opens the other account,
 *  which then downloads its own data. What is kept per account is only what
 *  is needed to open it again: who it is and, on the phone, a sign-in token
 *  held in the phone's encrypted storage. */

/** A phone kept for a household, not a whole office. */
export const MAX_ACCOUNTS = 5

export interface SavedAccount {
  userId: string
  /** The account's own name for itself (its main profile's name). */
  name: string
  /** The full address, kept so the password can be asked for without typing
   *  it again; only ever shown masked. */
  email: string
  /** The token that opens the account again without its password. Only kept
   *  on the phone, in encrypted storage; null in a browser. */
  token: string | null
  /** When the account was last opened on this device (ISO time). */
  lastUsed: string
}

/** What the screens get: everything but the token. */
export type AccountView = Omit<SavedAccount, 'token'> & { hasToken: boolean; masked: string }

/** "edvinas@gmail.com" reads "e•••@gmail.com": enough to tell two accounts
 *  apart, not enough to hand someone the address. */
export function maskEmail(email: string): string {
  const e = email.trim()
  if (!e) return ''
  const at = e.lastIndexOf('@')
  if (at <= 0) return `${e[0]}•••`
  return `${e[0]}•••${e.slice(at)}`
}

/** The account's name for the list: its profile's name, or the start of the
 *  address when there is no name yet. */
export function displayName(profileName: string | null | undefined, email: string): string {
  const name = (profileName ?? '').replace(/\s+/g, ' ').trim()
  if (name) return name.slice(0, 60)
  const local = email.trim().split('@')[0]
  return local ? local.slice(0, 60) : 'Account'
}

/** Most recently used first; the same time falls back to the name. */
export function ordered<T extends { lastUsed: string; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : a.name.localeCompare(b.name)))
}

export function toView(list: SavedAccount[]): AccountView[] {
  return ordered(list).map(({ token, ...rest }) => ({ ...rest, hasToken: Boolean(token), masked: maskEmail(rest.email) }))
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Whatever was read from storage, made safe: bad entries dropped, one entry
 *  per account, no more than the most recent five. Tokens are dropped when the
 *  device keeps none (a browser). */
export function cleanList(raw: unknown, keepTokens: boolean): SavedAccount[] {
  if (!Array.isArray(raw)) return []
  const byId = new Map<string, SavedAccount>()
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const userId = str(o.userId)
    const email = str(o.email)
    if (!userId || !email) continue
    const entry: SavedAccount = {
      userId,
      email,
      name: displayName(str(o.name), email),
      token: keepTokens && str(o.token) ? str(o.token) : null,
      lastUsed: str(o.lastUsed) || '1970-01-01T00:00:00.000Z',
    }
    const had = byId.get(userId)
    if (!had || had.lastUsed < entry.lastUsed) byId.set(userId, entry)
  }
  return ordered([...byId.values()]).slice(0, MAX_ACCOUNTS)
}

/** Add an account, or bring one already there up to date. A token left out
 *  (undefined) keeps the one already saved; null forgets it. Refused when the
 *  list is full and the account is new. */
export function remember(
  list: SavedAccount[],
  entry: { userId: string; email: string; name: string; token?: string | null },
  now: string,
): SavedAccount[] | 'full' {
  const had = list.find((a) => a.userId === entry.userId)
  if (!had && list.length >= MAX_ACCOUNTS) return 'full'
  const next: SavedAccount = {
    userId: entry.userId,
    email: entry.email || had?.email || '',
    name: displayName(entry.name, entry.email || had?.email || ''),
    token: entry.token === undefined ? had?.token ?? null : entry.token,
    lastUsed: now,
  }
  return [...list.filter((a) => a.userId !== entry.userId), next]
}

/** A new token for an account already on the list (the sign-in service hands
 *  out a new one every so often, and the old one stops working). An account
 *  not on the list is left off it: the same list comes back. */
export function withToken(list: SavedAccount[], userId: string, token: string | null): SavedAccount[] {
  const had = list.find((a) => a.userId === userId)
  if (!had || had.token === token) return list
  return list.map((a) => (a.userId === userId ? { ...a, token } : a))
}

/** The account's name changed (its profile was renamed). Same list back when
 *  nothing changes, so nothing is written. */
export function rename(list: SavedAccount[], userId: string, name: string): SavedAccount[] {
  const had = list.find((a) => a.userId === userId)
  if (!had) return list
  const next = displayName(name, had.email)
  if (next === had.name) return list
  return list.map((a) => (a.userId === userId ? { ...a, name: next } : a))
}

export function forget(list: SavedAccount[], userId: string): SavedAccount[] {
  return list.some((a) => a.userId === userId) ? list.filter((a) => a.userId !== userId) : list
}

/** The list only fills once a second account is added. After that, any
 *  account that signs in on this device joins it. */
export function shouldRemember(list: SavedAccount[], adding: boolean): boolean {
  return adding || list.length > 0
}

/** Is this address one of the accounts already on the device? */
export function alreadyHere(list: { email: string }[], email: string, currentEmail: string | null): boolean {
  const e = email.trim().toLowerCase()
  if (!e) return false
  if (currentEmail && currentEmail.trim().toLowerCase() === e) return true
  return list.some((a) => a.email.trim().toLowerCase() === e)
}

export type Check = { ok: true } | { ok: false; reason: string }
export type SwitchCheck = { ok: true; ask: 'unlock' | 'password' } | { ok: false; reason: string }

/** Words for the changes still waiting to go up. */
export function waitingText(pending: number): string {
  return pending === 1
    ? '1 change is still waiting to be sent. Switching waits until it has gone up, so nothing is lost.'
    : `${pending} changes are still waiting to be sent. Switching waits until they have gone up, so nothing is lost.`
}

export const OFFLINE_TEXT = 'Switching needs a connection, so that nothing waiting to be sent is lost. Try again when you are online.'
export const FULL_TEXT = `This device keeps up to ${MAX_ACCOUNTS} accounts. Remove one first.`

/** Everything this device holds must be on the server before the local copy
 *  is forgotten: online, and nothing left waiting after a push. */
function drained(online: boolean, pending: number): Check {
  if (!online) return { ok: false, reason: OFFLINE_TEXT }
  if (pending > 0) return { ok: false, reason: waitingText(pending) }
  return { ok: true }
}

/** What switching to another account needs, checked after trying to send
 *  what is waiting. On a phone with a screen lock and a saved token it asks
 *  for the phone's unlock; anywhere else it asks for that account's password.
 *  With no account open (after signing out) there is nothing to send. */
export function canSwitch(s: {
  targetId: string; currentId: string | null; online: boolean; pending: number
  native: boolean; deviceSecure: boolean; hasToken: boolean
}): SwitchCheck {
  if (s.currentId && s.targetId === s.currentId) return { ok: false, reason: 'That account is already open.' }
  if (!s.online) return { ok: false, reason: OFFLINE_TEXT }
  if (s.currentId) {
    const d = drained(s.online, s.pending)
    if (!d.ok) return d
  }
  return { ok: true, ask: s.native && s.deviceSecure && s.hasToken ? 'unlock' : 'password' }
}

/** What adding another account needs: room on the list (the open account
 *  counts), a connection and nothing waiting. */
export function canAdd(s: { list: { userId: string }[]; currentId: string | null; online: boolean; pending: number }): Check {
  const count = s.list.length + (s.currentId && !s.list.some((a) => a.userId === s.currentId) ? 1 : 0)
  if (count >= MAX_ACCOUNTS) return { ok: false, reason: FULL_TEXT }
  return drained(s.online, s.pending)
}

/** A token refused by the sign-in service (signed out elsewhere, or too old)
 *  cannot be retried; the account needs its password. A network error can. */
export function tokenIsDead(error: { status?: number; code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code && /refresh_token|session_not_found|session_expired|invalid_grant/i.test(error.code)) return true
  return error.status === 400 || error.status === 401 || error.status === 403
}

/* ---------- profiles inside an account (SET-02) ------------------------------ */

export interface ProfileLike { id: string; name: string; is_default: boolean; deleted_at?: string | null }

/** The profile to open: the one open now if it is still there, else the one
 *  last chosen on this device, else the account's default, else the first.
 *  A deleted profile is never opened. */
export function pickProfile<T extends ProfileLike>(list: T[], current: string | null, remembered: string | null): T | null {
  const live = list.filter((p) => !p.deleted_at)
  return live.find((p) => p.id === current) ?? live.find((p) => p.id === remembered)
    ?? live.find((p) => p.is_default) ?? live[0] ?? null
}

/** What is wrong with a profile's name, or null. */
export function profileNameProblem(name: string, others: { name: string }[]): string | null {
  const n = name.trim()
  if (!n) return 'Give the profile a name.'
  if (n.length > 40) return 'Keep the name under 40 characters.'
  if (others.some((o) => o.name.trim().toLowerCase() === n.toLowerCase())) return 'Another profile has that name.'
  return null
}

/** A profile can go unless it is the account's own (the default) or the
 *  only one left. */
export function profileDeleteProblem(p: ProfileLike, list: ProfileLike[]): string | null {
  if (p.is_default) return 'This is the account’s own profile; it goes only with the account.'
  if (list.filter((x) => !x.deleted_at).length <= 1) return 'The last profile cannot go.'
  return null
}

/** Where the device remembers the profile chosen last (localStorage). */
// The name from before Hemlo, kept: renaming it would lose what is stored under it.
export const PROFILE_MEMORY = 'getit-profile'

/* ---------- signing out (SET-04) ---------------------------------------------- */

/** Signing out wipes this device's copy, so changes not yet sent would be
 *  lost. With nothing waiting it goes ahead; otherwise it says how many, and
 *  why they did not go, and asks. */
export function signOutCheck(s: { pending: number; online: boolean }): Check {
  if (s.pending <= 0) return { ok: true }
  const n = s.pending === 1 ? '1 change has' : `${s.pending} changes have`
  return {
    ok: false,
    reason: s.online
      ? `${n} not reached your account yet, and signing out clears this device. Wait a moment and try again, or sign out and lose ${s.pending === 1 ? 'it' : 'them'}.`
      : `${n} not been sent: there is no connection, and signing out clears this device. Sign out once you are online, or sign out and lose ${s.pending === 1 ? 'it' : 'them'}.`,
  }
}
