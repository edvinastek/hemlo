/** A module's design as a file (MOD-16): its name, mark, fields, views and
 *  rules, never its records, so it can be passed to someone else and built
 *  again. Pure. Reading a file goes through the same checks as a module read
 *  from storage (def-rules.ts), so a hand-edited file cannot carry anything
 *  the app would not accept from its own editor. */
import type { FieldDef, ModuleDef } from './types.ts'
import { definitionFor, definitionProblem, readBuiltDefinition } from './def-rules.ts'
import { MODULE_FORMAT, isFormat } from '../lib/file-format-rules.ts'

export const DESIGN_FORMAT = MODULE_FORMAT
export const DESIGN_VERSION = 1

export interface DesignFile {
  format: typeof DESIGN_FORMAT
  version: typeof DESIGN_VERSION
  name: string
  definition: Record<string, unknown>
}

/** A module someone has, for a link to its records: its key and name. */
export interface ModuleName { key: string; name: string }

/** The file for a module: what is stored for it, records left out. A link to
 *  another built module's records keeps that module's name with it (v22), so
 *  the person who imports it gets the link back when they have a module of
 *  that name; a link to another kind of record of this same module is
 *  marked as such. */
export function designFile(def: ModuleDef, modules: ModuleName[] = []): DesignFile {
  const d = definitionFor(def)
  const entities = (d.entities as { fields: FieldDef[] }[]).map((e) => ({
    ...e,
    fields: e.fields.map((f) => {
      if (f.type !== 'lookup' || f.lookup !== 'record') return f
      if (f.module === def.key) return { ...f, module_self: true }
      return { ...f, module_name: modules.find((m) => m.key === f.module)?.name ?? null }
    }),
  }))
  return { format: DESIGN_FORMAT, version: DESIGN_VERSION, name: def.name, definition: { ...d, entities } }
}

/** The modules a person built, as names for a design file's links. */
export function builtNames(rows: { key: string; name: string; builtin?: boolean; deleted_at?: string | null }[]): ModuleName[] {
  return rows.filter((m) => !m.builtin && !m.deleted_at).map((m) => ({ key: m.key, name: m.name }))
}

/** The key a design is read under, before it is built and given its own. */
export const IMPORT_KEY = 'u_import00'

/** Links in a design file made to fit the modules the person has: a link to
 *  this module's own records stays one; a link to a module they have (the
 *  same one, or one of the same name) points at it; any other becomes a
 *  text field of the same name, so nothing in the design is lost. */
function fitLinks(definition: Record<string, unknown>, modules: ModuleName[]): Record<string, unknown> {
  const entities = Array.isArray(definition.entities) ? definition.entities : []
  return {
    ...definition,
    entities: entities.map((e) => {
      if (!e || typeof e !== 'object' || !Array.isArray((e as { fields?: unknown }).fields)) return e
      const fields = ((e as { fields: Record<string, unknown>[] }).fields).map((raw) => {
        if (!raw || typeof raw !== 'object' || raw.type !== 'lookup' || raw.lookup !== 'record') return raw
        const { module_self: self, module_name: named, ...f } = raw
        if (self === true) return { ...f, module: IMPORT_KEY }
        const same = modules.find((m) => m.key === f.module)
        const byName = typeof named === 'string' ? modules.find((m) => m.name.trim().toLowerCase() === named.trim().toLowerCase()) : undefined
        const to = same ?? byName
        if (to) return { ...f, module: to.key }
        return { name: f.name, label: f.label, type: 'text', ...(f.hidden === true ? { hidden: true } : {}) }
      })
      return { ...e, fields }
    }),
  }
}

/** "plant-care.hemlo-module.json" */
export function designFileName(name: string): string {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'module'
  return `${base}.hemlo-module.json`
}

/** A file read back as a draft to build, or what is wrong with it. */
export function readDesignFile(text: string, modules: ModuleName[] = []): { ok: true; def: ModuleDef } | { ok: false; problem: string } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, problem: 'That file is not a module design.' } }
  const f = raw as Partial<DesignFile>
  // A design saved before version 21 says getit.module; it reads the same.
  if (!f || !isFormat(f.format, DESIGN_FORMAT) || typeof f.definition !== 'object' || !f.definition) return { ok: false, problem: 'That file is not a module design.' }
  if (f.version !== DESIGN_VERSION) return { ok: false, problem: 'That design comes from a newer Hemlo. Update the app, then import it again.' }
  const def = readBuiltDefinition({ key: IMPORT_KEY, name: typeof f.name === 'string' ? f.name : '', definition: fitLinks(f.definition as Record<string, unknown>, modules) })
  if (def.entities.length === 0 || def.entities.every((e) => e.fields.length === 0)) return { ok: false, problem: 'That design has no fields to build from.' }
  const problem = definitionProblem(def)
  return problem ? { ok: false, problem } : { ok: true, def }
}
