package app.hemlo.planner.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import app.hemlo.planner.PlannerActivity;
import app.hemlo.planner.R;

/**
 * Hemlo · Today on the home screen. Draws from the snapshot the app wrote
 * (WidgetStore), in the app's theme (WidgetColours); ticks go to TickReceiver,
 * which is not exported, so no other app can tick anything here.
 */
public class TodayWidget extends AppWidgetProvider {

    static final int SLOTS = 8;
    private static final int[] ROW = { R.id.row_0, R.id.row_1, R.id.row_2, R.id.row_3, R.id.row_4, R.id.row_5, R.id.row_6, R.id.row_7 };
    private static final int[] TICK = { R.id.tick_0, R.id.tick_1, R.id.tick_2, R.id.tick_3, R.id.tick_4, R.id.tick_5, R.id.tick_6, R.id.tick_7 };
    private static final int[] TIME = { R.id.time_0, R.id.time_1, R.id.time_2, R.id.time_3, R.id.time_4, R.id.time_5, R.id.time_6, R.id.time_7 };
    private static final int[] TEXT = { R.id.text_0, R.id.text_1, R.id.text_2, R.id.text_3, R.id.text_4, R.id.text_5, R.id.text_6, R.id.text_7 };
    private static final int[] DONE = { R.id.done_0, R.id.done_1, R.id.done_2, R.id.done_3, R.id.done_4, R.id.done_5, R.id.done_6, R.id.done_7 };
    private static final int[] LABEL = { R.id.label_0, R.id.label_1, R.id.label_2, R.id.label_3, R.id.label_4, R.id.label_5, R.id.label_6, R.id.label_7 };

