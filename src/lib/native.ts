import { Capacitor, registerPlugin } from '@capacitor/core'

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

/* ---------- looks, app icon and haptics (android/…/LooksPlugin.java) ---------- */

interface GetItLooks {
  setTextZoom(options: { percent: number }): Promise<void>
  fontScale(): Promise<{ scale: number }>
  systemColours(): Promise<{ accent: string | null }>
  setIcon(options: { key: string }): Promise<void>
  getIcon(): Promise<{ key: string; pending: string | null }>
  haptic(options: { kind: 'tick' | 'hold' }): Promise<void>
}
const Looks = registerPlugin<GetItLooks>('GetItLooks')
const android = () => Capacitor.getPlatform() === 'android'

/** Text drawn at this percent of normal (LOOK-07); Android app only. */
export async function setTextZoom(percent: number): Promise<boolean> {
  if (!android()) return false
  try { await Looks.setTextZoom({ percent }); return true } catch { return false }
}

/** The phone's own font size setting, 1 being its default. */
export async function phoneFontScale(): Promise<number> {
  if (!android()) return 1
  try { return (await Looks.fontScale()).scale || 1 } catch { return 1 }
}

/** The main colour of the phone's wallpaper palette (Android 12 and later),
 *  or null where the phone has none (LOOK-02). */
export async function systemAccent(): Promise<string | null> {
  if (!android()) return null
  try { return (await Looks.systemColours()).accent } catch { return null }
}

/** The launcher icon this phone shows, and one waiting to be applied when
 *  the person next leaves the app (LOOK-10). Null outside the Android app. */
export async function appIcon(): Promise<{ key: string; pending: string | null } | null> {
  if (!android()) return null
  try { return await Looks.getIcon() } catch { return null }
}

/** Switch the launcher icon. It changes when the person leaves the app, so
 *  the screen they are on is never closed under them. */
export async function setAppIcon(key: string): Promise<boolean> {
  if (!android()) return false
  try { await Looks.setIcon({ key }); return true } catch { return false }
}

/** A short buzz: 'tick' for a tick, 'hold' when a long press takes hold. */
export function haptic(kind: 'tick' | 'hold' = 'tick') {
  if (android()) { void Looks.haptic({ kind }).catch(() => undefined); return }
  try { navigator.vibrate?.(kind === 'hold' ? 20 : 10) } catch { /* not every browser has it */ }
}
