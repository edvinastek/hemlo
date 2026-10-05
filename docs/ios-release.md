# Releasing GetIt for iPhone

GetIt's iPhone app is built by GitHub on its own Macs, from the same commit and
the same version number as the Android app, and sent to TestFlight. No Mac is
needed: everything below is done in a browser on Windows, plus one step with
the iPhone plugged into the Windows computer.

The iPhone project is in `ios/` (Capacitor, CocoaPods). The build is the `ios`
job in `.github/workflows/build.yml`.

## What it costs

- **Apple Developer Program**: US$99 a year (Apple shows the local price when
  you enrol). Needed for TestFlight and the App Store.
- **GitHub's Mac minutes**: a Mac minute costs about ten times a Linux minute.
  On a private repository, GitHub Free includes 2,000 minutes a month, and a
  Mac minute uses ten of them; beyond that a Mac minute is about US$0.06. On a
  public repository the standard runners are free. Prices change: check
  GitHub's billing page (Settings → Billing and plans) before relying on this.
- **One iPhone build** takes roughly 15 to 25 minutes (installing packages and
  the ML Kit pods, then Xcode), so about 150 to 250 of the 2,000 included
  minutes. That is why the iPhone job does **not** run on every push, unlike
  Android:
  - it runs when a push to `main` changes `version` in `package.json` (a
    release: both phones then get the same version), and
  - when you run the workflow by hand (Actions → Build → Run workflow).
  Every other push builds Android, Windows and the web as before and skips the
  iPhone, which costs nothing.

## Today, before the Apple account: prove the app compiles

Nothing to set up. Actions → **Build** → **Run workflow** → branch `main` →
Run. Without the Apple secrets the iPhone job compiles the app for iPhone
without signing it. A green **iPhone** job means the app, all its plugins and
the ML Kit scanner compile with the current Xcode. Nothing is uploaded.

## One time: the Apple side

1. **Enrol** in the Apple Developer Program at
   developer.apple.com/programs/enroll, as an individual, with your Apple
   Account (two-factor authentication must be on). The Apple Developer app on
   an iPhone is the quickest way to verify your identity; the website works too.
   Approval can take a day or two.

2. **Accept the agreements.** App Store Connect (appstoreconnect.apple.com) →
   Business: accept the Paid and Free Apps agreements shown there. Uploads fail
   until the latest agreement is accepted, and Apple asks again whenever it
   changes.

3. **Register the app's id.** developer.apple.com/account → Certificates,
   Identifiers & Profiles → **Identifiers** → + → App IDs → App →
   - Description: `GetIt`
   - Bundle ID: **Explicit**, `app.getit.planner`
   - Capabilities: leave everything as it is (GetIt needs none).
   Continue → Register. The id is permanent, like the Android package name.

4. **Register your iPhone** (once). Apple only gives the build Mac its
   development profile when the team has at least one device. Install the
   Apple Devices app (Microsoft Store) or iTunes on Windows, plug the iPhone in,
   trust the computer, open the iPhone's summary and click its serial number
   until it shows the **UDID**; copy it. Then Certificates, Identifiers &
   Profiles → **Devices** → + → Platform iOS, a name ("My iPhone"), the UDID →
   Register.

5. **Create the app in App Store Connect.** Apps → + → New App:
   - Platforms: iOS
   - Name: `GetIt - Day & Meal Planner` (the store name; 30 characters at most)
   - Primary language: English (U.K.)
   - Bundle ID: `app.getit.planner` (from step 3)
   - SKU: `getit-ios`
   - User access: Full access

6. **Make an App Store Connect API key** for GitHub. Users and Access →
   Integrations → App Store Connect API → **Team Keys** (the first time, choose
   Request Access and accept) → + →
   - Name: `GitHub builds`
   - Access: **Admin**. Apple's cloud signing (which keeps the distribution
     certificate at Apple, so it never sits on a computer) refuses keys with a
     lower role: the build would stop with "Cloud signing permission error".
   Generate, then **Download API Key**: a file `AuthKey_XXXXXXXXXX.p8`. Apple
   lets you download it **once**. Keep it in your password manager. Note the
   **Key ID** (in the list) and the **Issuer ID** (above the list).

7. **Find your Team ID**: developer.apple.com/account → Membership details →
   Team ID (10 characters).

## One time: the four GitHub secrets

In the repository: Settings → Secrets and variables → Actions → New repository
secret, four times:

