#!/usr/bin/env node
// Builds Visuma's shared food catalogue from NEVO-online 2025/9.0 (RIVM).
//
//   node scripts/import-nevo.mjs <NEVO2025_v9.0.csv>           report only
//   node scripts/import-nevo.mjs <NEVO2025_v9.0.csv> --write   rewrite migration 027's data and 036's
//                                                              vitamins and minerals
//
// NEVO's file is UTF-8, '|'-separated, values in double quotes, lines ending
// CRLF, with decimal commas. One row per food, nutrients in columns named by
// their NEVO code ("ENERCJ (kJ)", "PROT (g)", "NA (mg)"), per 100 g or per
// 100 ml ("Hoeveelheid/Quantity").
//
// NEVO's conditions of use: its data may be used unchanged only, with the
// source and version stated; additions are allowed when they are marked as
// additions; amendments are not; and the data may not be charged for. So every
// NEVO value goes into the catalogue exactly as published: the decimal comma
// is read as a point and nothing is rounded, recalculated or "fixed". An empty
// cell stays empty (unknown), never 0. Sodium is kept as published (mg);
// salt is worked out from it where it is shown (sodium × 2.5), never stored
// as if NEVO had published it. NEVO's CHO is available carbohydrate without
// fibre, which is the EU label's definition, so carb_basis is 'eu'. What
// Visuma adds (display names, units, cook yields) is in nevo-additions.mjs and
// is marked as such in the rows (`units[].source`, `source_version`).
//
// The raw NEVO files are not kept in the repository; the generated migration
// is.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  NEVO_VERSION, USDA_VERSION, UNITS, OIL_UNITS, YIELDS, REPLACES, KEEP, RECIPE_LINES, displayName, stateOf,
} from './nevo-additions.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const MIGRATION = join(HERE, '..', 'supabase', 'migrations', '027_food_catalogue.sql')
/** Version 19 (FOOD-17): the vitamins and minerals go in a migration of
 *  their own, so 027 (applied long ago) is left exactly as it is. */
export const MICROS_MIGRATION = join(HERE, '..', 'supabase', 'migrations', '036_v19_food_extras.sql')
export const MICROS_BEGIN = '-- BEGIN GENERATED NEVO MICRONUTRIENTS'
export const MICROS_END = '-- END GENERATED NEVO MICRONUTRIENTS'
const SEED = join(HERE, '..', 'seed', 'catalogue.json')
export const BEGIN = '-- BEGIN GENERATED NEVO DATA'
export const END = '-- END GENERATED NEVO DATA'

/** The nutrient columns read, by NEVO code, and the catalogue column each
 *  goes to. FAMSCIS is NEVO's cis mono-unsaturated fat, the EU label's
 *  "mono-unsaturates". NA (sodium) is kept in mg as published. OA (organic
 *  acids) is not a label figure and has no column: it travels in the data
 *  only so the food data check can count it, as Annex XIV does. */
export const COLUMNS = {
  ENERCJ: 'kj', ENERCC: 'kcal', PROT: 'protein_g', FAT: 'fat_g', FASAT: 'sat_fat_g', FAMSCIS: 'mufa_g',
  FAPU: 'pufa_g', CHO: 'carbs_g', SUGAR: 'sugars_g', STARCH: 'starch_g', POLYL: 'polyols_g', FIBT: 'fiber_g',
  ALC: 'alcohol_g', NA: 'sodium_mg', OA: 'organic_acid_g',
}

/** The vitamins and minerals read (FOOD-17): the ones of Regulation (EU)
 *  No 1169/2011, Annex XIII part A, that NEVO publishes, by NEVO code, with
 *  the short code the app keeps them under (src/lib/micros-rules.ts, which
 *  the check holds this list against) and the unit NEVO's header must give,
 *  which is also the annex's unit, so every value goes in unchanged. NEVO
 *  has no biotin, pantothenic acid, chloride, manganese, fluoride, chromium
 *  or molybdenum. Vitamin A is read as retinol equivalents (VITA_RE), niacin
 *  as published niacin (NIA), folate as dietary folate equivalents (FOL). */
