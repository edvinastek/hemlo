// The iPhone build's signing certificates, tidied after each GitHub run
// (docs/ios-release.md). Archiving with automatic signing makes a new "Apple
// Development" certificate on GitHub's Mac every run (the Mac is new each
// time and keeps nothing), and Apple allows only a few per team. So the
// workflow notes which certificates exist before archiving and, at the end,
// revokes only the development certificates that appeared during the run.
// Distribution is signed in the cloud by Apple and is never touched here.
//
//   node scripts/ios-certificates.mjs snapshot <file>     before archiving
//   node scripts/ios-certificates.mjs revoke-new <file>   at the end, always
//   node scripts/ios-certificates.mjs list                what exists now
//
// Reads ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH (the .p8 file) from the
// environment. Prints names and dates only, never the key or the token.
import crypto from 'node:crypto'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

export const API = 'https://api.appstoreconnect.apple.com/v1'
export const DEVELOPMENT_TYPES = ['DEVELOPMENT', 'IOS_DEVELOPMENT']

const b64url = (data) => Buffer.from(data).toString('base64url')

/** A token for the App Store Connect API: ES256, at most 20 minutes. */
export function ascToken({ keyId, issuerId, privateKey, now = Date.now() }) {
  if (!keyId || !issuerId || !privateKey) throw new Error('ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH are needed')
  const iat = Math.floor(now / 1000)
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  const body = b64url(JSON.stringify({ iss: issuerId, iat, exp: iat + 15 * 60, aud: 'appstoreconnect-v1' }))
  const signature = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${head}.${body}.${b64url(signature)}`
}

/** Every certificate of the team, as { id, type, name, expires }. */
export async function listCertificates(token, fetchFn = fetch) {
  const out = []
  let url = `${API}/certificates?limit=200&fields[certificates]=certificateType,displayName,name,expirationDate`
  while (url) {
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`App Store Connect answered ${res.status} listing certificates`)
    const json = await res.json()
    for (const c of json.data ?? []) {
      const a = c.attributes ?? {}
      out.push({ id: c.id, type: a.certificateType ?? '', name: a.displayName || a.name || '', expires: a.expirationDate ?? '' })
    }
    url = json.links?.next ?? null
  }
  return out
}

/** The development certificates in `now` that were not there `before`. */
export function newDevelopmentCertificates(beforeIds, now) {
  const before = new Set(beforeIds)
  return now.filter((c) => !before.has(c.id) && DEVELOPMENT_TYPES.includes(c.type))
}

/** Revoke them; says what it did. A failure to revoke one is reported and the
 *  rest still go: it is tidying, not the build. */
export async function revokeNew(token, beforeIds, fetchFn = fetch, log = console.log) {
  const gone = []
  for (const c of newDevelopmentCertificates(beforeIds, await listCertificates(token, fetchFn))) {
    const res = await fetchFn(`${API}/certificates/${encodeURIComponent(c.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok || res.status === 404) { gone.push(c.id); log(`Revoked ${c.type} certificate "${c.name}" made by this run.`) }
    else log(`::warning::Could not revoke the development certificate "${c.name}" (${res.status}). Revoke it in Certificates, Identifiers & Profiles.`)
  }
  if (gone.length === 0) log('No new development certificate to revoke.')
  return gone
}

async function main([command, file]) {
  const token = ascToken({
    keyId: process.env.ASC_KEY_ID,
    issuerId: process.env.ASC_ISSUER_ID,
    privateKey: process.env.ASC_KEY_PATH ? fs.readFileSync(process.env.ASC_KEY_PATH, 'utf8') : '',
  })
  if (command === 'list') {
    for (const c of await listCertificates(token)) console.log(`${c.type}\t${c.name}\t${c.expires}`)
  } else if (command === 'snapshot' && file) {
    const ids = (await listCertificates(token)).map((c) => c.id)
    fs.writeFileSync(file, JSON.stringify(ids))
    console.log(`${ids.length} certificates before archiving.`)
  } else if (command === 'revoke-new' && file) {
    if (!fs.existsSync(file)) { console.log('No snapshot: nothing was archived, nothing to revoke.'); return }
    await revokeNew(token, JSON.parse(fs.readFileSync(file, 'utf8')))
  } else {
    console.error('Usage: node scripts/ios-certificates.mjs snapshot <file> | revoke-new <file> | list')
    process.exit(2)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
}