    /** Header, rule and padding take about this much; each row is 34 dp. */
    private static final int CHROME_DP = 58;
    private static final int ROW_DP = 34;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) draw(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, id);
    }

    /** Redraw every Hemlo widget on the home screen: after the app writes a
     *  new snapshot, after a tick, after sign-out. */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidget.class));
        for (int id : ids) draw(context, manager, id);
    }

    static void draw(Context context, AppWidgetManager manager, int id) {
        Bundle options = manager.getAppWidgetOptions(id);
        // In portrait a widget gets its minimum width and its maximum height.
        int heightDp = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
        int widthDp = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        manager.updateAppWidget(id, render(context, heightDp, widthDp, new Date()));
    }

    /** How many rows fit a widget this tall; an unknown height gets the
     *  default 3-cell size. */
    static int slotsFor(int heightDp) {
        if (heightDp <= 0) return 5;
        return Math.max(1, Math.min(SLOTS, (heightDp - CHROME_DP) / ROW_DP));
    }

    static String dayOf(Date now) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(now);
    }

    static RemoteViews render(Context context, int heightDp, int widthDp, Date now) {
        String day = dayOf(now);
        WidgetModel model = WidgetModel.build(WidgetStore.snapshot(context), day, slotsFor(heightDp));
        WidgetColours col = WidgetColours.load(context);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_today);

        // The app's theme over the layout's default colours (LOOK-09).
        col.set(v, R.id.bg, "setColorFilter", p -> p.paper);
        col.set(v, R.id.date, "setTextColor", p -> p.ink);
        col.set(v, R.id.summary, "setTextColor", p -> p.soft);
        col.set(v, R.id.rule, "setBackgroundColor", p -> p.rule);
        col.set(v, R.id.message, "setTextColor", p -> p.soft);

        // The app is English throughout, so the date is too.
        String pattern = widthDp > 0 && widthDp < 240 ? "EEE d MMM" : "EEEE d MMMM";
        v.setTextViewText(R.id.date, new SimpleDateFormat(pattern, Locale.ENGLISH).format(now));
        v.setTextViewText(R.id.summary, model.summary);
        v.setOnClickPendingIntent(R.id.widget_root, openApp(context));
        v.setOnClickPendingIntent(R.id.header, openApp(context));

        if (model.message != null) {
            v.setTextViewText(R.id.message, model.message);
            v.setViewVisibility(R.id.message, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.message, View.GONE);
        }

        for (int i = 0; i < SLOTS; i++) {
            if (i >= model.rows.size()) {
                v.setViewVisibility(ROW[i], View.GONE);
                continue;
            }
            WidgetModel.Row r = model.rows.get(i);
            v.setViewVisibility(ROW[i], View.VISIBLE);
            // A habit's row opens that habit on the Habits page, with its
            // pinned note and today's checklist (HAB-11); other rows open the app.
            v.setOnClickPendingIntent(ROW[i], r.kind == WidgetModel.Kind.HABIT && r.id != null && !r.id.isEmpty()
                ? openPath(context, "/m/habits?open=" + Uri.encode(r.id)) : openApp(context));
            boolean item = r.kind != WidgetModel.Kind.LABEL && r.kind != WidgetModel.Kind.NOTE;
            boolean timed = item && r.kind != WidgetModel.Kind.HABIT;

            v.setViewVisibility(LABEL[i], r.kind == WidgetModel.Kind.LABEL ? View.VISIBLE : View.GONE);
            v.setViewVisibility(TICK[i], item ? View.VISIBLE : View.GONE);
            v.setViewVisibility(TIME[i], timed ? View.VISIBLE : View.GONE);
            v.setViewVisibility(TEXT[i], (item && !r.done) || r.kind == WidgetModel.Kind.NOTE ? View.VISIBLE : View.GONE);
            v.setViewVisibility(DONE[i], item && r.done ? View.VISIBLE : View.GONE);
            col.set(v, LABEL[i], "setTextColor", p -> p.soft);
            col.set(v, TIME[i], "setTextColor", p -> p.soft);
            col.set(v, DONE[i], "setTextColor", p -> p.soft);
            // A chore waiting past its day reads in the warning colour.
            col.set(v, TEXT[i], "setTextColor", r.late ? (p -> p.warn) : r.kind == WidgetModel.Kind.NOTE ? (p -> p.soft) : (p -> p.ink));

            if (r.kind == WidgetModel.Kind.LABEL) {
                v.setTextViewText(LABEL[i], r.text);
                continue;
            }
            if (r.kind == WidgetModel.Kind.NOTE) {
                v.setTextViewText(TEXT[i], r.text);
                continue;
            }
            v.setTextViewText(TIME[i], r.time != null ? r.time : "");
            if (r.done) {
                SpannableString struck = new SpannableString(r.text);
                struck.setSpan(new StrikethroughSpan(), 0, r.text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                v.setTextViewText(DONE[i], struck);
            } else {
                v.setTextViewText(TEXT[i], r.text);
            }
            if (!r.tickable()) {
                // An event or a record: a mark in the tick's place, nothing to tick.
                v.setImageViewResource(TICK[i], R.drawable.widget_mark);
                col.set(v, TICK[i], "setColorFilter", p -> p.soft);
                v.setContentDescription(TICK[i], r.kind == WidgetModel.Kind.EVENT ? "Event" : "Entry");
                v.setOnClickPendingIntent(TICK[i], openApp(context));
                continue;
            }
            v.setImageViewResource(TICK[i], r.done ? R.drawable.widget_tick_on : R.drawable.widget_tick_off);
            // An open box in the labels' colour, so it reads at 3:1 or more on every theme.
            col.set(v, TICK[i], "setColorFilter", r.done ? (p -> p.accent) : (p -> p.soft));
            v.setContentDescription(TICK[i], (r.done ? "Untick " : "Tick ") + r.text);
            v.setOnClickPendingIntent(TICK[i], tick(context, r, day));
        }
        return v;
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, PlannerActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Open the app at a path inside it (app.hemlo.planner://open/...), which
     *  the app routes (widget.ts openWidgetLink). The data URI keeps each
     *  row's intent apart from the others'. */
    private static PendingIntent openPath(Context context, String path) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("app.hemlo.planner://open" + path))
            .setClass(context, PlannerActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** One PendingIntent per row and state: the data URI keeps them apart, so
     *  ticking one row can never send another row's intent. */
    private static PendingIntent tick(Context context, WidgetModel.Row r, String day) {
        String kind = r.tickKind();
        Intent intent = new Intent(context, TickReceiver.class)
            .setAction(TickReceiver.ACTION)
            .setData(new Uri.Builder().scheme("hemlo-widget").authority(kind)
                .appendPath(r.id).appendPath(day).appendPath(r.done ? "undo" : "do").build());
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
