// Checks PROD-05, an unknown product: a nutrition table read as text (Dutch,
// English, German; a table read column by column; "<0,5 g"; sodium to salt;
// vitamins in their units), and adding the product to Open Food Facts: what
// is sent (and that the password goes only in the form), what each answer
// means, the photo after the figures. Every answer is made up: nothing is
// sent anywhere.
import { readLabelText } from '../lib/eu-label-rules.ts'
import {
  productFields, imageFields, readWriteAnswer, readImageAnswer, addToOff, missingForOff, isOffBarcode, OFF_WRITE, OFF_IMAGE, offProductUrl,
} from '../lib/products-write-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// A Dutch label.
const nl = readLabelText(`Voedingswaarde per 100 g
Energie 1520 kJ / 362 kcal
Vetten 12 g
waarvan verzadigde vetzuren 4,1 g
waarvan enkelvoudig onverzadigde vetzuren 5 g
waarvan meervoudig onverzadigde vetzuren 2 g
Koolhydraten 55 g
waarvan suikers 22 g
Voedingsvezel 3,5 g
Eiwitten 8 g
Zout <0,01 g
Vitamine D 2,5 µg (50%)
Calcium 120 mg 15%`)
is('Dutch: every line, the decimal comma read', nl.figures, { kj: '1520', kcal: '362', fat_g: '12', sat_fat_g: '4.1', mufa_g: '5', pufa_g: '2', carbs_g: '55', sugars_g: '22', fiber_g: '3.5', protein_g: '8', salt_g: '0' })
is('"waarvan verzadigde" is saturates, not fat; "onverzadigde" is not saturates', [nl.figures.sat_fat_g, nl.figures.mufa_g, nl.figures.fat_g], ['4.1', '5', '12'])
is('"<0,01 g" is a negligible amount: 0', nl.figures.salt_g, '0')
is('vitamins and minerals in their units, the %NRV left out', nl.micros, { vd: '2.5', ca: '120' })
is('per 100 g', nl.per, 'g')

// An English drink, energy on two lines, sodium only.
const en = readLabelText('Typical values per 100 ml\nEnergy (kJ) 180\nEnergy (kcal) 43\nFat 1.5g\nof which saturates 1.0g\nCarbohydrate 4.8g\nof which sugars 4.8g\nProtein 3.4g\nSodium 40 mg')
is('English, kJ and kcal on lines of their own', [en.figures.kj, en.figures.kcal], ['180', '43'])
is('sodium 40 mg is 0.1 g salt, when no salt is given', en.figures.salt_g, '0.1')
is('per 100 ml', en.per, 'ml')
is('"of which saturates" is not fat', [en.figures.fat_g, en.figures.sat_fat_g], ['1.5', '1'])

// German, read column by column (names and numbers on separate lines).
const de = readLabelText('Nährwerte je 100 g\nBrennwert\n1520 kJ (362 kcal)\nFett\n12 g\ndavon gesättigte Fettsäuren\n4,1 g\nKohlenhydrate\n55 g\ndavon Zucker\n22 g\nEiweiß\n8 g\nSalz\n0,5 g')
is('German, a number on the next line', de.figures, { kj: '1520', kcal: '362', fat_g: '12', sat_fat_g: '4.1', carbs_g: '55', sugars_g: '22', protein_g: '8', salt_g: '0.5' })
// Two columns: per 100 g first, a portion after.
is('two columns: the first number (per 100 g)', readLabelText('Fat 12 g 3.6 g\nProtein 8 g 2.4 g').figures, { fat_g: '12', protein_g: '8' })
is('nothing read from text that is not a label', readLabelText('Best before see lid. Keep cool.').found, 0)
is('vitamin B12 in µg, not read as 12', readLabelText('Vitamine B12 0,4 µg').micros, { b12: '0.4' })
is('iron in mg, folic acid in µg', readLabelText('Iron 2.1 mg\nFolic acid 60 µg').micros, { fe: '2.1', b9: '60' })

// What goes to Open Food Facts.
const product = {
  barcode: '8712345678906', name: 'Speltcrackers', brand: 'Bakkerij Test', per_ml: false,
  kj: 1520, kcal: 362, fat_g: 12, sat_fat_g: 4.1, mufa_g: null, pufa_g: null, carbs_g: 55, sugars_g: 22, polyols_g: null,
  starch_g: null, fiber_g: 3.5, protein_g: 8, salt_g: 0.9, micros: { vd: 2.5 },
}
const app = { uuid: 'a1b2c3', lang: 'nl' }
const fields = productFields(product, app)
const get = (k) => fields.find(([key]) => key === k)?.[1]
is('barcode, name, brand, language, per 100 g', [get('code'), get('product_name'), get('brands'), get('lc'), get('nutrition_data_per')], ['8712345678906', 'Speltcrackers', 'Bakkerij Test', 'nl', '100g'])
is('energy in kJ and kcal with their units', [get('nutriment_energy-kj'), get('nutriment_energy-kj_unit'), get('nutriment_energy-kcal'), get('nutriment_energy-kcal_unit')], ['1520', 'kJ', '362', 'kcal'])
is('the label’s lines under Open Food Facts’ names', [get('nutriment_fat'), get('nutriment_saturated-fat'), get('nutriment_carbohydrates'), get('nutriment_sugars'), get('nutriment_fiber'), get('nutriment_proteins'), get('nutriment_salt')],
  ['12', '4.1', '55', '22', '3.5', '8', '0.9'])
