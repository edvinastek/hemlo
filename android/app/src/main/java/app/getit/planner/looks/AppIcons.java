package app.getit.planner.looks;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;

/**
 * The launcher icons bundled in the app (LOOK-10). Each is an activity-alias
 * in AndroidManifest.xml; exactly one is enabled at any time, so GetIt always
 * has exactly one icon and is never hidden. Keys match src/lib/theme-rules.ts.
 */
public final class AppIcons {
    private AppIcons() {}

    static final String[] KEYS = { "classic", "night", "mono", "brick", "sage", "harbour", "ub", "tick", "week" };

    static boolean known(String key) {
        for (String k : KEYS) if (k.equals(key)) return true;
        return false;
    }

    /** Classic keeps the launcher's old name, ".MainActivity"; the others
     *  are ".IconNight", ".IconMono" and so on. */
    static String alias(String key) {
        if ("classic".equals(key)) return "app.getit.planner.MainActivity";
        return "app.getit.planner.Icon" + Character.toUpperCase(key.charAt(0)) + key.substring(1);
    }

    private static ComponentName component(Context c, String key) {
        return new ComponentName(c.getPackageName(), alias(key));
    }

    private static boolean enabled(Context c, String key) {
        int s = c.getPackageManager().getComponentEnabledSetting(component(c, key));
        if (s == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return "classic".equals(key);
        return s == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    /** The icon the launcher shows now. */
    public static String current(Context c) {
        for (String k : KEYS) if (enabled(c, k)) return k;
        return "classic";
    }

    /** The launcher entry the phone shows now: the activity the launcher
     *  shortcuts belong to (quickadd/QuickAdd.java). */
    public static ComponentName launcher(Context c) {
        return component(c, current(c));
    }

    /** Turn the chosen icon on first, then every other one off, so there is
     *  never a moment with no way into the app. */
    public static void apply(Context c, String key) {
        if (!known(key)) return;
        PackageManager pm = c.getPackageManager();
        pm.setComponentEnabledSetting(component(c, key),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (String k : KEYS) {
            if (k.equals(key)) continue;
            pm.setComponentEnabledSetting(component(c, k),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
    }
}
