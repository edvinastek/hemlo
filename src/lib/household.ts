import { db, getMeta, setMeta } from './db'
import { supabase } from './supabase'
import { edit } from './write'
import { ensureInstance } from '../modules/defs'
import { readChorePrefs, type ChorePrefs, type Member } from './chore-rules'
import { saveChore } from './chores'
import type { Chore } from './types'

/** The household's members as the chores need them: who they are and what
 *  they are called (HSE-07). Read from the server when there is a
 *  connection and kept on the phone, so names show offline too. */
const key = (householdId: string) => `members:${householdId}`

export async function cachedMembers(householdId: string): Promise<Member[]> {
  return getMeta<Member[]>(key(householdId), [])
}

export async function fetchMembers(householdId: string): Promise<Member[]> {
  const cached = await cachedMembers(householdId)
  if (typeof navigator !== 'undefined' && !navigator.onLine) return cached
  const { data, error } = await supabase.from('household_member').select('user_id, display_name, role').eq('household_id', householdId)
  if (error || !data) return cached
  // Owner first, then the rest in the order they joined (the server's order).
  const members = [...(data as Member[])].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'))
  await setMeta(key(householdId), members)
  return members
}

/** "Your name in the household": set on the server by the member
 *  themselves (rpc set_my_member_name). It needs a connection; the name is
 *  kept on this phone at once either way and sent again next time. */
export async function setMyMemberName(householdId: string, userId: string, name: string | null): Promise<'saved' | 'offline'> {
  const members = await cachedMembers(householdId)
  const next = members.some((m) => m.user_id === userId)
    ? members.map((m) => (m.user_id === userId ? { ...m, display_name: name } : m))
    : [...members, { user_id: userId, display_name: name }]
  await setMeta(key(householdId), next)
  await setMeta(`members-pending:${householdId}`, { name })
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
  const { error } = await supabase.rpc('set_my_member_name', { h: householdId, name: name ?? '' })
  if (error) return 'offline'
  await setMeta(`members-pending:${householdId}`, null)
  return 'saved'
}

/** Sends a name typed while offline, once there is a connection. */
export async function sendPendingName(householdId: string, userId: string): Promise<void> {
  const pending = await getMeta<{ name: string | null } | null>(`members-pending:${householdId}`, null)
  if (pending) await setMyMemberName(householdId, userId, pending.name)
}

/* ---------- the person's chore preferences ------------------------------------ */

/** Light days and a daily cap (HSE-09): the person's own, kept with the
 *  household module's settings for their profile. */
export async function chorePrefs(profileId: string): Promise<ChorePrefs> {
  const inst = await db.module_instance.where('profile_id').equals(profileId).filter((m) => m.module_key === 'household').first()
  return readChorePrefs(inst?.settings?.chores)
}

export async function saveChorePrefs(profileId: string, prefs: ChorePrefs): Promise<void> {
  const inst = await ensureInstance(profileId, 'household', true)
  const current = (await db.module_instance.get(inst.id)) ?? inst
  await edit('module_instance', current, { settings: { ...(current.settings ?? {}), chores: prefs } })
}

/** Holiday for every chore of the household at once (HSE-08): each gets the
 *  same dates, so everyone in the household sees the pause. */
export async function pauseAll(chores: Chore[], from: string | null, until: string | null): Promise<void> {
  for (const c of chores) {
    if (c.deleted_at) continue
    await saveChore({ ...c, paused_from: from, paused_until: until }, ['paused_from', 'paused_until'])
  }
}
