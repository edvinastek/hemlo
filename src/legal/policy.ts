/** The privacy policy, written once and shown in two places: inside the app,
 *  and on the public page Google Play links to. Keep it true to the code: if a
 *  feature starts collecting something new, this changes in the same commit.
 *  The sources for each statement (Supabase's plan, logs, backups, processors)
 *  are in docs/privacy/, which changes with it.
 *
 *  The controller's name and contact address come from the build environment
 *  (VITE_CONTROLLER_NAME, VITE_CONTACT_EMAIL), so they are not hard-coded into
 *  the repository. The public site refuses to build without them. */

export const POLICY_VERSION = '2026-10-04'

export const controller = {
  name: (import.meta.env.VITE_CONTROLLER_NAME as string | undefined) ?? '',
  email: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? '',
}

export interface Section { heading: string; body: string[] }

export function privacySections(): Section[] {
  const who = controller.name || 'the developer of GetIt'
  const mail = controller.email || 'the contact address on the Google Play listing'
  return [
    {
      heading: 'Who is responsible',
      body: [
        `GetIt is made by ${who}, a private individual in the Netherlands, who decides how your data is used and is responsible for it under the GDPR. Questions, requests and complaints go to ${mail}.`,
      ],
    },
    {
      heading: 'What GetIt stores',
      body: [
        'Your account: your email address and a password, which is stored only as a one-way hash.',
        'Your profile: a name, sex, date of birth, height, activity level, goal, time zone and the times your day starts and ends.',
        'Health and fitness details you enter: weigh-ins and waist measurements, calorie and protein targets, what you plan to eat and what you ate, training sessions and sets, and, if you turn those modules on, sleep, habits and supplements.',
        'Your plan: tasks, notes, goals, calendar events, recipes you add, shopping lists and what is in stock.',
        'If you follow a calendar (Settings → Calendars): its name, colour and secret address, and when it was last fetched. When you stop following it, the address is erased at once. If you make a link for Google Calendar: only a scrambled form (a hash) of the link, from which the link cannot be worked out.',
        'When you agreed to the storing of your health details, and to which version of this policy.',
        'Technical logs of requests to the server, including your IP address and the type of device or browser, kept for security.',
        'GetIt has no advertising, no analytics, no tracking and no third-party code that receives your data. It never sells your data or shares it for anyone else’s use.',
      ],
    },
    {
      heading: 'Why, and on what basis',
      body: [
        'Your account, profile and plan are stored to provide the planner you signed up for (GDPR article 6(1)(b), performance of a contract).',
        'Weight, food, training and sleep details are health data. GetIt stores them only with your explicit consent, given when you create an account (GDPR article 9(2)(a)). They are used for one thing: calculating your targets and planning your days, meals and shopping. Nothing is decided about you automatically.',
        'You can withdraw consent at any time by deleting your account. GetIt cannot plan meals or targets without these details, so withdrawing ends the service. What was stored before you withdrew was stored lawfully.',
        'The technical logs are kept to keep the service secure and working (GDPR article 6(1)(f), legitimate interest).',
      ],
    },
    {
      heading: 'Where your data is kept',
      body: [
        'With Supabase, which runs GetIt’s database and sign-in. Supabase is a processor: it handles the data only on GetIt’s instructions, under a data processing agreement. The data is stored in Frankfurt, Germany, on Amazon Web Services servers, encrypted on its way there and while stored.',
        'Supabase uses other companies to provide its service, such as Amazon Web Services for the servers and Cloudflare for the network that carries requests to them. Some of them, and Supabase’s own support staff, are outside the European Union; Supabase’s agreement covers any access from there with the European Commission’s standard contractual clauses. Its list of these companies is at supabase.com/legal/customer-resources/subprocessor-list.',
        'Emails to confirm your address or reset your password are sent through an email delivery service that acts for GetIt in the same way and receives only your email address and the link.',
        'On your device, a copy that lets GetIt work without a connection. Signing out removes it. On Android it is left out of phone backups and device-to-device transfers. Reminders on a locked phone show no text. If you add the GetIt widget to your home screen, it shows today’s tasks and habits there, from the same copy; signing out clears it.',
        'The privacy and account deletion pages are hosted by Cloudflare, which sees your IP address when you visit them. They set no cookies. On the deletion page, your email and password go straight from your browser to Supabase.',
        'Supermarket products: when you search for a product, scan or type a barcode, or open a product’s page, the words you searched or the barcode go straight from your device to Open Food Facts (openfoodfacts.org), and to its price list Open Prices for the prices people have shared. Both are run by Open Food Facts, a French non-profit, as their own public services. Nothing else is sent: no account, name, email address or health details, and GetIt’s server is not involved. Like any website they see your IP address and the type of device; product pictures are loaded from them too. Their privacy policy is at world.openfoodfacts.org/privacy. A product you add becomes one of your own foods, stored like the others.',
        'In the Android app a barcode is read by Google’s code scanner, part of Google Play services on the phone: it hands GetIt only the number, so GetIt never has the camera picture and needs no camera permission. Google may receive anonymous figures about how its scanner works, under Google’s own terms. In a browser that can read barcodes itself, the camera picture stays on the device and stops when you close the scanner.',
      ],
    },
    {
      heading: 'Who else can see it',
      body: [
        'No one else. Access is enforced by the database itself, not only by the app. If you share a household, its members share the stock list and shopping trips, and can read a food you put in that stock list (its name, brand, barcode, figures and shops) while it is there; your profile, health details and plan stay private to you.',
        'The one exception is a recipe you choose to propose to everyone. The app’s owner reads it first, with the name on your profile, to approve or decline it. Once approved, everyone signed in to GetIt can see the recipe and its ingredients, without your name. It stops being shared when you set it back to Only me or delete it, and it is deleted with your account.',
        'Google, which distributes the app through Google Play, receives nothing you enter in GetIt, unless you choose to link a calendar, as below.',
        'Calendar links, only if you make one. A link to show GetIt in Google Calendar lets whoever has it read the titles, times, sections and places of your tasks and of the events you put in your own agenda, from three months back to a year ahead, and your task notes only if you turn that on. Nothing else. Nothing about your health: planned meals, training, weigh-ins, sleep, habits and supplements are left out, whatever their title, and so is everything from modules you built yourself. Not your name: the calendar is called just GetIt. Not the events of calendars you follow. You give it to Google Calendar yourself; Google then fetches it every few hours and keeps what it reads under its own terms. Anyone you pass the link to can read it too, so keep it private; making a new link or turning it off stops the old one at once.',
        'A calendar you follow is fetched by GetIt’s server function at Supabase from the address you pasted, because a phone’s browser may not fetch it directly. The address is stored with your account, readable only by you (encrypted at rest by Supabase, like everything else), so your other devices can follow it too. The events themselves are kept only on your device(s), never on GetIt’s server, and only from three months back to a year ahead. Removing the calendar removes its events from GetIt and erases its address from GetIt’s server.',
      ],
    },
    {
      heading: 'How long it is kept',
      body: [
        'Your data is kept for as long as you have an account. Deleting your account removes it from the database at once.',
        'Something you delete inside the app is hidden at once and kept, marked as deleted, so your other devices learn it is gone. It is removed for good when your account is deleted, or sooner if you ask. A calendar you stop following is the exception: its secret address is erased at once; its name, colour and when it was last fetched are kept, marked as deleted.',
        'Supabase deletes its technical logs, with IP addresses, after one day.',
        'GetIt’s database currently has no automatic backups, so nothing remains after your account is deleted. If daily backups are added, deleted data will remain in them for no longer than seven days, and this policy will say so first.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        `See and take your data: Settings → Data and account → Export gives you everything GetIt holds about you in one file: profile, plan, recurring tasks, targets, weigh-ins, food log, meal plan, habits, supplements, and the foods and recipes you added. You can also ask for a copy at ${mail}.`,
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
      body: ['GetIt is for adults. It is not for anyone under 18.'],
    },
    {
      heading: 'Changes',
      body: ['The date at the top changes whenever this policy does. A change to what is collected or why is announced in the app first.'],
    },
  ]
}
