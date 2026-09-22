import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.getit.planner',
  appName: 'GetIt',
  webDir: 'dist',
  android: {
    // The app holds a full local copy, so it opens on the last known day
    // whether or not there is a connection.
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_getit',
      iconColor: '#b4442a',
    },
  },
}

export default config