export const MICRO_COLUMNS = {
  VITA_RE: ['va', 'µg'], VITD: ['vd', 'µg'], VITE: ['ve', 'mg'], VITK: ['vk', 'µg'], VITC: ['vc', 'mg'],
  THIA: ['b1', 'mg'], RIBF: ['b2', 'mg'], NIA: ['b3', 'mg'], VITB6: ['b6', 'mg'], FOL: ['b9', 'µg'], VITB12: ['b12', 'µg'],
  K: ['k', 'mg'], CA: ['ca', 'mg'], P: ['p', 'mg'], MG: ['mg', 'mg'], FE: ['fe', 'mg'], ZN: ['zn', 'mg'], CU: ['cu', 'mg'],
  SE: ['se', 'µg'], ID: ['i', 'µg'],
}

/** A deterministic id for a NEVO food (UUID version 5 of "nevo:<code>"), so
 *  running the import again finds the same rows and a device that already
 *  has a food keeps it. */
const NAMESPACE = '3f6c1a52-9d0e-4b7a-8c21-6e5a0b2d2025'
export function nevoId(code) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
  const b = createHash('sha1').update(Buffer.concat([ns, Buffer.from(`nevo:${code}`, 'utf8')])).digest().subarray(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ---- reading the file ------------------------------------------------------------------

/** Rows of a '|'-separated file with optional double quotes (a quote inside
 *  a quoted value is written twice). */
export function parseDelimited(text, sep = '|') {
  const t = text.replace(/^﻿/, '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** A NEVO number as published: "1,8" is 1.8, an empty cell is unknown.
 *  The number is the published one; only the decimal comma becomes a point. */
export function nevoNumber(cell) {
  const s = String(cell ?? '').trim()
  if (s === '') return null
  if (!/^-?\d+(,\d+)?$/.test(s)) throw new Error(`Not a NEVO number: "${s}"`)
  return Number(s.replace(',', '.'))
}

/** The foods in a NEVO file: code, names as published, food group, per 100 g
 *  or 100 ml, the remark, and the nutrients the catalogue keeps. */
export function readNevo(text) {
  const [head, ...body] = parseDelimited(text)
  const col = (prefix) => {
    const i = head.findIndex((h) => h === prefix || h.startsWith(`${prefix} (`))
    if (i < 0) throw new Error(`NEVO file has no column ${prefix}`)
    return i
  }
  const at = {
    version: col('NEVO-versie/NEVO-version'), group: col('Food group'), code: col('NEVO-code'),
    nl: col('Voedingsmiddelnaam/Dutch food name'), en: col('Engelse naam/Food name'), syn: col('Synoniem'),
    qty: col('Hoeveelheid/Quantity'), note: col('Opmerking'),
  }
  const nutrients = Object.fromEntries(Object.keys(COLUMNS).map((k) => [k, col(k)]))
  // Vitamins and minerals: each column NEVO's file has, with the unit
  // checked against the one the app counts in. A column the file lacks is
  // unknown for every food (the command line insists on all of them).
  const micros = {}
  for (const [code, [key, unit]] of Object.entries(MICRO_COLUMNS)) {
    const i = head.findIndex((h) => h === code || h.startsWith(`${code} (`))
    if (i < 0) continue
    const got = /\(([^)]*)\)/.exec(head[i])?.[1]
    if (got !== unit) throw new Error(`NEVO column ${code} is in ${got ?? 'no unit'}, expected ${unit}`)
    micros[key] = i
  }
  return body.map((r) => {
    const qty = r[at.qty].trim().toLowerCase().replace(/\s+/g, '')
    if (qty !== 'per100g' && qty !== 'per100ml') throw new Error(`Food ${r[at.code]}: quantity "${r[at.qty]}"`)
    const values = {}
    for (const [k, i] of Object.entries(nutrients)) values[COLUMNS[k]] = nevoNumber(r[i])
    // An empty cell stays out (unknown); a published 0 is kept.
    const m = {}
    for (const [key, i] of Object.entries(micros)) {
      const v = nevoNumber(r[i])
      if (v !== null) m[key] = v
    }
    return {
      code: Number(r[at.code]), version: r[at.version].trim(), group: r[at.group].trim(),
      nl: r[at.nl].trim(), en: r[at.en].trim(), synonyms: r[at.syn].trim() || null, note: r[at.note].trim() || null,
      per_ml: qty === 'per100ml', values, micros: m,
    }
  })
}

/** NEVO's micronutrient columns a file lacks (by NEVO code). */
export function missingMicroColumns(text) {
  const [head] = parseDelimited(text.slice(0, 20000).split(/\r?\n/)[0] + '\n')
  return Object.keys(MICRO_COLUMNS).filter((code) => !head.some((h) => h === code || h.startsWith(`${code} (`)))
}

// ---- rows for the catalogue -------------------------------------------------------------

/** A catalogue row for a NEVO food: NEVO's values unchanged, Visuma's
 *  additions beside them. */
export function foodRow(f) {
  const name = displayName(f.en)
  const isOil = /^(oil|frying oil)\b/i.test(f.en) && f.values.fat_g !== null && f.values.fat_g >= 99
  const units = UNITS[f.code] ?? (isOil ? OIL_UNITS : [])
  return {
    id: nevoId(f.code), nevo_code: f.code, name, name_nl: f.nl, name_en: f.en, synonyms: f.synonyms,
    food_group: f.group, source_note: f.note, per_ml: f.per_ml, state: stateOf(f.en),
    cook_yield: YIELDS[f.code] ?? null, units,
    ...f.values,
  }
}

/** Everything the import would do, checked: every old catalogue food is
 *  replaced, kept or hidden; every code the additions name is in the file;
 *  no two foods the person can see share a name. */
export function plan(nevo, oldNames) {
  const byCode = new Map(nevo.map((f) => [f.code, f]))
  const problems = []
  for (const [old, code] of Object.entries(REPLACES)) {
    if (!byCode.has(code)) problems.push(`REPLACES ${old}: no NEVO food ${code}`)
    if (!oldNames.includes(old)) problems.push(`REPLACES ${old}: not in the old catalogue`)
  }
  for (const old of Object.keys(KEEP)) {
    if (!oldNames.includes(old)) problems.push(`KEEP ${old}: not in the old catalogue`)
    if (REPLACES[old]) problems.push(`${old} is both replaced and kept`)
  }
  for (const [old, x] of Object.entries(RECIPE_LINES)) if (!byCode.has(x.code)) problems.push(`RECIPE_LINES ${old}: no NEVO food ${x.code}`)
  for (const code of Object.keys(UNITS)) if (!byCode.has(Number(code))) problems.push(`UNITS: no NEVO food ${code}`)
  for (const code of Object.keys(YIELDS)) if (!byCode.has(Number(code))) problems.push(`YIELDS: no NEVO food ${code}`)
  const rows = nevo.map(foodRow)
  const seen = new Map()
  for (const name of [...rows.map((r) => r.name), ...Object.values(KEEP)]) {
    const k = name.toLowerCase()
    if (seen.has(k)) problems.push(`Two shared foods called "${name}"`)
    seen.set(k, true)
  }
  const hidden = oldNames.filter((n) => !REPLACES[n] && !KEEP[n])
  return { rows, hidden, problems }
}

// ---- SQL ----------------------------------------------------------------------------------

/** A row without its empty fields: an absent key reads as empty in both
 *  Postgres and the check, and the file is half the size. */
export const compact = (r) => Object.fromEntries(Object.entries(r).filter(([k, v]) =>
  v !== null && v !== undefined && !(k === 'per_ml' && v === false) && !(Array.isArray(v) && v.length === 0)))

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const ROW_TYPES = {
  id: 'uuid', nevo_code: 'int', name: 'text', name_nl: 'text', name_en: 'text', synonyms: 'text', food_group: 'text',
  source_note: 'text', per_ml: 'boolean', state: 'text', cook_yield: 'numeric', units: 'jsonb',
  kj: 'numeric', kcal: 'numeric', protein_g: 'numeric', fat_g: 'numeric', sat_fat_g: 'numeric', mufa_g: 'numeric',
  pufa_g: 'numeric', carbs_g: 'numeric', sugars_g: 'numeric', starch_g: 'numeric', polyols_g: 'numeric',
  fiber_g: 'numeric', alcohol_g: 'numeric', sodium_mg: 'numeric',
}

/** The generated part of migration 027. The NEVO rows travel as JSON (one
 *  food a line), which Postgres reads with jsonb_to_recordset and the food
 *  data check reads with JSON.parse: one copy of the data, read the same way
 *  by both. A row is only rewritten when something in it changed, so a
 *  second run (or the same NEVO version again) leaves every device's copy
 *  alone. */
export function generatedSql(p) {
  const cols = Object.keys(ROW_TYPES)
  const changing = cols.filter((c) => c !== 'id')
  const out = []
  out.push(BEGIN)
  out.push(`-- ${p.rows.length} foods from ${NEVO_VERSION}. Generated by scripts/import-nevo.mjs; do not edit by hand.`)
  out.push(`insert into public.food (${cols.join(', ')}, owner_id, source, source_version, carb_basis)`)
  out.push(`select ${cols.map((c) => (c === 'units' ? `coalesce(r.units, '[]'::jsonb)` : c === 'per_ml' ? 'coalesce(r.per_ml, false)' : `r.${c}`)).join(', ')}, null, 'nevo', ${lit(NEVO_VERSION)}, 'eu'`)
  out.push(`from jsonb_to_recordset($nevo$[`)
  p.rows.forEach((r, i) => out.push(JSON.stringify(compact(r)) + (i < p.rows.length - 1 ? ',' : '')))
  out.push(`]$nevo$::jsonb) as r(${cols.map((c) => `${c} ${ROW_TYPES[c]}`).join(', ')})`)
  out.push(`on conflict (id) do update set ${changing.map((c) => `${c} = excluded.${c}`).join(', ')}, deleted_at = null,`)
  out.push(`  source = 'nevo', source_version = excluded.source_version, carb_basis = 'eu'`)
  out.push(`where (${changing.map((c) => `food.${c}`).join(', ')}, food.deleted_at, food.source_version)`)
  out.push(`  is distinct from (${changing.map((c) => `excluded.${c}`).join(', ')}, null, excluded.source_version);`)
  out.push('')
  out.push(`-- GetIt's own shared recipes: lines pointed at the NEVO food that fits what the recipe says.`)
  out.push(`update public.recipe_line l set food_id = n.id, state = coalesce(x.state, l.state)`)
  out.push(`from (values ${Object.entries(RECIPE_LINES).map(([o, x]) => `(${lit(o)}, ${x.code}, ${x.state ? lit(x.state) : 'null'})`).join(', ')}) as x(old_name, code, state),`)
  out.push(`  public.food o, public.food n, public.recipe r`)
  out.push(`where l.food_id = o.id and o.owner_id is null and o.nevo_code is null and o.name = x.old_name`)
  out.push(`  and n.nevo_code = x.code and r.id = l.recipe_id and r.owner_id is null;`)
  out.push('')
  out.push(`-- Old catalogue foods NEVO replaces (clearly the same food): hidden, and pointing at their NEVO food.`)
  out.push(`update public.food f set replaced_by = n.id, deleted_at = coalesce(f.deleted_at, now())`)
  out.push(`from (values`)
  const reps = Object.entries(REPLACES)
  reps.forEach(([o, c], i) => out.push(`  (${lit(o)}, ${c})${i < reps.length - 1 ? ',' : ''}`))
  out.push(`) as m(old_name, code), public.food n`)
  out.push(`where f.owner_id is null and f.nevo_code is null and f.name = m.old_name and n.nevo_code = m.code`)
  out.push(`  and f.replaced_by is distinct from n.id;`)
  out.push('')
  out.push(`-- Old catalogue foods NEVO has no match for, kept with a plain British name and marked as the US list.`)
  out.push(`update public.food f set name = k.new_name, source = 'usda', source_version = ${lit(USDA_VERSION)}`)
  out.push(`from (values`)
  const keeps = Object.entries(KEEP)
  keeps.forEach(([o, n], i) => out.push(`  (${lit(o)}, ${lit(n)})${i < keeps.length - 1 ? ',' : ''}`))
  out.push(`) as k(old_name, new_name)`)
  out.push(`where f.owner_id is null and f.nevo_code is null and f.replaced_by is null and f.name = k.old_name`)
  out.push(`  and (f.name, f.source, f.source_version) is distinct from (k.new_name, 'usda', ${lit(USDA_VERSION)});`)
  out.push('')
  out.push(`-- The rest of the old list is hidden, not deleted: whatever used one still adds up.`)
  out.push(`update public.food f set deleted_at = now()`)
  out.push(`where f.owner_id is null and f.nevo_code is null and f.replaced_by is null and f.deleted_at is null and f.name in (`)
  p.hidden.forEach((n, i) => out.push(`  ${lit(n)}${i < p.hidden.length - 1 ? ',' : ''}`))
  out.push(`);`)
  out.push(END)
  return out.join('\n')
}

/** The generated part of migration 036: each NEVO food's vitamins and
 *  minerals, as published, set on its catalogue row by NEVO code. One food a
 *  line, as [code, {figures}]: the code is shorter than the id, and keys
 *  absent are unknown. A row is only rewritten when its figures changed, so
 *  a second run leaves every device's copy alone. */
export function microsSql(nevo) {
  const rows = nevo.filter((f) => Object.keys(f.micros ?? {}).length)
  const out = []
  out.push(MICROS_BEGIN)
  out.push(`-- Vitamins and minerals of ${rows.length} foods from ${NEVO_VERSION}, per 100 g or 100 ml in NEVO's units, unchanged.`)
  out.push('-- Generated by scripts/import-nevo.mjs; do not edit by hand.')
  out.push('update public.food f set micros = e->1')
  out.push('from jsonb_array_elements($nevo$[')
  rows.forEach((f, i) => out.push(JSON.stringify([f.code, f.micros]) + (i < rows.length - 1 ? ',' : '')))
  out.push(']$nevo$::jsonb) as e')
  out.push('where f.nevo_code = (e->>0)::int and f.owner_id is null and f.micros is distinct from e->1;')
  out.push(MICROS_END)
  return out.join('\n')
}

/** The migration with its generated part replaced. */
export function withGenerated(migration, sql, begin = BEGIN, end = END) {
  const a = migration.indexOf(begin)
  const b = migration.indexOf(end)
  if (a < 0 || b < 0 || b < a) throw new Error(`The migration has no generated part (${begin} … ${end}).`)
  return migration.slice(0, a) + sql + migration.slice(b + end.length)
}

// ---- command line ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [csv, flag] = process.argv.slice(2)
  if (!csv) {
    console.error('Usage: node scripts/import-nevo.mjs <NEVO2025_v9.0.csv> [--write]')
    process.exit(2)
  }
  const text = readFileSync(csv, 'utf8')
  const lacking = missingMicroColumns(text)
  if (lacking.length) {
    console.error(`NEVO file lacks the vitamin and mineral columns ${lacking.join(', ')}.`)
    process.exit(1)
  }
  const nevo = readNevo(text)
  const versions = [...new Set(nevo.map((f) => f.version))]
  if (versions.length !== 1 || !/2025 9\.0/.test(versions[0])) {
    console.error(`Expected one version, NEVO-Online 2025 9.0; the file says ${versions.join(', ')}.`)
    process.exit(1)
  }
  const oldNames = JSON.parse(readFileSync(SEED, 'utf8')).foods.map((f) => f.name)
  const p = plan(nevo, oldNames)
  console.log(`${nevo.length} NEVO foods; ${Object.keys(REPLACES).length} old foods replaced, ${Object.keys(KEEP).length} kept, ${p.hidden.length} hidden.`)
  console.log(`Units on ${p.rows.filter((r) => r.units.length).length} foods; cook yields on ${p.rows.filter((r) => r.cook_yield).length}.`)
  console.log(`Vitamins and minerals on ${nevo.filter((f) => Object.keys(f.micros).length).length} foods (${nevo.reduce((n, f) => n + Object.keys(f.micros).length, 0)} figures).`)
  if (p.problems.length) {
    console.error(p.problems.join('\n'))
    process.exit(1)
  }
  if (flag === '--write') {
    writeFileSync(MIGRATION, withGenerated(readFileSync(MIGRATION, 'utf8'), generatedSql(p)))
    console.log(`Wrote ${MIGRATION}.`)
    writeFileSync(MICROS_MIGRATION, withGenerated(readFileSync(MICROS_MIGRATION, 'utf8'), microsSql(nevo), MICROS_BEGIN, MICROS_END))
    console.log(`Wrote ${MICROS_MIGRATION}.`)
  }
}
