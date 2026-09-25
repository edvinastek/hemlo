package app.getit.planner;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.getit.planner.widget.WidgetPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The home-screen widget's bridge lives in this app, not in an npm
        // package, so it is registered here before the bridge starts.
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
