package app.hemlo.planner.quickadd;

import android.app.Activity;
import android.os.Bundle;

/**
 * The launcher shortcuts' way in. A launcher starts a shortcut on a new,
 * cleared task; pointed at the app's screen, that would close the running
 * app and start it again. This invisible screen lives in a task of its own,
 * hands the ?add= link to the app's screen (brought forward as it is, the
 * link arriving like any other) and closes. Only ?add= links pass; anything
 * else just closes it.
 */
public class QuickAddActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String key = QuickAdd.keyOf(getIntent() != null ? getIntent().getData() : null);
        if (key != null) startActivity(QuickAdd.openIntent(this, key));
        finish();
    }
}