| Secret | Value |
| --- | --- |
| `ASC_KEY_ID` | the Key ID from step 6 |
| `ASC_ISSUER_ID` | the Issuer ID from step 6 |
| `ASC_KEY_P8` | the whole `.p8` file: open it in Notepad, select all, copy, paste (the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines included) |
| `APPLE_TEAM_ID` | the Team ID from step 7 |

The workflow writes the key to the Mac's temporary folder for the run only and
deletes it at the end; GitHub hides secret values in the logs. Never put the
`.p8` file in the repository.

## The first TestFlight build

1. Actions → **Build** → **Run workflow** → `main` → Run. With the four
   secrets set, the iPhone job archives the app, signs it through the key,
   keeps the `.ipa` as the `getit-ios-release` artifact and uploads it to App
   Store Connect. Its version is `version` in `package.json`; its build number
   is the run number, the same number the Android build of that run gets.
2. After 5 to 30 minutes the build shows in App Store Connect → your app →
   **TestFlight**, first as Processing. GetIt declares that it uses only
   standard encryption (HTTPS), so no export compliance question is asked.
3. **Internal testers** (you, and up to 100 people who are users of your App
   Store Connect team): TestFlight → Internal Testing → + → a group ("Owner") →
   add yourself → the build. Install **TestFlight** from the App Store on the
   iPhone and accept the invitation. Internal builds need no review.
4. **External testers** (friends, up to 10,000, by email or a public link):
   TestFlight → External Testing → + → a group → add testers → add the build →
   fill in What to test and the review information from
   `store/app-store-answers.md`. The first build of each version goes through
   **Beta App Review** (usually a day). Testers must also be on GetIt's invite
   list, as for Android (`node scripts/allowlist.mjs`).

Each build in TestFlight lasts 90 days.

## Each release

1. Raise `version` in `package.json` and push to `main`. Android, Windows,
   the web and the iPhone are all built from that commit with that version.
2. When the run is green, the iPhone build is already on its way to
   TestFlight. Upload the Android bundle to Play as in `docs/android-release.md`.
3. To build the iPhone app again without a new version (a fix), use **Run
   workflow**, not **Re-run jobs**: a re-run keeps the old run number, and App
   Store Connect refuses a build number it has already seen.

## Tidying certificates

Each signed run makes a new "Apple Development" certificate on GitHub's Mac,
which forgets it afterwards. Apple allows only a few per team, so the last step
of the job revokes the one that run made (`scripts/ios-certificates.mjs`), and
only that one: certificates you made yourself and the cloud distribution
certificate are never touched. If a run is cancelled before that step, the
certificate stays: delete old ones named "Created via API" in Certificates,
Identifiers & Profiles → Certificates.

## What works on the iPhone

The iPhone app is the same app as Android's. What needs Android's own code is
switched off on the iPhone and its button hidden (`src/lib/platform-rules.ts`,
checked by `src/test/platform.check.mjs`).

| Feature | iPhone | Notes |
| --- | --- | --- |
| Planner, food, shopping, habits, every module, sync, offline | Works | The same web code. |
| Sign-in, confirmation and password-reset links | Works | The app.getit.planner:// link is registered in Info.plist; Supabase already allows it for Android. |
| Reminders (local notifications), Done and In 15 min | Works, changed | No notification channels on iOS (the call is skipped); the iPhone keeps 64 scheduled notifications at most, so the soonest 64 are set and the rest on a later run; Done and In 15 min open GetIt so the tick is surely written. Lock-screen text follows the iPhone's Show Previews setting. |
| Focus timer's end notification | Works | Counts towards the 64. |
| Barcode scanner | Works, changed | ML Kit is built into the iPhone app (no download from Google Play); the iPhone asks for the camera on the first scan. Refused: a note says where to allow it. |
| Photos (records, recipes, labels, prices) | Works | The iPhone's camera screen or photo picker, through the web view. |
| Export and backup files | Works | Written to the app's cache, then the iPhone's share sheet (Save to Files, Mail, …). |
| Switching kept accounts with Face ID or the passcode | Works | `NSFaceIDUsageDescription` in Info.plist. |
| Open Food Facts / Open Prices sign-in token | Works | The iPhone's keychain, this device only. |
| Product search, recipe from a web address, Open Prices | Works | Capacitor's native HTTP, as on Android. |
| Text size (Looks) | Works, changed | The page is zoomed (as in a browser) and follows the iPhone's own text size (Dynamic Type), re-read when the app comes back. |
| Light, dark and black, themes, density, fonts | Works | The status bar's text follows the app's own light or dark. |
| Notch, Dynamic Island, home indicator | Works | `viewport-fit=cover` with `env(safe-area-inset-*)` (Capacitor sets its own variables only on Android). |
| Landscape | Works | Portrait and both landscapes, as on Android; iPhone only (an iPad runs it as an iPhone app). |
| Quick actions on the icon (a long press) | Works, fixed list | Task, Inbox, Food and Event: the + menu's defaults, opening the same entries as Android's launcher shortcuts. Android follows the person's own + menu order; the iPhone list is fixed for now. |
| Home-screen widgets (Today, stats, quick add) | Android only | Later: WidgetKit (PLAT-11). The "Show on the widget" switch and the stats widget hint are hidden on the iPhone. |
| Choosing the app icon | Android only | Hidden on the iPhone. Later: iOS alternate icons. |
| Phone colours (wallpaper theme) | Android only | Not offered on the iPhone (iOS has no such palette). |
| Sleep from Health Connect | Android only | Hidden. Later: Apple Health (PLAT-12). |
| Haptic tick | Android only | The iPhone web view has no vibration; later with Capacitor's Haptics plugin. |
| Telegram reminders, calendar links, households, sharing | Works | Server features, the same everywhere. |

