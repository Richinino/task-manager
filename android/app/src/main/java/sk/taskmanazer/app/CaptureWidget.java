package sk.taskmanazer.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;

/** Widget „Zapísať" 1×1: ťuknutie otvorí zachytenie úlohy. */
public class CaptureWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
    }

    static void updateAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, CaptureWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_capture);
        v.setOnClickPendingIntent(R.id.widget_root,
                TodayWidget.openUrl(c, 30, TodayWidget.BASE + "/dnes?zachytit=1"));
        mgr.updateAppWidget(ids, v);
    }
}
