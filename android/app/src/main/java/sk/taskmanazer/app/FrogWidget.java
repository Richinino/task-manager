package sk.taskmanazer.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.List;

/** Widget „Žaba" 2×2: priorita dňa na celej ploche a kruh na odškrtnutie. */
public class FrogWidget extends AppWidgetProvider {
    static final String ACTION_DONE = "sk.taskmanazer.app.widget.FROG_DONE";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
        WidgetRefreshJob.schedule(context, null);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_DONE.equals(intent.getAction())) {
            WidgetRefreshJob.schedule(context, intent.getStringExtra(TodayWidget.EXTRA_TASK_ID));
        } else {
            super.onReceive(context, intent);
        }
    }

    public static void updateAll(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, FrogWidget.class));
            if (ids != null && ids.length > 0) mgr.updateAppWidget(ids, build(c));
        } catch (Throwable ignored) {
        }
    }

    private static RemoteViews build(Context c) {
        SharedPreferences prefs = c.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_frog);
        v.setOnClickPendingIntent(R.id.widget_root, TodayWidget.openUrl(c, 40, TodayWidget.BASE + "/dnes"));

        if (prefs.getString("token", null) == null) {
            message(v, c, c.getString(R.string.wa_pair));
            v.setOnClickPendingIntent(R.id.widget_root,
                    TodayWidget.openUrl(c, 41, TodayWidget.BASE + "/nastavenia#telefon"));
            return v;
        }
        JSONObject o = WidgetQueue.load(prefs);
        if (o == null) {
            message(v, c, c.getString(R.string.wa_loading));
            return v;
        }
        try {
            List<WidgetQueue.Item> q = WidgetQueue.queue(o);
            if (q.isEmpty()) {
                message(v, c, c.getString(R.string.wa_nothing));
                return v;
            }
            WidgetQueue.Item it = q.get(0);
            int bg = WidgetQueue.cardColor(c, it);
            int fg = WidgetQueue.textOn(bg);

            v.setViewVisibility(R.id.message, View.GONE);
            v.setViewVisibility(R.id.content, View.VISIBLE);
            v.setInt(R.id.bg, "setColorFilter", bg);
            v.setTextViewText(R.id.title, it.title);
            v.setTextViewText(R.id.est, it.estimate);
            v.setTextViewText(R.id.status, TodayWidget.status(prefs));
            v.setTextColor(R.id.title, fg);
            v.setTextColor(R.id.est, fg);
            v.setTextColor(R.id.label, fg);
            v.setTextColor(R.id.status, fg);
            v.setInt(R.id.check, "setColorFilter", fg);
            if (it.frog) {
                v.setViewVisibility(R.id.star, View.VISIBLE);
                v.setTextViewText(R.id.label, c.getString(R.string.wa_priority));
            } else {
                v.setViewVisibility(R.id.star, View.GONE);
                v.setTextViewText(R.id.label, c.getString(R.string.wa_next));
            }
            if (it.id.isEmpty()) {
                v.setViewVisibility(R.id.check, View.INVISIBLE);
            } else {
                v.setViewVisibility(R.id.check, View.VISIBLE);
                v.setOnClickPendingIntent(R.id.check,
                        WidgetQueue.self(c, 42, FrogWidget.class, ACTION_DONE, it.id));
            }
        } catch (Throwable t) {
            message(v, c, c.getString(R.string.wa_bad_data));
        }
        return v;
    }

    private static void message(RemoteViews v, Context c, String text) {
        v.setInt(R.id.bg, "setColorFilter", c.getColor(R.color.w_bg));
        v.setViewVisibility(R.id.content, View.GONE);
        v.setViewVisibility(R.id.message, View.VISIBLE);
        v.setTextViewText(R.id.message, text);
    }
}
