import { Capacitor, SystemBars, SystemBarsStyle, registerPlugin } from '@capacitor/core'
import type { HcSession } from './sleep-import-rules'
import { dynamicTypeScale, platformFeatures, platformFrom, statusBarStyle, type Platform } from './platform-rules'

/** True inside the Android or iPhone app, false in a browser and on Windows. */
export const isNative = () => Capacitor.isNativePlatform()

/** Which app this is: 'android', 'ios' or 'web' (a browser, Windows). */
export const platform = (): Platform => platformFrom(Capacitor.getPlatform())
export const isAndroid = () => platform() === 'android'
export const isIos = () => platform() === 'ios'
/** What this app can do here (platform-rules.ts). */
export const features = () => platformFeatures(platform())

/** Hands a file to the person. In the phone apps, and in a phone's browser
 *  that can share files, the share sheet opens, so it can go to Files,
 *  Drive, email or a calendar app; otherwise the browser downloads it. Says which one happened, or
 *  'cancelled' when the person closed the share sheet. */
export async function saveFile(name: string, blob: Blob): Promise<'shared' | 'downloaded' | 'cancelled'> {
  // In the phone apps the web page cannot download or share files itself:
  // the file is written to the app's own cache, then the phone's share sheet
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
 *  On a phone that is the app itself, through the link the phone hands to it;
 *  in a browser it is the page they signed up from. */
export function authRedirect(kind: 'confirm' | 'recovery'): string {
  if (isNative()) return `app.hemlo.planner://auth-callback?kind=${kind}`
  return `${window.location.origin}${import.meta.env.BASE_URL}?kind=${kind}`
}

/* ---------- looks, app icon and haptics (android/…/LooksPlugin.java) ---------- */

interface HemloLooks {
  setTextZoom(options: { percent: number }): Promise<void>
  fontScale(): Promise<{ scale: number }>
  systemColours(): Promise<{ accent: string | null }>
  setIcon(options: { key: string }): Promise<void>
  getIcon(): Promise<{ key: string; pending: string | null }>
  haptic(options: { kind: 'tick' | 'hold' }): Promise<void>
}
const Looks = registerPlugin<HemloLooks>('HemloLooks')
const android = isAndroid

/** Text drawn at this percent of normal (LOOK-07); Android app only. */
export async function setTextZoom(percent: number): Promise<boolean> {
  if (!android()) return false
  try { await Looks.setTextZoom({ percent }); return true } catch { return false }
}

/** The phone's own font size setting, 1 being its default: Android's font
 *  scale, or the iPhone's Dynamic Type (Settings → Display & Brightness →
 *  Text Size), which the web view gives as the size of `-apple-system-body`. */
export async function phoneFontScale(): Promise<number> {
  if (isIos()) return dynamicTypeScale(appleBodySize())
  if (!android()) return 1
  try { return (await Looks.fontScale()).scale || 1 } catch { return 1 }
}

/** The iPhone's body text size in pixels, measured off the page. WebKit
 *  gives computed sizes without the page's own zoom, so the text size set in
 *  Looks does not feed back into this. */
function appleBodySize(): number | null {
  try {
    // Only WebKit knows the system font keywords; elsewhere there is nothing to read.
    if (!CSS.supports('font', '-apple-system-body')) return null
    const probe = document.createElement('span')
    probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden'
    probe.textContent = 'x'
    document.body.appendChild(probe)
    const px = parseFloat(getComputedStyle(probe).fontSize)
    probe.remove()
    return Number.isFinite(px) ? px : null
  } catch {
    return null
  }
}

/** The status bar's text light or dark to suit the page (iPhone): the app's
 *  own dark mode may differ from the phone's. */
export function setStatusBar(darkPage: boolean) {
  if (!features().themedStatusBar) return
  const style = statusBarStyle(darkPage) === 'DARK' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
  void SystemBars.setStyle({ style }).catch(() => undefined)
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

/* ---------- sleep from Health Connect (android/…/health/HealthPlugin.kt) ---------- */

/** 'available'; 'install' when Health Connect must be installed or updated
 *  from Google Play first; 'unsupported' on this phone (or not Android). */
export type HealthStatus = 'available' | 'install' | 'unsupported'

interface HemloHealth {
  availability(): Promise<{ status: HealthStatus }>
  install(): Promise<void>
  openSettings(): Promise<void>
  allowed(): Promise<{ allowed: boolean }>
  requestSleep(): Promise<{ allowed: boolean }>
  readSleep(options: { start: number; end: number }): Promise<{ sessions: HcSession[] }>
}
const Health = registerPlugin<HemloHealth>('HemloHealth')

/** Whether Health Connect can be used here (SLP-05). */
export async function healthStatus(): Promise<HealthStatus> {
  if (!android()) return 'unsupported'
  try { return (await Health.availability()).status } catch { return 'unsupported' }
}

/** Health Connect's page on Google Play. */
export async function installHealthConnect(): Promise<void> {
  if (android()) await Health.install().catch(() => undefined)
}

/** Health Connect's settings, where a permission refused twice can still be given. */
export async function openHealthConnect(): Promise<boolean> {
  if (!android()) return false
  try { await Health.openSettings(); return true } catch { return false }
}

/** Ask for reading sleep (Health Connect's own screen), unless already allowed. */
export async function allowSleepReading(): Promise<boolean> {
  if (!android()) return false
  return (await Health.requestSleep()).allowed
}

/** Sleep sessions overlapping [start, end) in milliseconds. Throws with code
 *  'not-allowed' when the permission was taken back. */
export async function readHealthSleep(start: number, end: number): Promise<HcSession[]> {
  if (!android()) return []
  return (await Health.readSleep({ start, end })).sessions ?? []
}
