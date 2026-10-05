package app.visuma.planner.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Which saved stats view a stats widget shows (WID-10, WID-14): opened when
 * the widget is placed, and again from the widget's own settings on a long
 * press (Android 12 and later) or by tapping a widget whose view was deleted.
 * Lists the views by name; with none saved yet it says so and offers Stats.
 * Drawn in the app's theme, from what the widgets already have.
 */
public class StatsWidgetConfigure extends Activity {

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private WidgetColours.Palette p;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        // Leaving with Back places nothing, as Android expects.
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent().getExtras();
        if (extras != null) widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        WidgetColours colours = WidgetColours.load(this);
        p = colours.now();
        getWindow().setStatusBarColor(p.paper);
        getWindow().setNavigationBarColor(p.paper);
        if (!colours.night() && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        setContentView(build());
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(String s, float sp, int colour, boolean serif) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(colour);
        t.setTypeface(serif ? Typeface.SERIF : Typeface.SANS_SERIF);
        return t;
    }

    private View build() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(p.paper);
        scroll.setFillViewport(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(16), dp(24), dp(16), dp(16));
        scroll.addView(col, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = text("Choose a stats view", 24, p.ink, true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) title.setAccessibilityHeading(true);
        col.addView(title);
        TextView intro = text("The widget shows it and keeps it up to date.", 14, p.soft, false);
        intro.setPadding(0, dp(4), 0, dp(16));
        col.addView(intro);

        StatsModel model = StatsModel.parse(WidgetStore.stats(this));
        String chosen = WidgetStore.statsView(this, widgetId);
        if (!model.present || model.views.isEmpty()) {
            boolean signedOut = !model.present;
            col.addView(text(signedOut ? "Open Visuma and sign in first." : StatsModel.NONE_SAVED, 17, p.ink, true));
            TextView how = text(signedOut
                ? "Your saved stats views are listed here once Visuma has opened."
                : "In Visuma, open Stats, build a view and save it. The widget shows it as soon as it is saved.", 14, p.soft, false);
            how.setPadding(0, dp(6), 0, dp(16));
            col.addView(how);
            col.addView(button(signedOut ? "Open Visuma" : "Open Stats", true, v -> {
                // Keep the widget: it fills in once a view is saved.
                done();
                startActivity(new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("app.visuma.planner://open" + (signedOut ? "/" : "/stats")))
                    .setClass(this, app.visuma.planner.PlannerActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }));
        } else {
            for (StatsModel.View view : model.views) col.addView(choice(view, view.id.equals(chosen)));
        }

        Button cancel = button("Cancel", false, v -> finish());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(16);
        lp.gravity = Gravity.END;
        col.addView(cancel, lp);
        return scroll;
    }

    private static String kindWord(String kind) {
        switch (kind) {
            case "ring": return "Ring";
            case "bars": return "Bars";
            case "line": return "Line";
            case "table": return "Table";
            default: return "Figure";
        }
    }

    /** One view, as a row the size of a fingertip or more. */
    private View choice(StatsModel.View view, boolean current) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setMinimumHeight(dp(56));
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(10));
        bg.setColor(current ? p.tint : p.paper);
        bg.setStroke(dp(current ? 2 : 1), current ? p.accent : p.rule);
        row.setBackground(bg);
        row.addView(text(view.name.isEmpty() ? "Untitled view" : view.name, 17, p.ink, true));
        String line = kindWord(view.kind) + (view.headline.isEmpty() ? "" : " · " + view.headline) + (current ? " · shown now" : "");
        row.addView(text(line, 13, p.soft, false));
        row.setClickable(true);
        row.setFocusable(true);
        row.setContentDescription(view.name + ", " + line);
        row.setSelected(current);
        row.setOnClickListener(v -> {
            WidgetStore.setStatsView(this, widgetId, view.id);
            done();
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        row.setLayoutParams(lp);
        return row;
    }

    private Button button(String label, boolean primary, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setMinHeight(dp(48));
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(10));
        bg.setColor(primary ? p.accent : p.paper);
        bg.setStroke(dp(1), primary ? p.accent : p.rule);
        b.setBackground(bg);
        b.setTextColor(primary ? p.paper : p.ink);
        b.setPadding(dp(16), 0, dp(16), 0);
        b.setOnClickListener(onClick);
        return b;
    }

    /** Draw the widget with its choice and hand it back to the launcher. */
    private void done() {
        StatsWidget.draw(this, AppWidgetManager.getInstance(this), widgetId);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }
}
