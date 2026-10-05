package app.visuma.planner.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Date;

/** What a stats widget shows for a given snapshot and choice (WID-10). */
public class StatsModelTest {

    static final String SNAP = "{\"v\":1,\"written_at\":\"2026-10-02T08:00:00.000Z\",\"views\":["
        + "{\"id\":\"p\",\"name\":\"Protein, this week\",\"kind\":\"bars\",\"headline\":\"142 g\",\"sub\":\"A day on average\","
        + "\"points\":[{\"label\":\"Mon\",\"value\":130},{\"label\":\"Tue\",\"value\":null},{\"label\":\"Wed\",\"value\":151,\"colour\":\"#ce710c\"}],"
        + "\"target\":150,\"link\":\"/stats?view=p\"},"
        + "{\"id\":\"r\",\"name\":\"Habits\",\"kind\":\"ring\",\"headline\":\"3 of 5\",\"sub\":\"\",\"points\":[],\"progress\":1.7,\"link\":\"https://evil.example\"},"
        + "{\"id\":\"t\",\"name\":\"Chores\",\"kind\":\"table\",\"headline\":\"\",\"sub\":\"\",\"points\":[],"
        + "\"rows\":[[\"Who\",\"Done\",\"Due\"],[\"Sam\",\"4\",\"1\"],[\"Alex\",\"3\",\"2\",\"extra\"]],\"link\":\"/stats?view=t\"},"
        + "{\"id\":\"\",\"name\":\"no id\"},"
        + "{\"id\":\"x\",\"name\":\"Odd\",\"kind\":\"pie\",\"headline\":\"1\",\"sub\":\"\",\"points\":[],\"link\":\"/stats\"}]}";

    @Test public void readsTheViews() {
        StatsModel m = StatsModel.parse(SNAP);
        assertEquals(4, m.views.size());
        StatsModel.View p = m.views.get(0);
        assertEquals("bars", p.kind);
        assertEquals(3, p.points.size());
        assertNull(p.points.get(1).value);
        assertEquals(0, p.points.get(0).colour);
        assertEquals(0xFFCE710C, p.points.get(2).colour);
        assertEquals(150.0, p.target, 0);
    }

    @Test public void keepsWhatIsDrawableAndSafe() {
        StatsModel m = StatsModel.parse(SNAP);
        assertEquals(1.0, m.views.get(1).progress, 0);
        // A link out of the app opens Stats instead.
        assertEquals("/stats", m.views.get(1).link);
        assertEquals(3, m.views.get(2).rows.get(2).size());
        // An unknown kind is drawn as a figure.
        assertEquals("number", m.views.get(3).kind);
    }

    @Test public void picksTheChosenViewOrSaysWhy() {
        StatsModel m = StatsModel.parse(SNAP);
        assertEquals("r", m.pick("r").view.id);
        assertEquals("p", m.pick(null).view.id);
        assertEquals(StatsModel.GONE, m.pick("deleted").message);
        assertEquals(StatsModel.NONE_SAVED, StatsModel.parse("{\"v\":1,\"written_at\":\"x\",\"views\":[]}").pick(null).message);
        assertEquals(StatsModel.SIGNED_OUT, StatsModel.parse(null).pick("p").message);
        assertEquals(StatsModel.SIGNED_OUT, StatsModel.parse("garbage").pick(null).message);
    }

    @Test public void saysAsOfWhenOld() {
        StatsModel m = StatsModel.parse(SNAP);
        long written = 1790928000000L; // 2026-10-02T08:00:00Z
        assertNull(m.asOf(new Date(written + 3600_000L)));
        assertEquals("As of Fri 2 Oct", m.asOf(new Date(written + 30 * 3600_000L)));
    }

    @Test public void sizesAndRoom() {
        assertEquals(StatsModel.Size.SMALL, StatsModel.sizeFor(140, 140));
        assertEquals(StatsModel.Size.WIDE, StatsModel.sizeFor(300, 140));
        assertEquals(StatsModel.Size.LARGE, StatsModel.sizeFor(300, 300));
        assertEquals(4, StatsModel.tableRows(140));
        assertEquals(6, StatsModel.tableRows(300));
        assertEquals(2, StatsModel.tableRows(60));
        assertTrue(!StatsModel.labelled(StatsModel.Size.SMALL, 7));
        assertTrue(StatsModel.labelled(StatsModel.Size.WIDE, 7));
        assertTrue(!StatsModel.labelled(StatsModel.Size.WIDE, 31));
        assertTrue(StatsModel.labelled(StatsModel.Size.LARGE, 31));
    }
}
