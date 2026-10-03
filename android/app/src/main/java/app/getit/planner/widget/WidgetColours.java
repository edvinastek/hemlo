package app.getit.planner.widget;

import android.content.Context;
import android.content.res.Configuration;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.function.ToIntFunction;

/**
 * The colours the widgets draw in: the app's chosen theme (LOOK-09), sent by
 * the app as WidgetLooks (src/lib/widget-rules.ts), in its light and dark
 * shade. Until the app has sent one, the default theme's.
 *
 * On "follow the phone" the widget switches with the home screen: on Android
 * 12 and later each colour is handed over as a light and a dark one and the
 * launcher picks as it draws, so the widget changes the moment the phone
 * does. Earlier phones get the shade of the moment, redrawn at the next
 * update.
 */
public final class WidgetColours {

    /** One shade's colours, as ARGB ints. */
    public static final class Palette {
        public final int paper, ink, soft, rule, rail, accent, done, warn, tint;

        Palette(int paper, int ink, int soft, int rule, int rail, int accent, int done, int warn, int tint) {
            this.paper = paper; this.ink = ink; this.soft = soft; this.rule = rule; this.rail = rail;
            this.accent = accent; this.done = done; this.warn = warn; this.tint = tint;
        }

        static Palette from(JSONObject o, Palette fb) {
            if (o == null) return fb;
            return new Palette(
                colour(o, "paper", fb.paper), colour(o, "ink", fb.ink), colour(o, "soft", fb.soft),
                colour(o, "rule", fb.rule), colour(o, "rail", fb.rail), colour(o, "accent", fb.accent),
                colour(o, "done", fb.done), colour(o, "warn", fb.warn), colour(o, "tint", fb.tint));
        }

        private static int colour(JSONObject o, String key, int fallback) {
            String v = o.optString(key, "");
            if (!v.matches("#[0-9a-fA-F]{6}")) return fallback;
            return 0xFF000000 | Integer.parseInt(v.substring(1), 16);
        }
    }

    /** The default theme (Notebook), as the widget had before themes. */
    public static final Palette LIGHT = new Palette(0xFFF8F4ED, 0xFF201E1B, 0xFF6C665B, 0xFFE4DDCD, 0xFFCFC6B3, 0xFFB4442A, 0xFF3F6B4A, 0xFF975809, 0xFFEFE9DD);
    public static final Palette DARK = new Palette(0xFF15141B, 0xFFF0EAE0, 0xFF9B9489, 0xFF2B2A2F, 0xFF3A3842, 0xFFD9674A, 0xFF7FB389, 0xFFE0A049, 0xFF221F27);

    /** "system", "light", "dark" or "black". */
    public final String mode;
    public final Palette light;
    /** The dark shade, or the black one when the person chose black. */
    public final Palette dark;
    private final boolean phoneNight;

    WidgetColours(String mode, Palette light, Palette dark, boolean phoneNight) {
        this.mode = mode;
        this.light = light;
        this.dark = dark;
        this.phoneNight = phoneNight;
    }

    public static WidgetColours load(Context c) {
        boolean night = (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        return parse(WidgetStore.looks(c), night);
    }

    /** Reads what the app sent; anything unreadable gives the defaults. */
    static WidgetColours parse(String json, boolean phoneNight) {
        if (json == null) return new WidgetColours("system", LIGHT, DARK, phoneNight);
        try {
            JSONObject o = new JSONObject(json);
            String mode = o.optString("mode", "system");
            if (!mode.equals("light") && !mode.equals("dark") && !mode.equals("black")) mode = "system";
            return new WidgetColours(mode, Palette.from(o.optJSONObject("light"), LIGHT), Palette.from(o.optJSONObject("dark"), DARK), phoneNight);
        } catch (Exception e) {
            return new WidgetColours("system", LIGHT, DARK, phoneNight);
        }
    }

    /** Is the widget dark right now? */
    public boolean night() {
        if ("light".equals(mode)) return false;
        if ("dark".equals(mode) || "black".equals(mode)) return true;
        return phoneNight;
    }

    /** The colours of the moment. */
    public Palette now() {
        return night() ? dark : light;
    }

    /** Hands the launcher both shades so it can switch on its own. */
    private boolean switching() {
        return "system".equals(mode) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    /** Call one colour method (setTextColor, setColorFilter,
     *  setBackgroundColor) on a view with the colour chosen from a palette. */
    public void set(RemoteViews v, int viewId, String method, ToIntFunction<Palette> pick) {
        if (switching()) {
            v.setColorInt(viewId, method, pick.applyAsInt(light), pick.applyAsInt(dark));
        } else {
            v.setInt(viewId, method, pick.applyAsInt(now()));
        }
    }
}
