/** Search in settings (5.1 item 11, SET-01): every setting More holds, by
 *  the words a person would look for it under, found by THE search. Pure.
 *
 *  `title` is the heading or row name as it reads on screen: the screen
 *  scrolls to the first heading or row with that text in the section. */
import { search } from './search-rules.ts'

export type SettingsSection = 'Modules' | 'Profile' | 'Looks' | 'Reminders' | 'Data'
export const SETTINGS_SECTIONS: SettingsSection[] = ['Modules', 'Profile', 'Looks', 'Reminders', 'Data']

export interface SettingEntry { title: string; section: SettingsSection; words: string }

export const SETTINGS_INDEX: SettingEntry[] = [
  { title: 'Page bar', section: 'Modules', words: 'navigation bottom bar style one row two rows three rows drawer fan hub tabs' },
  { title: 'Pages', section: 'Modules', words: 'order hide move pages bar' },
  { title: 'Swipe between pages', section: 'Modules', words: 'gesture swipe sideways' },
  { title: 'Modules page', section: 'Modules', words: 'hub grid modules page pin' },
  { title: 'On', section: 'Modules', words: 'modules switched on turn off disable hide' },
  { title: 'Available', section: 'Modules', words: 'modules switch on enable add' },
  { title: 'Built by you', section: 'Modules', words: 'build a module custom tracker fields' },
  { title: 'Profiles', section: 'Profile', words: 'profile switch add rename delete person' },
  { title: 'Time zone', section: 'Profile', words: 'timezone zone clock travel' },
  { title: 'Where you are', section: 'Profile', words: 'country city town location shops holidays' },
  { title: 'Work and commute', section: 'Profile', words: 'work hours school job commute travel locked' },
  { title: 'Starting layout', section: 'Profile', words: 'template start again reset layout' },
  { title: 'Public holidays', section: 'Profile', words: 'holidays bank holiday country calendar' },
  { title: 'Calendar links', section: 'Profile', words: 'google calendar feed ical ics subscribe follow' },
  { title: 'Body and goal', section: 'Profile', words: 'height date of birth activity goal weight cut bulk recomp' },
  { title: 'What to count', section: 'Profile', words: 'food nutrients calories protein carbs fat fibre' },
  { title: 'Colours', section: 'Looks', words: 'colour color module colours theme' },
  { title: 'Make GetIt yours', section: 'Looks', words: 'theme dark light mode icon text size looks' },
  { title: 'Who reminds you', section: 'Reminders', words: 'name persona reminder notifications' },
  { title: 'Reminders on this device', section: 'Reminders', words: 'notifications remind alarm' },
  { title: 'Quiet hours', section: 'Reminders', words: 'night silent do not disturb' },
  { title: 'Evening review', section: 'Reminders', words: 'review time moved times flagged extension limit' },
  { title: 'Tips', section: 'Reminders', words: 'tips help tutorial show again what moved where' },
  { title: 'Sync', section: 'Data', words: 'sync waiting queue offline send' },
  { title: 'Merges the app had to resolve', section: 'Data', words: 'conflicts merges refused' },
  { title: 'Your data', section: 'Data', words: 'export import backup restore file excel json' },
  { title: 'Import and export', section: 'Data', words: 'csv excel json ics calendar file' },
  { title: 'Privacy', section: 'Data', words: 'privacy policy gdpr' },
  { title: 'Account', section: 'Data', words: 'accounts switch account sign out delete account password' },
]

/** The settings a query finds, best first. */
export function findSettings(query: string, index: SettingEntry[] = SETTINGS_INDEX): SettingEntry[] {
  if (!query.trim()) return []
  return search(index.map((e) => ({ ...e, name: e.title, extra: `${e.section} ${e.words}` })), query)
    .map(({ title, section, words }) => ({ title, section, words }))
}
