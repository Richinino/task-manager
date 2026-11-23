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

/** Widget „Kopa" 2×2: úlohy na dnes po jednej, „ďalšia" listuje bez siete. */
public class StackWidget extends AppWidgetProvider {
    static final String ACTION_DONE = "sk.taskmanazer.app.widget.STACK_DONE";
    static final String ACTION_NEXT = "sk.taskmanazer.app.widget.STACK_NEXT";
    private static final String KEY_INDEX = "stackIndex";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
        WidgetRefreshJob.schedule(context, null);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_DONE.equals(action)) {
            // Po odškrtnutí začni znova od vrchu, kým server pošle nové poradie.
            context.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE).edit()
                    .putInt(KEY_INDEX, 0).apply();
            WidgetRefreshJob.schedule(context, intent.getStringExtra(TodayWidget.EXTRA_TASK_ID));
        } else if (ACTION_NEXT.equals(action)) {
            SharedPreferences prefs = context.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
            prefs.edit().putInt(KEY_INDEX, prefs.getInt(KEY_INDEX, 0) + 1).apply();
            updateAll(context);
        } else {
            super.onReceive(context, intent);
        }
    }

    public static void updateAll(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, StackWidget.class));
            if (ids != null && ids.length > 0) mgr.updateAppWidget(ids, build(c));
        } catch (Throwable ignored) {
        }
    }

    private static RemoteViews build(Context c) {
        SharedPreferences prefs = c.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_stack);
        v.setOnClickPendingIntent(R.id.widget_root, TodayWidget.openUrl(c, 50, TodayWidget.BASE + "/dnes"));

        if (prefs.getString("token", null) == null) {
            message(v, c.getString(R.string.wa_pair));
            v.setOnClickPendingIntent(R.id.widget_root,
                    TodayWidget.openUrl(c, 51, TodayWidget.BASE + "/nastavenia#telefon"));
            return v;
        }
        JSONObject o = WidgetQueue.load(prefs);
        if (o == null) {
            message(v, c.getString(R.string.wa_loading));
            return v;
        }
        try {
            List<WidgetQueue.Item> q = WidgetQueue.queue(o);
            int n = q.size();
            if (n == 0) {
                message(v, c.getString(R.string.wa_nothing));
                return v;
            }
            int idx = ((prefs.getInt(KEY_INDEX, 0) % n) + n) % n;
            WidgetQueue.Item it = q.get(idx);
            int bg = WidgetQueue.cardColor(c, it);
            int fg = WidgetQueue.textOn(bg);

            v.setViewVisibility(R.id.message, View.GONE);
            v.setViewVisibility(R.id.content, View.VISIBLE);
            v.setViewVisibility(R.id.card, View.VISIBLE);
            v.setInt(R.id.card, "setColorFilter", bg);
            v.setTextViewText(R.id.pos, c.getString(R.string.wa_stack_pos, idx + 1, n));
            v.setTextViewText(R.id.title, it.title);
            v.setTextViewText(R.id.est, it.estimate);
            v.setTextViewText(R.id.status, TodayWidget.status(prefs));
            int[] texts = {R.id.pos, R.id.title, R.id.est, R.id.status};
            for (int id : texts) v.setTextColor(id, fg);
            v.setInt(R.id.check, "setColorFilter", fg);
            v.setInt(R.id.next, "setColorFilter", fg);
            v.setInt(R.id.next, "setImageAlpha", 150);

            // Vykúkajúce karty: nasledujúce úlohy vo svojich farbách.
            peek(c, v, R.id.back1, q, idx, 1);
            peek(c, v, R.id.back2, q, idx, 2);

            if (it.id.isEmpty()) {
                v.setViewVisibility(R.id.check, View.INVISIBLE);
            } else {
                v.setViewVisibility(R.id.check, View.VISIBLE);
                v.setOnClickPendingIntent(R.id.check,
                        WidgetQueue.self(c, 52, StackWidget.class, ACTION_DONE, it.id));
            }
            if (n < 2) {
                v.setViewVisibility(R.id.next, View.GONE);
            } else {
                v.setViewVisibility(R.id.next, View.VISIBLE);
                v.setOnClickPendingIntent(R.id.next,
                        WidgetQueue.self(c, 53, StackWidget.class, ACTION_NEXT, null));
            }
        } catch (Throwable t) {
            message(v, c.getString(R.string.wa_bad_data));
        }
        return v;
    }

    private static void peek(Context c, RemoteViews v, int viewId, List<WidgetQueue.Item> q, int idx, int offset) {
        int n = q.size();
        if (n <= offset) {
            v.setViewVisibility(viewId, View.GONE);
            return;
        }
        WidgetQueue.Item p = q.get((idx + offset) % n);
        v.setViewVisibility(viewId, View.VISIBLE);
        int col = (p.frog || p.hasColor) ? WidgetQueue.cardColor(c, p) : c.getColor(R.color.w_school);
        v.setInt(viewId, "setColorFilter", col);
    }

    private static void message(RemoteViews v, String text) {
        v.setViewVisibility(R.id.card, View.GONE);
        v.setViewVisibility(R.id.back1, View.GONE);
        v.setViewVisibility(R.id.back2, View.GONE);
        v.setViewVisibility(R.id.content, View.GONE);
        v.setViewVisibility(R.id.message, View.VISIBLE);
        v.setTextViewText(R.id.message, text);
    }
}
