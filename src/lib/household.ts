import { supabase } from './supabase'
import { setMeta } from './db'
import { sync } from './sync'
import { useApp } from './store'

/** Sharing the cupboard, the shopping list and the chores with someone
 *  (STK-05, HSE-12). The household's owner makes a code; the other person
 *  types it in on their own phone. This one thing needs a connection: who
 *  is in a household is the server's to say, so nothing here is queued.
 *  The rules (a code works once, for two days, ten guesses an hour, kept
 *  only as a hash) are in migration 028 and proven in the security checks. */

export interface Member { user_id: string; role: 'owner' | 'member'; display_name: string | null; me: boolean }
export interface Invite { code: string; expires_at: string }

/** The tables that belong to a household: after joining or leaving, the
 *  next sync fetches them from the start for the household now open. */
const HOUSEHOLD_TABLES = ['stock', 'shopping_entry', 'shop_price', 'chore', 'chore_log', 'profile']

const offline = () => new Error('This needs a connection. Try again once the phone is online.')
const plain = (e: { message?: string } | null | undefined, fallback: string) =>
  new Error(e?.message && !/^(JWT|permission denied|new row)/i.test(e.message) ? e.message : fallback)

/** Who is in the household, the owner first. */
export async function householdMembers(householdId: string): Promise<Member[]> {
  if (!navigator.onLine) throw offline()
  const me = useApp.getState().session?.user.id ?? null
  const { data, error } = await supabase.from('household_member').select('user_id, role, display_name').eq('household_id', householdId)
  if (error) throw plain(error, 'The household could not be read. Try again.')
  return ((data ?? []) as Omit<Member, 'me'>[])
    .map((m) => ({ ...m, me: m.user_id === me }))
    .sort((a, b) => (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1) || (a.display_name ?? '').localeCompare(b.display_name ?? ''))
}

/** Is the signed-in person the owner of this household? */
export async function ownsHousehold(householdId: string): Promise<boolean> {
  const me = useApp.getState().session?.user.id
  if (!me || !navigator.onLine) return false
  const { data } = await supabase.from('household').select('owner_id').eq('id', householdId).maybeSingle()
  return (data as { owner_id?: string } | null)?.owner_id === me
}

/** A new code for the household (the owner only). An older unused one stops working. */
export async function createInvite(householdId: string): Promise<Invite> {
  if (!navigator.onLine) throw offline()
  const { data, error } = await supabase.rpc('create_household_invite', { h: householdId })
  const row = (Array.isArray(data) ? data[0] : data) as Invite | null
  if (error || !row) throw plain(error, 'A code could not be made. Try again.')
  return row
}

export async function cancelInvites(householdId: string): Promise<void> {
  if (!navigator.onLine) throw offline()
  const { error } = await supabase.rpc('cancel_household_invites', { h: householdId })
  if (error) throw plain(error, 'The code could not be cancelled. Try again.')
}

/** After the server moved the person's profiles to another household, the
 *  household's rows are fetched afresh and the app opens on it. */
async function refetch(): Promise<void> {
  for (const t of HOUSEHOLD_TABLES) await setMeta(`cursor:${t}`, null)
  const ids = useApp.getState().profiles.map((p) => p.id)
  await sync(ids)
}

/** Join with a code someone gave you. Returns the household joined. */
export async function joinHousehold(code: string): Promise<string> {
  if (!navigator.onLine) throw offline()
  const { data, error } = await supabase.rpc('join_household', { code })
  if (error) throw plain(error, 'That did not work. Try again.')
  const row = (Array.isArray(data) ? data[0] : data) as { household_id: string | null; problem: string | null } | null
  if (!row?.household_id) throw new Error(row?.problem ?? 'That code does not work.')
  await refetch()
  return row.household_id
}

/** Leave a household you joined: back to your own, with what you had there. */
export async function leaveHousehold(householdId: string): Promise<void> {
  if (!navigator.onLine) throw offline()
  const { error } = await supabase.rpc('leave_household', { h: householdId })
  if (error) throw plain(error, 'Leaving did not work. Try again.')
  await refetch()
}

/** The owner takes someone out of the household. */
export async function removeMember(householdId: string, userId: string): Promise<void> {
  if (!navigator.onLine) throw offline()
  const { error } = await supabase.rpc('remove_household_member', { h: householdId, member: userId })
  if (error) throw plain(error, 'That did not work. Try again.')
}

/** Your name as the household sees it (026's set_my_member_name). */
export async function setMyName(householdId: string, name: string): Promise<void> {
  if (!navigator.onLine) throw offline()
  const { error } = await supabase.rpc('set_my_member_name', { h: householdId, name })
  if (error) throw plain(error, 'The name could not be saved. Try again.')
}
