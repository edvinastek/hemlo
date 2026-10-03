import { format } from 'date-fns'
import { db } from './db'
import { readSettings } from './settings'
import { computeView } from './stats'
import { chartData, toWidgetView } from './chart-rules'
import { colourFor, PAPER } from './colours-rules'
import { rangeName, spanName, groupingsFor, type Measure } from './stats-builder-rules'
import type { StatsWidgetView } from './stats-widget-rules'

/** The saved stats views worked out for the home-screen widgets (STA-21,
 *  WID-10): every view the person saved, in their order, each in the shape
 *  the native widget draws (a figure, a ring, bars, a line or a short
 *  table), with a tap that opens it in the app at /stats?view=<id>. The
 *  widget pipeline (widget.ts) calls this whenever the data behind it
 *  changes. Colours are checked against the light page, which the widget's
 *  own background matches. A view that cannot be worked out is left out. */
export async function statsWidgetViews(profileId: string): Promise<StatsWidgetView[]> {
  const profile = await db.profile.get(profileId)
  if (!profile) return []
  const settings = readSettings(profile)
  const today = format(new Date(), 'yyyy-MM-dd')
  const out: StatsWidgetView[] = []
  for (const view of settings.stats_views) {
    try {
      const o = await computeView(profileId, view, today)
      const colour = (key: string) => (key === 'tasks' ? '#6d7198' : colourFor(key, settings))
      const data = chartData(o.result, view, colour, PAPER.light, o.shade)
      const measures = view.measures.map((m) => o.catalogue.find((c) => c.key === m.source)).filter((m): m is Measure => !!m)
      const rowsName = groupingsFor(measures).find((g) => g.key === view.rows)?.label ?? 'Row'
      const rangeText = view.range.kind === 'custom' ? spanName(o.span) : rangeName(view.range)
      out.push(toWidgetView(view, o.result, data, rangeText, rowsName))
    } catch {
      // One broken view never stops the others reaching the home screen.
    }
  }
  return out
}
