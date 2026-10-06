package app.hemlo.planner.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import java.util.List;

/**
 * A tick on the widget. Not exported: only the widget's own PendingIntents,
 * sent with this app's identity, can reach it.
 */
public class TickReceiver extends BroadcastReceiver {
    static final String ACTION = "app.hemlo.planner.widget.TICK";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null) return;
        String kind = data.getAuthority();
        List<String> path = data.getPathSegments();
        if (path.size() != 3 || !WidgetModel.TICK_KINDS.contains(kind)) return;

        WidgetStore.tick(context, kind, path.get(0), path.get(1), "do".equals(path.get(2)));
        TodayWidget.refreshAll(context);
        // If the app is open, it applies the tick now instead of on next start.
        WidgetPlugin.ticked();
    }
}
