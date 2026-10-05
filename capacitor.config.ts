import type { CapacitorConfig } from '@capacitor/cli'

/** The Android and iPhone apps. The id below is permanent once published:
 *  on Google Play the package name, on the App Store the bundle id; neither
 *  can ever be changed, only abandoned for a new listing. */
const config: CapacitorConfig = {
  // app.getit.planner until version 20; nothing had been published yet, so
  // the id changed with the name (Visuma).
  appId: 'app.visuma.planner',
  appName: 'Visuma',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    // Debugging the web view is for development builds only.
    webContentsDebuggingEnabled: false,
  },
  ios: {
    // The page runs edge to edge under the notch and the home indicator; the
    // layout keeps clear with env(safe-area-inset-*) (index.html has
    // viewport-fit=cover), the fallback of the --safe-area-inset-* variables
    // Capacitor sets only on Android.
    contentInset: 'never',
    // Inspecting the web view from Safari is for development builds only.
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
      smallIcon: 'ic_stat_visuma',
      iconColor: '#b4442a',
      // iPhone: a reminder that comes due while Visuma is open still shows as a
      // banner, with the sound; no badge on the icon (Visuma never sets one).
      presentationOptions: ['banner', 'list', 'sound'],
    },
  },
}

export default config
