// The iPhone build's certificate tidying (scripts/ios-certificates.mjs): the
// App Store Connect token is a valid ES256 JWT for Apple's audience, lasting
// under 20 minutes; only development certificates that appeared during the run
// are revoked (never distribution, never older ones); paging is followed; a
// failed revoke warns and the rest still go. A stand-in API, no network.
import crypto from 'node:crypto'
import { API, ascToken, listCertificates, newDevelopmentCertificates, revokeNew } from '../../scripts/ios-certificates.mjs'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}

// ---------- the token ------------------------------------------------------------
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const now = Date.UTC(2026, 9, 5, 12)
const token = ascToken({ keyId: 'ABC123', issuerId: 'issuer-1', privateKey: pem, now })
const [h, b, s] = token.split('.')
const head = JSON.parse(Buffer.from(h, 'base64url'))
const body = JSON.parse(Buffer.from(b, 'base64url'))
eq('header: ES256 with the key id', head, { alg: 'ES256', kid: 'ABC123', typ: 'JWT' })
eq('payload: issuer, Apple audience, 15 minutes', [body.iss, body.aud, body.exp - body.iat, body.iat], ['issuer-1', 'appstoreconnect-v1', 900, now / 1000])
eq('signature verifies with the public key (raw r||s, 64 bytes)',
  [Buffer.from(s, 'base64url').length, crypto.verify('sha256', Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))], [64, true])
let threw = false
try { ascToken({ keyId: '', issuerId: 'x', privateKey: pem }) } catch { threw = true }
eq('no key id: refuses', threw, true)

// ---------- which certificates go ---------------------------------------------------
const cert = (id, type, name = id) => ({ id, type, name, expires: '2027-10-05' })
const after = [cert('old-dev', 'DEVELOPMENT'), cert('dist', 'DISTRIBUTION'), cert('new-dev', 'DEVELOPMENT', 'Created via API'),
  cert('new-ios-dev', 'IOS_DEVELOPMENT'), cert('new-dist', 'DISTRIBUTION')]
eq('only development certificates new since the snapshot', newDevelopmentCertificates(['old-dev', 'dist'], after).map((c) => c.id), ['new-dev', 'new-ios-dev'])
eq('nothing new: nothing', newDevelopmentCertificates(after.map((c) => c.id), after), [])

// ---------- the API, standing in -------------------------------------------------------
function standIn(pages, failDelete = []) {
  const calls = []
  const fetchFn = async (url, init = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url.replace(API, '')}`)
    if (!init.headers?.Authorization?.startsWith('Bearer ')) return { ok: false, status: 401 }
    if ((init.method ?? 'GET') === 'DELETE') {
      const id = url.split('/').pop()
      return failDelete.includes(id) ? { ok: false, status: 409 } : { ok: true, status: 204 }
    }
    const page = url.includes('cursor=2') ? pages[1] : pages[0]
    return { ok: true, status: 200, json: async () => page }
  }
  return { fetchFn, calls }
}
const row = (id, certificateType) => ({ id, attributes: { certificateType, displayName: `${id} name`, expirationDate: '2027-10-05' } })
const pages = [
  { data: [row('a', 'DISTRIBUTION'), row('b', 'DEVELOPMENT')], links: { next: `${API}/certificates?cursor=2` } },
  { data: [row('c', 'DEVELOPMENT'), row('d', 'IOS_DEVELOPMENT')], links: {} },
]
const api = standIn(pages)
const listed = await listCertificates('t', api.fetchFn)
eq('both pages read', listed.map((c) => `${c.id}:${c.type}`), ['a:DISTRIBUTION', 'b:DEVELOPMENT', 'c:DEVELOPMENT', 'd:IOS_DEVELOPMENT'])
eq('names from displayName', listed[0].name, 'a name')

const lines = []
const api2 = standIn(pages, ['d'])
const gone = await revokeNew('t', ['a', 'b'], api2.fetchFn, (l) => lines.push(l))
eq('revokes the two new development certificates, keeps going past a failure', gone, ['c'])
eq('deletes asked for', api2.calls.filter((c) => c.startsWith('DELETE')), ['DELETE /certificates/c', 'DELETE /certificates/d'])
eq('a failed revoke is a warning naming the certificate', lines.some((l) => l.startsWith('::warning::') && l.includes('d name')), true)
eq('nothing printed carries the token', lines.some((l) => l.includes('Bearer')), false)

const quiet = []
await revokeNew('t', ['a', 'b', 'c', 'd'], standIn(pages).fetchFn, (l) => quiet.push(l))
eq('nothing new: says so', quiet, ['No new development certificate to revoke.'])

let refused = false
try { await listCertificates('t', async () => ({ ok: false, status: 401 })) } catch (e) { refused = /401/.test(e.message) }
eq('a refused key stops with the status', refused, true)

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall iOS certificate checks passed')
