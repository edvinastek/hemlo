package app.hemlo.planner.widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * The saved stats views the app worked out for the home screen (WID-10), read
 * from the snapshot it wrote (StatsWidgetSnapshot in
 * src/lib/stats-widget-rules.ts), and what one stats widget shows. No Android
 * views here, so it runs in a plain JVM test (StatsModelTest).
 */
public final class StatsModel {

    public static final class Point {
        public final String label;
        /** null: no data then, drawn as a gap, never as 0. */
        public final Double value;
        /** 0 when the view gave none: drawn in the theme's accent. */
        public final int colour;

        Point(String label, Double value, int colour) {
            this.label = label;
            this.value = value;
            this.colour = colour;
        }
    }

    public static final class View {
        public final String id, name, kind, headline, sub, link;
        public final List<Point> points;
        /** Ring: 0 to 1. null when the view has none. */
        public final Double progress;
        public final Double target;
        /** Table: up to 6 rows of up to 3 cells, the first row the heading. */
        public final List<List<String>> rows;

        View(String id, String name, String kind, String headline, String sub, String link,
             List<Point> points, Double progress, Double target, List<List<String>> rows) {
            this.id = id; this.name = name; this.kind = kind; this.headline = headline; this.sub = sub; this.link = link;
            this.points = points; this.progress = progress; this.target = target; this.rows = rows;
        }
    }

    public static final String SIGNED_OUT = "Open Hemlo and sign in to see your stats here.";
    public static final String NONE_SAVED = "Save a view in Stats first.";
    public static final String GONE = "This view is no longer saved. Choose another in the widget’s settings.";

    /** null when the app has not written one (signed out, or never opened). */
    public final String writtenAt;
    public final List<View> views;
    public final boolean present;

    private StatsModel(boolean present, String writtenAt, List<View> views) {
        this.present = present;
        this.writtenAt = writtenAt;
        this.views = Collections.unmodifiableList(views);
    }

    public static StatsModel parse(String json) {
        if (json == null || json.isEmpty()) return new StatsModel(false, null, new ArrayList<>());
        try {
            JSONObject o = new JSONObject(json);
            List<View> out = new ArrayList<>();
            JSONArray vs = o.optJSONArray("views");
            if (vs != null) {
                for (int i = 0; i < vs.length(); i++) {
                    View v = view(vs.optJSONObject(i));
                    if (v != null) out.add(v);
                }
            }
            return new StatsModel(true, o.optString("written_at", null), out);
        } catch (Exception e) {
            return new StatsModel(false, null, new ArrayList<>());
        }
    }

    private static Double number(JSONObject o, String key) {
        if (o == null || !o.has(key) || o.isNull(key)) return null;
        double d = o.optDouble(key, Double.NaN);
        return Double.isNaN(d) || Double.isInfinite(d) ? null : d;
    }

    private static int colour(String v) {
        if (v == null || !v.matches("#[0-9a-fA-F]{6}")) return 0;
        return 0xFF000000 | Integer.parseInt(v.substring(1), 16);
    }

    private static View view(JSONObject o) {
        if (o == null) return null;
        String id = o.optString("id", "");
        if (id.isEmpty()) return null;
        String kind = o.optString("kind", "number");
        if (!kind.equals("number") && !kind.equals("ring") && !kind.equals("bars") && !kind.equals("line") && !kind.equals("table")) kind = "number";
        List<Point> points = new ArrayList<>();
        JSONArray ps = o.optJSONArray("points");
        if (ps != null) {
            for (int i = 0; i < ps.length() && points.size() < 31; i++) {
                JSONObject p = ps.optJSONObject(i);
                if (p == null) continue;
                points.add(new Point(p.optString("label", ""), number(p, "value"), colour(p.optString("colour", null))));
            }
        }
        List<List<String>> rows = new ArrayList<>();
        JSONArray rs = o.optJSONArray("rows");
        if (rs != null) {
            for (int i = 0; i < rs.length() && rows.size() < 6; i++) {
                JSONArray r = rs.optJSONArray(i);
                if (r == null) continue;
                List<String> cells = new ArrayList<>();
                for (int j = 0; j < r.length() && cells.size() < 3; j++) cells.add(r.optString(j, ""));
                rows.add(cells);
            }
        }
        Double progress = number(o, "progress");
        if (progress != null) progress = Math.max(0, Math.min(1, progress));
        String link = o.optString("link", "");
        // Only a path inside the app; anything else opens Stats.
        if (!link.startsWith("/") || link.startsWith("//")) link = "/stats";
        return new View(id, o.optString("name", ""), kind, o.optString("headline", ""), o.optString("sub", ""), link,
            points, progress, number(o, "target"), rows);
    }

    /** What one widget shows: its chosen view, or the first one when none was
     *  chosen yet (placed without the settings screen). */
    public static final class Shown {
        public final View view;
        public final String message;

        Shown(View view, String message) {
            this.view = view;
            this.message = message;
        }
    }

    public Shown pick(String chosenId) {
        if (!present) return new Shown(null, SIGNED_OUT);
        if (views.isEmpty()) return new Shown(null, NONE_SAVED);
        if (chosenId == null) return new Shown(views.get(0), null);
        for (View v : views) if (v.id.equals(chosenId)) return new Shown(v, null);
        return new Shown(null, GONE);
    }

    /** "As of Thu 1 Oct" when the figures are more than a day old: the app
     *  has not been opened to bring them up to date. */
    public String asOf(Date now) {
        if (writtenAt == null) return null;
        try {
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT);
            iso.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date at = iso.parse(writtenAt.length() >= 19 ? writtenAt.substring(0, 19) : writtenAt);
            if (at == null || now.getTime() - at.getTime() < 24L * 3600 * 1000) return null;
            return "As of " + new SimpleDateFormat("EEE d MMM", Locale.ENGLISH).format(at);
        } catch (Exception e) {
            return null;
        }
    }

    /** The widget's size, from Android's measure of it in dp. */
    public enum Size { SMALL, WIDE, LARGE }

    public static Size sizeFor(int widthDp, int heightDp) {
        if (heightDp >= 200) return Size.LARGE;
        if (widthDp >= 200) return Size.WIDE;
        return Size.SMALL;
    }

    /** How many table rows (heading included) fit a widget this tall; each
     *  is about 22 dp under a name line. */
    public static int tableRows(int heightDp) {
        int h = heightDp > 0 ? heightDp : 140;
        return Math.max(2, Math.min(6, (h - 48) / 22));
    }

    /** Points are labelled under the chart when there is room for the words. */
    public static boolean labelled(Size s, int points) {
        if (s == Size.SMALL) return false;
        return s == Size.LARGE || points <= 14;
    }
}
