import { useSyncExternalStore } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { useApp } from './store'
import { DEFAULT_SETTINGS, readSettings, type LookSettings } from './settings'
import { setPagePapers } from './colours-rules'
import { onResetLocal } from './db'
import { features, isNative, phoneFontScale, setStatusBar, setTextZoom, systemAccent } from './native'
import { textZoomRoute } from './platform-rules'
import { sendWidgetLooks } from './widget'
import { WIDGET_DARK, WIDGET_LIGHT, widgetPalette, type WidgetLooks } from './widget-rules'
import {
  OWN, SYSTEM, cssVars, isDarkShade, layoutVars, pairingIn, resolveTheme, shadeFor, textZoom, type ResolvedTheme, type Shade,
} from './theme-rules'

/** Puts the chosen looks on the screen (LOOK-01 to LOOK-09): the theme's
 *  colours as custom properties on the page's root, the mode, the text size
 *  and the widgets' colours. It follows the open profile's settings, the
 *  phone's light or dark setting and, in the phone apps, the phone's font
 *  size (and on Android its wallpaper colours), re-read whenever the app
 *  comes back.
 *
 *  The colours are also kept in this device's storage, where a few lines in
 *  index.html read them before the first paint, so the app never flashes
 *  the default theme on its way to the chosen one. */

export interface LooksState {
  looks: LookSettings
  theme: ResolvedTheme
  /** The phone (or computer) is set to dark. */
  systemDark: boolean
  /** The phone's wallpaper accent (Android 12+), or null. */
  phoneAccent: string | null
  /** The phone's font size, 1 being its default. */
  phoneScale: number
  zoom: number
}

/** Kept in sync with the reader in index.html. */
// The name from before Hemlo, kept: renaming it would lose what is stored under it.
export const LOOKS_CACHE = 'getit.looks'

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

let phoneAccent: string | null = null
let phoneScale = 1
let state: LooksState = compute(DEFAULT_SETTINGS.looks)
const listeners = new Set<() => void>()

function compute(looks: LookSettings): LooksState {
  const systemDark = !!darkQuery?.matches
  const shade = shadeFor(looks.mode, systemDark)
  return {
    looks,
    theme: resolveTheme(looks.theme, shade, looks.seed, phoneAccent),
    systemDark,
    phoneAccent,
    phoneScale,
    zoom: textZoom(looks.text_size, phoneScale),
  }
}

/** The theme a key would give in a shade, with the phone's colours known
 *  here; for previews. */
export function previewTheme(key: string, shade: Shade, seed: string | null): ResolvedTheme {
  return resolveTheme(key, shade, seed, phoneAccent)
}

const currentLooks = (): LookSettings => {
  const profile = useApp.getState().profile
  return profile ? readSettings(profile).looks : state.looks
}

let lastWidget = ''
let lastZoom = 0
let lastDark: boolean | null = null

