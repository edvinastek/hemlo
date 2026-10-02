import type { StatsWidgetView } from './stats-widget-rules'

/** The saved stats views worked out for the home-screen widgets: every view
 *  the person saved, in their order. Filled in by the stats work; the widget
 *  pipeline (widget.ts) calls this whenever the data behind it changes. */
export async function statsWidgetViews(_profileId: string): Promise<StatsWidgetView[]> {
  return []
}
