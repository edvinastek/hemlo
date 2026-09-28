import type { EntityDef, FieldDef, ViewDef } from './types'
import {
  BOARD_CARD_FIELDS, boardField, chartFields, gridFields, isDateLike, isGridMark, isGridRow, isNumeric, mainField,
  viewDateField, viewProblem, type ChartKind, type ChartPeriod,
} from './def-rules'
import { Dropdown, type Option } from '../ui/Dropdown'
import './views/views.css'

/** The kinds of view there are, for the editor's and the builder's pickers. */
export const VIEW_TYPE_OPTIONS: Option<ViewDef['type']>[] = [
  { value: 'list', label: 'List', hint: 'Cards, newest first' },
  { value: 'table', label: 'Table', hint: 'Edit in place, like a sheet' },
  { value: 'calendar', label: 'Calendar', hint: 'A month, records on their days' },
  { value: 'board', label: 'Board', hint: 'Columns by a choice; move cards across' },
  { value: 'grid', label: 'Grid', hint: 'Days across, tap to tick, like a habit grid' },
  { value: 'chart', label: 'Chart', hint: 'A number over time, per day, week or month' },
  { value: 'form', label: 'Form', hint: 'Add one record after another' },
]
export const VIEW_TYPE_NAME: Record<ViewDef['type'], string> = {
  list: 'List', table: 'Table', calendar: 'Calendar', form: 'Form', board: 'Board', grid: 'Grid', chart: 'Chart',
}
const PERIOD_OPTIONS: Option<ChartPeriod>[] = [
  { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' },
]
const KIND_OPTIONS: Option<ChartKind>[] = [{ value: 'bar', label: 'Bars' }, { value: 'line', label: 'A line' }]

const opts = (fields: FieldDef[]) => fields.map((f) => ({ value: f.name, label: f.label }))

/** One setting: a quiet caption over a compact dropdown. */
function Setting<V extends string>({ caption, label, value, options, onChange }: {
  caption: string; label: string; value: V; options: Option<V>[]; onChange: (v: V) => void
}) {
  return (
    <div className="mf-field vs-pick">
      <span className="mf-hint">{caption}</span>
      <Dropdown label={label} value={value} options={options} onChange={onChange} />
    </div>
  )
}

/** What a calendar, board, grid or chart view goes by, chosen from the
 *  entity's fields, and in words what is missing when it cannot draw.
 *  Nothing for a list, table or form. `change` edits the view in place. */
export function ViewSettings({ view, entity, change }: {
  view: ViewDef; entity: EntityDef; change: (fn: (v: ViewDef) => void) => void
}) {
  const fields = entity.fields
  const dates = fields.filter(isDateLike)
  const problem = viewProblem(view, entity)
  const date = viewDateField(entity, view)
  const datePick = dates.length > 0 && (
    <Setting caption={view.type === 'calendar' ? 'Records go on the day of' : 'Days from'} label={`Date field of ${view.name}`}
      value={date?.name ?? dates[0].name} options={opts(dates)} onChange={(v) => change((x) => { x.dateField = v })} />
  )

  if (view.type === 'calendar') {
    return (
      <div className="me-more">
        {dates.length === 0 ? <span className="mf-hint">Add a date field for this calendar to go by.</span> : datePick}
      </div>
    )
  }

  if (view.type === 'board') {
    const choices = fields.filter((f) => f.type === 'select')
    const group = boardField(entity, view)
    const title = mainField(fields)
    const extra = fields.filter((f) => !f.hidden && f !== title && f !== group)
    const cols = view.columns ?? []
    return (
      <div className="me-more vs">
        {group && (
          <Setting caption="Columns from" label={`Columns of ${view.name}`} value={group.name} options={opts(choices)}
            onChange={(v) => change((x) => { x.groupBy = v })} />
        )}
        {extra.length > 0 && (
          <div className="vs-cols">
            <span className="mf-hint">On each card, besides {title?.label.toLowerCase() ?? 'the name'} (up to {BOARD_CARD_FIELDS})</span>
            <div className="me-cols" role="group" aria-label={`Fields on the cards of ${view.name}`}>
              {extra.map((f) => {
                const on = cols.includes(f.name)
                return (
                  <button key={f.name} type="button" className="me-col" aria-pressed={on}
                    disabled={!on && cols.length >= BOARD_CARD_FIELDS}
                    onClick={() => change((x) => {
                      const next = on ? cols.filter((c) => c !== f.name) : [...cols, f.name]
                      if (next.length) x.columns = next; else delete x.columns
                    })}>{f.label}</button>
                )
              })}
            </div>
          </div>
        )}
        {problem && <p className="mf-error">{problem}</p>}
      </div>
    )
  }

  if (view.type === 'grid') {
    const g = gridFields(entity, view)
    const rows = fields.filter(isGridRow)
    const marks = fields.filter(isGridMark)
    return (
      <div className="me-more vs">
        {g.row && (
          <Setting caption="Rows named by" label={`Rows of ${view.name}`} value={g.row.name} options={opts(rows)}
            onChange={(v) => change((x) => { x.groupBy = v })} />
        )}
        {datePick}
        {g.row && g.date && (
          <Setting caption="A tap" label={`What a tap does in ${view.name}`} value={g.mark?.name ?? ''}
            options={[
              ...marks.map((f) => ({ value: f.name, label: f.type === 'boolean' ? `Ticks ${f.label}` : `Counts ${f.label}` })),
              { value: '', label: 'Adds a record' },
            ]}
            onChange={(v) => change((x) => { x.field = v })} />
        )}
        {problem && <p className="mf-error">{problem}</p>}
      </div>
    )
  }

  if (view.type === 'chart') {
    const c = chartFields(entity, view)
    const numbers = fields.filter(isNumeric)
    return (
      <div className="me-more vs">
        {c.value && (
          <Setting caption="Draws" label={`Number drawn in ${view.name}`} value={c.value.name} options={opts(numbers)}
            onChange={(v) => change((x) => { x.field = v })} />
        )}
        {datePick}
        {c.value && c.date && (
          <>
            <Setting caption="Added up per" label={`Period of ${view.name}`} value={view.period ?? 'week'} options={PERIOD_OPTIONS}
              onChange={(v) => change((x) => { x.period = v })} />
            <Setting caption="As" label={`How ${view.name} is drawn`} value={view.chart ?? 'bar'} options={KIND_OPTIONS}
              onChange={(v) => change((x) => { x.chart = v })} />
          </>
        )}
        {problem && <p className="mf-error">{problem}</p>}
      </div>
    )
  }
  return null
}
