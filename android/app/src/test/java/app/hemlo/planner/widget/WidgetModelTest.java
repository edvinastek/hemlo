package app.hemlo.planner.widget;

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

    // WID-02: the rest of the day, from the modules shown on the widget.
    private static String snapItems(String tasks, String habits, String items) {
        return "{\"v\":1,\"updated_at\":\"x\",\"days\":{\"" + DAY + "\":{\"tasks\":[" + tasks + "],\"habits\":[" + habits + "],\"items\":[" + items + "]}}}";
    }

    private static String item(String kind, String id, String time, boolean done, boolean tick, boolean late) {
        return "{\"kind\":\"" + kind + "\",\"id\":\"" + id + "\",\"title\":\"" + id + "\",\"time\":" + (time == null ? "null" : "\"" + time + "\"")
            + ",\"done\":" + done + ",\"tick\":" + tick + ",\"late\":" + late + "}";
    }

    @Test public void itemsSitAmongTheTasksByTime() {
        WidgetModel m = WidgetModel.build(snapItems(
            task("Standup", "09:00", false) + "," + task("Untimed", null, false),
            "",
            item("event", "Dentist", "14:00", false, false, false) + "," + item("chore", "Dishes", "19:00", false, true, false) + ","
                + item("supplements", "Morning supplements", "08:00", false, true, false) + "," + item("chore", "Bins", null, false, true, true)), DAY, 8);
        List<String> want = new ArrayList<>();
        want.add("SUPPLEMENTS:Morning supplements@08:00");
        want.add("TASK:Standup@09:00");
        want.add("EVENT:Dentist@14:00");
        want.add("CHORE:Dishes@19:00");
        want.add("TASK:Untimed");
        want.add("CHORE:Bins(late)");
        assertEquals(want, rows(m));
        // Events are on the day but not to do.
        assertEquals("5 left", m.summary);
    }

    @Test public void doneItemsGoWithTheDoneTasks() {
        WidgetModel m = WidgetModel.build(snapItems(task("Run", "07:00", true), "",
            item("chore", "Dishes", "19:00", true, true, false)), DAY, 8);
        assertEquals("All done", m.summary);
        assertEquals("TASK:Run(done)@07:00", m.rows.get(0).toString());
        assertEquals("CHORE:Dishes(done)@19:00", m.rows.get(1).toString());
    }

    @Test public void onlyChoresAndSlotsHaveTicks() {
        WidgetModel m = WidgetModel.build(snapItems("", "",
            item("record", "Weigh-in", null, false, false, false) + "," + item("chore", "Fake", null, true, false, false) + ","
                + item("surprise", "From a newer app", null, false, true, false)), DAY, 8);
        assertEquals(2, m.rows.size());
        for (WidgetModel.Row r : m.rows) assertEquals(false, r.tickable());
        // A chore without a tick is shown, never ticked, and never shown done.
        assertEquals("RECORD:Fake", m.rows.get(1).toString());
        assertEquals("", m.summary);
    }

    @Test public void tickKindsAreTheFour() {
        assertEquals(4, WidgetModel.TICK_KINDS.size());
        assertEquals(true, WidgetModel.TICK_KINDS.contains("supplements"));
        assertEquals(false, WidgetModel.TICK_KINDS.contains("event"));
    }

    // LOOK-09: the widget's colours come from the app's theme.
    @Test public void coloursFollowTheApp() {
        WidgetColours none = WidgetColours.parse(null, true);
        assertEquals(WidgetColours.DARK.paper, none.now().paper);
        assertEquals(WidgetColours.LIGHT.paper, WidgetColours.parse(null, false).now().paper);

        String ub = "{\"v\":1,\"mode\":\"black\",\"light\":{\"paper\":\"#f6f2f5\"},\"dark\":{\"paper\":\"#000000\",\"accent\":\"#ffa500\",\"ink\":\"nonsense\"}}";
        WidgetColours c = WidgetColours.parse(ub, false);
        assertEquals(true, c.night());
        assertEquals(0xFF000000, c.now().paper);
        assertEquals(0xFFFFA500, c.now().accent);
        assertEquals(WidgetColours.DARK.ink, c.now().ink);

        WidgetColours light = WidgetColours.parse("{\"mode\":\"light\"}", true);
        assertEquals(false, light.night());
        WidgetColours follows = WidgetColours.parse("{\"mode\":\"system\"}", true);
        assertEquals(true, follows.night());
        assertEquals(WidgetColours.LIGHT.paper, WidgetColours.parse("not json", false).now().paper);
    }
}
