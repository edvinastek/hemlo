package app.getit.planner.widget;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.DisplayMetrics;

import java.util.List;

/**
 * The small charts of the stats widgets: bars, a line and a ring (WID-10).
 *
 * Each chart is drawn as layers of shape only (masks): the quiet parts
 * (baseline, target line, labels, the ring's track) on one, the data on
 * another. The widget paints each layer in a colour of the theme, so on
 * "follow the phone" the launcher can switch the colours with the home
 * screen, as it does for the text. Points that carry their own colour go on
 * a third layer drawn as they are. Masks are one byte a pixel and drawn at
 * no more than twice the base density, which keeps a widget update small.
 */
final class StatsCharts {
    private StatsCharts() {}

    static final class Layers {
        Bitmap soft;
        Bitmap accent;
        /** Only when some point has its own colour. */
        Bitmap colour;
    }

    /** Pixels per dp for the charts. */
    static float scale(float density) {
        return Math.max(1f, Math.min(2f, density));
    }

    private static Bitmap mask(int w, int h, float s) {
        Bitmap b = Bitmap.createBitmap(Math.max(1, w), Math.max(1, h), Bitmap.Config.ALPHA_8);
        b.setDensity(Math.round(DisplayMetrics.DENSITY_DEFAULT * s));
        return b;
    }

