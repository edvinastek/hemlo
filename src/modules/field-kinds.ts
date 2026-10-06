import type { FieldDef } from './types.ts'

/** The settings and the reading of the field kinds MOD-12 added (version 16
 *  to 22): stars on a scale, a share in a range, money in a currency, a
 *  stretch of time from a start to an end, and a link to another module's
 *  record. Pure: no database, no React (checked in src/test/fieldkinds.check.mjs).
 *  def-rules.ts keeps a field to these settings; the form, the views, Stats,
 *  the files and the design files read a value through them, so a kind means
 *  the same thing everywhere. */

/* ---------- rating: stars on a scale ------------------------------------------ */

/** The scales offered. Five is the default (and every field made before v22). */
export const RATING_SCALES = [3, 5, 10]
export const RATING_DEFAULT = 5

/** How many stars a rating field has. */
export const ratingMax = (f: Pick<FieldDef, 'max'>): number =>
  typeof f.max === 'number' && Number.isInteger(f.max) && f.max >= 2 && f.max <= 10 ? f.max : RATING_DEFAULT

/** "★★★★☆" */
export function starsText(n: number, max: number): string {
  const k = Math.max(0, Math.min(max, Math.round(n)))
  return '★'.repeat(k) + '☆'.repeat(max - k)
}

/* ---------- percent: a share in a range --------------------------------------- */

export const PERCENT_LIMIT = 1000

/** The range a percentage may take: 0 to 100 unless the field says otherwise
 *  ("growth" can be negative, "of target" can pass 100). */
export function percentRange(f: Pick<FieldDef, 'min' | 'max'>): { min: number; max: number } {
  const min = typeof f.min === 'number' && Number.isFinite(f.min) && Math.abs(f.min) <= PERCENT_LIMIT ? f.min : 0
  const max = typeof f.max === 'number' && Number.isFinite(f.max) && Math.abs(f.max) <= PERCENT_LIMIT && f.max > min ? f.max : Math.max(100, min + 1)
  return { min, max }
}

/* ---------- money: an amount in one currency ----------------------------------- */

/** Currencies offered for a money field: the euro and its neighbours first,
 *  then the ones people travel or are paid in most. ISO 4217 codes. */
export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'EUR', name: 'Euro' }, { code: 'GBP', name: 'Pound sterling' }, { code: 'USD', name: 'US dollar' },
  { code: 'CHF', name: 'Swiss franc' }, { code: 'PLN', name: 'Polish złoty' }, { code: 'CZK', name: 'Czech koruna' },
  { code: 'HUF', name: 'Hungarian forint' }, { code: 'RON', name: 'Romanian leu' }, { code: 'BGN', name: 'Bulgarian lev' },
  { code: 'SEK', name: 'Swedish krona' }, { code: 'NOK', name: 'Norwegian krone' }, { code: 'DKK', name: 'Danish krone' },
  { code: 'ISK', name: 'Icelandic króna' }, { code: 'TRY', name: 'Turkish lira' }, { code: 'UAH', name: 'Ukrainian hryvnia' },
  { code: 'CAD', name: 'Canadian dollar' }, { code: 'AUD', name: 'Australian dollar' }, { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'JPY', name: 'Japanese yen' }, { code: 'CNY', name: 'Chinese yuan' }, { code: 'INR', name: 'Indian rupee' },
  { code: 'BRL', name: 'Brazilian real' }, { code: 'MXN', name: 'Mexican peso' }, { code: 'ZAR', name: 'South African rand' },
]
const CODES = new Set(CURRENCIES.map((c) => c.code))
export const isCurrency = (v: unknown): v is string => typeof v === 'string' && CODES.has(v)

/** The signs a money field kept as its unit before v22 ("€"), as codes. */
const SIGNS: Record<string, string> = { '€': 'EUR', '£': 'GBP', '$': 'USD', 'US$': 'USD', 'zł': 'PLN', 'Kč': 'CZK', 'kr': 'SEK', 'Fr': 'CHF', 'CHF': 'CHF', '¥': 'JPY', '₹': 'INR', '₺': 'TRY', '₴': 'UAH' }

/** A money field's currency: its own code, else what its older unit said,
 *  else the given fallback (the person's country's), else the euro. */
export function moneyCurrency(f: Pick<FieldDef, 'currency' | 'unit'>, fallback = 'EUR'): string {
  if (isCurrency(f.currency)) return f.currency
  const u = (f.unit ?? '').trim()
  if (u && isCurrency(u.toUpperCase())) return u.toUpperCase()
  if (u && SIGNS[u]) return SIGNS[u]
  return isCurrency(fallback) ? fallback : 'EUR'
}

