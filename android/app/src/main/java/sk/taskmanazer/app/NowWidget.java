package sk.taskmanazer.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget „Teraz" 4×1: čo sa deje práve teraz, najbližšia úloha a rýchle zapísanie. */
public class NowWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
        WidgetRefreshJob.schedule(context, null);
    }

    public static void updateAll(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, NowWidget.class));
            if (ids == null || ids.length == 0) return;
            mgr.updateAppWidget(ids, build(c));
        } catch (Throwable ignored) {
        }
    }

    private static void text(RemoteViews v, String title, String detail) {
        v.setTextViewText(R.id.wb_now_title, title);
        v.setTextViewText(R.id.wb_now_detail, detail);
    }

    private static RemoteViews build(Context c) {
        SharedPreferences prefs = c.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_now);
        PendingIntent today = TodayWidget.openUrl(c, 60, TodayWidget.BASE + "/dnes");
        v.setOnClickPendingIntent(R.id.widget_root, today);
        v.setOnClickPendingIntent(R.id.wb_now_add,
                TodayWidget.openUrl(c, 61, TodayWidget.BASE + "/dnes?zachytit=1"));

        if (prefs.getString("token", null) == null) {
            text(v, "Pripoj widget v appke", "Knižnica → Nastavenia → Telefón");
            v.setViewVisibility(R.id.wb_now_pill, View.GONE);
            v.setViewVisibility(R.id.wb_now_add, View.GONE);
            v.setOnClickPendingIntent(R.id.widget_root,
                    TodayWidget.openUrl(c, 62, TodayWidget.BASE + "/nastavenia#telefon"));
            return v;
        }
        JSONObject o = WidgetB.cached(prefs);
        String status = WidgetB.status(prefs);
        if (o == null) {
            text(v, "Načítavam…", status);
            v.setViewVisibility(R.id.wb_now_pill, View.GONE);
            return v;
        }

        try {
            JSONObject now = WidgetB.obj(o, "now");
            String title;
            String detail;
            int dotColor = WidgetB.AMBER;
            if (now != null && !WidgetB.str(now, "title").isEmpty()) {
                title = WidgetB.str(now, "title");
                detail = WidgetB.str(now, "detail");
                if ("Po škole".equals(title)) dotColor = WidgetB.GREEN;
            } else {
                // Starý server alebo nič, čo by pilulka hovorila: pokojný súhrn dňa.
                title = "Dnes";
                detail = WidgetB.str(o, "summary");
                dotColor = WidgetB.GREEN;
            }
            if (!status.isEmpty()) detail = detail.isEmpty() ? status : detail + " · " + status;
            text(v, title, detail);
            v.setInt(R.id.wb_now_dot, "setColorFilter", dotColor);

            JSONArray q = WidgetB.arr(o, "queue");
            if (q == null || q.length() == 0) q = WidgetB.arr(o, "next");
            if (q == null || q.length() == 0) q = WidgetB.arr(o, "tasks");
            JSONObject first = q == null ? null : q.optJSONObject(0);
            String pill = WidgetB.str(first, "title");
            if (pill.isEmpty()) {
                v.setViewVisibility(R.id.wb_now_pill, View.GONE);
            } else {
                v.setViewVisibility(R.id.wb_now_pill, View.VISIBLE);
                v.setTextViewText(R.id.wb_now_pill, pill);
                v.setOnClickPendingIntent(R.id.wb_now_pill, today);
            }
        } catch (Throwable e) {
            text(v, "Dáta sa nepodarilo prečítať", "");
            v.setViewVisibility(R.id.wb_now_pill, View.GONE);
        }
        return v;
    }
}
