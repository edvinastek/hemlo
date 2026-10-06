package app.hemlo.planner.health;

import static org.junit.Assert.assertEquals;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.widget.TextView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;

import app.hemlo.planner.R;

/**
 * The screen Health Connect opens to say what Hemlo does with sleep (SLP-05),
 * light and dark at 360 dp, into app/build/widget-previews.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35, qualifiers = "w360dp-h740dp-xxhdpi")
public class HealthPrivacyRenderTest {

    private void shot(String name) throws Exception {
        HealthPrivacyActivity a = Robolectric.buildActivity(HealthPrivacyActivity.class).setup().get();
        View root = a.getWindow().getDecorView();
        float d = a.getResources().getDisplayMetrics().density;
        int w = Math.round(360 * d);
        int h = Math.round(740 * d);
        root.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, w, h);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        root.draw(new Canvas(b));
        File dir = new File("build/widget-previews");
        dir.mkdirs();
        try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        assertEquals("Privacy policy", ((TextView) a.findViewById(R.id.health_policy)).getText().toString());
    }

    @Test public void light() throws Exception { shot("health-privacy"); }

    @Test @Config(qualifiers = "w360dp-h740dp-night-xxhdpi")
    public void dark() throws Exception { shot("health-privacy-dark"); }
}
