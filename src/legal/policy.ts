/** The privacy policy, written once and shown in two places: inside the app,
 *  and on the public page Google Play links to. Keep it true to the code: if a
 *  feature starts collecting something new, this changes in the same commit.
 *  The sources for each statement (Supabase's plan, logs, backups, processors)
 *  are in docs/privacy/, which changes with it.
 *
 *  The controller's name and contact address come from the build environment
 *  (VITE_CONTROLLER_NAME, VITE_CONTACT_EMAIL), so they are not hard-coded into
 *  the repository. The public site refuses to build without them. */

/** The day this policy last changed, 'yyyy-MM-dd'. A newer date than the
 *  one a person agreed to (or last read) shows the one-line notice in the
 *  app (legal/PolicyNotice.tsx, G2 #16). Version 18: Netlify, household
 *  sharing, Finance, stats widgets, Open Prices sharing, photos, NEVO and
 *  USDA, notifications and the Android permissions. Version 19: reminders
 *  through Telegram, and sleep read from Health Connect. Version 20: the
 *  iPhone app (its permissions, ML Kit, TestFlight, backups). Version 21:
 *  the service is called Visuma (it was GetIt); nothing else changed. Later
 *  than version 20's date, so everyone sees the notice once. */
export const POLICY_VERSION = '2026-10-08'

export const controller = {
  name: (import.meta.env.VITE_CONTROLLER_NAME as string | undefined) ?? '',
  email: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? '',
}

export interface Section { heading: string; body: string[] }

/** The iPhone app's permissions (ios/App/App/Info.plist, version 20), in
 *  plain words and written as they read inside a sentence;
 *  store/app-store-answers.md lists the same. */
export const IPHONE_PERMISSIONS: { name: string; why: string }[] = [
  { name: 'notifications', why: 'for reminders, if you turn them on (the iPhone asks you first)' },
  { name: 'the camera', why: 'only when you scan a barcode or take a photo in Visuma (the iPhone asks you first)' },
  { name: 'Face ID', why: 'only to confirm switching between accounts kept on the phone' },
]

/** The Android permissions in the app's merged manifest (version 18), in
 *  plain words. Kept here so the policy and the store answers say the same
 *  (store/play-console-answers.md lists the same set). */
export const ANDROID_PERMISSIONS: { name: string; why: string }[] = [
  { name: 'Internet and network state', why: 'to sync your data and to know when you are offline' },
  { name: 'Notifications', why: 'for reminders, if you turn them on (Android asks you first)' },
  { name: 'Run at start-up', why: 'to set your reminders again after the phone restarts' },
  { name: 'Keep awake', why: 'briefly, so a reminder arrives on time' },
  { name: 'Fingerprint or face', why: 'only to confirm switching between accounts kept on the phone' },
  { name: 'Health Connect: sleep (read)', why: 'only to import your nights when you choose Import from Health Connect on the Sleep page (Android asks you first)' },
]

