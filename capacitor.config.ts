import type { CapacitorConfig } from '@capacitor/cli'

/** The Android app. The package name below is permanent once published on
 *  Google Play — it can never be changed, only abandoned for a new listing. */
const config: CapacitorConfig = {
  appId: 'app.getit.planner',
  appName: 'GetIt',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    // Debugging the web view is for development builds only.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // Android 15 and 16 draw apps edge to edge. Capacitor passes the status
    // and gesture bar sizes to the page as --safe-area-inset-* so the layout
    // can keep clear of them; the bar icons follow light or dark mode.
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DEFAULT',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_getit',
      iconColor: '#b4442a',
    },
  },
}

export default config
