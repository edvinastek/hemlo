/** A module is configuration on a shared core, not a hard-coded screen.
 *  Built-in modules are defined the same way a custom one is, which is what
 *  makes the editor an addition later rather than a rewrite. */

export type FieldType =
  | 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'time'
  | 'datetime' | 'select' | 'lookup' | 'formula' | 'duration'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  /** Spreadsheet-style expression over the record's own fields, e.g.
   *  "grams * kcal / 100". Calculated fields are never stored. */
  formula?: string
  /** Table a lookup picks from, so a food or an exercise is never typed twice. */
  lookup?: 'food' | 'recipe' | 'exercise' | 'task' | 'goal'
  options?: string[]
  required?: boolean
  unit?: string
  width?: number
  /** Counted in Stats: summed, averaged, or the records counted. */
  stats?: 'sum' | 'average' | 'count'
  /** Kept in the records but left off the page and the form. */
  hidden?: boolean
}

export interface ViewDef {
  key: string
  name: string
  type: 'list' | 'table' | 'calendar' | 'board' | 'grid' | 'chart' | 'form'
  entity: string
  columns?: string[]
  filters?: Record<string, unknown>
  /** The date or date-time field a calendar, grid or chart goes by. */
  dateField?: string
  /** Board: the choice field whose options are its columns. Grid: the
   *  field its rows are named by (the record's name when there is none). */
  groupBy?: string
  /** Chart: the number it draws. Grid: the yes/no or number a tap ticks
   *  (none: a tap just adds a record for that day). */
  field?: string
  /** Chart: added up per day, week or month, until changed on the page. */
  period?: 'day' | 'week' | 'month'
  /** Chart: bars or a line. */
  chart?: 'bar' | 'line'
  /** Switched off in the editor: kept, but not shown as a tab. */
  hidden?: boolean
}

export interface RuleDef {
  name: string
  /** Stated as a sentence with one qualifier, the way the design kit asks. */
  sentence: string
  when: string
  then: string
  locked?: boolean
  /** Switched off in the editor. Absent means on. */
  off?: boolean
  /** For a reminder rule: the time used when a record has none of its own. */
  time?: string
}

export interface EntityDef {
  name: string
  label: string
  /** A built-in module stores its records in its own table; a custom one uses
   *  the shared module_record store. Either way the planner sees the same
   *  Task and Series rows. */
  table?: string
  fields: FieldDef[]
}

export interface ModuleDef {
  key: string
  name: string
  summary: string
  entities: EntityDef[]
  views: ViewDef[]
  rules: RuleDef[]
  /** What the assistant is allowed to read and change once this is on. */
  skills?: string[]
  defaultOn?: boolean
  depth: 'full' | 'light'
  /** One character for the page bar and the page's heading. */
  glyph?: string
  /** Words that point at this module, for the setup templates' suggestion. */
  keywords?: string[]
  /** Built by the person rather than shipped with the app. */
  built?: boolean
}
