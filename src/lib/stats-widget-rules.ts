/** What the app hands the Android stats widgets (WID-10, STA-21): each saved
 *  stats view the person may place on the home screen, already worked out,
 *  so the widget only draws. Pure types and a size guard; the figures come
 *  from the stats work (stats-widget.ts), the drawing from the native side.
 *
 *  The snapshot is written as JSON through the widget plugin (widget.ts,
 *  `updateStats`). Bump `v` if the shape changes, and keep the native reader
 *  able to read the version before. */

export type StatsWidgetKind = 'number' | 'ring' | 'bars' | 'line' | 'table'

export interface StatsWidgetPoint {
  /** Short label under a bar or point ("Mon", "W41", "Oct"). */
  label: string
  /** null: no data that day (drawn as a gap, never as 0). */
  value: number | null
  /** '#rrggbb', already checked against the widget's background. */
  colour?: string
}

export interface StatsWidgetView {
  id: string
  name: string
  kind: StatsWidgetKind
  /** The big figure, written out: "142 g", "86%", "3 of 5". */
  headline: string
  /** One quieter line: "Protein · this week · target 150 g". */
  sub: string
  /** For bars and line: the series, oldest first, at most 31 points. */
  points: StatsWidgetPoint[]
  /** For ring: 0 to 1. For bars and line: drawn as a line when set. */
  progress?: number | null
  target?: number | null
  /** For table: at most 6 rows of at most 3 cells, first row the heading. */
  rows?: string[][]
  /** Where a tap opens the app: '/stats?view=<id>'. */
  link: string
}

export interface StatsWidgetSnapshot {
  v: 1
  /** ISO time it was worked out; the widget shows "as of" when it is old. */
  written_at: string
  views: StatsWidgetView[]
}

export const MAX_WIDGET_POINTS = 31
export const MAX_WIDGET_ROWS = 6

/** Keeps a snapshot inside what the widget can draw, whatever made it. */
export function trimStatsSnapshot(s: StatsWidgetSnapshot): StatsWidgetSnapshot {
  return {
    v: 1,
    written_at: s.written_at,
    views: s.views.slice(0, 50).map((v) => ({
      ...v,
      name: v.name.slice(0, 60),
      headline: v.headline.slice(0, 24),
      sub: v.sub.slice(0, 80),
      points: v.points.slice(-MAX_WIDGET_POINTS).map((p) => ({ ...p, label: p.label.slice(0, 6) })),
      rows: v.rows?.slice(0, MAX_WIDGET_ROWS).map((r) => r.slice(0, 3).map((c) => c.slice(0, 24))),
    })),
  }
}
