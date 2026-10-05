# NOTES-I1 — the iPhone app (PLAT-10), version 20

Branch v20/ios, from main (0.19.0). Running log; newest at the bottom.

## Log

1. `@capacitor/ios` 8.5.2 added to package.json (it was already in the lock
   file and node_modules as a dependency of the two @aparajita plugins, so
   only the root entry of package-lock.json changed). `npx cap add ios
   --packagemanager CocoaPods` on Linux: writes the Xcode project, copies the
   web build, skips `pod install` and the xcodebuild clean step with a
   warning. Nothing else is skipped. The Podfile came out with the real path
   of the linked node_modules (../../../../getit/node_modules); put back to
   ../../node_modules, as on GitHub.
