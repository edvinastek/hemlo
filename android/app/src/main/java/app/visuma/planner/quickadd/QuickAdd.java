package app.visuma.planner.quickadd;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

import app.visuma.planner.PlannerActivity;
import app.visuma.planner.R;
import app.visuma.planner.looks.AppIcons;

/**
 * The + menu's first entries on the phone (NAV-24, WID-11): the app sends
 * them whenever they change (src/lib/widget.ts sendQuickAdd), in the
 * person's order with hidden entries and switched-off modules left out. The
 * quick-add widget draws its buttons from them, and they are the launcher
 * shortcuts (a long press on the Visuma icon). Each opens
 * app.visuma.planner://open/?add=<entry key>, which Today's + turns into
 * that entry's sheet.
 *
 * The shortcuts are dynamic, not declared in res/xml: a declared one cannot
 * be removed or reordered, so it would offer Food to someone who switched
 * Food off, and show twice beside the person's own order.
 */
public final class QuickAdd {
    private QuickAdd() {}

    /** One entry: the + menu's key and label, and a name short enough for a
     *  shortcut or a widget button. */
    public static final class Item {
        public final String key;
        public final String label;
        public final String shortLabel;

        Item(String key, String label, String shortLabel) {
            this.key = key;
            this.label = label;
            this.shortLabel = shortLabel;
        }
    }

    public static final int SIZE = 4;
    private static final String FILE = "visuma_quickadd";
    private static final String ITEMS = "items";
    /** The + menu's entry keys (src/lib/today-prefs-rules.ts KEY). */
    private static final Pattern KEY = Pattern.compile("[a-z0-9_:-]{1,60}");
    private static final String LINK = "app.visuma.planner://open/?add=";

    /** Before the app has said: the + menu's first entries for a new profile
     *  (src/lib/widget-quickadd-rules.ts QUICK_ADD_DEFAULT). */
    static final List<Item> DEFAULTS = Collections.unmodifiableList(java.util.Arrays.asList(
        new Item("task", "Task", "Task"),
        new Item("inbox", "Task to Inbox", "Inbox"),
        new Item("food", "Food", "Food"),
        new Item("event", "Event", "Event")));

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** The entries to offer: what the app sent, or the defaults. */
    public static synchronized List<Item> items(Context c) {
        List<Item> list = parse(prefs(c).getString(ITEMS, null));
        return list.isEmpty() ? DEFAULTS : list;
    }

    /** Store the app's list. Anything unreadable is dropped, not guessed at. */
    public static synchronized void put(Context c, String json) {
        if (parse(json).isEmpty()) return;
        prefs(c).edit().putString(ITEMS, json).apply();
    }

    /** Signing out: back to the defaults, and no shortcuts until the next
     *  person's list arrives. */
    public static synchronized void clear(Context c) {
        prefs(c).edit().remove(ITEMS).apply();
        try {
            ShortcutManagerCompat.removeAllDynamicShortcuts(c);
        } catch (Exception ignored) {
            // A launcher without shortcuts: nothing to remove.
        }
    }

    static List<Item> parse(String json) {
        List<Item> out = new ArrayList<>();
        if (json == null) return out;
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < a.length() && out.size() < SIZE; i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null) continue;
                String key = o.optString("key", "");
                String label = o.optString("label", "").trim();
                String shortLabel = o.optString("short", "").trim();
                if (!KEY.matcher(key).matches() || label.isEmpty()) continue;
                boolean twice = false;
                for (Item x : out) twice |= x.key.equals(key);
                if (twice) continue;
                if (label.length() > 40) label = label.substring(0, 40);
                if (shortLabel.isEmpty() || shortLabel.length() > 12) shortLabel = label.length() > 10 ? label.substring(0, 9) + "…" : label;
                out.add(new Item(key, label, shortLabel));
            }
        } catch (Exception ignored) {
            out.clear();
        }
        return out;
    }

    /** The entry key an ?add= link names, or null for any other link. */
    public static String keyOf(Uri uri) {
        if (uri == null) return null;
        String s = uri.toString();
        if (!s.startsWith(LINK)) return null;
        String key = Uri.decode(s.substring(LINK.length()));
        return KEY.matcher(key).matches() ? key : null;
    }

    public static Uri link(String key) {
        return Uri.parse(LINK + Uri.encode(key));
    }

    /** Open the app on that entry's sheet. The link keeps each entry's intent
     *  apart from the others'. */
    public static Intent openIntent(Context c, String key) {
        return new Intent(Intent.ACTION_VIEW, link(key))
            .setClass(c, PlannerActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    /** The launcher shortcuts, in the + menu's order. They go through
     *  QuickAddActivity: a launcher starts a shortcut on a cleared task, which
     *  would restart the app if it pointed at the app's screen itself. */
    public static void publishShortcuts(Context c) {
        try {
            List<ShortcutInfoCompat> list = new ArrayList<>();
            int max = Math.min(SIZE, ShortcutManagerCompat.getMaxShortcutCountPerActivity(c));
            ComponentName launcher = AppIcons.launcher(c);
            int rank = 0;
            for (Item item : items(c)) {
                if (rank >= max) break;
                Intent intent = new Intent(Intent.ACTION_VIEW, link(item.key)).setClass(c, QuickAddActivity.class);
                list.add(new ShortcutInfoCompat.Builder(c, "add_" + item.key.replace(':', '_'))
                    .setShortLabel(item.shortLabel)
                    .setLongLabel("Add " + lower(item.label))
                    .setIcon(IconCompat.createWithResource(c, iconFor(item.key)))
                    .setIntent(intent)
                    .setActivity(launcher)
                    .setRank(rank++)
                    .build());
            }
            ShortcutManagerCompat.setDynamicShortcuts(c, list);
        } catch (Exception ignored) {
            // Too many updates in a short time (Android limits apps in the
            // background), or a launcher without shortcuts: the last list stays.
        }
    }

    /** "Task to Inbox" → "task to Inbox": the first letter only, so a name
     *  the person gave a module of their own keeps its capitals. */
    static String lower(String label) {
        if (label.length() > 1 && Character.isUpperCase(label.charAt(0)) && Character.isLowerCase(label.charAt(1))) {
            return Character.toLowerCase(label.charAt(0)) + label.substring(1);
        }
        return label;
    }

    /** A shortcut's icon: the entry's own where there is one, a plus otherwise. */
    static int iconFor(String key) {
        switch (key) {
            case "task": return R.drawable.ic_qa_task;
            case "inbox": return R.drawable.ic_qa_inbox;
            case "food": return R.drawable.ic_qa_food;
            case "event": return R.drawable.ic_qa_event;
            case "m:shopping": return R.drawable.ic_qa_shopping;
            case "m:health": return R.drawable.ic_qa_weighin;
            case "m:habits": return R.drawable.ic_qa_habit;
            case "m:sleep": return R.drawable.ic_qa_sleep;
            default: return R.drawable.ic_qa_add;
        }
    }

    /** The same, as a bare glyph for the widget's buttons. */
    static int glyphFor(String key) {
        switch (key) {
            case "task": return R.drawable.glyph_qa_task;
            case "inbox": return R.drawable.glyph_qa_inbox;
            case "food": return R.drawable.glyph_qa_food;
            case "event": return R.drawable.glyph_qa_event;
            case "m:shopping": return R.drawable.glyph_qa_shopping;
            case "m:health": return R.drawable.glyph_qa_weighin;
            case "m:habits": return R.drawable.glyph_qa_habit;
            case "m:sleep": return R.drawable.glyph_qa_sleep;
            default: return R.drawable.glyph_qa_add;
        }
    }
}
