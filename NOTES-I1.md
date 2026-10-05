# NOTES-I1 — the iPhone app (PLAT-10), version 20

Branch v20/ios, from main (0.19.0). Running log, then the state at the end.

## Log

1. `@capacitor/ios` 8.5.2 added to package.json (it was already in the lock
   file and node_modules as a dependency of the two @aparajita plugins, so
   only the root entry of package-lock.json changed; `npm ls
   --package-lock-only` is clean). `npx cap add ios --packagemanager CocoaPods`
   on Linux writes the Xcode project, copies the web build and skips only
   `pod install` and the xcodebuild clean step, with a warning each. The
   Podfile came out with the real path of the linked node_modules
   (../../../../getit/node_modules); put back to ../../node_modules, as on
   GitHub. `cap sync` rewrites it the same way every time: put it back before
   committing, as with android/capacitor.settings.gradle.
2. CocoaPods 1.17.0 (the version on GitHub's Mac) installed as a gem into the
   scratchpad, with rsync from apt: **`pod install` runs on Linux** and
   resolved all 22 pods for iOS 15.5 (ML Kit 8.0.0 → MLKitBarcodeScanning 7,
   MLKitCommon 13, MLKitVision 9, GoogleUtilities 8.1.4 and the rest). Its
   `Podfile.lock` and the workspace's `contents.xcworkspacedata` are
   committed, so the Mac installs exactly these. It changed nothing in
   project.pbxproj (the template is already wired for Pods).
3. Every plugin's podspec: Capacitor, app, filesystem, local-notifications,
   share, keyboard, both @aparajita plugins and the ML Kit plugin all say
   15.0; ML Kit's README asks for 15.5 (GoogleMLKit 8). Podfile and both
   project-level and target-level IPHONEOS_DEPLOYMENT_TARGET = 15.5.
4. Project settings: TARGETED_DEVICE_FAMILY = 1 (iPhone only: no iPad
   screenshots or iPad multitasking rules; an iPad runs it as an iPhone app),
   the ~ipad orientation list dropped, a shared `App` scheme committed
   (xcodebuild on a fresh checkout then has one for sure), the privacy
   manifest added to the Copy Bundle Resources phase with the xcodeproj gem.
5. Info.plist: URL scheme app.getit.planner (auth links, quick actions),
   ITSAppUsesNonExemptEncryption false, NSCameraUsageDescription,
   NSFaceIDUsageDescription (the biometric plugin's README: Face ID is refused
   without it), quick actions, orientations as Android (portrait and both
   landscapes), view-controller status bar. Kept the template's armv7
   device capability (every Capacitor app ships with it).
6. Icons and splash: `npm run assets:ios` (new script; `npm run assets` calls
   it at the end) runs @capacitor/assets for iOS with the Android colours.
   Works on Linux; the 1024 icon is RGB without alpha (App Store rule); light
   and dark splash. Android's assets are byte-identical (sha1 of every tracked
   file under android/ before and after).
7. Audit of every native call (table below). Real iOS bugs found and fixed:
   - `LocalNotifications.createChannel` is unimplemented on iOS and rejects,
     which stopped `ensureChannel` before `registerActionTypes`, so **no
     reminder would ever have been scheduled on an iPhone**. Channels are now
     Android only.
   - `isGoogleBarcodeScannerModuleAvailable` is unimplemented on iOS, so the
     scanner always fell back to typing. Skipped on iOS.
   - Text size: `isNative()` sent the size to Android's text zoom, which does
     nothing on iOS: Looks' text size did nothing on an iPhone.
   - The widget switch, the stats widget hint and the app icon picker would
     have been dead controls on the iPhone.
8. `src/lib/platform-rules.ts` (what each platform can do), helpers
   `platform()`, `isAndroid()`, `isIos()`, `features()` in native.ts.
   Android's behaviour is unchanged (the check asserts every Android flag).
