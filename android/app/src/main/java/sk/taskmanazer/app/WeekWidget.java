package sk.taskmanazer.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget „Týždeň" 4×2: sedem stĺpcov kapacity, ťuknutie na deň otvorí /dnes?den=. */
public class WeekWidget extends AppWidgetProvider {
    private static final int[] TAPS = {R.id.wb_wk_t1, R.id.wb_wk_t2, R.id.wb_wk_t3, R.id.wb_wk_t4,
            R.id.wb_wk_t5, R.id.wb_wk_t6, R.id.wb_wk_t7};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
        WidgetRefreshJob.schedule(context, null);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle newOptions) {
        try {
            manager.updateAppWidget(id, build(context, manager, id));
        } catch (Throwable ignored) {
        }
    }

    public static void updateAll(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, WeekWidget.class));
            if (ids == null) return;
            for (int id : ids) {
                try {
                    mgr.updateAppWidget(id, build(c, mgr, id));
                } catch (Throwable ignored) {
                }
            }
        } catch (Throwable ignored) {
        }
    }

    private static void message(RemoteViews v, String head, String sum, String msg) {
        v.setTextViewText(R.id.wb_wk_head, head);
        v.setTextViewText(R.id.wb_wk_sum, sum);
        v.setTextViewText(R.id.wb_wk_msg, msg);
        v.setViewVisibility(R.id.wb_wk_msg, View.VISIBLE);
        v.setViewVisibility(R.id.wb_wk_bars, View.GONE);
        for (int t : TAPS) v.setViewVisibility(t, View.GONE);
    }

    private static RemoteViews build(Context c, AppWidgetManager mgr, int id) {
        SharedPreferences prefs = c.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_week);
        v.setOnClickPendingIntent(R.id.widget_root,
                TodayWidget.openUrl(c, 65, TodayWidget.BASE + "/tyzden"));

        if (prefs.getString("token", null) == null) {
            message(v, "Týždeň", "", "Pripoj widget v appke: Knižnica → Nastavenia → Telefón");
            v.setOnClickPendingIntent(R.id.widget_root,
                    TodayWidget.openUrl(c, 66, TodayWidget.BASE + "/nastavenia#telefon"));
            return v;
        }
        JSONObject o = WidgetB.cached(prefs);
        String status = WidgetB.status(prefs);
        if (o == null) {
            message(v, "Týždeň", status, "Načítavam…");
            return v;
        }

        try {
            JSONArray week = WidgetB.arr(o, "week");
            if (week == null || week.length() == 0) {
                message(v, "Týždeň", status, "Počkaj na aktualizáciu servera");
                return v;
            }
            int n = Math.min(7, week.length());
            long planned = 0;
            for (int i = 0; i < n; i++) {
                JSONObject d = week.optJSONObject(i);
                if (d != null) planned += Math.max(0, d.optInt("plannedMin", 0));
            }
            String first = WidgetB.str(week.optJSONObject(0), "date");
            String last = WidgetB.str(week.optJSONObject(n - 1), "date");
            v.setTextViewText(R.id.wb_wk_head, "Týždeň " + range(first, last));
            v.setTextViewText(R.id.wb_wk_sum, status.isEmpty() ? duration(planned) : status);
            v.setViewVisibility(R.id.wb_wk_msg, View.GONE);
            v.setViewVisibility(R.id.wb_wk_bars, View.VISIBLE);

            int wdp = WidgetB.widthDp(c, mgr, id, 320) - 28;
            int hdp = WidgetB.heightDp(c, mgr, id, 150) - 20 - 28;
            if (wdp < 120) wdp = 120;
            if (hdp < 60) hdp = 60;
            v.setImageViewBitmap(R.id.wb_wk_bars,
                    drawWeek(c, WidgetB.dp(c, wdp), WidgetB.dp(c, hdp), week, n));

            for (int i = 0; i < TAPS.length; i++) {
                JSONObject d = i < n ? week.optJSONObject(i) : null;
                String date = WidgetB.str(d, "date");
                if (date.isEmpty()) {
                    v.setViewVisibility(TAPS[i], View.INVISIBLE);
                    continue;
                }
                v.setViewVisibility(TAPS[i], View.VISIBLE);
                PendingIntent pi = TodayWidget.openUrl(c, 70 + i,
                        TodayWidget.BASE + "/dnes?den=" + date);
                v.setOnClickPendingIntent(TAPS[i], pi);
            }
        } catch (Throwable e) {
            message(v, "Týždeň", "", "Dáta sa nepodarilo prečítať");
        }
        return v;
    }

    /** „23.–29. 11." alebo pri prelomení mesiaca „30. 11.–6. 12.". */
    static String range(String first, String last) {
        try {
            String[] a = first.split("-");
            String[] b = last.split("-");
            int da = Integer.parseInt(a[2]);
            int ma = Integer.parseInt(a[1]);
            int db = Integer.parseInt(b[2]);
            int mb = Integer.parseInt(b[1]);
            if (ma == mb) return da + ".–" + db + ". " + mb + ".";
            return da + ". " + ma + ".–" + db + ". " + mb + ".";
        } catch (Throwable e) {
            return "";
        }
    }

    static String duration(long min) {
        long h = min / 60;
        long m = min % 60;
        if (min <= 0) return "nič naplánované";
        if (h == 0) return m + " min";
        return m == 0 ? h + " h" : h + " h " + m;
    }

    /** Sedem stĺpcov: skratka dňa, číslo, zvislý pás kapacity. */
    static Bitmap drawWeek(Context c, int w, int h, JSONArray week, int n) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        int cTrack = c.getColor(R.color.w_track);
        int cFg = c.getColor(R.color.w_fg);
        int cMuted = c.getColor(R.color.w_muted);
        int cBg = c.getColor(R.color.w_bg);
        int cAccent = c.getColor(R.color.w_accent);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setTextAlign(Paint.Align.CENTER);
        tp.setTypeface(Typeface.DEFAULT_BOLD);

        float cell = w / 7f;
        float gap = WidgetB.dp(c, 6);
        float cw = cell - gap;
        float barTop = WidgetB.dp(c, 36);
        float barBottom = h;
        if (barBottom - barTop < WidgetB.dp(c, 20)) barTop = Math.max(WidgetB.dp(c, 24), barBottom - WidgetB.dp(c, 20));
        float radius = Math.min(WidgetB.dp(c, 12), cw / 2f);

        for (int i = 0; i < n; i++) {
            JSONObject d = week.optJSONObject(i);
            if (d == null) continue;
            boolean today = d.optBoolean("today", false);
            float cx = cell * i + cell / 2f;
            float left = cx - cw / 2f;

            tp.setTextSize(WidgetB.dp(c, 11));
            tp.setColor(today ? cFg : cMuted);
            cv.drawText(WidgetB.str(d, "dayShort"), cx, WidgetB.dp(c, 11), tp);
            tp.setTextSize(WidgetB.dp(c, 14));
            tp.setColor(cFg);
            cv.drawText(String.valueOf(d.optInt("dayNum", 0)), cx, WidgetB.dp(c, 28), tp);

            RectF bar = new RectF(left, barTop, left + cw, barBottom);
            p.setStyle(Paint.Style.FILL);
            p.setColor(cTrack);
            cv.drawRoundRect(bar, radius, radius, p);

            int planned = Math.max(0, d.optInt("plannedMin", 0));
            int free = d.optInt("freeMin", 0);
            int cap = planned + free;
            float frac;
            if (cap <= 0) frac = planned > 0 ? 1f : 0f;
            else frac = Math.min(1f, planned / (float) cap);
            if (frac > 0f) {
                float fh = Math.max(WidgetB.dp(c, 3), (barBottom - barTop) * frac);
                cv.save();
                Path clip = new Path();
                clip.addRoundRect(bar, radius, radius, Path.Direction.CW);
                cv.clipPath(clip);
                p.setColor(today ? cAccent : cMuted);
                cv.drawRect(bar.left, barBottom - fh, bar.right, barBottom, p);
                cv.restore();
            }

            if (d.optBoolean("exam", false)) {
                float r = WidgetB.dp(c, 4.5f);
                float my = barTop + WidgetB.dp(c, 10);
                p.setStyle(Paint.Style.FILL);
                p.setColor(cBg);
                cv.drawCircle(cx, my, r, p);
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(WidgetB.dp(c, 1.6f));
                p.setColor(cFg);
                cv.drawCircle(cx, my, r, p);
                p.setStyle(Paint.Style.FILL);
                cv.drawCircle(cx, my, WidgetB.dp(c, 1.5f), p);
            }
        }
        return bmp;
    }
}
