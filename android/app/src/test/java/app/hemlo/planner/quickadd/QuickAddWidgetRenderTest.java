package app.hemlo.planner.quickadd;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.TextView;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;
import java.util.List;

import app.hemlo.planner.R;
import app.hemlo.planner.widget.StatsWidgetRenderTest;
import app.hemlo.planner.widget.TodayWidgetRenderTest;
import app.hemlo.planner.widget.WidgetStore;

/**
 * The quick-add widget and the launcher shortcuts (WID-11, NAV-24): the list
 * the app sends, read safely; buttons by width; the links they open. Draws
 * the widget light and dark into app/build/widget-previews, as the Today
 * widget's test does (quickadd-light.png is the picker's preview image).
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35, qualifiers = "xxhdpi")
public class QuickAddWidgetRenderTest {

    static final String MINE = "[{\"key\":\"m:shopping\",\"label\":\"Shopping item\",\"short\":\"Shopping\"},"
        + "{\"key\":\"task\",\"label\":\"Task\",\"short\":\"Task\"},"
        + "{\"key\":\"m:health\",\"label\":\"Weigh-in\",\"short\":\"Weigh-in\"},"
        + "{\"key\":\"inbox\",\"label\":\"Task to Inbox\",\"short\":\"Inbox\"}]";

    private Context ctx;

    @Before public void setUp() {
        ctx = RuntimeEnvironment.getApplication();
        QuickAdd.clear(ctx);
        WidgetStore.putLooks(ctx, null);
    }

    private View shot(String name, String looks, int widthDp) throws Exception {
        WidgetStore.putLooks(ctx, looks);
        RemoteViews rv = QuickAddWidget.render(ctx, widthDp);
        return TodayWidgetRenderTest.save(ctx, rv, name, widthDp, 56);
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    private static boolean shown(View root, int id) {
        return root.findViewById(id).getVisibility() == View.VISIBLE;
    }

    @Test public void defaultsBeforeTheAppSays() throws Exception {
        View v = shot("quickadd-light", null, 300);
        assertEquals("Task", text(v, R.id.qa_text_0));
        assertEquals("Inbox", text(v, R.id.qa_text_1));
        assertEquals("Food", text(v, R.id.qa_text_2));
        assertEquals("Event", text(v, R.id.qa_text_3));
        assertEquals("Add task to Inbox", root(v, R.id.qa_1).getContentDescription().toString());
    }

    @Test @Config(qualifiers = "night-xxhdpi")
    public void defaultsDark() throws Exception {
        shot("quickadd-dark", null, 300);
    }

    @Test public void thePersonsOwnOrder() throws Exception {
        QuickAdd.put(ctx, MINE);
        View v = shot("quickadd-mine-light", StatsWidgetRenderTest.LIGHT, 300);
        assertEquals("Shopping", text(v, R.id.qa_text_0));
        assertEquals("Weigh-in", text(v, R.id.qa_text_2));
        assertEquals("Add shopping item", root(v, R.id.qa_0).getContentDescription().toString());
        shot("quickadd-mine-dark", StatsWidgetRenderTest.DARK, 300);
        shot("quickadd-mine-ub-black", StatsWidgetRenderTest.UB_BLACK, 300);
    }

    @Test public void buttonsByWidth() throws Exception {
        View two = shot("quickadd-2x1", null, 140);
        assertTrue(shown(two, R.id.qa_1));
        assertTrue(!shown(two, R.id.qa_2));
        View three = shot("quickadd-3x1", null, 200);
        assertTrue(shown(three, R.id.qa_2));
        assertTrue(!shown(three, R.id.qa_3));
        assertEquals(4, QuickAddWidget.buttonsFor(0));
        assertEquals(4, QuickAddWidget.buttonsFor(320));
    }

    @Test public void fewerEntriesThanButtons() throws Exception {
        QuickAdd.put(ctx, "[{\"key\":\"task\",\"label\":\"Task\",\"short\":\"Task\"}]");
        View v = shot("quickadd-one", null, 300);
        assertTrue(shown(v, R.id.qa_0));
        assertTrue(!shown(v, R.id.qa_1));
    }

    @Test public void listReadSafely() {
        assertEquals(0, QuickAdd.parse("not json").size());
        assertEquals(0, QuickAdd.parse(null).size());
        // A broken key, a missing label and a key twice are left out; at most four.
        List<QuickAdd.Item> l = QuickAdd.parse("[{\"key\":\"Bad Key\",\"label\":\"x\"},{\"key\":\"food\"},"
            + "{\"key\":\"task\",\"label\":\"Task\"},{\"key\":\"task\",\"label\":\"Task\"},"
            + "{\"key\":\"a\",\"label\":\"A\"},{\"key\":\"b\",\"label\":\"B\"},{\"key\":\"c\",\"label\":\"C\"},{\"key\":\"d\",\"label\":\"D\"}]");
        assertEquals(4, l.size());
        assertEquals("task", l.get(0).key);
        // Nothing usable keeps what was there.
        QuickAdd.put(ctx, MINE);
        QuickAdd.put(ctx, "[]");
        assertEquals("m:shopping", QuickAdd.items(ctx).get(0).key);
        // Signing out goes back to the defaults.
        QuickAdd.clear(ctx);
        assertEquals("task", QuickAdd.items(ctx).get(0).key);
    }

    @Test public void links() {
        assertEquals("app.hemlo.planner://open/?add=m%3Ahealth", QuickAdd.link("m:health").toString());
        assertEquals("m:health", QuickAdd.keyOf(QuickAdd.link("m:health")));
        assertNull(QuickAdd.keyOf(Uri.parse("app.hemlo.planner://open/stats")));
        assertNull(QuickAdd.keyOf(Uri.parse("app.hemlo.planner://open/?add=..%2F..")));
        assertNull(QuickAdd.keyOf(Uri.parse("https://example.com/?add=task")));
        assertNull(QuickAdd.keyOf(null));
    }

    @Test public void shortcutsFollowTheList() {
        QuickAdd.put(ctx, MINE);
        QuickAdd.publishShortcuts(ctx);
        List<ShortcutInfoCompat> s = ShortcutManagerCompat.getDynamicShortcuts(ctx);
        assertEquals(4, s.size());
        ShortcutInfoCompat first = null;
        for (ShortcutInfoCompat x : s) if (x.getRank() == 0) first = x;
        assertEquals("add_m_shopping", first.getId());
        assertEquals("Shopping", first.getShortLabel().toString());
        assertEquals("Add shopping item", first.getLongLabel().toString());
        assertEquals("app.hemlo.planner://open/?add=m%3Ashopping", first.getIntent().getData().toString());
        assertEquals(QuickAddActivity.class.getName(), first.getIntent().getComponent().getClassName());
        QuickAdd.clear(ctx);
        assertEquals(0, ShortcutManagerCompat.getDynamicShortcuts(ctx).size());
    }

    /** Every launcher shortcut icon in a row, as a launcher draws them, into
     *  build/widget-previews/shortcut-icons.png. */
    @Test public void shortcutIcons() throws Exception {
        String[] keys = { "task", "inbox", "food", "event", "m:shopping", "m:health", "m:habits", "m:sleep", "m:other" };
        float d = ctx.getResources().getDisplayMetrics().density;
        int size = Math.round(48 * d);
        int gap = Math.round(12 * d);
        Bitmap b = Bitmap.createBitmap(keys.length * (size + gap) + gap, size + 2 * gap, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(Color.rgb(0x5f, 0x6b, 0x73));
        for (int i = 0; i < keys.length; i++) {
            Drawable icon = ctx.getDrawable(QuickAdd.iconFor(keys[i]));
            int x = gap + i * (size + gap);
            icon.setBounds(x, gap, x + size, gap + size);
            icon.draw(c);
        }
        File dir = new File("build/widget-previews");
        dir.mkdirs();
        try (FileOutputStream out = new FileOutputStream(new File(dir, "shortcut-icons.png"))) {
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
    }

    private static View root(View v, int id) {
        return v.findViewById(id);
    }
}
