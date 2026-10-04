package app.getit.planner.health;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import app.getit.planner.PlannerActivity;
import app.getit.planner.R;

/**
 * What GetIt does with Health Connect, for Health Connect's own screens: the
 * "privacy policy" link on its permission screen (Android 13 and earlier) and
 * "app permissions → GetIt" in its settings (Android 14 and later). Health
 * Connect requires an app to have this before it may ask for anything. The
 * full policy is in the app (More → About → Privacy policy), one tap away.
 */
public class HealthPrivacyActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_health_privacy);
        findViewById(R.id.health_policy).setOnClickListener(v -> {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("app.getit.planner://open/more?page=about"))
                .setClass(this, PlannerActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            finish();
        });
        findViewById(R.id.health_close).setOnClickListener(v -> finish());
    }
}
