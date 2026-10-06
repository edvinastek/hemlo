package app.hemlo.planner.health;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import app.hemlo.planner.PlannerActivity;
import app.hemlo.planner.R;

/**
 * What Hemlo does with Health Connect, for Health Connect's own screens: the
 * "privacy policy" link on its permission screen (Android 13 and earlier) and
 * "app permissions → Hemlo" in its settings (Android 14 and later). Health
 * Connect requires an app to have this before it may ask for anything, and
 * it must lead to the privacy policy given in Play Console: the public page
 * once its address is in res/values/health.xml (health_privacy_url), the
 * same policy inside the app until then.
 */
public class HealthPrivacyActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_health_privacy);
        findViewById(R.id.health_policy).setOnClickListener(v -> {
            String url = getString(R.string.health_privacy_url).trim();
            try {
                if (url.startsWith("https://")) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return;
                }
            } catch (ActivityNotFoundException ignored) {
                // No browser: the policy in the app instead.
            }
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("app.hemlo.planner://open/more?page=about"))
                .setClass(this, PlannerActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            finish();
        });
        findViewById(R.id.health_close).setOnClickListener(v -> finish());
    }
}
