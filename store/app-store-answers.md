# App Store Connect answers for GetIt (iPhone)

Every form App Store Connect asks for before TestFlight and the App Store, with
the answer that matches what the iPhone app does as of **version 20** (checked
5 October 2026 against the code, `ios/App/App/Info.plist`,
`ios/App/App/PrivacyInfo.xcprivacy`, the plugins' own privacy manifests and
`src/legal/policy.ts`). It mirrors `store/play-console-answers.md`: if a feature
changes what is collected, change both files, the policy and `docs/privacy/` in
the same commit, and update the forms. The steps around them are in
`docs/ios-release.md`.

## App information

| Field | Answer |
| --- | --- |
| Name | GetIt - Day & Meal Planner (30 characters at most, as on Play) |
| Subtitle | Day, meals, shopping, habits (30 at most) |
| Bundle ID | `app.visuma.planner` (permanent) |
| SKU | `getit-ios` |
| Primary language | English (U.K.) |
| Category | Productivity; secondary: Health & Fitness |
| Content rights | **Yes, it contains third-party content, and I have the rights**: product data and pictures from Open Food Facts (Open Database Licence), the Dutch NEVO food table (RIVM) and USDA FoodData Central, all published for reuse. |
| Price | Free |
| Privacy Policy URL | `https://<site-name>.netlify.app/privacy.html` (as on Play) |
| Support URL | Required by Apple. Until there is a support page, the same privacy page: it names the contact address. |
| Copyright | `2026 Edvinas Straigis` |
| Digital Services Act (EU) | Before the app is offered in the EU, App Store Connect asks whether you are a trader. A free personal app with no business behind it: non-trader. If you are a trader, your address and contact are shown on the listing. (TestFlight does not need this.) |

### Description and keywords

- **Description** (4000 at most): `full_description` from `store/listing.json`
  with two changes, because the iPhone app has no widgets and its lock-screen
  text follows the iPhone's setting:
  - "on a page or a home-screen widget" → "on a page or on Today"
  - "On a locked phone they show no text." → "On a locked iPhone they show no text unless you choose otherwise in its settings."
- **Promotional text** (170 at most): `A calm planner for your day, meals, shopping and habits. Works offline.`
- **Keywords** (100 at most, comma-separated, no spaces needed):
  `planner,to-do,meal planner,shopping list,habits,calories,protein,recipes,offline,routine`

## App Privacy (the "nutrition label")

App Store Connect → your app → App Privacy → Get Started. **Do you or your
third-party partners collect data from this app?** Yes.

For every type: **Used for tracking: No.** GetIt has no advertising, no
analytics of its own and no tracking (`NSPrivacyTracking` is false); nothing is
combined with data from other companies' apps or websites.

### Data linked to the user (stored with the account, for the app itself)

| Apple's category | Data type | Purposes | What it is in GetIt |
| --- | --- | --- | --- |
| Contact Info | Email Address | App Functionality | The sign-in address. |
| Contact Info | Name | App Functionality | The profile name; the name a member shows in a household. |
| Health & Fitness | Health | App Functionality | Weight, waist, food eaten, targets, sleep, supplements, cycle (if that module is on). |
| Health & Fitness | Fitness | App Functionality | Training sessions, sets and exercises. |
| Financial Info | Purchase History | App Functionality | What the person types in Finance as spent; the prices typed for shopping items. |
| Financial Info | Other Financial Info | App Functionality | Income, budgets and planned payments typed in Finance. |
| Location | Coarse Location | App Functionality | The country and town typed in the profile, and a shop's place when a price is shared. Never the device's location: GetIt has no location permission. |
| User Content | Photos or Videos | App Functionality | Photos added to records and recipes (private storage); a price tag or receipt photo sent to Open Prices only when the person shares a price. |
| User Content | Other User Content | App Functionality; Analytics (see ML Kit below) | Tasks, notes, recipes, shopping lists, stock, chores, module records, calendar events. |
| Other Data | Other Data Types | App Functionality; Analytics (see ML Kit below) | Date of birth and sex, for the calorie and protein targets. |

### Data not linked to the user (ML Kit's barcode scanner)

The barcode scanner is Google's ML Kit, built into the iPhone app. Its own
privacy manifests (`MLKitCommon`, `MLKitBarcodeScanning`, `GoogleDataTransport`)
declare that it sends Google these, **not linked** to the user and **not used
for tracking**, for Google's analytics and the scanner's working:

| Apple's category | Data type | Purposes |
| --- | --- | --- |
| Identifiers | Device ID | Analytics, App Functionality |
| Usage Data | Product Interaction | Analytics, App Functionality |
| Diagnostics | Performance Data | Analytics, App Functionality |
| Diagnostics | Other Diagnostic Data | Analytics |

(ML Kit also lists "other user content" and "other data types"; those types are
already declared above as linked, so App Store Connect takes them once, with
Analytics added to their purposes.)

Not collected: precise location, contacts, browsing or search history (product
searches go from the phone straight to Open Food Facts, which is not GetIt's
partner), sensitive info, audio, emails or messages, gameplay, customer
support, advertising data, payment info, credit info, crash data.

## Age rating