/** "€249.50", "CHF 12.00", "¥1,200". The currency's own decimals. */
export function moneyText(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** A currency's sign alone ("€", "CHF"), for a column or a form label. */
export function currencySign(currency: string): string {
  try {
    const part = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')
    return part?.value ?? currency
  } catch {
    return currency
  }
}

/* ---------- timespan: from a start to an end ------------------------------------- */

const SPAN = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/

/** A stretch of time "HH:MM-HH:MM" in minutes, across midnight when the
 *  end is earlier; null when it is not one. */
export function spanMinutes(v: unknown): number | null {
  if (typeof v !== 'string' || !SPAN.test(v)) return null
  const [a, b] = v.split('-').map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)))
  return b >= a ? b - a : b + 1440 - a
}

/** "45 min", "3 h 45 min", "2 h". */
export function minutesText(m: number): string {
  const r = Math.round(m)
  if (r < 60) return `${r} min`
  return `${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ''}`
}

/* ---------- links to another built module's records ------------------------------ */

/** Which list a link field picks from: 'food', 'recipe' … and
 *  'record:<module key>[:<kind>]' for another built module's records. */
export const linkKey = (f: Pick<FieldDef, 'lookup' | 'module' | 'entity'>): string =>
  f.lookup === 'record' ? `record:${f.module ?? ''}${f.entity ? `:${f.entity}` : ''}` : (f.lookup ?? '')

/** What a link shows: the linked thing's name, "Quick Fit (deleted)" when it
 *  was deleted, "Deleted" when it is not on this device at all. Never a crash
 *  and never the bare id. */
export function linkText(id: unknown, items: { id: string; name: string; gone?: boolean }[] | undefined): string {
  if (id === null || id === undefined || id === '') return ''
  const hit = (items ?? []).find((i) => i.id === id)
  if (!hit) return 'Deleted'
  return hit.gone ? `${hit.name} (deleted)` : hit.name
}

/* ---------- in Stats and in totals ------------------------------------------------ */

/** How a field counts in Stats and in a page's totals, or null when it is
 *  not a number at all. Stars and shares are always averaged (adding up
 *  ratings means nothing); money is added up (or averaged when the field
 *  says) in its own currency only, one field being one currency; a start
 *  and end counts as its minutes. */
export interface FieldMeasure {
  combine: 'sum' | 'mean'
  unit: string
  decimals: number
  /** The number a stored value counts as, or null. */
  value: (v: unknown) => number | null
  /** A total or an average as words: "€661.50", "4.2 of 5", "38 %", "5 h 15 min". */
  text: (n: number) => string
}

const asNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

export function fieldMeasure(f: Pick<FieldDef, 'type' | 'unit' | 'stats' | 'currency' | 'max' | 'min'>, fallbackCurrency = 'EUR'): FieldMeasure | null {
  const mean = f.stats === 'average'
  switch (f.type) {
    case 'rating': {
      const max = ratingMax(f)
      return { combine: 'mean', unit: `of ${max}`, decimals: 1, value: asNum, text: (n) => `${round(n, 1)} of ${max}` }
    }
    case 'percent':
      return { combine: 'mean', unit: '%', decimals: 1, value: asNum, text: (n) => `${round(n, 1)} %` }
    case 'money': {
      const cur = moneyCurrency(f, fallbackCurrency)
      return { combine: mean ? 'mean' : 'sum', unit: cur, decimals: 2, value: asNum, text: (n) => moneyText(n, cur) }
    }
    case 'timespan':
      return { combine: mean ? 'mean' : 'sum', unit: 'min', decimals: 0, value: spanMinutes, text: (n) => minutesText(n) }
    case 'duration': {
      const unit = f.unit || 'min'
      return { combine: mean ? 'mean' : 'sum', unit, decimals: 0, value: asNum, text: (n) => `${round(n, 1)} ${unit}` }
    }
    case 'number': case 'integer': case 'formula':
      return {
        combine: mean ? 'mean' : 'sum', unit: f.unit ?? '', decimals: f.type === 'integer' ? 0 : 1, value: asNum,
        text: (n) => `${round(n, 2)}${f.unit ? ` ${f.unit}` : ''}`,
      }
  }
  return null
}

/** The fields Stats may add up or average (the rest can only be counted). */
export const isMeasurable = (f: Pick<FieldDef, 'type'>) => fieldMeasure(f as FieldDef) !== null

/** What "In Stats" may offer for a kind: stars and shares are averaged, never added up. */
export function statsChoices(f: Pick<FieldDef, 'type'>): ('sum' | 'average' | 'count')[] {
  if (f.type === 'rating' || f.type === 'percent') return ['average', 'count']
  return isMeasurable(f) ? ['sum', 'average', 'count'] : ['count']
}

/** A total or an average over records, as a field counts it. */
export function combineValues(m: FieldMeasure, values: unknown[]): number | null {
  const nums = values.map(m.value).filter((n): n is number => n !== null)
  if (!nums.length) return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return m.combine === 'mean' ? sum / nums.length : sum
}
