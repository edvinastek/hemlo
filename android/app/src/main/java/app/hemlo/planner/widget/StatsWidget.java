package app.hemlo.planner.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Date;
import java.util.List;

import app.hemlo.planner.PlannerActivity;
import app.hemlo.planner.R;

/**
 * Hemlo · Stats on the home screen (WID-10): as many as the person places,
 * each showing one saved stats view as a figure, a ring, a small chart or a
 * short table, at 2×2, 4×2 and 4×4. The figures are worked out by the app
 * (StatsModel reads them); this only draws, in the app's theme. Which view a
 * widget shows is chosen in StatsWidgetConfigure, when it is placed and later
 * from the widget's settings (WID-14). A tap opens that view in the app.
 */
public class StatsWidget extends AppWidgetProvider {

    private static final int[] ROW = { R.id.trow_0, R.id.trow_1, R.id.trow_2, R.id.trow_3, R.id.trow_4, R.id.trow_5 };
    private static final int[][] CELL = {
        { R.id.tcell_0_0, R.id.tcell_0_1, R.id.tcell_0_2 }, { R.id.tcell_1_0, R.id.tcell_1_1, R.id.tcell_1_2 },
        { R.id.tcell_2_0, R.id.tcell_2_1, R.id.tcell_2_2 }, { R.id.tcell_3_0, R.id.tcell_3_1, R.id.tcell_3_2 },
        { R.id.tcell_4_0, R.id.tcell_4_1, R.id.tcell_4_2 }, { R.id.tcell_5_0, R.id.tcell_5_1, R.id.tcell_5_2 },
    };