App Store Connect → your app → App Information → Age Rating → Edit.

| Question | Answer |
| --- | --- |
| Parental controls | No |
| Age assurance | No |
| Unrestricted web access | No (a recipe's web address is read for its recipe; no web page is shown) |
| User-generated content | **Yes**: household members share lists, prices and chores, and a recipe proposed to everyone is shown to all users once the developer approves it |
| Social media | No |
| Messaging and chat | No |
| Advertising | No |
| Profanity or crude humour, horror or fear, alcohol, tobacco or drugs | None |
| Medical or treatment information | None |
| Health or wellness topics | **Yes** (nutrition, weight, sleep, training) |
| Mature or suggestive themes, sexual content, nudity | None |
| Violence (cartoon, realistic, graphic) and weapons | None |
| Gambling, simulated gambling, contests, loot boxes | No / None |

Take the rating App Store Connect works out. The app is made for adults (on
Play its target audience is 18 and over); Apple's rating describes the content,
and nothing in GetIt needs a higher one.

## Export compliance

Answered in the build itself: `ITSAppUsesNonExemptEncryption` is false in
Info.plist. GetIt uses only encryption built into iOS (HTTPS to Supabase, Open
Food Facts, Open Prices, OpenStreetMap and Telegram; the keychain) and no
encryption of its own, so App Store Connect asks nothing per build. If it ever
does, the answer is: uses encryption, exempt (standard encryption in the
operating system only).

## Permissions (Info.plist)

| Key | Text the iPhone shows | When |
| --- | --- | --- |
| `NSCameraUsageDescription` | GetIt uses the camera only when you scan a barcode or take a photo, for example of a food label. | The first barcode scan or photo. |
| `NSFaceIDUsageDescription` | GetIt uses Face ID only to confirm switching to another account kept on this iPhone. | The first switch to a kept account. |
| Notifications (no key) | The iPhone's own question | When reminders are turned on. |

No location, contacts, microphone, photo library (the photo picker needs none),
tracking, Bluetooth or health permission.

## TestFlight

### Test information (App Store Connect → TestFlight → Test Information)

- **Beta app description**: `GetIt is a calm planner for your day, meals, shopping and habits. It works offline and syncs across your devices.`
- **Feedback email**: the GetIt contact address.
- **Marketing URL**: leave empty. **Privacy policy URL**: as above.
- **Sign-in required**: yes, with the reviewer account below.

### What to test (each build)

```
Thank you for testing GetIt on iPhone. Please try:
- Sign in, then add a few tasks for today and tomorrow with the round +.
- Plan a meal on Food, and see it on the shopping list.
- Scan a food's barcode (Food → search field → the stripes icon). The iPhone asks for the camera once.
- Turn on reminders (Settings → Reminders and tips) and wait for one; try Done on the notification.
- Settings → Looks: dark mode and text size. Change the iPhone's own text size and come back.
- Long-press the GetIt icon on the home screen: Task, Inbox, Food and Event.
- Turn the phone sideways on Today and Plan.
Tell us about anything hidden behind the notch, the home bar or the keyboard, and anything that says "Android".
Not in the iPhone app yet: home-screen widgets and Apple Health.
```

### Beta App Review notes (external testing) and App Review notes

```
GetIt is a personal planner (tasks, meals, shopping, habits) that works offline and syncs to the user's account.
Sign-in is required: use the account below. No second factor or one-time code is used.
Sign-ups are invite-only during testing; this account is already invited and confirmed.
The camera is used only for barcode scanning (ML Kit, on the device) and photos the user takes.
Face ID is used only to confirm switching between accounts kept on the phone (Settings → Data and account).
Notifications are local reminders the user turns on; no push service is used.
Account deletion: Settings → Data and account → Delete account.
Recipes shared with all users are approved by the developer before anyone sees them; everything else is visible only to the user and the household members they invite.
```

Reviewer account: the same one as for Google Play, made as in
`store/testers/reviewer-account.md` (a dedicated address on the invite list,
confirmed, with made-up sample data). In App Store Connect it goes under
TestFlight → Test Information → Sign-in information, and for the App Store under
the version's App Review Information → Sign-in required.

## Screenshots (for the App Store, not needed for TestFlight)

Apple's current specification (App Store Connect Help, "Screenshot
specifications"): 1 to 10 screenshots, PNG or JPEG, no transparency.

| Display | Required | Portrait sizes accepted |
| --- | --- | --- |
| iPhone 6.9" | **Yes**, for an iPhone app (unless 6.5" ones are given) | 1320 × 2868, 1290 × 2796, 1260 × 2736 |
| iPhone 6.5" | Only if there are no 6.9" ones | 1284 × 2778, 1242 × 2688 |
| iPhone 6.3" and smaller | No: scaled from the larger ones | 1206 × 2622, 1179 × 2556 |
| iPad | No: GetIt is an iPhone-only app (`TARGETED_DEVICE_FAMILY = 1`) | |

`node scripts/store-shots.mjs --iphone` makes the 6.9" set (1320 × 2868) in
`store/screenshots/iphone/` from the same invented demo week as the Play
screenshots. Upload them in the same order as on Play.
