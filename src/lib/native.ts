import { Capacitor } from '@capacitor/core'

/** True inside the Android app, false in a browser and on Windows. */
export const isNative = () => Capacitor.isNativePlatform()

/** Hands a file to the person. In the Android app, and in a phone's browser
 *  that can share files, the share sheet opens, so it can go to Files,
 *  Drive, email or a calendar app; otherwise the browser downloads it. Says which one happened, or
 *  'cancelled' when the person closed the share sheet. */
export async function saveFile(name: string, blob: Blob): Promise<'shared' | 'downloaded' | 'cancelled'> {
  // In the Android app the web page cannot download or share files itself:
  // the file is written to the app's own cache, then Android's share sheet
  // offers it to Files, Drive, email or a calendar app.
  if (isNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const safe = name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'export'
    const written = await Filesystem.writeFile({ path: `exports/${safe}`, data: await toBase64(blob), directory: Directory.Cache, recursive: true })
    try {
      await Share.share({ title: safe, files: [written.uri], dialogTitle: 'Save or send' })
      return 'shared'
    } catch (e) {
      // Closing the sheet is not an error.
      if (/cancel/i.test(String((e as Error)?.message ?? e))) return 'cancelled'
      throw e
    }
  }
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  const phone = /Android|iPhone|iPad/i.test(navigator.userAgent)
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

/** A file's bytes as base64, the form the native file writer takes. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',', 2)[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Where a confirmation or password-reset email should send the person back to.
 *  On a phone that is the app itself, through the link Android hands to it;
 *  in a browser it is the page they signed up from. */
export function authRedirect(kind: 'confirm' | 'recovery'): string {
  if (isNative()) return `app.getit.planner://auth-callback?kind=${kind}`
  return `${window.location.origin}${import.meta.env.BASE_URL}?kind=${kind}`
}
