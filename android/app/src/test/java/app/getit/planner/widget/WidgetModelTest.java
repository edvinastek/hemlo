package app.getit.planner.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/** What the widget draws for a given snapshot, day and size. */
public class WidgetModelTest {

    private static final String DAY = "2026-09-25";

    private static String snap(String tasks, String habits) {
        return "{\"v\":1,\"updated_at\":\"x\",\"days\":{\"" + DAY + "\":{\"tasks\":[" + tasks + "],\"habits\":[" + habits + "]}}}";
    }

    private static String task(String id, String time, boolean done) {
        return "{\"id\":\"" + id + "\",\"title\":\"" + id + "\",\"time\":" + (time == null ? "null" : "\"" + time + "\"") + ",\"done\":" + done + "}";
    }

    private static String habit(String id, boolean done) {
        return "{\"id\":\"" + id + "\",\"name\":\"" + id + "\",\"done\":" + done + "}";
    }

    private static List<String> rows(WidgetModel m) {
        List<String> out = new ArrayList<>();
        for (WidgetModel.Row r : m.rows) out.add(r.toString());
        return out;
    }

    @Test public void signedOutShowsSignIn() {
        assertEquals(WidgetModel.SIGNED_OUT, WidgetModel.build(null, DAY, 5).message);
        assertEquals(WidgetModel.SIGNED_OUT, WidgetModel.build("not json", DAY, 5).message);
    }

    @Test public void aDayNotInTheSnapshotAsksToOpenTheApp() {
        assertEquals(WidgetModel.STALE, WidgetModel.build(snap("", ""), "2026-09-28", 5).message);
    }

    @Test public void openTasksThenHabits() {
        WidgetModel m = WidgetModel.build(snap(
            task("Standup", "09:00", false) + "," + task("Lunch", "12:00", false) + "," + task("Gym", "17:30", false),
            habit("Stretch", true) + "," + habit("Walk", false)), DAY, 6);
        assertNull(m.message);
        assertEquals("3 left", m.summary);
        assertEquals(List.of("TASK:Standup@09:00", "TASK:Lunch@12:00", "TASK:Gym@17:30", "LABEL:Habits", "HABIT:Stretch(done)", "HABIT:Walk"), rows(m));
    }

    @Test public void habitsGetUpToHalfWhenTasksAreMany() {
        StringBuilder t = new StringBuilder();
        for (int i = 0; i < 9; i++) t.append(i > 0 ? "," : "").append(task("t" + i, "1" + i + ":00", false));
        WidgetModel m = WidgetModel.build(snap(t.toString(), habit("a", false) + "," + habit("b", false) + "," + habit("c", false) + "," + habit("d", false) + "," + habit("e", false)), DAY, 8);
        assertEquals(List.of("TASK:t0@10:00", "TASK:t1@11:00", "TASK:t2@12:00", "LABEL:Habits", "HABIT:a", "HABIT:b", "HABIT:c", "HABIT:d"), rows(m));
        assertEquals(6, m.hiddenOpen);
    }

    @Test public void spareRowsGoToHabitsThenDoneTasksAboveThem() {
        WidgetModel m = WidgetModel.build(snap(
            task("Done", "07:00", true) + "," + task("Open", "09:00", false),
            habit("a", false)), DAY, 6);
        assertEquals(List.of("TASK:Open@09:00", "TASK:Done(done)@07:00", "LABEL:Habits", "HABIT:a"), rows(m));
    }

    @Test public void allDoneSaysSo() {
        WidgetModel m = WidgetModel.build(snap(task("A", null, true), ""), DAY, 5);
        assertEquals("All done", m.summary);
        assertEquals(List.of("TASK:A(done)"), rows(m));
    }

    @Test public void nothingPlannedStillShowsHabits() {
        WidgetModel m = WidgetModel.build(snap("", habit("Stretch", false)), DAY, 5);
        assertEquals("", m.summary);
        assertEquals(List.of("NOTE:" + WidgetModel.EMPTY, "LABEL:Habits", "HABIT:Stretch"), rows(m));
    }

    @Test public void aTinyWidgetShowsOnlyTheNextTask() {
        WidgetModel m = WidgetModel.build(snap(task("A", "08:00", false) + "," + task("B", "09:00", false), habit("h", false)), DAY, 1);
        assertEquals(List.of("TASK:A@08:00"), rows(m));
    }

    @Test public void neverMoreRowsThanSlots() {
        StringBuilder t = new StringBuilder();
        StringBuilder h = new StringBuilder();
        for (int i = 0; i < 30; i++) {
            t.append(i > 0 ? "," : "").append(task("t" + i, null, i % 2 == 0));
            h.append(i > 0 ? "," : "").append(habit("h" + i, false));
        }
        for (int slots = 1; slots <= TodayWidget.SLOTS; slots++) {
            assertEquals(slots, WidgetModel.build(snap(t.toString(), h.toString()), DAY, slots).rows.size());
        }
    }

    @Test public void aTickIsLaidOverTheSnapshot() throws Exception {
        JSONObject s = new JSONObject(snap(task("A", "08:00", false), habit("A", false)));
        WidgetStore.apply(s, new JSONObject("{\"kind\":\"habit\",\"id\":\"A\",\"day\":\"" + DAY + "\",\"done\":true}"));
        WidgetModel m = WidgetModel.build(s.toString(), DAY, 5);
        assertEquals(List.of("TASK:A@08:00", "LABEL:Habits", "HABIT:A(done)"), rows(m));
    }
}
