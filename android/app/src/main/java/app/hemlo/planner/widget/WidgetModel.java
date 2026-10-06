package app.hemlo.planner.widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * What one widget shows, worked out from the snapshot the app wrote. No Android
 * views here, so it runs in a plain JVM test (WidgetModelTest).
 *
 * The widget has a fixed number of rows for its size. What is still to do
 * comes first in time order: open tasks, chores and supplement slots, with
 * the day's events and dated records among them (WID-02); then the day's
 * habits under a "Habits" label; then what is already done, if there is
 * room. Habits keep their own order whether ticked or not, so a row never
 * jumps away from the finger that just ticked it.
 */
public final class WidgetModel {

    public enum Kind { TASK, HABIT, CHORE, SUPPLEMENTS, EVENT, RECORD, LABEL, NOTE }

    /** The kinds a tick on the widget may name (TickReceiver checks it). */
    public static final Set<String> TICK_KINDS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList("task", "habit", "chore", "supplements")));

    public static final class Row {
        public final Kind kind;
        public final String id;
        public final String text;
        public final String time;
        public final boolean done;
        /** A chore that has waited past its day. */
        public final boolean late;

        Row(Kind kind, String id, String text, String time, boolean done, boolean late) {
            this.kind = kind;
            this.id = id;
            this.text = text;
            this.time = time;
            this.done = done;
            this.late = late;
        }

        Row(Kind kind, String id, String text, String time, boolean done) {
            this(kind, id, text, time, done, false);
        }

        /** Has a tick box. */
        public boolean tickable() {
            return kind == Kind.TASK || kind == Kind.HABIT || kind == Kind.CHORE || kind == Kind.SUPPLEMENTS;
        }

        /** The word a tick on this row carries to the app. */
        public String tickKind() {
            switch (kind) {
                case TASK: return "task";
                case HABIT: return "habit";
                case CHORE: return "chore";
                case SUPPLEMENTS: return "supplements";
                default: return null;
            }
        }

        @Override public String toString() {
            return kind + ":" + text + (done ? "(done)" : "") + (late ? "(late)" : "") + (time != null ? "@" + time : "");
        }
    }

    /** Shown instead of rows when there is nothing to draw from. */
    public final String message;
    /** "3 left", "All done", or empty. */
    public final String summary;
    public final List<Row> rows;
    /** How many open rows did not fit; the app has them. */
    public final int hiddenOpen;

    private WidgetModel(String message, String summary, List<Row> rows, int hiddenOpen) {
        this.message = message;
        this.summary = summary;
        this.rows = Collections.unmodifiableList(rows);
        this.hiddenOpen = hiddenOpen;
    }

    public static final String SIGNED_OUT = "Open Hemlo and sign in to see your day here.";
    public static final String STALE = "Open Hemlo to bring today up to date.";
    public static final String EMPTY = "Nothing planned today.";

    private static String time(JSONObject o) {
        return o.isNull("time") ? null : o.optString("time", null);
    }

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
                Row r = new Row(Kind.TASK, t.optString("id"), t.optString("title"), time(t), t.optBoolean("done"));
                (r.done ? done : open).add(r);
            }
        }
        // Everything else the day holds, from the modules shown on the widget.
        JSONArray items = today.optJSONArray("items");
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject t = items.optJSONObject(i);
                if (t == null) continue;
                Kind kind;
                switch (t.optString("kind")) {
                    case "chore": kind = Kind.CHORE; break;
                    case "supplements": kind = Kind.SUPPLEMENTS; break;
                    case "event": kind = Kind.EVENT; break;
                    case "record": kind = Kind.RECORD; break;
                    default: continue; // a kind from a newer app: left out, not guessed at
                }
                boolean tick = t.optBoolean("tick") && (kind == Kind.CHORE || kind == Kind.SUPPLEMENTS);
                if (!tick && (kind == Kind.CHORE || kind == Kind.SUPPLEMENTS)) kind = Kind.RECORD;
                Row r = new Row(kind, t.optString("id"), t.optString("title"), time(t), tick && t.optBoolean("done"), t.optBoolean("late"));
                (r.done ? done : open).add(r);
            }
        }
        // By time, untimed last; the sort keeps tasks before the other rows at
        // the same time, as the app does.
        Comparator<Row> byTime = (a, b) -> (a.time != null ? a.time : "99:99").compareTo(b.time != null ? b.time : "99:99");
        Collections.sort(open, byTime);

        List<Row> habits = new ArrayList<>();
        JSONArray hs = today.optJSONArray("habits");
        if (hs != null) {
            for (int i = 0; i < hs.length(); i++) {
                JSONObject h = hs.optJSONObject(i);
                if (h == null) continue;
                habits.add(new Row(Kind.HABIT, h.optString("id"), h.optString("name"), null, h.optBoolean("done")));
            }
        }

        int openToDo = 0;
        for (Row r : open) if (r.tickable()) openToDo++;
        String summary;
        if (openToDo == 0 && done.isEmpty()) summary = "";
        else if (openToDo == 0) summary = "All done";
        else summary = openToDo + " left";

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
        // Rows the day left free go to habits first, then to what is already
        // done, which sits with the rest of the day above the habits.
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
