import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { refreshPlan } from '../lib/lifecycle'
import { startTelegramLink, telegramBot, telegramStatus, unlinkTelegram } from '../lib/telegram'
import { LINK_MINUTES } from '../lib/telegram-rules'
import './shopping-settings.css'

/** Settings → Reminders → Telegram (REM-05): reminders as Telegram messages,
 *  opt-in. Link shows a one-time t.me link; tapping Start in Telegram links
 *  the chat, which this row notices by itself. Offered only when the build
 *  names the bot (VITE_TELEGRAM_BOT); needs a connection to link or unlink. */
export function TelegramReminders() {
  const profile = useApp((s) => s.profile)
  const online = useApp((s) => s.online)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [link, setLink] = useState<{ url: string; until: number } | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const profileId = profile?.id ?? null
  const bot = telegramBot()

  useEffect(() => {
    if (!profileId || !online || !bot) return
    let live = true
    telegramStatus(profileId).then((v) => { if (live) setLinked(v) }).catch((e) => { if (live) setNote(e.message) })
    return () => { live = false }
  }, [profileId, online, bot])

  // While the link is out, look every few seconds whether Start was tapped.
  useEffect(() => {
    if (!link || !profileId) return
    const t = window.setInterval(() => {
      if (Date.now() > link.until) { setLink(null); window.clearInterval(t); return }
      telegramStatus(profileId).then((v) => {
        if (!v) return
        setLinked(true)
        setLink(null)
        // Hand over the coming reminders straight away.
        void refreshPlan()
      }).catch(() => { /* offline for a moment: looked at again shortly */ })
    }, 3000)
    return () => window.clearInterval(t)
  }, [link, profileId])

  if (!profileId || !bot) return null

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setNote(null)
    try { await fn() } catch (e) { setNote(e instanceof Error ? e.message : 'That did not work. Try again.') } finally { setBusy(false) }
  }

  return (
    <>
      <p className="section-title">Telegram</p>
      <div className="setting-row ss-block">
        <div>
          <div className="row-name">Reminders in Telegram</div>
          <div className="row-meta">{linked ? 'Linked. ' : ''}Reminder titles are sent through Telegram.</div>
          {!online && <p className="ss-note">Linking needs a connection.</p>}
          {online && linked === false && !link && (
            <div className="ss-inline">
              <button type="button" className="btn" disabled={busy}
                onClick={() => void run(async () => setLink({ url: await startTelegramLink(profileId), until: Date.now() + LINK_MINUTES * 60_000 }))}>Link</button>
            </div>
          )}
          {online && link && !linked && (
            <>
              <div className="ss-inline">
                <a className="btn btn-primary" href={link.url} target="_blank" rel="noopener noreferrer">Open Telegram</a>
                <button type="button" className="btn" onClick={() => setLink(null)}>Cancel</button>
              </div>
              <p className="ss-note" role="status">Tap Start in Telegram. The link works for {LINK_MINUTES} minutes.</p>
            </>
          )}
          {online && linked && (
            <div className="ss-inline">
              {asking ? (
                <>
                  <button type="button" className="btn shop-warn" disabled={busy}
                    onClick={() => void run(async () => { await unlinkTelegram(profileId); setLinked(false); setAsking(false) })}>Unlink</button>
                  <button type="button" className="btn" onClick={() => setAsking(false)}>Keep</button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => setAsking(true)}>Unlink…</button>
              )}
            </div>
          )}
        </div>
      </div>
      {note && <p className="ss-said is-bad" role="status">{note}</p>}
    </>
  )
}
