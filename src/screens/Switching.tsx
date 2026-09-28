import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { switchDone } from '../lib/accounts'
import { sync } from '../lib/sync'
import '../settings/accounts.css'

/** Shown over everything while the device changes accounts: the old copy is
 *  forgotten and the other account's plan downloads. Nothing can be tapped
 *  that would belong to the wrong account. */
export function Switching({ userId, name }: { userId: string; name: string }) {
  const openId = useApp((s) => s.session?.user.id)
  const profileId = useApp((s) => s.profile?.id)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 20000)
    return () => window.clearTimeout(t)
  }, [])

  // Done once the new account is open and its profile has arrived.
  useEffect(() => {
    if (openId === userId && profileId) switchDone()
  }, [openId, profileId, userId])

  return (
    <div className="page">
      <div className="switching" role="status" aria-live="polite">
        <h1 className="page-date">Switching to {name}…</h1>
        <p className="page-sub">Opening the account and downloading its plan. This device shows one account at a time.</p>
        {slow && (
          <>
            <p className="page-sub">This is taking longer than usual. It carries on as long as there is a connection.</p>
            <button className="btn" onClick={() => void sync([])}>Try again</button>
          </>
        )}
      </div>
    </div>
  )
}