    private static Paint fill() {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0xFF000000);
        p.setStyle(Paint.Style.FILL);
        return p;
    }

    private static Paint stroke(float width) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0xFF000000);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(width);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        return p;
    }

    private static double max(List<StatsModel.Point> pts, Double target) {
        double m = target != null ? target : 0;
        for (StatsModel.Point p : pts) if (p.value != null) m = Math.max(m, p.value);
        return m > 0 ? m : 1;
    }

    /** Bars from zero, a gap where there is no data, the target dashed. */
    static Layers bars(List<StatsModel.Point> pts, Double target, int wDp, int hDp, float density, boolean labels) {
        float s = scale(density);
        int w = Math.round(wDp * s), h = Math.round(hDp * s);
        Layers out = new Layers();
        out.soft = mask(w, h, s);
        out.accent = mask(w, h, s);
        Canvas soft = new Canvas(out.soft);
        Canvas accent = new Canvas(out.accent);
        Canvas colour = null;
        Paint colourPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

        float labelH = labels ? 14 * s : 0;
        float top = 4 * s, base = h - labelH - 1 * s;
        int n = Math.max(1, pts.size());
        float slot = (float) w / n;
        float barW = Math.max(2 * s, Math.min(slot * 0.64f, 28 * s));
        double m = max(pts, target);
        Paint bar = fill();
        float r = Math.min(barW / 2, 3 * s);
        for (int i = 0; i < pts.size(); i++) {
            StatsModel.Point p = pts.get(i);
            if (p.value == null) continue;
            float hgt = (float) (Math.max(0, p.value) / m * (base - top));
            if (p.value > 0) hgt = Math.max(hgt, 1.5f * s);
            if (hgt <= 0) continue;
            float x = i * slot + (slot - barW) / 2;
            RectF rect = new RectF(x, base - hgt, x + barW, base);
            Canvas target2 = accent;
            Paint paint = bar;
            if (p.colour != 0) {
                if (colour == null) {
                    out.colour = Bitmap.createBitmap(Math.max(1, w), Math.max(1, h), Bitmap.Config.ARGB_8888);
                    out.colour.setDensity(out.soft.getDensity());
                    colour = new Canvas(out.colour);
                }
                colourPaint.setColor(p.colour);
                target2 = colour;
                paint = colourPaint;
            }
            // Rounded at the top, square on the baseline.
            target2.drawRoundRect(rect, r, r, paint);
            target2.drawRect(x, base - Math.min(hgt, r), x + barW, base, paint);
        }
        soft.drawRect(0, base, w, base + 1 * s, fill());
        drawTarget(soft, target, m, top, base, w, s);
        if (labels) drawLabels(soft, pts, slot, h, s, false);
        return out;
    }

    /** A line through the points, broken where there is no data, with the
     *  latest point marked. */
    static Layers line(List<StatsModel.Point> pts, Double target, int wDp, int hDp, float density, boolean labels) {
        float s = scale(density);
        int w = Math.round(wDp * s), h = Math.round(hDp * s);
        Layers out = new Layers();
        out.soft = mask(w, h, s);
        out.accent = mask(w, h, s);
        Canvas soft = new Canvas(out.soft);
        Canvas accent = new Canvas(out.accent);

        float labelH = labels ? 14 * s : 0;
        float top = 6 * s, base = h - labelH - 4 * s;
        int n = Math.max(1, pts.size());
        float slot = (float) w / n;
        double m = max(pts, target);
        double lo = m;
        for (StatsModel.Point p : pts) if (p.value != null) lo = Math.min(lo, p.value);
        // A line starts from zero unless all its values sit far above it, so
        // small changes in weight or sleep still show.
        double floor = lo > m * 0.6 ? lo - (m - lo) * 0.25 : 0;
        if (target != null) floor = Math.min(floor, target);
        double span = Math.max(1e-9, m - floor);

        Path path = new Path();
        boolean pen = false;
        float lastX = -1, lastY = -1;
        int run = 0;
        Paint dot = fill();
        for (int i = 0; i < pts.size(); i++) {
            StatsModel.Point p = pts.get(i);
            if (p.value == null) {
                if (run == 1) accent.drawCircle(lastX, lastY, 2 * s, dot);
                pen = false;
                run = 0;
                continue;
            }
            float x = i * slot + slot / 2;
            float y = (float) (base - (p.value - floor) / span * (base - top));
            if (pen) path.lineTo(x, y);
            else path.moveTo(x, y);
            pen = true;
            run++;
            lastX = x;
            lastY = y;
        }
        if (run == 1) accent.drawCircle(lastX, lastY, 2 * s, dot);
        accent.drawPath(path, stroke(2 * s));
        if (lastX >= 0) accent.drawCircle(lastX, lastY, 3.5f * s, dot);
        soft.drawRect(0, base + 3 * s, w, base + 4 * s, fill());
        drawTarget(soft, target, m, top, base, w, s, floor);
        if (labels) drawLabels(soft, pts, slot, h, s, true);
        return out;
    }

    /** A ring filled to the progress, starting at the top. */
    static Layers ring(double progress, int sizeDp, float density) {
        float s = scale(density);
        int px = Math.round(sizeDp * s);
        Layers out = new Layers();
        out.soft = mask(px, px, s);
        out.accent = mask(px, px, s);
        float width = Math.max(6 * s, px * 0.11f);
        RectF box = new RectF(width / 2, width / 2, px - width / 2, px - width / 2);
        Paint track = stroke(width);
        new Canvas(out.soft).drawOval(box, track);
        double p = Math.max(0, Math.min(1, progress));
        if (p > 0) new Canvas(out.accent).drawArc(box, -90, (float) (360 * p), false, stroke(width));
        return out;
    }

    private static void drawTarget(Canvas c, Double target, double m, float top, float base, int w, float s) {
        drawTarget(c, target, m, top, base, w, s, 0);
    }

    private static void drawTarget(Canvas c, Double target, double m, float top, float base, int w, float s, double floor) {
        if (target == null || target <= floor) return;
        float y = (float) (base - (target - floor) / Math.max(1e-9, m - floor) * (base - top));
        Paint dash = stroke(1.5f * s);
        dash.setStrokeCap(Paint.Cap.BUTT);
        dash.setPathEffect(new DashPathEffect(new float[] { 4 * s, 3 * s }, 0));
        Path line = new Path();
        line.moveTo(0, y);
        line.lineTo(w, y);
        c.drawPath(line, dash);
    }

    /** Labels under the points, as many as fit without touching; a line
     *  keeps its first and last. */
    private static void drawLabels(Canvas c, List<StatsModel.Point> pts, float slot, int h, float s, boolean ends) {
        if (pts.isEmpty()) return;
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(0xFF000000);
        text.setTextSize(10 * s);
        text.setTextAlign(Paint.Align.CENTER);
        float widest = 0;
        for (StatsModel.Point p : pts) widest = Math.max(widest, text.measureText(p.label));
        int every = Math.max(1, (int) Math.ceil((widest + 4 * s) / slot));
        float y = h - 3 * s;
        int last = pts.size() - 1;
        for (int i = 0; i < pts.size(); i++) {
            boolean show = ends ? (i == 0 || i == last || (every == 1)) : (i % every == 0);
            if (!show) continue;
            float x = i * slot + slot / 2;
            if (ends && i == 0) {
                text.setTextAlign(Paint.Align.LEFT);
                x = Math.max(0, x - slot / 2);
            } else if (ends && i == last && last > 0) {
                text.setTextAlign(Paint.Align.RIGHT);
                x = Math.min(c.getWidth(), x + slot / 2);
            } else {
                text.setTextAlign(Paint.Align.CENTER);
            }
            c.drawText(pts.get(i).label, x, y, text);
        }
    }
}
