/** What each app can do on its own platform (PLAT-10): the Android app, the
 *  iPhone app and everything else (a browser, Windows). One table, so a
 *  feature that needs Android's own code is switched off on the iPhone in one
 *  place and its button never shows there. No Capacitor here: checked in
 *  src/test/platform.check.mjs. docs/ios-release.md has the same table in words. */

export type Platform = 'android' | 'ios' | 'web'

/** Capacitor's name for where the page runs, as one of ours. */
export function platformFrom(name: string | null | undefined): Platform {
  return name === 'android' || name === 'ios' ? name : 'web'
}

export interface PlatformFeatures {
  /** The home-screen widgets (VisumaWidget, Android only). */
  widgets: boolean
  /** Choosing the launcher icon (VisumaLooks, LOOK-10). */
  appIcons: boolean
  /** Text size through the web view's own text zoom (Android); elsewhere the
   *  page is zoomed with CSS. */
  nativeTextZoom: boolean
  /** The phone's own text size is read and added to the chosen size: Android's
   *  font scale, the iPhone's Dynamic Type. */
  phoneTextSize: boolean
  /** The wallpaper's colours as a theme (Android 12 and later). */
  phoneColours: boolean
  /** Sleep from Health Connect (SLP-05). Apple Health is later work. */
  healthConnect: boolean
  /** The + menu's first entries sent to the launcher shortcuts and the
   *  quick-add widget as the person orders them (Android). The iPhone has
   *  fixed quick actions instead, declared in its Info.plist. */
  quickAddSync: boolean
  /** app.visuma.planner://open/… links (widgets, shortcuts, quick actions). */
  openLinks: boolean
  /** Google's scanner module, fetched from Google Play when missing. */
  scannerModule: boolean
  /** Notification channels (Android 8 and later). */
  notificationChannels: boolean
  /** The phone keeps only this many scheduled notifications (iOS: 64); null
   *  for no limit worth planning around. */
  pendingLimit: number | null
  /** A notification's Done and In 15 min open the app first, so the page is
   *  certainly running when the tick is written (iOS may not wake a web view
   *  for an action in the background). */
  actionsOpenApp: boolean
  /** The status bar's text follows the app's own light or dark, not only the
   *  phone's setting. */
  themedStatusBar: boolean
  /** Open Prices' app_platform value. */
  openPrices: 'android' | 'ios' | 'web'
}

const ANDROID: PlatformFeatures = {
  widgets: true, appIcons: true, nativeTextZoom: true, phoneTextSize: true, phoneColours: true,
  healthConnect: true, quickAddSync: true, openLinks: true, scannerModule: true, notificationChannels: true,
  pendingLimit: null, actionsOpenApp: false, themedStatusBar: false, openPrices: 'android',
}

const IOS: PlatformFeatures = {
  widgets: false, appIcons: false, nativeTextZoom: false, phoneTextSize: true, phoneColours: false,
  healthConnect: false, quickAddSync: false, openLinks: true, scannerModule: false, notificationChannels: false,
  pendingLimit: 64, actionsOpenApp: true, themedStatusBar: true, openPrices: 'ios',
}

const WEB: PlatformFeatures = {
  widgets: false, appIcons: false, nativeTextZoom: false, phoneTextSize: false, phoneColours: false,
  healthConnect: false, quickAddSync: false, openLinks: false, scannerModule: false, notificationChannels: false,
  pendingLimit: null, actionsOpenApp: false, themedStatusBar: false, openPrices: 'web',
}

export function platformFeatures(p: Platform): PlatformFeatures {
  return p === 'android' ? ANDROID : p === 'ios' ? IOS : WEB
}

/** The reminders to hand to the phone: all of them, or, where it keeps only
 *  so many, the soonest that fit beside the ones it already holds and keeps
 *  (a snooze, a focus timer). Later ones are scheduled on a later run, which
 *  happens every time the app opens or a task changes. */
export function remindersThatFit<T extends { at: Date }>(list: T[], limit: number | null, kept = 0): T[] {
  if (limit === null) return list
  const room = Math.max(0, limit - Math.max(0, kept))
  return [...list].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, room)
}

/** The iPhone's Dynamic Type as a scale, 1 being its default ("Large", body
 *  text 17 px). Read from `font: -apple-system-body`; anything unreadable is 1.
 *  Kept within what the layout can hold, as the Android font scale is. */
export const IOS_BODY_PX = 17
export function dynamicTypeScale(bodyPx: number | null | undefined): number {
  if (typeof bodyPx !== 'number' || !Number.isFinite(bodyPx) || bodyPx <= 0) return 1
  const scale = bodyPx / IOS_BODY_PX
  return Math.round(Math.max(0.8, Math.min(2, scale)) * 100) / 100
}

/** How the chosen text size reaches the screen: Android's web view zooms its
 *  text itself; elsewhere the page's zoom is set, or taken off at 100%. */
export function textZoomRoute(features: Pick<PlatformFeatures, 'nativeTextZoom'>, zoom: number): { native: number | null; css: number | null } {
  if (features.nativeTextZoom) return { native: zoom, css: null }
  return { native: null, css: zoom === 100 ? null : zoom / 100 }
}

/** The status bar's style for the app's shade: 'DARK' is light text for a dark
 *  page, 'LIGHT' dark text for a light one (Capacitor's SystemBarsStyle). */
export const statusBarStyle = (darkPage: boolean): 'DARK' | 'LIGHT' => (darkPage ? 'DARK' : 'LIGHT')
