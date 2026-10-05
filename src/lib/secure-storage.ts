import { isIos } from './native'

/** The phone's secure storage (Android's keystore, the iPhone's keychain),
 *  loaded only in the phone apps. On the iPhone, items stay on this phone:
 *  never copied to a new one through a backup, as on Android, where the
 *  keystore's keys never leave the phone either. */
let loading: Promise<typeof import('@aparajita/capacitor-secure-storage')> | null = null
export function secureStorage() {
  return (loading ??= import('@aparajita/capacitor-secure-storage').then(async (m) => {
    if (isIos()) await m.SecureStorage.setDefaultKeychainAccess(m.KeychainAccess.whenUnlockedThisDeviceOnly).catch(() => undefined)
    return m
  }))
}
