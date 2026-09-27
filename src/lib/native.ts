import { Capacitor } from '@capacitor/core'

/** True inside the Android app, false in a browser and on Windows. */
export const isNative = () => Capacitor.isNativePlatform()

/** Hands a file to the person. Where the system share sheet takes files (a
 *  phone's browser, and the app where its web view offers it), the share
 *  sheet opens, so it can go to Files, Drive, email or a calendar app;
 *  otherwise the browser downloads it. Says which one happened, or
 *  'cancelled' when the person closed the share sheet. */
export async function saveFile(name: string, blob: Blob): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  const phone = isNative() || /Android|iPhone|iPad/i.test(navigator.userAgent)
  if (phone && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Anything else: fall back to a download below.
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked a little later: some browsers start the download after click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'downloaded'
}

/** Where a confirmation or password-reset email should send the person back to.
 *  On a phone that is the app itself, through the link Android hands to it;
 *  in a browser it is the page they signed up from. */
export function authRedirect(kind: 'confirm' | 'recovery'): string {
  if (isNative()) return `app.getit.planner://auth-callback?kind=${kind}`
  return `${window.location.origin}${import.meta.env.BASE_URL}?kind=${kind}`
}
