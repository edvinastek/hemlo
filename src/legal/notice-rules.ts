/** When the app says the privacy policy changed (G2 #16): the policy
 *  promises that a change is announced in the app first. The person agreed
 *  to one version when they made their account (kept with the account as
 *  privacy_version); once they have read a newer one (policy_read, kept with
 *  the account too, and on the device for when it is offline) the line goes
 *  away. It never blocks anything. Checked in src/test/policynotice.check.mjs. */

const VERSION = /^\d{4}-\d{2}-\d{2}$/

/** The newest of the versions given, ignoring anything that is not one. */
function newest(...versions: unknown[]): string | null {
  const ok = versions.filter((v): v is string => typeof v === 'string' && VERSION.test(v)).sort()
  return ok.at(-1) ?? null
}

/** Is there a change the person has not seen? Versions are the policy's
 *  dates, 'yyyy-MM-dd', so later is larger. An account from before versions
 *  were kept has seen none, so it is told. */
export function noticeDue(current: string, agreed: unknown, ...read: unknown[]): boolean {
  if (!VERSION.test(current)) return false
  const seen = newest(agreed, ...read)
  return !seen || seen < current
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-10-04" → "4 October 2026". */
export function policyDate(version: string): string {
  const m = VERSION.exec(version) ? version.split('-').map(Number) : null
  if (!m || m[1] < 1 || m[1] > 12) return version
  return `${m[2]} ${MONTHS[m[1] - 1]} ${m[0]}`
}

/** The notice's one line. */
export const noticeText = (version: string) => `The privacy policy changed on ${policyDate(version)}.`
