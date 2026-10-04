package app.getit.planner.widget;

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
import java.util.Calendar;
import java.util.Date;

import app.getit.planner.R;

/**
 * Draws the real widget layout, light and dark, at a few sizes, and saves each
 * as a PNG in app/build/widget-previews, so a change can be looked at without
 * a phone. Also checks what the rows say.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35, qualifiers = "xxhdpi")
public class TodayWidgetRenderTest {

    private static final String DAY = "2026-09-25";

    private static final String SNAPSHOT = "{\"v\":1,\"updated_at\":\"2026-09-25T08:00:00Z\",\"days\":{\"" + DAY + "\":{"
        + "\"tasks\":["
        + "{\"id\":\"t1\",\"title\":\"Morning pages\",\"time\":\"07:00\",\"done\":true},"
        + "{\"id\":\"t2\",\"title\":\"Team check-in\",\"time\":\"11:00\",\"done\":false},"
        + "{\"id\":\"t3\",\"title\":\"Lunch: grilled chicken breast with lentils and greens\",\"time\":\"12:00\",\"done\":false},"
        + "{\"id\":\"t4\",\"title\":\"Calisthenics A\",\"time\":\"17:30\",\"done\":false},"
        + "{\"id\":\"t5\",\"title\":\"Read, 30 min\",\"time\":null,\"done\":false}],"
        + "\"habits\":["
        + "{\"id\":\"h1\",\"name\":\"Stretch 10 min\",\"done\":true},"
        + "{\"id\":\"h2\",\"name\":\"10,000 steps\",\"done\":false},"
        + "{\"id\":\"h3\",\"name\":\"Phone out of the bedroom\",\"done\":false}]}}}";

    private static Date friday() {
        Calendar c = Calendar.getInstance();
        c.set(2026, Calendar.SEPTEMBER, 25, 10, 0, 0);
        return c.getTime();
    }

    private View shot(String name, String snapshot, int widthDp, int heightDp) throws Exception {
        return shot(name, snapshot, null, widthDp, heightDp);
    }

    private View shot(String name, String snapshot, String looks, int widthDp, int heightDp) throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        WidgetStore.clear(ctx);
        WidgetStore.putLooks(ctx, looks);
        if (snapshot != null) WidgetStore.putSnapshot(ctx, snapshot);
        RemoteViews rv = TodayWidget.render(ctx, heightDp, widthDp, friday());
        return save(ctx, rv, name, widthDp, heightDp);
    }

    /** Lays the widget out at a size, on a grey wallpaper so the rounded
     *  corners show, and saves it as build/widget-previews/<name>.png. */
    public static View save(Context ctx, RemoteViews rv, String name, int widthDp, int heightDp) throws Exception {
        FrameLayout parent = new FrameLayout(ctx);
        View v = rv.apply(ctx, parent);
        float d = ctx.getResources().getDisplayMetrics().density;
        int w = Math.round(widthDp * d);
        int h = Math.round(heightDp * d);
        v.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        v.layout(0, 0, w, h);

        int pad = Math.round(16 * d);
        Bitmap b = Bitmap.createBitmap(w + 2 * pad, h + 2 * pad, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(Color.rgb(0x5f, 0x6b, 0x73));
        c.translate(pad, pad);
        v.draw(c);
        File dir = new File("build/widget-previews");
        dir.mkdirs();
        try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        return v;
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    private static boolean shown(View root, int id) {
        return root.findViewById(id).getVisibility() == View.VISIBLE;
    }

    @Test public void fullDayLight() throws Exception {
        View v = shot("today-light", SNAPSHOT, 320, 330);
        assertEquals("Friday 25 September", text(v, R.id.date));
        assertEquals("4 left", text(v, R.id.summary));
        assertEquals("Team check-in", text(v, R.id.text_0));
        assertEquals("11:00", text(v, R.id.time_0));
        assertTrue(shown(v, R.id.tick_0));
        assertTrue(shown(v, R.id.label_4));
        assertEquals("Habits", text(v, R.id.label_4));
        assertEquals("Stretch 10 min", text(v, R.id.done_5));
    }

    @Test @Config(qualifiers = "night-xxhdpi")
    public void fullDayDark() throws Exception {
        shot("today-dark", SNAPSHOT, 320, 330);
    }

    @Test public void defaultSize() throws Exception {
        View v = shot("today-4x2", SNAPSHOT, 320, 230);
        // Five rows fit: two tasks, the label and two habits.
        assertTrue(shown(v, R.id.row_4));
        assertTrue(!shown(v, R.id.row_5));
        assertEquals("Habits", text(v, R.id.label_2));
    }

    @Test public void narrow() throws Exception {
        View v = shot("today-narrow", SNAPSHOT, 200, 180);
        assertEquals("Fri 25 Sep", text(v, R.id.date));
    }

    @Test public void signedOut() throws Exception {
        View v = shot("signed-out", null, 320, 180);
        assertTrue(shown(v, R.id.message));
        assertEquals(WidgetModel.SIGNED_OUT, text(v, R.id.message));
        assertTrue(!shown(v, R.id.row_0));
    }

    @Test public void tickShowsAtOnce() throws Exception {
        Context ctx = RuntimeEnvironment.getApplication();
        WidgetStore.clear(ctx);
        WidgetStore.putSnapshot(ctx, SNAPSHOT);
        WidgetStore.tick(ctx, "task", "t2", DAY, true);
        // A new snapshot from the app that has not seen the tick yet keeps it.
        WidgetStore.putSnapshot(ctx, SNAPSHOT);
        WidgetModel m = WidgetModel.build(WidgetStore.snapshot(ctx), DAY, 8);
        assertEquals("3 left", m.summary);
        assertEquals(1, WidgetStore.takeTicks(ctx).length());
        assertEquals(0, WidgetStore.takeTicks(ctx).length());
    }

    // WID-02: chores, supplement slots and events among the tasks.
    static final String WITH_ITEMS = "{\"v\":1,\"updated_at\":\"2026-09-25T08:00:00Z\",\"days\":{\"" + DAY + "\":{"
        + "\"tasks\":[{\"id\":\"t1\",\"title\":\"Team check-in\",\"time\":\"11:00\",\"done\":false},"
        + "{\"id\":\"t2\",\"title\":\"Morning pages\",\"time\":\"07:00\",\"done\":true}],"
        + "\"habits\":[{\"id\":\"h1\",\"name\":\"Stretch 10 min\",\"done\":false},{\"id\":\"h2\",\"name\":\"10,000 steps\",\"done\":true}],"
        + "\"items\":[{\"kind\":\"supplements\",\"id\":\"s1,s2\",\"title\":\"Morning supplements\",\"time\":null,\"done\":false,\"tick\":true},"
        + "{\"kind\":\"event\",\"id\":\"e1\",\"title\":\"Dentist\",\"time\":\"14:00\",\"done\":false,\"tick\":false},"
        + "{\"kind\":\"chore\",\"id\":\"c1\",\"title\":\"Take the bins out\",\"time\":null,\"done\":false,\"tick\":true,\"late\":true},"
        + "{\"kind\":\"chore\",\"id\":\"c2\",\"title\":\"Dishes\",\"time\":\"19:00\",\"done\":false,\"tick\":true}]}}}";

    @Test public void itemsFromEveryModule() throws Exception {
        View v = shot("today-items-light", WITH_ITEMS, StatsWidgetRenderTest.LIGHT, 320, 330);
        assertEquals("Team check-in", text(v, R.id.text_0));
        assertEquals("Dentist", text(v, R.id.text_1));
        assertEquals("Dishes", text(v, R.id.text_2));
        assertEquals("4 left", text(v, R.id.summary));
        shot("today-items-ub-black", WITH_ITEMS, StatsWidgetRenderTest.UB_BLACK, 320, 330);
        shot("today-items-dark", WITH_ITEMS, StatsWidgetRenderTest.DARK, 320, 330);
    }

    @Test public void aChoreTickShowsAtOnce() {
        Context ctx = RuntimeEnvironment.getApplication();
        WidgetStore.clear(ctx);
        WidgetStore.putSnapshot(ctx, WITH_ITEMS);
        WidgetStore.tick(ctx, "chore", "c2", DAY, true);
        WidgetStore.tick(ctx, "supplements", "s1,s2", DAY, true);
        WidgetModel m = WidgetModel.build(WidgetStore.snapshot(ctx), DAY, 8);
        assertEquals("2 left", m.summary);
        assertEquals(2, WidgetStore.takeTicks(ctx).length());
    }
}
