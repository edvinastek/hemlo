/** Adding an unknown product to Open Food Facts (PROD-05), as rules with no
 *  database and no React (checked in src/test/offwrite.check.mjs with
 *  made-up answers; nothing is ever sent from a check).
 *
 *  Open Food Facts' write API (openfoodfacts.github.io/openfoodfacts-server/
 *  api/, "Add or edit a product" and "Upload a photo"): a form POST to
 *  /cgi/product_jqm2.pl with the barcode, the person's own Open Food Facts
 *  user name and password (sent with the request, never kept), the product
 *  fields and the app's name, version and a random id for this account, as
 *  Open Food Facts asks of apps; then the photo of the nutrition table to
 *  /cgi/product_image_upload.pl. The Open Prices sign-in token of v18 is
 *  Open Prices' own and does not work here, so the password is asked for
 *  each time the person adds a product, and goes nowhere else.
 *
 *  Opt-in and per product, on the person's tap only. */

import { OFF } from './products-rules.ts'
import { APP_NAME } from './open-prices-rules.ts'
import { MICROS, readMicros, type MicroCode } from './micros-rules.ts'

export const OFF_WRITE = `${OFF}/cgi/product_jqm2.pl`
export const OFF_IMAGE = `${OFF}/cgi/product_image_upload.pl`
export const APP_VERSION_WRITE = '19'

/** What is sent about the product: what the person typed, per 100 g or
 *  100 ml, and nothing else. */
export interface OffProduct {
  barcode: string
  name: string
  brand: string | null
  per_ml: boolean
  kj: number | null
  kcal: number | null
  fat_g: number | null
  sat_fat_g: number | null
  mufa_g: number | null
  pufa_g: number | null
  carbs_g: number | null
  sugars_g: number | null
  polyols_g: number | null
  starch_g: number | null
  fiber_g: number | null
  protein_g: number | null
  salt_g: number | null
  micros?: unknown
}

/** Open Food Facts' names for the label's lines (its nutrient ids). Alcohol
 *  is left out: Open Food Facts counts it in % vol, the label in grams. */
const NUTRIENT_IDS: [keyof OffProduct, string, string][] = [
  ['kj', 'energy-kj', 'kJ'], ['kcal', 'energy-kcal', 'kcal'], ['fat_g', 'fat', 'g'], ['sat_fat_g', 'saturated-fat', 'g'],
  ['mufa_g', 'monounsaturated-fat', 'g'], ['pufa_g', 'polyunsaturated-fat', 'g'], ['carbs_g', 'carbohydrates', 'g'],
  ['sugars_g', 'sugars', 'g'], ['polyols_g', 'polyols', 'g'], ['starch_g', 'starch', 'g'], ['fiber_g', 'fiber', 'g'],
  ['protein_g', 'proteins', 'g'], ['salt_g', 'salt', 'g'],
]
/** Open Food Facts' ids for the vitamins and minerals. */
const MICRO_IDS: Record<MicroCode, string> = {
  va: 'vitamin-a', vd: 'vitamin-d', ve: 'vitamin-e', vk: 'vitamin-k', vc: 'vitamin-c', b1: 'vitamin-b1', b2: 'vitamin-b2',
  b3: 'vitamin-pp', b6: 'vitamin-b6', b9: 'vitamin-b9', b12: 'vitamin-b12', b7: 'biotin', b5: 'pantothenic-acid',
  k: 'potassium', cl: 'chloride', ca: 'calcium', p: 'phosphorus', mg: 'magnesium', fe: 'iron', zn: 'zinc', cu: 'copper',
  mn: 'manganese', f: 'fluoride', se: 'selenium', cr: 'chromium', mo: 'molybdenum', i: 'iodine',
}

export interface OffCredentials { user: string; password: string }
export interface OffApp { uuid: string; lang: string }

/** A barcode Open Food Facts takes: 8 to 14 digits. */
export const isOffBarcode = (code: string | null | undefined) => typeof code === 'string' && /^\d{8,14}$/.test(code)

/** Whether there is enough to add: a barcode, a name, energy and the rest
 *  of the mandatory declaration (Open Food Facts can then work out its
 *  scores). Null when it is, else what is missing in words. */
export function missingForOff(p: OffProduct): string | null {
  if (!isOffBarcode(p.barcode)) return 'It needs its barcode.'
  if (!p.name.trim()) return 'It needs a name.'
  const lacking = [
    p.kcal == null && p.kj == null ? 'energy' : null, p.fat_g == null ? 'fat' : null, p.sat_fat_g == null ? 'saturates' : null,
    p.carbs_g == null ? 'carbohydrate' : null, p.sugars_g == null ? 'sugars' : null, p.protein_g == null ? 'protein' : null,
    p.salt_g == null ? 'salt' : null,
  ].filter(Boolean)
  return lacking.length ? `Add ${lacking.join(', ')} first: Open Food Facts asks for the whole label.` : null
}

/** The fields of the product's form, in order. The password is added by
 *  the sender, never kept with them. */