is('an unknown figure is not sent', fields.some(([k]) => k === 'nutriment_starch' || k === 'nutriment_polyols'), false)
is('a vitamin in its unit', [get('nutriment_vitamin-d'), get('nutriment_vitamin-d_unit')], ['2.5', 'µg'])
is('the app named, with a random id for this account', [get('app_name'), get('app_version'), get('app_uuid')], ['Hemlo', '19', 'a1b2c3'])
is('no password among the product’s fields', fields.some(([k]) => k === 'password' || k === 'user_id'), false)
is('the photo is the nutrition table, in the label’s language', imageFields('8712345678906', 'nl', app).fileField, 'imgupload_nutrition_nl')
is('a barcode is 8 to 14 digits', [isOffBarcode('8712345678906'), isOffBarcode('123'), isOffBarcode('abc12345')], [true, false, false])
is('the whole label is asked for first', missingForOff({ ...product, sat_fat_g: null, salt_g: null }), 'Add saturates, salt first: Open Food Facts asks for the whole label.')
is('the product’s page', offProductUrl('8712345678906'), 'https://world.openfoodfacts.org/product/8712345678906')

// Answers.
is('saved', readWriteAnswer(200, { status: 1, status_verbose: 'fields saved' }), { ok: true })
is('a wrong password', readWriteAnswer(403, null).ok, false)
is('a wrong password said in the body', readWriteAnswer(200, { status: 0, status_verbose: 'Incorrect user name or password' }).message, 'That Open Food Facts user name and password did not work.')
is('offline', readWriteAnswer(0, null).message, 'No connection. Try again when you are online.')
is('busy', readWriteAnswer(429, null).message, 'Open Food Facts is busy. Try again in a minute.')
is('a photo taken', [readImageAnswer(200, { status: 'status ok', imgid: 3 }).ok, readImageAnswer(200, { status: 'status not ok', error: 'This picture has already been sent.' }).ok], [true, true])
is('a photo refused, the figures still in', readImageAnswer(200, { status: 'status not ok', error: 'too small' }).ok, false)

// Sending, with a stand-in for the network.
const sent = []
const stand = (answers) => async (url, init) => {
  sent.push({ url, form: Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `<file ${v.size}>`])), credentials: init.credentials })
  const a = answers.shift()
  return { status: a.status, json: async () => a.body }
}
const photo = new Blob([new Uint8Array(1000)], { type: 'image/jpeg' })
let r = await addToOff(product, { user: 'tester', password: 'secret' }, app, photo, stand([{ status: 200, body: { status: 1 } }, { status: 200, body: { status: 'status ok' } }]))
is('figures, then the photo: both taken', [r.ok, r.photo?.ok], [true, true])
is('first to the product write, then the photo upload', sent.map((s) => s.url), [OFF_WRITE, OFF_IMAGE])
is('the user name and password go in each form, no cookies', [sent[0].form.user_id, sent[0].form.password, sent[1].form.user_id, sent[0].credentials], ['tester', 'secret', 'tester', 'omit'])
is('the photo is the nutrition table', [sent[1].form.imagefield, sent[1].form.imgupload_nutrition_nl], ['nutrition_nl', '<file 1000>'])
sent.length = 0
r = await addToOff(product, { user: 'tester', password: 'wrong' }, app, photo, stand([{ status: 200, body: { status: 0, status_verbose: 'Incorrect user name or password' } }]))
is('a refused write sends no photo', [r.ok, sent.length], [false, 1])
sent.length = 0
r = await addToOff(product, { user: 'me@example.com', password: 'x' }, app, null, stand([]))
is('an email address is caught before anything is sent', [r.ok, sent.length], [false, 0])
r = await addToOff({ ...product, protein_g: null }, { user: 'tester', password: 'x' }, app, null, stand([]))
is('an incomplete label is caught before anything is sent', [r.ok, sent.length], [false, 0])
r = await addToOff(product, { user: 'tester', password: 'x' }, app, null, async () => { throw new Error('offline') })
is('no connection, said plainly', r, { ok: false, message: 'No connection. Try again when you are online.' })

console.log(fail ? `\n${fail} failed` : '\nAll unknown product checks passed')
process.exit(fail ? 1 : 0)
