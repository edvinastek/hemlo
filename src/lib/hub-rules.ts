/** The Modules page's search (NAV-22): one box over the modules and what
 *  they hold, by THE search (search-rules.ts). Pure: the screen reads the
 *  rows, this decides what is found and in which order. */
import { search } from './search-rules.ts'

export interface HubModule {
  /** Page key ('food', 'm:sleep') when it has a page, else the module key. */
  key: string
  module: string
  name: string
  summary: string
  keywords: string[]
  on: boolean
  route: string | null
}

export interface HubRecord {
  id: string
  module: string
  name: string
  /** Other words it is found by: its other values. */
  extra: string
  /** Where it opens. */
  route: string
  /** "Plants · 3 Oct 2026" */
  meta: string
  /** Changed recently: higher first among equals. */
  recent?: number
}

export type HubHit =
  | { kind: 'module'; item: HubModule }
  | { kind: 'record'; item: HubRecord }

/** Modules first (they are few, and usually what is meant), the ones that
 *  are on before the ones that are off; then records of modules that are
 *  on, best first, at most `limit` of them. Nothing typed, nothing found. */
export function hubSearch(modules: HubModule[], records: HubRecord[], query: string, limit = 30): { hits: HubHit[]; more: number } {
  if (!query.trim()) return { hits: [], more: 0 }
  const mods = search(modules.map((m) => ({ ...m, extra: `${m.summary} ${m.keywords.join(' ')}`, mine: m.on })), query)
  const on = new Set(modules.filter((m) => m.on).map((m) => m.module))
  const recs = search(records.filter((r) => on.has(r.module)), query)
  return {
    hits: [
      ...mods.map((m) => ({ kind: 'module' as const, item: modules.find((x) => x.key === m.key)! })),
      ...recs.slice(0, limit).map((r) => ({ kind: 'record' as const, item: r })),
    ],
    more: Math.max(0, recs.length - limit),
  }
}

/** A record's name: its first piece of text that is not a date. */
export function recordName(data: Record<string, unknown> | null | undefined, fallback: string): string {
  for (const v of Object.values(data ?? {})) {
    if (typeof v === 'string' && v.trim() && !/^\d{4}-\d{2}-\d{2}/.test(v) && !/^_/.test(v)) return v.trim().split('\n')[0].slice(0, 120)
  }
  return fallback
}

/** Every other value of a record, as words to be found by. */
export function recordWords(data: Record<string, unknown> | null | undefined): string {
  return Object.entries(data ?? {})
    .filter(([k]) => !k.startsWith('_'))
    .map(([, v]) => (Array.isArray(v) ? v.join(' ') : typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
    .join(' ')
    .slice(0, 400)
}