    /** A widget Android has not measured yet is drawn as the default 2×2. */
    private static final int DEFAULT_DP = 140;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) draw(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, id);
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        for (int id : ids) WidgetStore.forgetStatsView(context, id);
    }

    /** Redraw every stats widget: after the app writes new figures or a new
     *  theme, and after sign-out. */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, StatsWidget.class));
        for (int id : ids) draw(context, manager, id);
    }

    static void draw(Context context, AppWidgetManager manager, int id) {
        Bundle options = manager.getAppWidgetOptions(id);
        // In portrait a widget gets its minimum width and its maximum height.
        int w = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        int h = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
        manager.updateAppWidget(id, render(context, id, w > 0 ? w : DEFAULT_DP, h > 0 ? h : DEFAULT_DP, new Date()));
    }

    static RemoteViews render(Context context, int widgetId, int wDp, int hDp, Date now) {
        StatsModel model = StatsModel.parse(WidgetStore.stats(context));
        StatsModel.Shown shown = model.pick(WidgetStore.statsView(context, widgetId));
        StatsModel.Size size = StatsModel.sizeFor(wDp, hDp);
        WidgetColours col = WidgetColours.load(context);
        float density = context.getResources().getDisplayMetrics().density;

        StatsModel.View view = shown.view;
        String kind = view == null ? "message" : view.kind;
        int layout = kind.equals("bars") || kind.equals("line") ? R.layout.widget_stats_chart
            : kind.equals("table") ? R.layout.widget_stats_table : R.layout.widget_stats_figure;
        RemoteViews v = new RemoteViews(context.getPackageName(), layout);

        col.set(v, R.id.bg, "setColorFilter", p -> p.paper);
        col.set(v, R.id.stat_name, "setTextColor", p -> p.soft);
        col.set(v, R.id.stat_message, "setTextColor", p -> p.soft);
        col.set(v, R.id.stat_asof, "setTextColor", p -> p.soft);

        if (view == null) {
            v.setTextViewText(R.id.stat_name, "Hemlo · Stats");
            v.setTextViewText(R.id.stat_message, shown.message);
            v.setViewVisibility(R.id.stat_message, View.VISIBLE);
            v.setViewVisibility(R.id.stat_body, View.GONE);
            // A view that is gone is replaced from the settings screen; with
            // none saved, or signed out, the app is where to go.
            PendingIntent tap = StatsModel.GONE.equals(shown.message) ? configure(context, widgetId) : open(context, widgetId, "/stats");
            v.setOnClickPendingIntent(R.id.widget_root, tap);
            v.setContentDescription(R.id.widget_root, "Hemlo stats. " + shown.message);
            return v;
        }

        v.setTextViewText(R.id.stat_name, view.name);
        v.setOnClickPendingIntent(R.id.widget_root, open(context, widgetId, view.link));
        v.setContentDescription(R.id.widget_root, view.name + ": " + view.headline + (view.sub.isEmpty() ? "" : ", " + view.sub));
        String asOf = model.asOf(now);
        if (asOf != null) {
            v.setTextViewText(R.id.stat_asof, asOf);
            v.setViewVisibility(R.id.stat_asof, View.VISIBLE);
        }

        switch (kind) {
            case "bars":
            case "line":
                drawChart(v, col, view, size, wDp, hDp, density, asOf != null);
                break;
            case "table":
                drawTable(v, col, view, size, hDp - (asOf != null ? 14 : 0));
                break;
            case "ring":
                drawRing(v, col, view, size, wDp, hDp, density);
                break;
            default:
                drawNumber(v, col, view, size);
        }
        return v;
    }

    private static void headline(RemoteViews v, WidgetColours col, StatsModel.View view, float sp) {
        v.setTextViewText(R.id.stat_headline, view.headline);
        v.setTextViewTextSize(R.id.stat_headline, TypedValue.COMPLEX_UNIT_SP, sp);
        col.set(v, R.id.stat_headline, "setTextColor", p -> p.ink);
        v.setTextViewText(R.id.stat_sub, view.sub);
        col.set(v, R.id.stat_sub, "setTextColor", p -> p.soft);
        v.setViewVisibility(R.id.stat_sub, view.sub.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private static void drawNumber(RemoteViews v, WidgetColours col, StatsModel.View view, StatsModel.Size size) {
        headline(v, col, view, size == StatsModel.Size.LARGE ? 44 : size == StatsModel.Size.WIDE ? 36 : 30);
        v.setInt(R.id.stat_sub, "setMaxLines", size == StatsModel.Size.SMALL ? 2 : 3);
    }

    private static void drawRing(RemoteViews v, WidgetColours col, StatsModel.View view, StatsModel.Size size, int wDp, int hDp, float density) {
        double progress = view.progress != null ? view.progress : 0;
        int ringDp;
        if (size == StatsModel.Size.SMALL) {
            // Only the ring, with the figure inside it.
            ringDp = Math.max(56, Math.min(wDp - 28, hDp - 44));
            v.setViewVisibility(R.id.text_col, View.GONE);
            v.setTextViewText(R.id.ring_text, view.headline);
            v.setTextViewTextSize(R.id.ring_text, TypedValue.COMPLEX_UNIT_SP, Math.max(14, Math.min(22, ringDp / 5f)));
            col.set(v, R.id.ring_text, "setTextColor", p -> p.ink);
        } else {
            ringDp = Math.max(56, Math.min(size == StatsModel.Size.LARGE ? wDp / 2 : wDp / 3, hDp - 44));
            v.setTextViewText(R.id.ring_text, "");
            headline(v, col, view, size == StatsModel.Size.LARGE ? 36 : 30);
            v.setViewPadding(R.id.text_col, Math.round(14 * density), 0, 0, 0);
        }
        StatsCharts.Layers layers = StatsCharts.ring(progress, ringDp, density);
        v.setViewVisibility(R.id.ring_box, View.VISIBLE);
        v.setImageViewBitmap(R.id.ring_track, layers.soft);
        v.setImageViewBitmap(R.id.ring_fill, layers.accent);
        col.set(v, R.id.ring_track, "setColorFilter", p -> p.rail);
        col.set(v, R.id.ring_fill, "setColorFilter", p -> p.accent);
        v.setContentDescription(R.id.ring_box, Math.round(progress * 100) + "% of the way");
    }

    private static void drawChart(RemoteViews v, WidgetColours col, StatsModel.View view, StatsModel.Size size, int wDp, int hDp, float density, boolean asOf) {
        boolean small = size == StatsModel.Size.SMALL;
        headline(v, col, view, small ? 22 : size == StatsModel.Size.LARGE ? 30 : 26);
        if (small) v.setViewVisibility(R.id.stat_sub, View.GONE);
        // What is left under the name and the figure, less the padding.
        int chartW = Math.max(60, wDp - 28);
        int chartH = Math.max(28, hDp - 20 - 18 - (small ? 28 : 36) - 6 - (asOf ? 14 : 0));
        List<StatsModel.Point> pts = view.points;
        boolean labels = StatsModel.labelled(size, pts.size()) && chartH >= 56;
        StatsCharts.Layers layers = "line".equals(view.kind)
            ? StatsCharts.line(pts, view.target, chartW, chartH, density, labels)
            : StatsCharts.bars(pts, view.target, chartW, chartH, density, labels);
        v.setImageViewBitmap(R.id.chart_soft, layers.soft);
        v.setImageViewBitmap(R.id.chart_accent, layers.accent);
        col.set(v, R.id.chart_soft, "setColorFilter", p -> p.soft);
        col.set(v, R.id.chart_accent, "setColorFilter", p -> p.accent);
        if (layers.colour != null) {
            v.setImageViewBitmap(R.id.chart_colour, layers.colour);
            v.setViewVisibility(R.id.chart_colour, View.VISIBLE);
        }
        v.setContentDescription(R.id.chart_box, describe(view));
    }

    private static void drawTable(RemoteViews v, WidgetColours col, StatsModel.View view, StatsModel.Size size, int hDp) {
        boolean head = size == StatsModel.Size.LARGE && !view.headline.isEmpty();
        if (head) {
            v.setViewVisibility(R.id.stat_headline, View.VISIBLE);
            v.setTextViewText(R.id.stat_headline, view.headline);
            col.set(v, R.id.stat_headline, "setTextColor", p -> p.ink);
        }
        int fit = StatsModel.tableRows(hDp - (head ? 32 : 0));
        int n = Math.min(fit, view.rows.size());
        if (n == 0) {
            v.setTextViewText(R.id.stat_message, view.headline.isEmpty() ? "Nothing to show yet." : view.headline);
            v.setViewVisibility(R.id.stat_message, View.VISIBLE);
            return;
        }
        boolean narrow = size == StatsModel.Size.SMALL;
        for (int i = 0; i < n; i++) {
            List<String> cells = view.rows.get(i);
            v.setViewVisibility(ROW[i], View.VISIBLE);
            for (int j = 0; j < 3; j++) {
                int id = CELL[i][j];
                // A narrow widget keeps the name and the first figure.
                boolean shown = j < cells.size() && !(narrow && j == 2);
                v.setViewVisibility(id, shown ? View.VISIBLE : View.GONE);
                if (!shown) continue;
                v.setTextViewText(id, cells.get(j));
                if (i == 0) {
                    // The heading: small and quiet.
                    v.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, 11);
                    col.set(v, id, "setTextColor", p -> p.soft);
                } else {
                    col.set(v, id, "setTextColor", p -> p.ink);
                }
            }
        }
    }

    /** The chart in words, for screen readers. */
    static String describe(StatsModel.View view) {
        StringBuilder b = new StringBuilder(view.kind.equals("line") ? "Line chart" : "Bar chart");
        int shown = 0;
        for (StatsModel.Point p : view.points) {
            if (p.value == null) continue;
            if (shown++ == 0) b.append(": ");
            else b.append(", ");
            b.append(p.label).append(' ').append(trim(p.value));
        }
        if (view.target != null) b.append(". Target ").append(trim(view.target));
        return b.toString();
    }

    private static String trim(double d) {
        if (d == Math.rint(d)) return String.valueOf((long) d);
        return String.valueOf(Math.round(d * 10) / 10.0);
    }

    /** Open the app at a path inside it. One PendingIntent per widget, so two
     *  widgets never share each other's link. */
    static PendingIntent open(Context context, int widgetId, String path) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("app.hemlo.planner://open" + path))
            .setClass(context, PlannerActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, widgetId, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent configure(Context context, int widgetId) {
        Intent intent = new Intent(context, StatsWidgetConfigure.class)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .setData(Uri.parse("hemlo-widget://configure/" + widgetId))
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, widgetId, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
