package app.visuma.planner.looks;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

import app.visuma.planner.quickadd.QuickAdd;

/**
 * Looks on the phone's side (src/lib/native.ts): the text size the web view
 * draws at, the phone's font size and wallpaper colours, the launcher icon,
 * and a short buzz for ticks and long presses.
 */
@CapacitorPlugin(name = "VisumaLooks")
public class LooksPlugin extends Plugin {

    private static final String FILE = "visuma_looks";
    private static final String ZOOM = "text_zoom";
    private static final String PENDING = "pending_icon";

    private SharedPreferences prefs() {
        return getContext().getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    @Override
    public void load() {
        // The last text size chosen, before the page draws, so text does not
        // jump from one size to another as the app opens.
        int zoom = prefs().getInt(ZOOM, 0);
        if (zoom > 0) applyZoom(zoom);
    }

    @Override
    protected void handleOnStop() {
        // A new icon is switched while the person is away from the app, so
        // the launcher entry they came in through never vanishes under them.
        super.handleOnStop();
        String pending = prefs().getString(PENDING, null);
        if (pending != null) {
            AppIcons.apply(getContext(), pending);
            prefs().edit().remove(PENDING).apply();
            // The launcher shortcuts belong to the icon's entry: move them to the new one.
            QuickAdd.publishShortcuts(getContext());
        }
    }

    @PluginMethod
    public void setTextZoom(PluginCall call) {
        Integer percent = call.getInt("percent");
        if (percent == null) {
            call.reject("percent is required");
            return;
        }
        int p = Math.max(50, Math.min(300, percent));
        prefs().edit().putInt(ZOOM, p).apply();
        applyZoom(p);
        call.resolve();
    }

    private void applyZoom(int percent) {
        if (getBridge() == null) return;
        WebView web = getBridge().getWebView();
        if (web == null) return;
        web.post(() -> web.getSettings().setTextZoom(percent));
    }

    @PluginMethod
    public void fontScale(PluginCall call) {
        JSObject out = new JSObject();
        out.put("scale", (double) getContext().getResources().getConfiguration().fontScale);
        call.resolve(out);
    }

    /** The wallpaper's main colour on Android 12 and later (Material You). */
    @PluginMethod
    public void systemColours(PluginCall call) {
        JSObject out = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int c = getContext().getColor(android.R.color.system_accent1_500);
            out.put("accent", String.format(Locale.ROOT, "#%06x", c & 0xFFFFFF));
        } else {
            out.put("accent", JSObject.NULL);
        }
        call.resolve(out);
    }

    @PluginMethod
    public void getIcon(PluginCall call) {
        JSObject out = new JSObject();
        out.put("key", AppIcons.current(getContext()));
        String pending = prefs().getString(PENDING, null);
        out.put("pending", pending != null ? pending : JSObject.NULL);
        call.resolve(out);
    }

    @PluginMethod
    public void setIcon(PluginCall call) {
        String key = call.getString("key");
        if (key == null || !AppIcons.known(key)) {
            call.reject("unknown icon");
            return;
        }
        if (key.equals(AppIcons.current(getContext()))) prefs().edit().remove(PENDING).apply();
        else prefs().edit().putString(PENDING, key).apply();
        call.resolve();
    }

    @PluginMethod
    public void haptic(PluginCall call) {
        String kind = call.getString("kind", "tick");
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) {
            int effect;
            if ("hold".equals(kind)) effect = HapticFeedbackConstants.LONG_PRESS;
            else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) effect = HapticFeedbackConstants.CONFIRM;
            else effect = HapticFeedbackConstants.KEYBOARD_TAP;
            web.post(() -> web.performHapticFeedback(effect));
        }
        call.resolve();
    }
}
