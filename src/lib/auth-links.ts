import { App as NativeApp } from '@capacitor/app'
import { supabase } from './supabase'
import { isNative } from './native'
import { useApp } from './store'

/** Turn an email link into a session.
 *
 *  A confirmation or password-reset link arrives with a one-time code. On the
 *  phone Android hands the link to the app; in a browser it is the page's own
 *  address. Either way the code is traded for a session here, and a reset
 *  sends the person to choose a new password before anything else. */
async function handle(url: string) {
  let parsed: URL
  try { parsed = new URL(url) } catch { return }
  const code = parsed.searchParams.get('code')
  const kind = parsed.searchParams.get('kind')
  const failure = parsed.searchParams.get('error_description')
  const { setLinkNote, setRecovering } = useApp.getState()

  if (failure) {
    setLinkNote(failure.includes('expired')
      ? 'That link has expired. Ask for a new one.'
      : 'That link could not be used. Ask for a new one.')
    return
  }
  if (!code) return

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // The code can only be redeemed on the device that asked for it: the
    // other half of the proof never left that device.
    setLinkNote('Open the link on the phone or browser where you asked for it, or ask for a new one.')
    return
  }
  if (kind === 'recovery') setRecovering(true)
  else if (kind === 'confirm') setLinkNote('Your address is confirmed.')
}

export function listenForAuthLinks() {
  if (isNative()) {
    void NativeApp.addListener('appUrlOpen', ({ url }) => {
      if (url.startsWith('app.getit.planner://auth-callback')) void handle(url)
    })
    return
  }
  if (window.location.search.includes('code=') || window.location.search.includes('error_description=')) {
    const url = window.location.href
    // Take the code out of the address bar so a reload or a shared link
    // cannot try to use it twice.
    window.history.replaceState({}, '', window.location.pathname)
    void handle(url)
  }
}
