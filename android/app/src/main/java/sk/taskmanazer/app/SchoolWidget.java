package sk.taskmanazer.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget „Škola" 2×2: najbližšia hodina veľkou skratkou a rad bodiek dnešných hodín. */
public class SchoolWidget extends AppWidgetProvider {
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
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, SchoolWidget.class));
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

    private static void layout(RemoteViews v, String label, String code, String time,
                               String after, boolean exam, boolean dots) {
        v.setTextViewText(R.id.wb_sc_label, label);
        v.setViewVisibility(R.id.wb_sc_code, code.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.wb_sc_code, code);
        v.setViewVisibility(R.id.wb_sc_time, time.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.wb_sc_time, time);
        v.setViewVisibility(R.id.wb_sc_after, after.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.wb_sc_after, after);
        v.setViewVisibility(R.id.wb_sc_exam, exam ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.wb_sc_dots, dots ? View.VISIBLE : View.GONE);
    }

    private static RemoteViews build(Context c, AppWidgetManager mgr, int id) {
        SharedPreferences prefs = c.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_school);
        v.setOnClickPendingIntent(R.id.widget_root,
                TodayWidget.openUrl(c, 63, TodayWidget.BASE + "/rozvrh"));

        if (prefs.getString("token", null) == null) {
            layout(v, "Škola", "", "", "Pripoj widget v appke: Knižnica → Nastavenia → Telefón", false, false);
            v.setOnClickPendingIntent(R.id.widget_root,
                    TodayWidget.openUrl(c, 64, TodayWidget.BASE + "/nastavenia#telefon"));
            return v;
        }
        JSONObject o = WidgetB.cached(prefs);
        String status = WidgetB.status(prefs);
        if (o == null) {
            layout(v, "Škola", "", "", status.isEmpty() ? "Načítavam…" : status, false, false);
            return v;
        }

        try {
            JSONObject school = WidgetB.obj(o, "school");
            if (school == null) {
                String msg = o.has("school") ? "Rozvrh nie je zadaný" : "Počkaj na aktualizáciu servera";
                layout(v, "Škola", "", "", msg, false, false);
                if (!status.isEmpty()) v.setTextViewText(R.id.wb_sc_label, "Škola · " + status);
                return v;
            }
            JSONArray lessons = WidgetB.arr(school, "lessons");
            boolean any = lessons != null && lessons.length() > 0;
            JSONObject next = WidgetB.obj(school, "next");
            if (next != null && !WidgetB.str(next, "code").isEmpty()) {
                boolean running = false;
                if (any) {
                    for (int i = 0; i < lessons.length(); i++) {
                        JSONObject l = lessons.optJSONObject(i);
                        if (l != null && "now".equals(l.optString("state"))
                                && WidgetB.str(l, "code").equals(WidgetB.str(next, "code"))) running = true;
                    }
                }
                String time = WidgetB.str(next, "time");
                String room = WidgetB.str(next, "room");
                String when = time.isEmpty() ? room : (room.isEmpty() ? time : time + " v " + room);
                layout(v, running ? "Teraz" : "Ďalšia hodina", WidgetB.str(next, "code"), when, "",
                        next.optBoolean("exam", false), any);
                int col = WidgetB.parseColor(WidgetB.str(next, "color"));
                v.setTextColor(R.id.wb_sc_code, col != 0 ? col : c.getColor(R.color.w_fg));
            } else {
                String after = WidgetB.str(school, "afterSchool");
                layout(v, any ? "Škola skončila" : "Dnes bez školy", "", "", after, false, any);
            }
            if (!status.isEmpty()) v.setTextViewText(R.id.wb_sc_label, "Škola · " + status);
            if (any) {
                int wdp = WidgetB.widthDp(c, mgr, id, 160) - 28;
                if (wdp < 60) wdp = 60;
                v.setImageViewBitmap(R.id.wb_sc_dots, drawDots(c, WidgetB.dp(c, wdp), lessons));
            }
        } catch (Throwable e) {
            layout(v, "Škola", "", "", "Dáta sa nepodarilo prečítať", false, false);
        }
        return v;
    }

    /** Rad bodiek: plná = minulá, obrys = teraz, slabá = budúca. */
    private static Bitmap drawDots(Context c, int w, JSONArray lessons) {
        int n = Math.min(lessons.length(), 14);
        int d = WidgetB.dp(c, 10);
        float gap = WidgetB.dp(c, 10);
        if (n > 1 && n * d + (n - 1) * gap > w) {
            gap = Math.max(WidgetB.dp(c, 3), (w - n * d) / (float) (n - 1));
            if (n * d + (n - 1) * gap > w) {
                d = Math.max(WidgetB.dp(c, 4), (int) ((w - (n - 1) * gap) / n));
            }
        }
        int h = WidgetB.dp(c, 10);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        int fg = c.getColor(R.color.w_fg);
        int track = c.getColor(R.color.w_track);
        float stroke = WidgetB.dp(c, 2);
        for (int i = 0; i < n; i++) {
            JSONObject l = lessons.optJSONObject(i);
            String state = l == null ? "future" : l.optString("state", "future");
            float cx = d / 2f + i * (d + gap);
            float cy = h / 2f;
            if ("now".equals(state)) {
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(stroke);
                p.setColor(fg);
                cv.drawCircle(cx, cy, d / 2f - stroke / 2f, p);
            } else {
                p.setStyle(Paint.Style.FILL);
                p.setColor("past".equals(state) ? fg : track);
                cv.drawCircle(cx, cy, d / 2f, p);
            }
        }
        return bmp;
    }
}