export function productFields(p: OffProduct, app: OffApp): [string, string][] {
  const out: [string, string][] = [
    ['code', p.barcode], ['product_name', p.name.trim()], ['lc', app.lang],
    ['nutrition_data_per', '100g'],
  ]
  // A drink's figures (per 100 ml) go in the same fields: Open Food Facts
  // keeps "100g" for both and reads ml from the product's quantity.
  if (p.brand?.trim()) out.push(['brands', p.brand.trim()])
  for (const [key, id, unit] of NUTRIENT_IDS) {
    const v = p[key]
    if (typeof v === 'number' && Number.isFinite(v)) out.push([`nutriment_${id}`, String(v)], [`nutriment_${id}_unit`, unit])
  }
  const micros = readMicros(p.micros)
  for (const m of MICROS) {
    const v = micros[m.code]
    if (v !== undefined) out.push([`nutriment_${MICRO_IDS[m.code]}`, String(v)], [`nutriment_${MICRO_IDS[m.code]}_unit`, m.unit])
  }
  out.push(['app_name', APP_NAME], ['app_version', APP_VERSION_WRITE], ['app_uuid', app.uuid],
    ['comment', 'Added from the label with Hemlo'])
  return out
}

/** The photo's form: the barcode and which picture it is (the nutrition
 *  table, in the label's language). The file goes under imgupload_<field>. */
export function imageFields(barcode: string, lang: string, app: OffApp): { fields: [string, string][]; fileField: string } {
  const field = `nutrition_${lang}`
  return {
    fields: [['code', barcode], ['imagefield', field], ['app_name', APP_NAME], ['app_version', APP_VERSION_WRITE], ['app_uuid', app.uuid]],
    fileField: `imgupload_${field}`,
  }
}

export type OffAnswer = { ok: true } | { ok: false; message: string }

/** What an answer to a write means, in words. Open Food Facts answers 200
 *  with status 1 when it saved the fields, and status 0 with a reason when
 *  it did not; a wrong password is a 403 (or a status 0 saying so). */
export function readWriteAnswer(status: number, body: unknown): OffAnswer {
  if (status === 0) return { ok: false, message: 'No connection. Try again when you are online.' }
  if (status === 401 || status === 403) return { ok: false, message: 'That Open Food Facts user name and password did not work.' }
  if (status === 429) return { ok: false, message: 'Open Food Facts is busy. Try again in a minute.' }
  if (status !== 200) return { ok: false, message: 'Open Food Facts did not take it. Try again later.' }
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (Number(b.status) === 1) return { ok: true }
  const why = String(b.status_verbose ?? b.error ?? '')
  if (/password|login|user/i.test(why)) return { ok: false, message: 'That Open Food Facts user name and password did not work.' }
  return { ok: false, message: why ? `Open Food Facts did not take it: ${why}.` : 'Open Food Facts did not take it. Try again later.' }
}

/** What an answer to the photo means. "status": "status ok" or a status 1
 *  is taken; a photo already there ("image already exists") is fine too. */
export function readImageAnswer(status: number, body: unknown): OffAnswer {
  if (status !== 200) return readWriteAnswer(status, body)
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const s = String(b.status ?? '')
  if (s === 'status ok' || Number(b.status) === 1 || /already/i.test(String(b.error ?? b.status_verbose ?? ''))) return { ok: true }
  return { ok: false, message: 'The figures were added, but the photo was not. You can add it on openfoodfacts.org.' }
}

type Fetch = (url: string, init: { method: string; body: FormData; credentials: 'omit'; headers: Record<string, string> }) =>
  Promise<{ status: number; json: () => Promise<unknown> }>

/** Send the product, then its photo when there is one. `send` is fetch in
 *  the app and a stand-in in the checks. The password goes in the form of
 *  each request and nowhere else. */
export async function addToOff(p: OffProduct, who: OffCredentials, app: OffApp, photo: Blob | null, send: Fetch): Promise<OffAnswer & { photo?: OffAnswer }> {
  const missing = missingForOff(p)
  if (missing) return { ok: false, message: missing }
  if (!who.user.trim() || !who.password) return { ok: false, message: 'Give your Open Food Facts user name and password.' }
  if (who.user.includes('@')) return { ok: false, message: 'Use your Open Food Facts user name, not your email address.' }
  const auth: [string, string][] = [['user_id', who.user.trim()], ['password', who.password]]
  const form = (pairs: [string, string][]) => { const f = new FormData(); for (const [k, v] of pairs) f.append(k, v); return f }
  const headers = { 'X-User-Agent': `${APP_NAME}/${APP_VERSION_WRITE} (contact via app)`, Accept: 'application/json' }
  let answer: OffAnswer
  try {
    const res = await send(OFF_WRITE, { method: 'POST', body: form([...productFields(p, app), ...auth]), credentials: 'omit', headers })
    answer = readWriteAnswer(res.status, await res.json().catch(() => null))
  } catch {
    return readWriteAnswer(0, null) as OffAnswer
  }
  if (!answer.ok || !photo) return answer
  const img = imageFields(p.barcode, app.lang, app)
  const body = form([...img.fields, ...auth])
  body.append(img.fileField, photo, 'nutrition.jpg')
  try {
    const res = await send(OFF_IMAGE, { method: 'POST', body, credentials: 'omit', headers })
    return { ok: true, photo: readImageAnswer(res.status, await res.json().catch(() => null)) }
  } catch {
    return { ok: true, photo: { ok: false, message: 'The figures were added, but the photo was not. You can add it on openfoodfacts.org.' } }
  }
}

/** The product's page on Open Food Facts. */
export const offProductUrl = (barcode: string) => `${OFF}/product/${barcode}`