9. Swift: SceneDelegate (Capacitor 8's template uses UIScene) handles quick
   actions: `windowScene(_:performActionFor:)` while running, and
   `connectionOptions.shortcutItem` on a cold start, delayed to Capacitor's
   `capacitorViewDidAppear` exactly as Capacitor's own SceneDelegateProxy does
   for a launch link. The link goes through `ApplicationDelegateProxy`, so the
   App plugin raises `appUrlOpen` and `getLaunchUrl` returns it; widget.ts now
   listens for those links on iOS too. AppDelegate keeps Library/WebKit (the
   web view's IndexedDB) out of backups, as Android's allowBackup=false.
   Swift 6.1.2 for Linux downloaded to the scratchpad: both files type-check
   (`swiftc -typecheck -swift-version 5`) against stand-ins with the UIKit and
   Capacitor signatures; only Swift 6 concurrency warnings, as Capacitor's
   own proxy code has.
10. GitHub Actions: the iPhone job in build.yml (decision below), actionlint
    1.7.12 with shellcheck clean for everything new (the only remarks are
    shellcheck "info" on the existing Android manifest step).
11. Signing: archiving with automatic signing needs a development profile,
    which Apple gives only when the team has a registered device, and makes a
    new Apple Development certificate on every fresh Mac (Apple caps them).
    So: one registered iPhone (owner step), and `scripts/ios-certificates.mjs`
    revokes the development certificate a run made, at the end of the run
    (ES256 token for the App Store Connect API from node:crypto; checked).
    Archiving unsigned and signing only at export was considered: reports say
    the nested frameworks stay unsigned and the upload is refused (ITMS-90035),
    and GetIt embeds nine pod frameworks.
12. Harness (port 5510, scratchpad, deleted at the end): the app built with
    the store-shots stand-in sign-in and demo week, run with Capacitor's
    platform set to 'ios' (CapacitorCustomPlatform), in **Playwright WebKit**
    (installed into the scratchpad) at 393 × 852 × 3, with WebKit's
    `env(safe-area-inset-*)` written in as an iPhone 15–17 gives them (top 59,
    bottom 34; landscape left/right 59, bottom 21). The keychain plugins were
    stood in (their 'ios' code calls the native side, which a browser lacks,
    and went round in a circle). Everything clears the island, the status bar
    and the home indicator; content scrolls under nothing; the + and the
    sheets' action rows clear the home indicator; Looks shows "On top of the
    iPhone's own text size" and no icon picker; Edit module → Show has four
    switches. Screenshots: scratchpad/shots20/i1/ (Today, Plan week, Food day,
    the + menu, the task sheet, Settings, Looks, Looks end, Edit module Show,
    Today scrolled; light and -dark; Today and the + menu in landscape).
13. Store: `node scripts/store-shots.mjs --iphone` makes the App Store's 6.9"
    set (1320 × 2868) in store/screenshots/iphone/ (committed).
14. Policy (POLICY_VERSION 2026-10-07, see merge notes), records of
    processing, docs/ios-release.md, store/app-store-answers.md,
    requirements (PLAT-10 Partly; PLAT-11 widgets and PLAT-12 Apple Health as
    Could, source R7).

## Feature → iPhone status

| Feature (code) | iPhone | What was done |
| --- | --- | --- |
| `isNative()` users in general | Works | true on iOS as on Android; Android-only uses now ask `features()`. |
| Files out: `saveFile` (filesystem + share) | Works | Both plugins have iOS code; cache dir then the share sheet. |
| Auth links: `authRedirect`, auth-links.ts | Works | app.getit.planner:// registered in Info.plist; the same callback URL as Android, so Supabase's allow list already has it. |
| Lifecycle (appStateChange, resume) | Works | App plugin on iOS. |
| Reminders, notify.ts | Works, changed | Channels Android only; actions open the app on iOS (`foreground: true`, iOS-only option); at most 64 pending (soonest first, beside snoozes and a focus end kept); `presentationOptions` banner, list, sound. |
| Barcode scanner, BarcodeScan.tsx | Works, changed | No module check on iOS; camera refusal explained. |
| Photos (file inputs with capture) | Works | Camera usage string covers them. |
| Accounts: secure storage, biometric | Works | Keychain items this device only on iOS (`src/lib/secure-storage.ts`); Face ID string. |
| Open Prices (account, share) | Works | `app_platform=ios`. |
| products.ts, recipe-fetch.ts, open-prices.ts (CapacitorHttp) | Works | Core plugin, iOS included. |
| looks.ts text size | Works, changed | CSS zoom on iOS (as the web), times Dynamic Type read from `-apple-system-body` (guarded by `CSS.supports`), re-read on resume; index.html's first paint gets the same zoom. |
| looks.ts status bar | Works, new | SystemBars.setStyle from the app's own shade, iOS only (Android left as it was). |
| Phone colours (GetItLooks.systemColours) | Android only | Already returned null off Android; not offered. |
| App icon (GetItLooks.setIcon) | Android only | Picker hidden on iOS. |
| Haptics (GetItLooks.haptic) | Android only | Falls to navigator.vibrate, absent in WKWebView: silent. Later. |
| Widgets, widget.ts | Android only | Guarded by `features().widgets`; widget switch and stats hint hidden on iOS. |
| Quick-add sending to the launcher (sendQuickAdd) | Android only | Guarded; iOS has fixed quick actions instead. |
| Links app.getit.planner://open/… | Works | Listened for on iOS too (quick actions). |
| Health Connect sleep import | Android only | Already unsupported off Android; menu entry absent. Apple Health later (PLAT-12). |
| Keyboard plugin | Not used | Not a dependency of the app (only of a plugin), so not linked; listed for later. |

## Decisions and why

- **iPhone job inside build.yml, not ios.yml**: the owner asked to "update
  both at once". In the same workflow the iPhone build has the same commit,
  the same `checks` gate and the same run number as Android's versionCode, so
  Android build N and iPhone build N are the same code. A small Linux job
  (`ios-when`) decides cheaply whether the Mac job runs.
- **When it runs**: on a push to main that changes `version` in package.json,
  and on Run workflow. Releases bump the version, so both phones update
  together; everyday pushes cost no Mac minutes. If the previous commit can't
  be read (new branch, force push), it builds to be safe.
- **macos-26 and Xcode 26.6 pinned**: Apple takes uploads only from Xcode 26
  with the iOS 26 SDK since 28 April 2026; 26.6 is the image's default, with
  the iOS 26.5 SDK and its platform installed. The job checks the path and
  lists the installed Xcodes if it is gone; it downloads the iOS platform only
  if missing.
- **Compile check is `generic/platform=iOS` with signing off**, not the
  simulator (ML Kit's simulator slices).
- **Upload route**: `xcodebuild -exportArchive` with ExportOptions.plist
  (method app-store-connect), twice from one archive: destination export
  (the .ipa artifact) and destination upload (App Store Connect). Apple's own
  route with cloud signing; no altool (whose Xcode 26 version had a
  silent-failure regression).
- **Admin API key**: cloud-managed distribution signing refuses App Manager
  keys ("Cloud signing permission error").
- **CocoaPods** (the ML Kit plugin supports nothing else), Podfile.lock
  committed; if a plugin update outgrows it, the job runs `pod update`, warns
  and uploads the new lock file.
- **iPhone only** (no iPad target).
- **Quick actions**: static, the + menu's four defaults, in Info.plist, with
  ten lines of Swift; following the person's order needs a native plugin
  (later).
- **Text size on iPhone**: page zoom like the web build, plus Dynamic Type, so
  the iPhone's own text size is honoured as Android's font scale is.
- **Backups**: the local copy and keychain items stay off backups, matching
  Android.

## Verification (end)

- `npx tsc -b`, `npm run check` (with the new `platform` and `ioscerts`
  checks), `npx vite build`: pass.
- `npx cap sync ios` and `npx cap sync android` on Linux: no errors (pod
  install and xcodebuild clean skipped with warnings, as expected); the
  Podfile and android/capacitor.settings.gradle path churn put back.
- `pod install` (CocoaPods 1.17 on Linux) on a copy: complete, 22 pods.
- Android `./gradlew -q --offline assembleDebug` builds.
- Plists parse (python plistlib): Info.plist, PrivacyInfo.xcprivacy,
  ExportOptions.plist, IDEWorkspaceChecks.plist. Workflows: actionlint 1.7.12.
- Swift: type-checked against stand-ins (Swift 6.1.2, Linux).

## Merge notes for the lead

- Shared files touched: package.json (dependency `@capacitor/ios`, scripts
  `assets`/`assets:ios`, two names in the check loop), package-lock.json (one
  root line), src/test/README.md (two entries), README.md,
  docs/requirements.md (PLAT-10 status; PLAT-11, PLAT-12; source R7),
  capacitor.config.ts (`ios` block, LocalNotifications.presentationOptions),
  .github/workflows/build.yml (two jobs appended, header comment).
- `POLICY_VERSION` is **2026-10-07**: version 19 had already set 2026-10-06
  (a day ahead), so "the day I finish" (5 October) would have been older and
  nobody would have seen the notice. If another v20 branch also bumps it, keep
  the latest date and make sure it is later than 2026-10-06.
- Anyone running `npx cap sync` in a worktree must put back the paths in
  ios/App/Podfile and android/capacitor.settings.gradle before committing.
- No migrations, no Dexie version, no edge functions, no new secrets in the
  repository. The owner adds four GitHub secrets (ASC_KEY_ID, ASC_ISSUER_ID,
  ASC_KEY_P8, APPLE_TEAM_ID) when he has the Apple account.

## Sources

- Apple, SDK minimum requirements: developer.apple.com/news/upcoming-requirements
  (Xcode 26 / iOS 26 SDK for uploads since 28 April 2026).
- GitHub runner images, macOS 26 and 15 arm64 readmes:
  github.com/actions/runner-images/blob/main/images/macos/ (Xcode 26.6
  default on macos-26, iOS 26.5 SDK and simulators, CocoaPods 1.17.0).
- App Store Connect Help: screenshot specifications; age ratings values and
  definitions.
- Apple Developer Forums 698117 (cloud signing needs an Admin key), 810658.
- justrach/harness PR 160 (development certificate per CI run, "maximum number
  of certificates"); virtu333/rogue-emblem PR 104 and
  shilokuma-inc/ninjacord-ios PR 234 (unsigned archive, nested frameworks
  rejected with ITMS-90035); clucknorrisapp/CLKN-SEEKER PR 4 (ExportOptions
  shape); fastlane issue 29743 (Xcode 26 altool silent failures).
- Plugin READMEs and sources in node_modules: @capacitor-mlkit/barcode-scanning
  (iOS 15.5, camera string, CocoaPods only), @capacitor/filesystem (C617.1),
  @capacitor/local-notifications (iOS: createChannel unimplemented,
  presentationOptions, action `foreground`), @aparajita/capacitor-biometric-auth
  (NSFaceIDUsageDescription), @aparajita/capacitor-secure-storage (keychain,
  access levels), @capacitor/ios (SceneDelegateProxy, SystemBars,
  ApplicationDelegateProxy), the ML Kit pods' privacy manifests.
- Capacitor docs: iOS privacy manifest page.
