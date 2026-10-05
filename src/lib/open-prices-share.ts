import { CapacitorHttp } from '@capacitor/core'
import { features, isNative } from './native'
import { forgetOffToken, offToken } from './open-prices-account'
import {
  OPEN_PRICES_API, PHOTO_MAX_PX, PHOTO_QUALITY, SHARE_AGENT, appQuery, fitPhoto, nominatimUrl, placesUrl,
  proofFields, readId, readNominatim, readPlaces, readProblem, type PricePayload, type Problem, type ProofType, type ShopPlace,
} from './open-prices-rules'

/** The requests that share a price with Open Prices (PRICE-05), each one
 *  started by the person's own tap: finding the shop, sending the photo,
 *  sending the price. The rules are in open-prices-rules.ts. Never called
 *  from a check: the checks and the screenshot harness answer for Open
 *  Prices and OpenStreetMap themselves. */

const platform = () => features().openPrices
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

export type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem }

async function send(url: string, init: RequestInit): Promise<{ status: number; json: unknown }> {
  if (!online()) return { status: 0, json: null }
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 30_000)
  try {
    const res = await fetch(url, { ...init, credentials: 'omit', signal: stop.signal })
    const json = await res.json().catch(() => null)
    return { status: res.status, json }
  } catch {
    return { status: 0, json: null }
  } finally {
    clearTimeout(timer)
  }
}

// ---- finding the shop ---------------------------------------------------------------------

/** Open Prices' own places with this name in this town. */
export async function searchPlaces(name: string, town: string): Promise<Result<ShopPlace[]>> {
  const r = await send(placesUrl(name, town), { headers: { Accept: 'application/json', 'X-User-Agent': SHARE_AGENT } })
  if (r.status !== 200) return { ok: false, problem: readProblem(r.status, r.json) }
  return { ok: true, value: readPlaces(r.json) }
}

// OpenStreetMap's search allows at most one request a second, and asks
// apps to keep what it answered rather than ask again.
let lastOsm = 0
const osmCache = new Map<string, ShopPlace[]>()

/** OpenStreetMap's shops with this name in this town: one request, and the
 *  same search again is answered from what came back the first time. */
export async function searchOsm(name: string, town: string, country: string | null): Promise<Result<ShopPlace[]>> {
  const url = nominatimUrl(name, town, country)
  const kept = osmCache.get(url)
  if (kept) return { ok: true, value: kept }
  if (!online()) return { ok: false, problem: readProblem(0, null) }
  const wait = lastOsm + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastOsm = Date.now()
  try {
    let status: number
    let json: unknown
    if (isNative()) {
      // From the phone the request names the app, as the policy asks.
      const res = await CapacitorHttp.get({
        url, headers: { 'User-Agent': SHARE_AGENT, Accept: 'application/json' }, connectTimeout: 15000, readTimeout: 15000, responseType: 'json',
      })
      status = res.status
      json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    } else {
      // A browser cannot set User-Agent; it sends the page as the Referer,
      // which the policy accepts for web apps.
      const r = await send(url, { headers: { Accept: 'application/json' }, referrerPolicy: 'origin' })
      status = r.status
      json = r.json
    }
    if (status !== 200) return { ok: false, problem: readProblem(status, json) }
    const places = readNominatim(json)
    osmCache.set(url, places)
    return { ok: true, value: places }
  } catch {
    return { ok: false, problem: readProblem(0, null) }
  }
}


// ---- the photo ----------------------------------------------------------------------------

/** The photo made smaller on the device and drawn again as a JPEG: easy to
 *  send, and without what the camera wrote into the file (where it was
 *  taken, the phone's make). */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement
  let w: number
  let h: number
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    source = bmp; w = bmp.width; h = bmp.height
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('not an image')); img.src = url })
      source = img; w = img.naturalWidth; h = img.naturalHeight
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
  const size = fitPhoto(w, h, PHOTO_MAX_PX)
  if (!size.w) throw new Error('not an image')
  const canvas = document.createElement('canvas')
  canvas.width = size.w
  canvas.height = size.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.drawImage(source, 0, 0, size.w, size.h)
  if ('close' in source) source.close()
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', PHOTO_QUALITY))
  if (!blob) throw new Error('no photo')
  return blob
}

// ---- sending ------------------------------------------------------------------------------

async function authed(path: string, body: BodyInit, json: boolean): Promise<Result<number>> {
  const token = await offToken()
  if (!token) return { ok: false, problem: readProblem(401, null) }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-User-Agent': SHARE_AGENT }
  if (json) headers['Content-Type'] = 'application/json'
  const r = await send(`${OPEN_PRICES_API}${path}?${appQuery(platform())}`, { method: 'POST', headers, body })
  if (r.status === 401 || r.status === 403) await forgetOffToken()
  if (r.status !== 200 && r.status !== 201) return { ok: false, problem: readProblem(r.status, r.json) }
  const id = readId(r.json)
  return id ? { ok: true, value: id } : { ok: false, problem: readProblem(500, null) }
}

/** Sends the photo of the price tag or receipt; its id comes back. */
export async function uploadProof(photo: Blob, opts: { type: ProofType; place: ShopPlace; date: string; currency: string }): Promise<Result<number>> {
  const form = new FormData()
  form.append('file', photo, 'proof.jpg')
  for (const [k, v] of Object.entries(proofFields(opts))) form.append(k, v)
  return authed('/proofs/upload', form, false)
}

/** Sends the price; its id on Open Prices comes back. */
export async function postPrice(payload: PricePayload): Promise<Result<number>> {
  return authed('/prices', JSON.stringify(payload), true)
}
