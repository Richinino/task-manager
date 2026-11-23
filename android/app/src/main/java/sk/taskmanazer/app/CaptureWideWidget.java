package sk.taskmanazer.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;

/** Widget „Zapísať" 2×1: pilulka „+ Zapísať" a mikrofón, obe otvoria zachytenie. */
public class CaptureWideWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
    }

    public static void updateAll(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, CaptureWideWidget.class));
            if (ids == null || ids.length == 0) return;
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_capture_wide);
            android.app.PendingIntent open = TodayWidget.openUrl(c, 60, TodayWidget.BASE + "/dnes?zachytit=1");
            v.setOnClickPendingIntent(R.id.widget_root, open);
            v.setOnClickPendingIntent(R.id.pill, open);
            v.setOnClickPendingIntent(R.id.mic, open);
            mgr.updateAppWidget(ids, v);
        } catch (Throwable ignored) {
        }
    }
}
