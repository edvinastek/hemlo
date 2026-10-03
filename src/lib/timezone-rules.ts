/** The time zone a profile is planned in (GEN-69): the phone's own, unless
 *  the person chose one. Pure.
 *
 *  The app always shows the phone's clock; the profile's zone is what the
 *  server goes by when it writes the Google Calendar feed, so a feed made
 *  while travelling still puts 09:00 at 09:00 where the person is. */

const ZONE = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/

/** An IANA zone name, or null. 'UTC' counts. */
export function cleanZone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const z = v.trim()
  return z.length <= 60 && ZONE.test(z) ? z : null
}

/** The setting kept in the core module's switch row: follow the phone (the
 *  default), or a zone chosen by hand. */
export interface ZoneChoice { follow: boolean; zone: string | null }

export function readZoneChoice(v: unknown): ZoneChoice {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const zone = cleanZone(o.zone)
  return { follow: o.follow === false && zone ? false : true, zone: o.follow === false ? zone : null }
}

/** The zone the profile should have now, and whether its row needs writing. */
export function zoneToStore(choice: ZoneChoice, phone: string | null, stored: string | null): { zone: string; change: boolean } {
  const want = (!choice.follow && choice.zone) || cleanZone(phone) || cleanZone(stored) || 'UTC'
  return { zone: want, change: want !== stored }
}

/** "Europe/Amsterdam" as people say it: "Amsterdam (Europe)". */
export function zoneLabel(z: string): string {
  const parts = z.split('/')
  if (parts.length === 1) return z
  const city = parts[parts.length - 1].replace(/_/g, ' ')
  return `${city} (${parts.slice(0, -1).join(', ').replace(/_/g, ' ')})`
}
