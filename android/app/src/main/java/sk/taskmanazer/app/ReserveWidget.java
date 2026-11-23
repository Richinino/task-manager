package sk.taskmanazer.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget „Rezerva" 2×1: koľko času dnes ostáva a pás kapacity. */
public class ReserveWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
        WidgetRefreshJob.schedule(context, null);
    }

    public static void updateAll(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, ReserveWidget.class));
            if (ids != null && ids.length > 0) mgr.updateAppWidget(ids, build(c));
        } catch (Throwable ignored) {
        }
    }

    private static RemoteViews build(Context c) {
        SharedPreferences prefs = c.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_reserve);
        v.setOnClickPendingIntent(R.id.widget_root, TodayWidget.openUrl(c, 70, TodayWidget.BASE + "/dnes"));

        if (prefs.getString("token", null) == null) {
            small(v, c.getString(R.string.wa_pair), "");
            v.setOnClickPendingIntent(R.id.widget_root,
                    TodayWidget.openUrl(c, 71, TodayWidget.BASE + "/nastavenia#telefon"));
            return v;
        }
        JSONObject o = WidgetQueue.load(prefs);
        if (o == null) {
            small(v, c.getString(R.string.wa_loading), TodayWidget.status(prefs));
            return v;
        }
        try {
            boolean over = o.optBoolean("over", false);
            boolean dayOver = o.optBoolean("dayOver", false);
            String status = TodayWidget.status(prefs);
            boolean hasReserve = o.has("reserveMin") && !o.isNull("reserveMin");
            int reserve = o.optInt("reserveMin", 0);

            // Pás = koľko z voľného času dnes zaberú úlohy — to isté ako riadok
            // dneška vo widgete Týždeň a na obrazovke Plán. Bez `week` (starší
            // server) pás nekreslíme.
            int cap = 0;
            int planned = 0;
            JSONArray week = o.optJSONArray("week");
            if (week != null) {
                for (int i = 0; i < week.length(); i++) {
                    JSONObject d = week.optJSONObject(i);
                    if (d != null && d.optBoolean("today", false)) {
                        cap = d.optInt("freeMin", 0);
                        planned = d.optInt("plannedMin", 0);
                    }
                }
            }

            if (dayOver) {
                small(v, c.getString(R.string.wa_day_over), status);
                v.setViewVisibility(R.id.bars, View.GONE);
                return v;
            }

            String label = status.isEmpty() ? c.getString(R.string.wa_reserve_label) : status;
            boolean muted = false;
            if (over) {
                // Preplnené bez červenej, pokojne.
                String big;
                if (hasReserve && reserve < 0) big = c.getString(R.string.wa_over_more, WidgetQueue.fmtMin(c, reserve));
                else big = c.getString(R.string.wa_over_plain);
                v.setTextViewText(R.id.num, big);
                v.setTextViewText(R.id.label, status.isEmpty() ? c.getString(R.string.wa_over_label) : status);
                v.setTextViewText(R.id.num, big);
                v.setTextViewTextSize(R.id.num, TypedValue.COMPLEX_UNIT_SP, 14);
                muted = true;
            } else if (hasReserve) {
                v.setTextViewText(R.id.num, WidgetQueue.fmtMin(c, reserve));
                v.setTextViewTextSize(R.id.num, TypedValue.COMPLEX_UNIT_SP, 28);
                v.setTextViewText(R.id.label, label);
            } else {
                // Starší server bez rezervy: aspoň súhrn.
                v.setTextViewText(R.id.num, WidgetQueue.str(o, "summary"));
                v.setTextViewTextSize(R.id.num, TypedValue.COMPLEX_UNIT_SP, 14);
                v.setTextViewText(R.id.label, status);
            }

            if (cap > 0 && (hasReserve || over)) {
                int used = over ? 100 : Math.max(0, Math.min(100, Math.round(planned * 100f / cap)));
                v.setViewVisibility(R.id.bars, View.VISIBLE);
                v.setViewVisibility(R.id.bar, muted ? View.GONE : View.VISIBLE);
                v.setViewVisibility(R.id.bar_muted, muted ? View.VISIBLE : View.GONE);
                v.setProgressBar(muted ? R.id.bar_muted : R.id.bar, 100, used, false);
            } else {
                v.setViewVisibility(R.id.bars, View.GONE);
            }
        } catch (Throwable t) {
            small(v, c.getString(R.string.wa_bad_data), "");
        }
        return v;
    }

    /** Krátka správa namiesto čísla (nepripojené, načítavam, deň skončil). */
    private static void small(RemoteViews v, String text, String label) {
        v.setTextViewText(R.id.num, text);
        v.setTextViewTextSize(R.id.num, TypedValue.COMPLEX_UNIT_SP, 13);
        v.setTextViewText(R.id.label, label);
        v.setViewVisibility(R.id.bars, View.GONE);
    }
}
