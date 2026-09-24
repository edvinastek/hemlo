import { Capacitor } from '@capacitor/core'

/** True inside the Android app, false in a browser and on Windows. */
export const isNative = () => Capacitor.isNativePlatform()

/** Where a confirmation or password-reset email should send the person back to.
 *  On a phone that is the app itself, through the link Android hands to it;
 *  in a browser it is the page they signed up from. */
export function authRedirect(kind: 'confirm' | 'recovery'): string {
  if (isNative()) return `app.getit.planner://auth-callback?kind=${kind}`
  return `${window.location.origin}${import.meta.env.BASE_URL}?kind=${kind}`
}
