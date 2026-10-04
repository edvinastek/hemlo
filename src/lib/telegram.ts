import { getMeta, setMeta } from './db'
import { supabase } from './supabase'
import { linkAddress, cleanBotName, queueItems, queueSignature } from './telegram-rules'

/** Reminders through Telegram (REM-05), on the device.
 *
 *  Linking lives on the server (038): the app asks for a one-time code, shows
 *  the t.me link, and Telegram tells the server which chat tapped Start. So
 *  linking and unlinking need a connection; reminders keep working without
 *  the app once they are handed over.
 *
 *  While a profile is linked, every time the phone's reminders are worked out
 *  (notify.ts) the next three days' list is handed to the server too, and the
 *  telegram-send function sends each one when it falls due. A device keeps a
 *  note of whether the profile is linked, so an unlinked one asks nothing of
 *  the server. */

/** The bot's username, from the build (VITE_TELEGRAM_BOT). Without one the
 *  Telegram setting is not offered. */
export const telegramBot = (): string | null => cleanBotName(import.meta.env.VITE_TELEGRAM_BOT as string | undefined)

interface Note { linked: boolean; sig?: string; at?: number }
type Notes = Record<string, Note>
const KEY = 'telegram'
/** A list that has not changed goes again after this long anyway, in case the
 *  server lost it. */
const RESEND_MS = 6 * 3600_000

const notes = () => getMeta<Notes>(KEY, {})
async function note(profileId: string, next: Note | null) {
  const all = { ...(await notes()) }
  if (next) all[profileId] = next
  else delete all[profileId]
  await setMeta(KEY, all)
}

/** Linked or not, as the server says (and noted on the device). */
export async function telegramStatus(profileId: string): Promise<boolean> {
  const { data, error } = await supabase.from('channel_setting')
    .select('telegram_on, telegram_chat_id').eq('profile_id', profileId).maybeSingle()
  if (error) throw new Error('Telegram could not be checked. Try again with a connection.')
  const linked = !!data?.telegram_on && !!data?.telegram_chat_id
  const had = (await notes())[profileId]
  if (!!had?.linked !== linked) await note(profileId, linked ? { linked } : null)
  return linked
}

/** A new one-time link to the bot, working for 10 minutes. */
export async function startTelegramLink(profileId: string): Promise<string> {
  const { data, error } = await supabase.rpc('telegram_link_start', { p: profileId })
  const link = !error && typeof data === 'string' ? linkAddress(telegramBot(), data) : null
  if (!link) throw new Error('The link could not be made. Try again with a connection.')
  return link
}

/** Unlink: the server forgets the chat and what was waiting for it. */
export async function unlinkTelegram(profileId: string): Promise<void> {
  const { error } = await supabase.from('channel_setting').update({ telegram_chat_id: null }).eq('profile_id', profileId)
  if (error) throw new Error('Telegram could not be unlinked. Try again with a connection.')
  await note(profileId, null)
}

/** Hand the coming reminders to the server, when this profile is linked and
 *  the list changed. `list` is notify.ts's own list, worked out once for the
 *  phone and for this. Quietly does nothing offline: the next time reminders
 *  are worked out, it goes. */
export async function handToTelegram(profileId: string, now: Date, list: () => Promise<{ key: string; at: Date; telegram: string | null }[]>): Promise<void> {
  try {
    const had = (await notes())[profileId]
    if (!had?.linked || !telegramBot()) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const items = queueItems(await list(), now)
    const sig = queueSignature(items)
    if (had.sig === sig && had.at && now.getTime() - had.at < RESEND_MS) return
    const { data, error } = await supabase.rpc('telegram_set_reminders', { p: profileId, items })
    if (error) return
    // -1: unlinked meanwhile (/stop in Telegram, or from another device).
    await note(profileId, data === -1 ? null : { linked: true, sig, at: now.getTime() })
  } catch { /* offline or signed out: tried again next time */ }
}