export function privacySections(): Section[] {
  const who = controller.name || 'the developer of Visuma'
  const mail = controller.email || 'the contact address on the Google Play listing'
  return [
    {
      heading: 'Who is responsible',
      body: [
        `Visuma is made by ${who}, a private individual in the Netherlands, who decides how your data is used and is responsible for it under the GDPR. Questions, requests and complaints go to ${mail}.`,
        'Visuma was called GetIt until October 2026. Only the name changed: the same service, run by the same person, under the same terms.',
      ],
    },
    {
      heading: 'What Visuma stores',
      body: [
        'Your account: your email address and a password, which is stored only as a one-way hash.',
        'Your profile: a name, sex, date of birth, height, activity level, goal, time zone, the times your day starts and ends, and, if you give them, your country and town (for shops, prices and public holidays).',
        'Health and fitness details you enter: weigh-ins and waist measurements, calorie and protein targets, what you plan to eat and what you ate, training sessions, sets and the exercises you add, and, if you turn those modules on, sleep, habits and supplements (with how many doses are left, if you count them).',
        'Your plan: tasks, notes and note templates, goals, projects and their milestones, routines, calendar events, books you are reading, the stats views you save, recipes you add, shopping lists, what is in stock, and the prices you type for things at your shops.',
        'Finance, if you turn it on: the amounts you spend and receive, their categories and notes, budgets, and planned payments such as rent or subscriptions. Visuma never connects to a bank; it holds only what you type.',
        'Modules you build yourself: their fields and records, and any photos you add to a record.',
        'If you share a household: that you are a member, and the name you give yourself there.',
        'If you follow a calendar (Settings → Calendars): its name, colour and secret address, and when it was last fetched. When you stop following it, the address is erased at once. If you make a link for Google Calendar: only a scrambled form (a hash) of the link, from which the link cannot be worked out.',
        'When you agreed to the storing of your health details, to which version of this policy, and which later version you have read.',
        'Technical logs of requests to the server, including your IP address and the type of device or browser, kept for security.',
        'Visuma has no advertising, no analytics and no tracking. Apart from Google’s barcode scanner (below), no third-party code in the app receives anything. Visuma never sells your data or shares it for anyone else’s use.',
      ],
    },
    {
      heading: 'Why, and on what basis',
      body: [
        'Your account, profile, plan, Finance records, household and the modules you build are stored to provide the planner you signed up for (GDPR article 6(1)(b), performance of a contract).',
        'Weight, food, training, sleep and supplement details are health data. Visuma stores them only with your explicit consent, given when you create an account (GDPR article 9(2)(a)). They are used for one thing: calculating your targets and planning your days, meals and shopping. Nothing is decided about you automatically.',
        'You can withdraw consent at any time by deleting your account. Visuma cannot plan meals or targets without these details, so withdrawing ends the service. What was stored before you withdrew was stored lawfully.',
        'A price is sent to Open Prices only when you choose to share it, at your request (GDPR article 6(1)(b)); see "Sharing prices with Open Prices" below.',
        'Reminders go through Telegram only when you link it, at your request (GDPR article 6(1)(b)); see "Reminders through Telegram" below.',
        'The technical logs are kept to keep the service secure and working (GDPR article 6(1)(f), legitimate interest).',
      ],
    },
    {
      heading: 'Where your data is kept',
      body: [
        'With Supabase, which runs Visuma’s database, sign-in and file storage. Supabase is a processor: it handles the data only on Visuma’s instructions, under a data processing agreement. The data is stored in Frankfurt, Germany, on Amazon Web Services servers, encrypted on its way there and while stored.',
        'Supabase uses other companies to provide its service, such as Amazon Web Services for the servers and Cloudflare for the network that carries requests to them. Some of them, and Supabase’s own support staff, are outside the European Union; Supabase’s agreement covers any access from there with the European Commission’s standard contractual clauses. Its list of these companies is at supabase.com/legal/customer-resources/subprocessor-list.',
        'Photos you add to a record in a module are made smaller on your device and stored privately with Supabase, in the same place: only your account can open them, and a copy is kept on your device so you can see them offline. Deleting the record or your account deletes them.',
        'A photo you add to a recipe is kept the same way: only you can open it, unless the recipe is approved for everyone (below), when it is shown with the recipe. Replacing it, taking it off or deleting the recipe deletes it a day later (so Undo can bring it back); deleting your account deletes it at once.',
        'Emails to confirm your address or reset your password are sent through an email delivery service that acts for Visuma in the same way and receives only your email address and the link.',
        'On your device, a copy that lets Visuma work without a connection. Signing out removes it. On Android it is left out of phone backups and device-to-device transfers; on an iPhone it is left out of iCloud and computer backups.',
        'Reminders on the phone, if you turn them on, are set on the phone itself as local notifications: no server sends them, and on a locked phone they show no text (on an iPhone, as long as its Show Previews setting is left at When Unlocked, the iPhone’s default). Reminders through Telegram are different; see below.',
        'Sleep from Health Connect, only if you turn it on in the Android app: Visuma reads, on the phone, only the sleep sessions you allow in Android’s Health Connect, and keeps them as your own sleep records, stored and synced like the ones you type. It reads nothing else there, writes nothing there, and sends what it read nowhere else. You can take the permission back in Health Connect at any time; the sleep records already kept stay until you delete them. Visuma never shares or sells what it reads there and never uses it for advertising, and its use of data from Health Connect follows the Health Connect Permissions policy, including its Limited Use requirements.',
        'Home-screen widgets (Android app), if you add them, show what you choose from the same copy, and signing out clears them. The Visuma widget shows today’s tasks and habits. A stats widget shows the figures of one saved stats view, which can be health figures such as your weight or sleep, to anyone who sees your home screen. To keep health figures off it, place stats widgets only for views without them, or take the widget off your home screen.',
        'The privacy and account deletion pages are hosted by Netlify, which sees your IP address when you visit them and acts as Visuma’s processor for that. They set no cookies. On the deletion page, your email and password go straight from your browser to Supabase.',
        'Supermarket products: when you search for a product, scan or type a barcode, or open a product’s page, the words you searched or the barcode go straight from your device to Open Food Facts (openfoodfacts.org), and to its price list Open Prices for the prices people have shared. Both are run by Open Food Facts, a French non-profit, as their own public services. Nothing else is sent: no account, name, email address or health details, and Visuma’s server is not involved. Like any website they see your IP address and the type of device; product pictures are loaded from them too. Their privacy policy is at world.openfoodfacts.org/privacy. A product you add becomes one of your own foods, stored like the others. Links to a shop’s offers page or site search open in your browser on the shop’s own website: Visuma sends the shop nothing but the search words in the link, and the shop’s own privacy policy applies there.',
        'Food figures come from the Dutch food composition table NEVO (RIVM) and, for a few foods and units, USDA FoodData Central. They are built into Visuma: looking a food up sends nothing anywhere.',
        'A recipe read from a web address: your device fetches that page itself, so the website sees your IP address, as when you open it in a browser. Nothing else is sent.',
        'In the Android app a barcode is read by Google’s code scanner, part of Google Play services on the phone: it hands Visuma only the number, so Visuma never has the camera picture and needs no camera permission. Google’s scanner sends Google figures about how it works (the phone’s model, the app’s name and version, and an identifier for this installation that does not name you), for Google’s own diagnostics, under Google’s own terms. In the iPhone app a barcode is read by Google’s ML Kit, built into the app: the camera picture is read on the phone and never leaves it, and only the number reaches Visuma. ML Kit sends Google the same kind of figures about how it works, under Google’s own terms. In a browser that can read barcodes itself, the camera picture stays on the device and stops when you close the scanner.',
      ],
    },
    {
      heading: 'Reminders through Telegram',
      body: [
        'Off unless you link it (Settings → Reminders → Telegram). Linking shows a link to Visuma’s bot in Telegram that works once, for 10 minutes; tapping Start there tells Visuma the number of your chat with the bot, which is stored with your profile at Supabase. Telegram also passes the bot your Telegram name with every message you send it; Visuma reads only the chat number and the command, and keeps nothing else.',
        'While it is linked, your device hands Visuma’s server the reminders for the next three days: each reminder’s line (the title you gave the task, habit, chore, event or supplement, with its time) and when it is due. A server function at Supabase sends each one to Telegram when it falls due and notes that it was sent, for two days, so it never goes twice. Reminders Visuma writes from your meal, training, body and sleep plans stay on the phone, and so do amounts of money and supplement counts: a health detail goes only if you wrote it in a title yourself.',
        'Telegram (run by Telegram FZ-LLC and Telegram Messenger Inc., outside the European Union) delivers the messages and keeps them under its own terms and privacy policy (telegram.org/privacy), as an independent controller, not as Visuma’s processor. Visuma sends Telegram nothing else: not your name, email address or account.',
        'Unlink in the app, or send /stop to the bot, or block it: Visuma forgets the chat and the reminders waiting at once. Deleting your account does the same. Messages already delivered stay in your Telegram chat until you delete them there.',
      ],
    },
    {
      heading: 'Sharing prices with Open Prices',
      body: [
        'Off unless you turn it on (Settings → Shopping and household → Share prices with Open Prices), and then only a price you choose, when you tap Share. Nothing is ever shared by itself.',
        'Turning it on asks for your Open Food Facts user name and password. They go once, from your device, to Open Prices’ own sign-in, run by Open Food Facts; Visuma never keeps the password. What comes back is a key that lets Visuma send prices for you: on the phone it is kept in the phone’s secure storage (Android’s keystore, the iPhone’s keychain), in a browser only until the tab is closed. Signing out, turning sharing off or signing out of Visuma forgets it.',
        'When you share a price, Visuma sends to Open Prices: the photo of the price tag or receipt you take or pick, the product’s barcode, the price, the currency, the day, whether it was an offer (and its normal price, if you give it), which shop it was (its OpenStreetMap place), and that it came from Visuma. The photo is made smaller and drawn again on your device first, which leaves out where it was taken and the camera’s details. Nothing else is sent: not your Visuma account, email address or health details.',
        'Shared prices are public. Open Prices publishes the price, the shop and the photo for anyone to see and reuse under the Open Database Licence (ODbL), together with your Open Food Facts user name. Before photographing a receipt, cover anything personal on it, such as a loyalty card or bank card number. Open Food Facts is responsible for what it publishes; you can remove your prices and photos on prices.openfoodfacts.org with your account. Deleting your Visuma account does not remove them there.',
        'To find the shop, the shop name and town you type go to Open Prices’ list of shops, and, only if you ask, to OpenStreetMap’s search (nominatim.openstreetmap.org, run by the OpenStreetMap Foundation), one request each time. Like any website they see your IP address.',
      ],
    },
    {
      heading: 'Adding a product to Open Food Facts',
      body: [
        'When a scanned product is not known anywhere, you can make it one of your foods from its label, by typing the figures, pasting the label’s text, or with a photo of the nutrition table beside the form. The photo stays on your device.',
        'Only if you tick “Also add it to Open Food Facts” and then tap Add, Visuma sends to Open Food Facts (openfoodfacts.org): the barcode, the name and brand you typed, the figures per 100 g or 100 ml, the photo of the nutrition table if you took one (made smaller and drawn again on your device, which leaves out where it was taken and the camera’s details), that it came from Visuma, and a random code for your Visuma account on this device that does not name you. Your Open Food Facts user name and password go with it, from your device straight to Open Food Facts; Visuma never keeps the password. Nothing else is sent: not your Visuma account, email address, what you eat or any health details.',
        'Open Food Facts publishes the product for anyone to see and reuse (the data under the Open Database Licence, the photo under Creative Commons Attribution-ShareAlike), with your Open Food Facts user name. It is responsible for what it publishes; you can change the product on openfoodfacts.org. Deleting your Visuma account does not remove it there.',
      ],
    },
    {
      heading: 'Who else can see it',
      body: [
        'No one else, unless you share a household. Access is enforced by the database itself, not only by the app.',
        'In a household, every member sees and can change what the household shares: the stock list (what is in the cupboard, fridge and freezer, with places, dates and notes), the shopping list and its lists, the prices anyone typed for the household’s shops, and the chores (their names, rooms, notes and schedule, who they are assigned to, and who did them when). Members see each other’s names as they set them in the household. They can read a food that is in the shared stock list (its name, brand, barcode, figures and shops) while it is there. Your profile, health details, plan, Finance, habits, supplements and modules stay private to you.',
        'The one exception is a recipe you choose to propose to everyone. The app’s owner reads it first, with the name on your profile, to approve or decline it. Once approved, everyone signed in to Visuma can see the recipe, its ingredients and its photo, without your name. It stops being shared when you set it back to Only me or delete it, and it is deleted with your account.',
        'Prices you choose to share with Open Prices, and products you choose to add to Open Food Facts, are public, as described above.',
        'Telegram receives the reminder lines you chose to get there, if you link it, as described above.',
        'Google, which distributes the app through Google Play, receives nothing you enter in Visuma, unless you choose to link a calendar, as below.',
        'Apple, which distributes the iPhone app through the App Store and TestFlight, receives nothing you enter in Visuma. While you test the iPhone app through TestFlight, Apple shows the developer the name and email address you were invited with, and the crash reports and feedback you choose to send.',
        'Calendar links, only if you make one. A link to show Visuma in Google Calendar lets whoever has it read the titles, times, sections and places of your tasks and of the events you put in your own agenda, from three months back to a year ahead, and your task notes only if you turn that on. Nothing else. Nothing about your health: planned meals, training, weigh-ins, sleep, habits and supplements are left out, whatever their title, and so is everything from modules you built yourself. Not your name: the calendar is called just Visuma. Not the events of calendars you follow. You give it to Google Calendar yourself; Google then fetches it every few hours and keeps what it reads under its own terms. Anyone you pass the link to can read it too, so keep it private; making a new link or turning it off stops the old one at once.',
        'A calendar you follow is fetched by Visuma’s server function at Supabase from the address you pasted, because a phone’s browser may not fetch it directly. The address is stored with your account, readable only by you (encrypted at rest by Supabase, like everything else), so your other devices can follow it too. The events themselves are kept only on your device(s), never on Visuma’s server, and only from three months back to a year ahead. Removing the calendar removes its events from Visuma and erases its address from Visuma’s server.',
      ],
    },
    {
      heading: 'On your phone: what Visuma may use',
      body: [
        `The Android app asks for: ${ANDROID_PERMISSIONS.map((p) => `${p.name.toLowerCase()} (${p.why})`).join('; ')}. Android libraries also add one internal permission that only Visuma holds, so the app’s own parts can talk to each other.`,
        'The Android app has no camera, location, contacts, microphone or storage permission. Barcodes are read by Google’s code scanner, as above. A photo (of a price tag, a receipt or for a record) is taken with your phone’s own camera app or picked with Android’s photo picker, which hands Visuma only that one picture.',
        `The iPhone app asks for: ${IPHONE_PERMISSIONS.map((p) => `${p.name} (${p.why})`).join('; ')}. A photo is taken with the iPhone’s own camera screen or picked with its photo picker, which hands Visuma only that one picture. It has no location, contacts, microphone or photo library permission, no home-screen widgets and no Health Connect, and it reads nothing from Apple Health.`,
      ],
    },
    {
      heading: 'How long it is kept',
      body: [
        'Your data is kept for as long as you have an account. Deleting your account removes it from the database at once, photos included.',
        'In a shared household, what the household shares stays with the other members when you leave or delete your account: the stock list, the shopping list, the prices typed and the chores, without your name on them.',
        'Something you delete inside the app is hidden at once and kept, marked as deleted, so your other devices learn it is gone. It is removed for good when your account is deleted, or sooner if you ask. A calendar you stop following is the exception: its secret address is erased at once; its name, colour and when it was last fetched are kept, marked as deleted.',
        'Prices you shared with Open Prices stay public there until you remove them on prices.openfoodfacts.org.',
        'Telegram: the chat number until you unlink; reminders waiting for at most three days ahead; the note that one was sent, two days. Messages delivered stay in your Telegram chat until you delete them there.',
        'Supabase deletes its technical logs, with IP addresses, after one day.',
        'Visuma’s database currently has no automatic backups, so nothing remains after your account is deleted. If daily backups are added, deleted data will remain in them for no longer than seven days, and this policy will say so first.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        `See and take your data: Settings → Data and account → Export gives you everything Visuma holds about you in one file: profile, plan, recurring tasks, targets, weigh-ins, food log, meal plan, habits, supplements, modules and their records, Finance, and the foods and recipes you added. You can also ask for a copy at ${mail}.`,
        'Correct it: edit anything in the app.',
        'Delete it: Settings → Data and account → Delete account, or on the account deletion page, which works without the app.',
        `Object, restrict processing or ask anything else: write to ${mail}. You will get an answer within one month.`,
        'Complain: to the Dutch data protection authority, the Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).',
      ],
    },
    {
      heading: 'If something goes wrong',
      body: [
        'If your data is ever exposed, lost or changed without permission, it is reported to the Autoriteit Persoonsgegevens within 72 hours when the law requires it, and you are told directly if it puts you at high risk.',
      ],
    },
    {
      heading: 'Age',
      // Matches the Google Play target audience (18 and over), which is kept
      // above the Dutch digital-consent age of 16 because of the health data.
      body: ['Visuma is for adults. It is not for anyone under 18.'],
    },
    {
      heading: 'Changes',
      body: ['The date at the top changes whenever this policy does. A change to what is collected or why is announced in the app first: one line, the next time you open it, until you have read the new policy.'],
    },
  ]
}
