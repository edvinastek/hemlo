package app.getit.planner.quickadd;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import java.util.List;

import app.getit.planner.R;
import app.getit.planner.widget.WidgetColours;

/**
 * GetIt · Quick add on the home screen (WID-11): a button for each of the +
 * menu's first entries (QuickAdd), each opening the app on that entry's sheet.
 * As many buttons as the widget is wide enough for: two at two cells, three
 * at three, four at four. Drawn in the app's theme, as the Today widget is.
 */
public class QuickAddWidget extends AppWidgetProvider {

    private static final int[] SLOT = { R.id.qa_0, R.id.qa_1, R.id.qa_2, R.id.qa_3 };
    private static final int[] ICON = { R.id.qa_icon_0, R.id.qa_icon_1, R.id.qa_icon_2, R.id.qa_icon_3 };
    private static final int[] TEXT = { R.id.qa_text_0, R.id.qa_text_1, R.id.qa_text_2, R.id.qa_text_3 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) draw(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, id);
    }

    /** Redraw every quick-add widget: after a new list or theme from the app,
     *  and after sign-out. */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, QuickAddWidget.class));
        for (int id : ids) draw(context, manager, id);
    }

    static void draw(Context context, AppWidgetManager manager, int id) {
        Bundle options = manager.getAppWidgetOptions(id);
        // In portrait a widget gets its minimum width.
        int widthDp = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        manager.updateAppWidget(id, render(context, widthDp));
    }

    /** How many buttons fit a widget this wide; an unknown width gets all four. */
    static int buttonsFor(int widthDp) {
        if (widthDp <= 0) return QuickAdd.SIZE;
        if (widthDp < 170) return 2;
        if (widthDp < 240) return 3;
        return QuickAdd.SIZE;
    }

    static RemoteViews render(Context context, int widthDp) {
        List<QuickAdd.Item> items = QuickAdd.items(context);
        WidgetColours col = WidgetColours.load(context);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_quickadd);
        col.set(v, R.id.bg, "setColorFilter", p -> p.paper);

        int shown = Math.min(items.size(), buttonsFor(widthDp));
        for (int i = 0; i < SLOT.length; i++) {
            if (i >= shown) {
                v.setViewVisibility(SLOT[i], View.GONE);
                continue;
            }
            QuickAdd.Item item = items.get(i);
            v.setViewVisibility(SLOT[i], View.VISIBLE);
            v.setImageViewResource(ICON[i], QuickAdd.glyphFor(item.key));
            col.set(v, ICON[i], "setColorFilter", p -> p.accent);
            v.setTextViewText(TEXT[i], item.shortLabel);
            col.set(v, TEXT[i], "setTextColor", p -> p.ink);
            // The button is read as one: "Add task to Inbox".
            v.setContentDescription(SLOT[i], "Add " + QuickAdd.lower(item.label));
            v.setOnClickPendingIntent(SLOT[i], open(context, item.key));
        }
        return v;
    }

    /** One PendingIntent per entry: the link keeps them apart. */
    private static PendingIntent open(Context context, String key) {
        return PendingIntent.getActivity(context, 0, QuickAdd.openIntent(context, key),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
