package app.getit.planner;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.getit.planner.looks.LooksPlugin;
import app.getit.planner.widget.WidgetPlugin;

/**
 * The app's one screen. The launcher does not open it by this name: each app
 * icon the person can choose (Settings → Looks) is an activity-alias that
 * points here, and ".MainActivity", the name the launcher has always known,
 * is the Classic icon's alias, so home-screen icons made before icons could
 * be chosen keep working.
 */
public class PlannerActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The widget's and the looks' bridges live in this app, not in npm
        // packages, so they are registered here before the bridge starts.
        registerPlugin(WidgetPlugin.class);
        registerPlugin(LooksPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
