package sk.taskmanazer.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

/** Spoločné pomôcky widgetov Teraz, Škola a Týždeň (agent B). */
final class WidgetB {
    static final int AMBER = 0xFFD9971C;
    static final int GREEN = 0xFF1F8A5F;

    private WidgetB() {
    }

    static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    static boolean landscape(Context c) {
        return c.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
    }

    /** Šírka widgetu v dp podľa volieb; záloha, ak ich launcher nedá. */
    static int widthDp(Context c, AppWidgetManager mgr, int id, int fallback) {
        try {
            Bundle o = mgr.getAppWidgetOptions(id);
            int w = o == null ? 0 : o.getInt(landscape(c)
                    ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
                    : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            return w > 0 ? w : fallback;
        } catch (Throwable e) {
            return fallback;
        }
    }

    static int heightDp(Context c, AppWidgetManager mgr, int id, int fallback) {
        try {
            Bundle o = mgr.getAppWidgetOptions(id);
            int h = o == null ? 0 : o.getInt(landscape(c)
                    ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
                    : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            return h > 0 ? h : fallback;
        } catch (Throwable e) {
            return fallback;
        }
    }

    /** 0 = bez farby (alfa je vždy nastavená, takže platná farba nie je 0). */
    static int parseColor(String s) {
        if (s == null || s.isEmpty() || "null".equals(s)) return 0;
        try {
            return Color.parseColor(s);
        } catch (IllegalArgumentException e) {
            return 0;
        }
    }

    static String str(JSONObject o, String key) {
        if (o == null || o.isNull(key)) return "";
        return o.optString(key, "");
    }

    static JSONObject obj(JSONObject o, String key) {
        if (o == null || o.isNull(key)) return null;
        return o.optJSONObject(key);
    }

    static JSONArray arr(JSONObject o, String key) {
        if (o == null || o.isNull(key)) return null;
        return o.optJSONArray(key);
    }

    /** Uložený JSON alebo null, ak chýba či je poškodený. */
    static JSONObject cached(SharedPreferences prefs) {
        String json = prefs.getString("json", null);
        if (json == null) return null;
        try {
            return new JSONObject(json);
        } catch (Throwable e) {
            return null;
        }
    }

    static String status(SharedPreferences prefs) {
        return TodayWidget.status(prefs);
    }
}
