package app.visuma.planner.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Date;

import app.visuma.planner.R;

/**
 * Draws the real stats widget layouts for every kind of view at 2×2, 4×2 and
 * 4×4, in the default theme light and dark and in UB on black, and saves each
 * as a PNG in app/build/widget-previews. Also checks what they say.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35, qualifiers = "xxhdpi")
public class StatsWidgetRenderTest {

    static final String SNAP = "{\"v\":1,\"written_at\":\"2026-10-03T08:00:00.000Z\",\"views\":["
        + "{\"id\":\"num\",\"name\":\"Protein, this week\",\"kind\":\"number\",\"headline\":\"142 g\",\"sub\":\"A day on average · target 150 g\",\"points\":[],\"link\":\"/stats?view=num\"},"
        + "{\"id\":\"ring\",\"name\":\"Habits today\",\"kind\":\"ring\",\"headline\":\"3 of 5\",\"sub\":\"Stretch and walk still to do\",\"points\":[],\"progress\":0.6,\"link\":\"/stats?view=ring\"},"
        + "{\"id\":\"bars\",\"name\":\"Study minutes\",\"kind\":\"bars\",\"headline\":\"5 h 10\",\"sub\":\"This week · target 60 a day\",\"target\":60,\"points\":["
        + "{\"label\":\"Mon\",\"value\":45},{\"label\":\"Tue\",\"value\":70},{\"label\":\"Wed\",\"value\":null},{\"label\":\"Thu\",\"value\":30},"
        + "{\"label\":\"Fri\",\"value\":90,\"colour\":\"#4777d2\"},{\"label\":\"Sat\",\"value\":75},{\"label\":\"Sun\",\"value\":0}],\"link\":\"/stats?view=bars\"},"
        + "{\"id\":\"line\",\"name\":\"Weight\",\"kind\":\"line\",\"headline\":\"78.4 kg\",\"sub\":\"−0.6 kg in 30 days\",\"points\":["
        + pointsLine() + "],\"link\":\"/stats?view=line\"},"
        + "{\"id\":\"table\",\"name\":\"Chores this month\",\"kind\":\"table\",\"headline\":\"23 done\",\"sub\":\"\",\"points\":[],"
        + "\"rows\":[[\"Who\",\"Done\",\"Late\"],[\"Sam\",\"12\",\"1\"],[\"Alex\",\"9\",\"3\"],[\"Robin\",\"2\",\"0\"],[\"Kim\",\"0\",\"0\"]],\"link\":\"/stats?view=table\"}]}";

    static String pointsLine() {
        StringBuilder b = new StringBuilder();
        double w = 79.0;
        for (int i = 0; i < 30; i++) {
            if (i > 0) b.append(',');
            w += Math.sin(i * 0.7) * 0.25 - 0.02;
            String v = (i == 12 || i == 13) ? "null" : String.valueOf(Math.round(w * 10) / 10.0);
            b.append("{\"label\":\"").append(i + 1).append("\",\"value\":").append(v).append('}');
        }
        return b.toString();
    }

    public static final String UB_BLACK = "{\"v\":1,\"mode\":\"black\",\"light\":{\"paper\":\"#f6f2f5\",\"ink\":\"#0b0b0b\",\"soft\":\"#5e4f5d\",\"rule\":\"#dfd1de\",\"rail\":\"#b99bb8\",\"accent\":\"#531552\",\"done\":\"#3f6b4a\",\"warn\":\"#995100\",\"tint\":\"#ebe0ea\"},"
        + "\"dark\":{\"paper\":\"#000000\",\"ink\":\"#f2ece6\",\"soft\":\"#a89aa6\",\"rule\":\"#261426\",\"rail\":\"#531552\",\"accent\":\"#ffa500\",\"done\":\"#8fd19e\",\"warn\":\"#ff7a6b\",\"tint\":\"#1a0b1a\"}}";
    public static final String LIGHT = "{\"v\":1,\"mode\":\"light\"}";
    public static final String DARK = "{\"v\":1,\"mode\":\"dark\"}";

    private View shot(String name, String looks, String viewId, int widthDp, int heightDp) throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        WidgetStore.clear(ctx);
        WidgetStore.putStats(ctx, SNAP);
        WidgetStore.putLooks(ctx, looks);
        WidgetStore.setStatsView(ctx, 7, viewId);
        RemoteViews rv = StatsWidget.render(ctx, 7, widthDp, heightDp, new Date(1790928000000L + 86400000L));
        return TodayWidgetRenderTest.save(ctx, rv, name, widthDp, heightDp);
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    private static boolean shown(View root, int id) {
        View v = root.findViewById(id);
        return v != null && v.getVisibility() == View.VISIBLE;
    }

    @Test public void everyKindEverySize() throws Exception {
        String[] kinds = { "num", "ring", "bars", "line", "table" };
        int[][] sizes = { { 150, 150 }, { 320, 150 }, { 320, 320 } };
        String[] names = { "2x2", "4x2", "4x4" };
        String[][] looks = { { "light", LIGHT }, { "dark", DARK }, { "ub-black", UB_BLACK } };
        for (String[] l : looks) {
            for (String k : kinds) {
                for (int i = 0; i < sizes.length; i++) {
                    View v = shot("stats-" + k + "-" + names[i] + "-" + l[0], l[1], k, sizes[i][0], sizes[i][1]);
                    assertTrue(shown(v, R.id.stat_name));
                }
            }
        }
    }

    @Test public void figureSaysItsFigure() throws Exception {
        View v = shot("stats-check-number", LIGHT, "num", 150, 150);
        assertEquals("Protein, this week", text(v, R.id.stat_name));
        assertEquals("142 g", text(v, R.id.stat_headline));
    }

    @Test public void smallRingHoldsTheFigure() throws Exception {
        View v = shot("stats-check-ring", LIGHT, "ring", 150, 150);
        assertEquals("3 of 5", text(v, R.id.ring_text));
        assertTrue(!shown(v, R.id.text_col));
    }

    @Test public void tableFitsItsRows() throws Exception {
        View small = shot("stats-check-table-small", LIGHT, "table", 150, 150);
        assertTrue(shown(small, R.id.trow_3));
        assertTrue(!shown(small, R.id.trow_4));
        assertTrue(!shown(small, R.id.tcell_1_2));
        View large = shot("stats-check-table-large", LIGHT, "table", 320, 320);
        assertTrue(shown(large, R.id.trow_4));
        assertEquals("Alex", text(large, R.id.tcell_2_0));
        assertEquals("23 done", text(large, R.id.stat_headline));
    }

    @Test public void emptyStates() throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        WidgetStore.clear(ctx);
        View out = TodayWidgetRenderTest.save(ctx, StatsWidget.render(ctx, 8, 150, 150, new Date()), "stats-signed-out", 150, 150);
        assertEquals(StatsModel.SIGNED_OUT, text(out, R.id.stat_message));
        WidgetStore.putStats(ctx, "{\"v\":1,\"written_at\":\"2026-10-03T08:00:00Z\",\"views\":[]}");
        View none = TodayWidgetRenderTest.save(ctx, StatsWidget.render(ctx, 8, 150, 150, new Date()), "stats-none-saved", 150, 150);
        assertEquals(StatsModel.NONE_SAVED, text(none, R.id.stat_message));
        WidgetStore.putStats(ctx, SNAP);
        WidgetStore.setStatsView(ctx, 8, "deleted");
        View gone = TodayWidgetRenderTest.save(ctx, StatsWidget.render(ctx, 8, 320, 150, new Date()), "stats-gone", 320, 150);
        assertEquals(StatsModel.GONE, text(gone, R.id.stat_message));
    }

    @Test public void oldFiguresSayAsOf() throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        WidgetStore.clear(ctx);
        WidgetStore.putStats(ctx, SNAP);
        WidgetStore.setStatsView(ctx, 9, "num");
        View v = TodayWidgetRenderTest.save(ctx, StatsWidget.render(ctx, 9, 150, 150, new Date(1790928000000L + 3 * 86400000L)), "stats-as-of", 150, 150);
        assertEquals("As of Sat 3 Oct", text(v, R.id.stat_asof));
    }

    @Test public void signingOutKeepsTheChoice() {
        Context ctx = RuntimeEnvironment.getApplication();
        WidgetStore.putLooks(ctx, UB_BLACK);
        WidgetStore.setStatsView(ctx, 11, "bars");
        WidgetStore.putStats(ctx, SNAP);
        WidgetStore.clear(ctx);
        assertEquals("bars", WidgetStore.statsView(ctx, 11));
        assertEquals(UB_BLACK, WidgetStore.looks(ctx));
        assertEquals(null, WidgetStore.stats(ctx));
        WidgetStore.forgetStatsView(ctx, 11);
        assertEquals(null, WidgetStore.statsView(ctx, 11));
    }
}