function apply() {
  state = compute(currentLooks())
  const { theme, looks } = state
  const root = document.documentElement
  for (const [k, v] of Object.entries(cssVars(theme.tokens, theme.shade))) root.style.setProperty(k, v)
  root.dataset.theme = isDarkShade(theme.shade) ? 'dark' : 'light'
  root.dataset.shade = theme.shade
  // Density and the font pairing (LOOK-08, LOOK-12): variables on the root;
  // an empty one is taken off, so the style sheet's default stands.
  for (const [k, v] of Object.entries(layoutVars(looks.density, pairingIn(looks.theme, looks.fonts)))) {
    if (v) root.style.setProperty(k, v)
    else root.style.removeProperty(k)
  }
  // Compact rows are drawn only under this mark, so Comfortable is exactly
  // the rows as they always were.
  if (looks.density === 'comfortable') delete root.dataset.density
  else root.dataset.density = looks.density
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.tokens.paper)

  // Module colours are checked against the pages of this theme (LOOK-06).
  const light = resolveTheme(looks.theme, 'light', looks.seed, phoneAccent).tokens
  const dark = resolveTheme(looks.theme, looks.mode === 'black' ? 'black' : 'dark', looks.seed, phoneAccent).tokens
  setPagePapers(light.paper, dark.paper)

  // Text size: Android draws text larger through the web view itself, so the
  // layout keeps its width; elsewhere (the iPhone included, where the size
  // also follows Dynamic Type) the whole page is zoomed.
  if (state.zoom !== lastZoom) {
    lastZoom = state.zoom
    const route = textZoomRoute(features(), state.zoom)
    if (route.native !== null) {
      root.style.removeProperty('zoom')
      void setTextZoom(route.native)
    } else if (route.css === null) {
      root.style.removeProperty('zoom')
    } else {
      root.style.setProperty('zoom', String(route.css))
    }
  }
  const darkPage = isDarkShade(theme.shade)
  if (darkPage !== lastDark) { lastDark = darkPage; setStatusBar(darkPage) }

  remember(light, dark, looks)

  const widget: WidgetLooks = {
    v: 1, mode: looks.mode,
    light: widgetPalette(light, WIDGET_LIGHT),
    dark: widgetPalette(dark, WIDGET_DARK),
  }
  const json = JSON.stringify(widget)
  if (json !== lastWidget) {
    lastWidget = json
    void sendWidgetLooks(json)
  }
  for (const l of listeners) l()
}

/** What index.html needs to paint the right colours at once. */
function remember(light: ResolvedTheme['tokens'], dark: ResolvedTheme['tokens'], looks: LookSettings) {
  try {
    const zoom = textZoomRoute(features(), state.zoom).css
    const plain = looks.theme === 'notebook' && looks.mode === 'system' && zoom === null
    if (plain) { localStorage.removeItem(LOOKS_CACHE); return }
    localStorage.setItem(LOOKS_CACHE, JSON.stringify({
      mode: looks.mode,
      light: cssVars(light, 'light'),
      dark: cssVars(dark, looks.mode === 'black' ? 'black' : 'dark'),
      zoom,
    }))
  } catch {
    // Private windows and full storage: the app still applies the theme a
    // moment later, only without the head start.
  }
}

/** The phone's font size and wallpaper colours, read again whenever the
 *  app comes back, since either may have changed in the phone's settings. */
async function readPhone() {
  const [scale, accent] = await Promise.all([phoneFontScale(), systemAccent()])
  if (scale === phoneScale && accent === phoneAccent) return
  phoneScale = scale
  phoneAccent = accent
  apply()
}

let started = false
/** Start following the looks; call once, from App. */
export function watchLooks(): () => void {
  if (started) return () => undefined
  started = true
  apply()
  const unsub = useApp.subscribe((s, prev) => {
    if (s.profile?.id !== prev.profile?.id || s.profile?.settings !== prev.profile?.settings) apply()
  })
  const onSystem = () => apply()
  darkQuery?.addEventListener('change', onSystem)
  let resume: Promise<{ remove: () => Promise<void> }> | undefined
  if (isNative()) {
    void readPhone()
    resume = NativeApp.addListener('resume', () => { void readPhone() })
  }
  return () => {
    unsub()
    void resume?.then((h) => h.remove())
    darkQuery?.removeEventListener('change', onSystem)
    started = false
  }
}

/** The looks as they are now, kept live; for the Looks panel. */
export function useLooks(): LooksState {
  return useSyncExternalStore(subscribe, () => state)
}
function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Whether the phone offers its own colours (Android 12 and later). */
export const hasPhoneColours = () => state.phoneAccent !== null

export { OWN, SYSTEM }

// Signing out goes back to the default looks on this device.
onResetLocal(async () => {
  try { localStorage.removeItem(LOOKS_CACHE) } catch { /* nothing kept */ }
  state = compute(DEFAULT_SETTINGS.looks)
  if (started) apply()
})
