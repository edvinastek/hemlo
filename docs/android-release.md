# Releasing GetIt for Android

Every push to `main` builds a signed Android App Bundle for Google Play and a
signed APK for installing directly. This page covers the one-time setup and
what to do for each release.
The iPhone app is built from the same commit and version: see
`docs/ios-release.md`.

## One time: the upload key

Google Play signs what people install with a key Google keeps (Play App
Signing). You sign what you *upload* with your own **upload key**. Make it on
your own computer, so it never passes through anyone else's hands.

1. Install a Java runtime if you have none (PowerShell):
   ```powershell
   winget install EclipseAdoptium.Temurin.21.JDK
   ```
   Close and reopen PowerShell afterwards.

2. Make the key. Pick a long password and write it down; you will need it twice.
   ```powershell
   cd $HOME\Documents
   keytool -genkeypair -v -keystore getit-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```
   It asks for your name and location; only the password matters.

3. **Back it up** somewhere that is not this laptop: a password manager that
   takes attachments, or a USB stick in a drawer. With Play App Signing a lost
   upload key can be replaced by Google support, but it takes days.

4. Put it into GitHub, which is where the builds happen. Copy the key as text:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Documents\getit-upload.jks")) | Set-Clipboard
   ```
   Then in the repository: Settings → Secrets and variables → Actions → New
   repository secret, four times:

   | Secret | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | paste the clipboard |
   | `ANDROID_KEYSTORE_PASSWORD` | the password |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | the password again |

   Never commit the `.jks` file; `.gitignore` refuses it anyway.

5. The next push builds a signed bundle. Until these secrets exist, CI builds an
   unsigned bundle so you can still see the build pass, but Play will not
   accept it.

## One time: the public site

Google Play needs a privacy policy URL and an account-deletion URL. Both are
built from this repository by `npm run build:site` into `dist-site/`.

1. Add two more repository secrets: `VITE_CONTROLLER_NAME` (your legal name,
   as the policy must name who is responsible) and `VITE_CONTACT_EMAIL` (the
   dedicated developer address).
2. The site is hosted by Netlify (the privacy policy says so). Build it on your
   computer with the four `VITE_…` values in `.env` (the two above and the
   Supabase URL and publishable key): `npm run build:site`. Then sign in at
   app.netlify.com, open Netlify Drop (app.netlify.com/drop) and drag the
   `dist-site` folder onto it. A dropped site must belong to your account, or
   Netlify removes it after an hour. In the site's settings leave analytics,
   forms, functions and snippet injection off: the policy says the pages set no
   cookies and load nothing else. To publish a new version (a policy change),
   build again and drag the folder onto the site's Deploys page.
3. Your URLs are then `https://<site-name>.netlify.app/privacy.html` and
   `/delete.html`. Put them in Play Console and in `store/listing.json`.
4. Add the site to Supabase's allowed redirect URLs so a password reset asked
   for on the web returns there.

## Each release

1. Raise `version` in `package.json` (for example 0.2.0 → 0.3.0). The web,
   Android and Windows builds all read it, so every platform carries the same
   number.
2. Push to `main`. When the run is green, download `getit-android-release`.
3. Play Console → your app → Testing → choose the track → Create new release →
   upload the `.aab`. Paste a short "what's new".
4. The version code is the CI run number, so each upload is automatically
   higher than the last, which Play requires.

## Checks before every upload

- `npm run check` passes (calculations, formulas, reminders).
- `supabase/test.sh` passes (29 attacks on the database), whenever a migration changed.
- `store/play-console-answers.md` still matches the app. New data collected
  means a new Data safety answer **before** the release goes out.
