/** Settings as a short list of pages (v17, CALM-12, SET-01), and the search
 *  over every setting in them (5.1 item 11), by the words a person would
 *  look for it under, found by THE search. Pure.
 *
 *  `title` is the heading or row name as it reads on screen: the page opens
 *  and scrolls to the first heading or row with that text. */
import { search } from './search-rules.ts'

export type SettingsPage =
  | 'profile' | 'looks' | 'bar' | 'modules' | 'planning' | 'food' | 'shopping'
  | 'calendars' | 'reminders' | 'data' | 'about'

export interface SettingsPageInfo {
  key: SettingsPage
  title: string
  /** A few words under the title on the Settings list: what is inside. */
  line: string
}

/** The Settings list, in its order: what is changed most first, About last. */
export const SETTINGS_PAGES: SettingsPageInfo[] = [
  { key: 'profile', title: 'Profile', line: 'Profiles, time zone, where you are' },
  { key: 'looks', title: 'Looks', line: 'Theme, dark mode, text size, colours' },
  { key: 'bar', title: 'Page bar', line: 'Style, order, swiping' },
  { key: 'modules', title: 'Modules', line: 'Switch on or off, build your own' },
  { key: 'planning', title: 'Planning', line: 'Work hours, hold times, cards, review' },
  { key: 'food', title: 'Food and body', line: 'What to count, meals, body and goal' },
  { key: 'shopping', title: 'Shopping and household', line: 'Shopping trip, sharing' },
  { key: 'calendars', title: 'Calendars', line: 'Google Calendar, public holidays' },
  { key: 'reminders', title: 'Reminders and tips', line: 'Reminders, quiet hours, tips' },
  { key: 'data', title: 'Data and account', line: 'Sync, export, import, accounts' },
  { key: 'about', title: 'About', line: 'Version, data sources, privacy' },
]

export const pageInfo = (key: string | null | undefined): SettingsPageInfo | undefined =>
  SETTINGS_PAGES.find((p) => p.key === key)

/** The tabs of version 16 (and the addresses other screens still use:
 *  ?section=Data) and the page each became. */
const OLD_SECTIONS: Record<string, SettingsPage> = {
  Modules: 'modules', Profile: 'profile', Looks: 'looks', Reminders: 'reminders', Data: 'data',
}

export interface SettingEntry { title: string; page: SettingsPage; words: string }

export const SETTINGS_INDEX: SettingEntry[] = [
  { title: 'Profiles', page: 'profile', words: 'profile switch add rename delete person another' },
  { title: 'Time zone', page: 'profile', words: 'timezone zone clock travel' },
  { title: 'Where you are', page: 'profile', words: 'country city town location shops' },
  { title: 'Looks', page: 'looks', words: 'theme dark light black mode icon text size make getit yours' },
  { title: 'Colours', page: 'looks', words: 'colour color module colours' },
  { title: 'Style', page: 'bar', words: 'navigation bottom bar style one row two rows three rows drawer fan hub tabs' },
  { title: 'Pages', page: 'bar', words: 'order hide move pages bar pin' },
  { title: 'Swipe between pages', page: 'bar', words: 'gesture swipe sideways' },
  { title: 'Modules page', page: 'modules', words: 'hub grid modules page pin' },
  { title: 'On', page: 'modules', words: 'modules switched on turn off disable hide' },
  { title: 'Available', page: 'modules', words: 'modules switch on enable add' },
  { title: 'Built by you', page: 'modules', words: 'build a module custom tracker fields' },
  { title: 'Starting layout', page: 'modules', words: 'template start again reset layout' },
  { title: 'Work and commute', page: 'planning', words: 'work hours school job commute travel locked' },
  { title: 'Hold times', page: 'planning', words: 'hold long press drag open in place' },
  { title: 'Cards on Today', page: 'planning', words: 'cards pinned today summary figure' },
  { title: 'Note templates', page: 'planning', words: 'note templates checklist packing list fill-ins' },
  { title: 'Evening review', page: 'planning', words: 'review time moved times flagged extension limit' },
  { title: 'Food', page: 'food', words: 'food nutrients calories protein carbs fat fibre what to count meals main meal' },
  { title: 'Body and goal', page: 'food', words: 'height date of birth sex activity goal weight cut bulk recomp targets' },
  { title: 'Shopping', page: 'shopping', words: 'shopping trip days list window shops aisles' },
  { title: 'Share prices with Open Prices', page: 'shopping', words: 'open prices open food facts share price public account sign in photo receipt' },
  { title: 'Household', page: 'shopping', words: 'household share invite join leave members family partner flatmate code chores cupboard list name' },
  { title: 'Calendar links', page: 'calendars', words: 'google calendar feed ical ics subscribe follow' },
  { title: 'Public holidays', page: 'calendars', words: 'holidays bank holiday country calendar' },
  { title: 'Who reminds you', page: 'reminders', words: 'name persona reminder notifications' },
  { title: 'Reminders on this device', page: 'reminders', words: 'notifications remind alarm' },
  { title: 'Quiet hours', page: 'reminders', words: 'night silent do not disturb' },
  { title: 'Telegram', page: 'reminders', words: 'telegram messages chat bot reminders' },
  { title: 'Tips', page: 'reminders', words: 'tips help tutorial show again what moved where' },
  { title: 'Sync', page: 'data', words: 'sync waiting queue offline send' },
  { title: 'Merges the app had to resolve', page: 'data', words: 'conflicts merges refused' },
  { title: 'Your data', page: 'data', words: 'export import backup restore file excel json' },
  { title: 'Import and export', page: 'data', words: 'csv excel json ics calendar file' },
  { title: 'Account', page: 'data', words: 'accounts switch account sign out password' },
  { title: 'Delete account', page: 'data', words: 'delete remove account erase everything' },
  { title: 'Version', page: 'about', words: 'about version update' },
  { title: 'Data sources', page: 'about', words: 'credits nevo rivm open food facts open prices licence odbl holidays' },
  { title: 'Privacy', page: 'about', words: 'privacy policy gdpr delete' },
]

/** The settings a query finds, best first. Page titles are found too. */
export function findSettings(query: string, index: SettingEntry[] = SETTINGS_INDEX): SettingEntry[] {
  if (!query.trim()) return []
  const pageOf = (k: SettingsPage) => pageInfo(k)?.title ?? ''
  return search(index.map((e) => ({ ...e, name: e.title, extra: `${pageOf(e.page)} ${e.words}` })), query)
    .map(({ title, page, words }) => ({ title, page, words }))
}

/** Which page an address opens, or null for the Settings list: ?page=looks,
 *  the old ?section=Looks, ?find=<title> (the setting's own page), or the
 *  old #calendar-links. */
export function pageForAddress(params: { page?: string | null; section?: string | null; find?: string | null; hash?: string | null }): SettingsPage | null {
  const found = params.find ? SETTINGS_INDEX.find((e) => e.title === params.find) : undefined
  if (found) return found.page
  if (params.hash === '#calendar-links') return 'calendars'
  if (pageInfo(params.page)) return params.page as SettingsPage
  return (params.section && OLD_SECTIONS[params.section]) || null
}
