import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, setMeta } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { useBackClose } from '../ui/useBackClose'
import { Privacy } from '../screens/Privacy'
import { POLICY_VERSION } from './policy'
import { noticeDue, noticeText } from './notice-rules'
import './notice.css'

const READ = 'policy:read'

/** "The privacy policy changed on 4 October 2026. Read" (G2 #16): one slim
 *  line at the top, on the next open after the policy changed, until the
 *  person reads it or closes it. Never in the way of anything: the page
 *  moves down under it. Reading it is kept with the account, so other
 *  devices stop saying it too, and on this device for when it is offline. */
export function PolicyNotice() {
  const user = useApp((s) => s.session?.user ?? null)
  const readHere = useLiveQuery(() => getMeta<string | null>(READ, null), [], undefined)
  const [gone, setGone] = useState(false)
  const [reading, setReading] = useState(false)
  const meta = user?.user_metadata as Record<string, unknown> | undefined
  const due = !!user && readHere !== undefined && !gone && noticeDue(POLICY_VERSION, meta?.privacy_version, meta?.policy_read, readHere)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('has-notice', due && !reading)
    return () => root.classList.remove('has-notice')
  }, [due, reading])

  async function markRead() {
    setGone(true)
    await setMeta(READ, POLICY_VERSION)
    // With the account, for the other devices; offline it waits for next time.
    if (navigator.onLine !== false) await supabase.auth.updateUser({ data: { policy_read: POLICY_VERSION } }).catch(() => undefined)
  }

  if (reading) return <PolicyReader onClose={() => setReading(false)} />
  if (!due) return null
  return (
    <aside className="policy-notice" role="note" aria-label="Privacy policy">
      <p>
        {noticeText(POLICY_VERSION)}{' '}
        <button type="button" className="tip-go" onClick={() => { setReading(true); void markRead() }}>Read</button>
      </p>
      <button type="button" className="tip-close" aria-label="Close" onClick={() => void markRead()}>×</button>
    </aside>
  )
}

/** The policy over the page; Back, Escape and its own Back button close it. */
function PolicyReader({ onClose }: { onClose: () => void }) {
  useBackClose(onClose)
  return (
    <div className="policy-reader" role="dialog" aria-modal="true" aria-label="Privacy policy">
      <Privacy onBack={onClose} />
    </div>
  )
}
