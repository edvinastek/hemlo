package app.getit.planner.widget;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.lang.ref.WeakReference;

/**
 * The app's side of the widgets (src/lib/widget.ts): write the Today and stats
 * snapshots and the theme, collect the ticks made on the Today widget, and
 * clear the data on sign-out.
 */
@CapacitorPlugin(name = "GetItWidget")
public class WidgetPlugin extends Plugin {

    private static WeakReference<WidgetPlugin> live = new WeakReference<>(null);

    @Override
    public void load() {
        live = new WeakReference<>(this);
    }

    /** Called by TickReceiver: tell a running app there are ticks to collect. */
    static void ticked() {
        WidgetPlugin p = live.get();
        if (p != null) p.notifyListeners("tick", new JSObject());
    }

    @PluginMethod
    public void update(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        WidgetStore.putSnapshot(getContext(), snapshot);
        TodayWidget.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takeTicks(PluginCall call) {
        JSONArray ticks = WidgetStore.takeTicks(getContext());
        JSObject out = new JSObject();
        try {
            out.put("ticks", new JSArray(ticks.toString()));
        } catch (Exception e) {
            out.put("ticks", new JSArray());
        }
        call.resolve(out);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        WidgetStore.clear(getContext());
        TodayWidget.refreshAll(getContext());
        StatsWidget.refreshAll(getContext());
        call.resolve();
    }

    /** The app's theme, both shades and the mode (WidgetLooks): every widget
     *  redraws in it at once. */
    @PluginMethod
    public void setLooks(PluginCall call) {
        String looks = call.getString("looks");
        if (looks == null) {
            call.reject("looks is required");
            return;
        }
        WidgetStore.putLooks(getContext(), looks);
        TodayWidget.refreshAll(getContext());
        StatsWidget.refreshAll(getContext());
        call.resolve();
    }

    /** Every saved stats view, worked out (StatsWidgetSnapshot). */
    @PluginMethod
    public void updateStats(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        WidgetStore.putStats(getContext(), snapshot);
        StatsWidget.refreshAll(getContext());
        call.resolve();
    }
}
