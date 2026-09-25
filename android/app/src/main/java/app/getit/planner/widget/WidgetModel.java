package app.getit.planner.widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * What one widget shows, worked out from the snapshot the app wrote. No Android
 * views here, so it runs in a plain JVM test (WidgetModelTest).
 *
 * The widget has a fixed number of rows for its size. Open tasks come first in
 * time order, then the day's habits under a "Habits" label, then tasks already
 * done if there is room. Habits keep their own order whether ticked or not, so
 * a row never jumps away from the finger that just ticked it.
 */
public final class WidgetModel {

    public enum Kind { TASK, HABIT, LABEL, NOTE }

    public static final class Row {
        public final Kind kind;
        public final String id;
        public final String text;
        public final String time;
        public final boolean done;

        Row(Kind kind, String id, String text, String time, boolean done) {
            this.kind = kind;
            this.id = id;
            this.text = text;
            this.time = time;
            this.done = done;
        }

        @Override public String toString() {
            return kind + ":" + text + (done ? "(done)" : "") + (time != null ? "@" + time : "");
        }
    }

    /** Shown instead of rows when there is nothing to draw from. */
    public final String message;
    /** "3 left", "All done", or empty. */
    public final String summary;
    public final List<Row> rows;
    /** How many open tasks did not fit; the app has them. */
    public final int hiddenOpen;

    private WidgetModel(String message, String summary, List<Row> rows, int hiddenOpen) {
        this.message = message;
        this.summary = summary;
        this.rows = Collections.unmodifiableList(rows);
        this.hiddenOpen = hiddenOpen;
    }

    public static final String SIGNED_OUT = "Open GetIt and sign in to see your day here.";
    public static final String STALE = "Open GetIt to bring today up to date.";
    public static final String EMPTY = "Nothing planned today.";

    /**
     * @param snapshotJson what the app last wrote, or null when signed out
     * @param day          today on this phone, as yyyy-MM-dd
     * @param slots        rows the widget has room for at its current size
     */
    public static WidgetModel build(String snapshotJson, String day, int slots) {
        if (snapshotJson == null || snapshotJson.isEmpty()) {
            return new WidgetModel(SIGNED_OUT, "", new ArrayList<>(), 0);
        }
        JSONObject today;
        try {
            JSONObject days = new JSONObject(snapshotJson).getJSONObject("days");
            today = days.optJSONObject(day);
        } catch (Exception e) {
            return new WidgetModel(SIGNED_OUT, "", new ArrayList<>(), 0);
        }
        // The snapshot holds today and tomorrow; a phone left alone for two days
        // has neither, and an empty widget would read as "nothing planned".
        if (today == null) return new WidgetModel(STALE, "", new ArrayList<>(), 0);

        List<Row> open = new ArrayList<>();
        List<Row> done = new ArrayList<>();
        JSONArray tasks = today.optJSONArray("tasks");
        if (tasks != null) {
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t == null) continue;
                String time = t.isNull("time") ? null : t.optString("time", null);
                Row r = new Row(Kind.TASK, t.optString("id"), t.optString("title"), time, t.optBoolean("done"));
                (r.done ? done : open).add(r);
            }
        }
        List<Row> habits = new ArrayList<>();
        JSONArray hs = today.optJSONArray("habits");
        if (hs != null) {
            for (int i = 0; i < hs.length(); i++) {
                JSONObject h = hs.optJSONObject(i);
                if (h == null) continue;
                habits.add(new Row(Kind.HABIT, h.optString("id"), h.optString("name"), null, h.optBoolean("done")));
            }
        }

        String summary;
        if (open.isEmpty() && done.isEmpty()) summary = "";
        else if (open.isEmpty()) summary = "All done";
        else summary = open.size() + " left";

        int n = Math.max(1, slots);
        List<Row> rows = new ArrayList<>();

        // Room for habits: up to half the rows, at least one when there are any
        // and the widget has three rows or more, plus their label.
        int habitRows = 0;
        if (!habits.isEmpty() && n >= 3) habitRows = Math.min(habits.size(), Math.max(1, n / 2));
        int taskRows = n - (habitRows > 0 ? habitRows + 1 : 0);

        int shownOpen = Math.min(open.size(), taskRows);
        rows.addAll(open.subList(0, shownOpen));
        if (open.isEmpty() && done.isEmpty()) {
            rows.add(new Row(Kind.NOTE, "", EMPTY, null, false));
        }
        // Rows the tasks left free go to habits first, then to tasks already
        // done, which sit with the other tasks above the habits.
        int spare = taskRows - rows.size();
        if (habitRows > 0 && spare > 0) habitRows = Math.min(habits.size(), habitRows + spare);
        int room = n - rows.size() - (habitRows > 0 ? habitRows + 1 : 0);
        if (room > 0 && !done.isEmpty()) rows.addAll(done.subList(0, Math.min(room, done.size())));
        if (habitRows > 0) {
            rows.add(new Row(Kind.LABEL, "", "Habits", null, false));
            rows.addAll(habits.subList(0, habitRows));
        }

        return new WidgetModel(null, summary, rows, open.size() - shownOpen);
    }
}
