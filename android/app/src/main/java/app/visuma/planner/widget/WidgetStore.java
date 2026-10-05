package app.visuma.planner.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The widgets' copies of today and of the saved stats views, the theme they
 * draw in, and the ticks made on the Today widget that the app has not picked
 * up yet. All of it lives in private app storage, which the manifest already
 * keeps out of backups and device transfers. Signing out clears them.
 */
public final class WidgetStore {
    // Was getit_widget; renamed with the app id in version 21 (a new app id
    // starts with empty storage anyway, and nothing had been published).
    private static final String FILE = "visuma_widget";
    private static final String SNAPSHOT = "snapshot";
    private static final String TICKS = "ticks";
    private static final String LOOKS = "looks";
    private static final String STATS = "stats";
    /** Which saved stats view each stats widget shows: "view_<widget id>". */
    private static final String VIEW_PREFIX = "view_";
    /** A tick the app never collects (the app not opened for weeks) stops
     *  growing the queue here. The app applies the last per row anyway. */
    private static final int MAX_TICKS = 200;

    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public static synchronized String snapshot(Context c) {
        return prefs(c).getString(SNAPSHOT, null);
    }

    /** A new snapshot from the app, with any ticks it has not applied yet laid
     *  over it, so a tick on the widget never flickers back while waiting. */
    public static synchronized void putSnapshot(Context c, String json) {
        String merged = json;
        try {
            JSONObject snap = new JSONObject(json);
            JSONArray ticks = pending(c);
            for (int i = 0; i < ticks.length(); i++) apply(snap, ticks.getJSONObject(i));
            merged = snap.toString();
        } catch (Exception ignored) {
            // A snapshot that is not JSON is stored as given; the model shows
            // "sign in" for it rather than guessing.
        }
        prefs(c).edit().putString(SNAPSHOT, merged).apply();
    }

    /** Record a tick from the widget and show it at once. */
    public static synchronized void tick(Context c, String kind, String id, String day, boolean done) {
        try {
            JSONObject t = new JSONObject();
            t.put("kind", kind);
            t.put("id", id);
            t.put("day", day);
            t.put("done", done);
            t.put("at", isoNow());
            JSONArray ticks = pending(c);
            ticks.put(t);
            while (ticks.length() > MAX_TICKS) ticks.remove(0);

            SharedPreferences.Editor e = prefs(c).edit().putString(TICKS, ticks.toString());
            String s = snapshot(c);
            if (s != null) {
                JSONObject snap = new JSONObject(s);
                apply(snap, t);
                e.putString(SNAPSHOT, snap.toString());
            }
            e.apply();
        } catch (Exception ignored) {
            // Nothing sensible to show the person from a broadcast receiver;
            // the row simply does not change and they can tick it in the app.
        }
    }

    /** Hand the queued ticks to the app and forget them here. */
    public static synchronized JSONArray takeTicks(Context c) {
        JSONArray ticks = pending(c);
        prefs(c).edit().remove(TICKS).apply();
        return ticks;
    }

    /** Signing out forgets the day, the stats and waiting ticks. The theme
     *  and which view each stats widget was set to show belong to the phone
     *  and stay, so the widgets look right and keep their choice. */
    public static synchronized void clear(Context c) {
        prefs(c).edit().remove(SNAPSHOT).remove(TICKS).remove(STATS).apply();
    }

    public static synchronized String looks(Context c) {
        return prefs(c).getString(LOOKS, null);
    }

    public static synchronized void putLooks(Context c, String json) {
        prefs(c).edit().putString(LOOKS, json).apply();
    }

    public static synchronized String stats(Context c) {
        return prefs(c).getString(STATS, null);
    }

    public static synchronized void putStats(Context c, String json) {
        prefs(c).edit().putString(STATS, json).apply();
    }

    /** The saved view a stats widget shows, or null when none was chosen. */
    public static synchronized String statsView(Context c, int widgetId) {
        return prefs(c).getString(VIEW_PREFIX + widgetId, null);
    }

    public static synchronized void setStatsView(Context c, int widgetId, String viewId) {
        prefs(c).edit().putString(VIEW_PREFIX + widgetId, viewId).apply();
    }

    public static synchronized void forgetStatsView(Context c, int widgetId) {
        prefs(c).edit().remove(VIEW_PREFIX + widgetId).apply();
    }

    private static JSONArray pending(Context c) {
        try {
            return new JSONArray(prefs(c).getString(TICKS, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Set the done flag of the row a tick names, in the day it names. */
    static void apply(JSONObject snap, JSONObject tick) throws Exception {
        JSONObject days = snap.optJSONObject("days");
        if (days == null) return;
        JSONObject day = days.optJSONObject(tick.getString("day"));
        if (day == null) return;
        String kind = tick.getString("kind");
        String name = "task".equals(kind) ? "tasks" : "habit".equals(kind) ? "habits" : "items";
        JSONArray list = day.optJSONArray(name);
        if (list == null) return;
        for (int i = 0; i < list.length(); i++) {
            JSONObject row = list.getJSONObject(i);
            // Chores and supplement slots share the items list with rows of
            // other kinds; the kind keeps a chore and a slot apart.
            if ("items".equals(name) && !kind.equals(row.optString("kind"))) continue;
            if (tick.getString("id").equals(row.optString("id"))) row.put("done", tick.getBoolean("done"));
        }
    }

    private static String isoNow() {
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.ROOT);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return f.format(new java.util.Date());
    }
}