## Later work

- Home-screen widgets with WidgetKit (PLAT-11): a widget extension, an App
  Group shared with the app, and a Mac or many CI rounds to get right.
- Apple Health sleep import (PLAT-12): a HealthKit plugin, the HealthKit
  entitlement, `NSHealthShareUsageDescription`, and Apple's review of health
  data use.
- Quick actions that follow the person's own + menu order (a small native
  plugin setting `UIApplication.shortcutItems`).
- Haptics (`@capacitor/haptics`) and alternate app icons.
- The keyboard plugin (`@capacitor/keyboard`), if a sheet's field turns out to
  hide behind the keyboard on a real iPhone; today the web view scrolls the
  field into view, as Safari does.
- If Google sign-in is ever turned on (`VITE_ENABLE_GOOGLE`), the iPhone app
  must also offer Sign in with Apple (App Review guideline 4.8).

## If the first run fails

The job's log says which step; when Xcode fails, the full log is the
`ios-build-log` artifact. The likely ones:

| Where | What the log says | What to do |
| --- | --- | --- |
| Xcode | `Xcode_26.6.app is not on this runner image any more` | Set `XCODE_APP` in build.yml to a 26.x (or later) Xcode the log lists. |
| Install pods | `pod install refused ios/App/Podfile.lock` (a warning) | A plugin was updated; the job resolved the pods again and went on. Commit the `Podfile.lock` from the `ios-podfile-lock` artifact into `ios/App/`. |
| Compile | `error:` lines naming a `.swift` file | A Swift error, most likely in `ios/App/App/SceneDelegate.swift` or `AppDelegate.swift`, which were checked only against stand-ins on Linux. |
| Archive | `Your team has no devices from which to generate a provisioning profile` | Register an iPhone (step 4). |
| Archive | `Cloud signing permission error` / `No signing certificate "iOS Distribution" found` | The key's role must be Admin (step 6). |
| Archive | `No profiles for 'app.getit.planner' were found` | The bundle id is not registered under that team (step 3), or `APPLE_TEAM_ID` is another team's. |
| Archive | `maximum number of certificates` | Delete old "Created via API" development certificates (see Tidying). |
| Upload | `No suitable application records were found` | Create the app in App Store Connect (step 5). |
| Upload | `You must accept the latest agreement` | Step 2. |
| Upload | `The bundle version must be higher` | Use Run workflow rather than Re-run jobs. |
| Email from Apple after upload (ITMS-90683, ITMS-91053) | A missing purpose string or required-reason API | Add it to `ios/App/App/Info.plist` or `ios/App/App/PrivacyInfo.xcprivacy` and run again. |

## Sources

- Apple: SDK minimum requirements (Xcode 26 and the iOS 26 SDK for uploads
  since 28 April 2026), developer.apple.com/news/upcoming-requirements
- GitHub runner images: macOS 26 arm64 (Xcode 26.6 default, iOS 26.5 SDK and
  simulators installed; CocoaPods 1.17), github.com/actions/runner-images
- Apple Developer Forums: cloud signing with an API key needs the Admin role
  (developer.apple.com/forums/thread/698117)
- App Store Connect Help: screenshot specifications; age ratings
- Capacitor: iOS privacy manifest; `@capacitor/filesystem` README (file
  timestamp reason C617.1); `@capacitor-mlkit/barcode-scanning` README (iOS
  15.5, camera usage, CocoaPods only); `@aparajita/capacitor-biometric-auth`
  README (`NSFaceIDUsageDescription`)
