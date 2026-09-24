/** The privacy policy, written once and shown in two places: inside the app,
 *  and on the public page Google Play links to. Keep it true to the code: if a
 *  feature starts collecting something new, this changes in the same commit.
 *
 *  The controller's name and contact address come from the build environment
 *  (VITE_CONTROLLER_NAME, VITE_CONTACT_EMAIL), so they are not hard-coded into
 *  the repository. The public site refuses to build without them. */

export const POLICY_VERSION = '2026-09-24'

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
        `GetIt is made by ${who}, based in the Netherlands, who decides how your data is used and is responsible for it under the GDPR. Questions, requests and complaints go to ${mail}.`,
      ],
    },
    {
      heading: 'What GetIt stores',
      body: [
        'Your account: your email address and a password, which is stored only as a one-way hash.',
        'Your profile: a name, sex, date of birth, height, activity level, goal, time zone and the times your day starts and ends.',
        'Health and fitness details you enter: weigh-ins and waist measurements, calorie and protein targets, what you plan to eat and what you ate, training sessions and sets, and, if you turn those modules on, sleep, habits and supplements.',
        'Your plan: tasks, notes, goals, calendar events, recipes you add, shopping lists and what is in stock.',
        'Nothing else. GetIt has no advertising, no analytics, no tracking, no third-party code that receives your data, and it never sells or shares data.',
      ],
    },
    {
      heading: 'Why, and on what basis',
      body: [
        'Your account, profile and plan are stored to provide the planner you signed up for (GDPR article 6(1)(b), performance of a contract).',
        'Weight, food, training and sleep details are health data. GetIt stores them only with your explicit consent, given when you create an account (GDPR article 9(2)(a)). They are used for one thing: calculating your targets and planning your days, meals and shopping.',
        'You can withdraw consent at any time by deleting your account. GetIt cannot plan meals or targets without these details, so withdrawing ends the service.',
      ],
    },
    {
      heading: 'Where your data is kept',
      body: [
        'On servers run by Supabase, in Frankfurt, Germany, which processes the data only on GetIt’s instructions. Data is encrypted on its way there and while stored.',
        'On your device, a copy that lets GetIt work without a connection. Signing out removes it. On Android it is left out of phone backups and device-to-device transfers.',
        'Reminders on a locked phone show no text. The server keeps brief technical logs, including IP addresses, for security; they are deleted after a short period.',
      ],
    },
    {
      heading: 'Who else can see it',
      body: [
        'No one. Access is enforced by the database itself, not only by the app. If you share a household, its members share the stock list and shopping trips; your profile, health details and plan stay private to you.',
      ],
    },
    {
      heading: 'How long it is kept',
      body: [
        'For as long as you have an account. Deleting your account removes your data from the database at once. If backups are running at the time, deleted data can remain in them for up to seven days before it is overwritten.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'See and take your data: More → Data → Export gives you everything in one file.',
        'Correct it: edit anything in the app.',
        'Delete it: More → Data → Delete account, or on the account deletion page, which works without the app.',
        `Object, restrict processing or ask anything else: write to ${mail}. You will get an answer within one month.`,
        'Complain: to the Dutch data protection authority, the Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).',
      ],
    },
    {
      heading: 'Age',
      body: ['GetIt is not for people under 16.'],
    },
    {
      heading: 'Changes',
      body: ['The date at the top changes whenever this policy does. A change to what is collected or why is announced in the app first.'],
    },
  ]
}
