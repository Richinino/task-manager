package sk.taskmanazer.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Spoločné pomôcky widgetov Žaba, Kopa, Zapísať 2×1 a Rezerva (čítanie cache JSON, farby, zámery). */
final class WidgetQueue {
    static final int AMBER = 0xFFD9971C;
    static final int ON_AMBER = 0xFF1D1405;

    private WidgetQueue() {
    }

    static final class Item {
        String id = "";
        String title = "";
        String estimate = "";
        boolean hasColor;
        int color;
        boolean frog;
    }

    /** Uložený JSON alebo null, keď ešte nie je (alebo je pokazený). */
    static JSONObject load(SharedPreferences prefs) {
        try {
            String json = prefs.getString("json", null);
            return json == null ? null : new JSONObject(json);
        } catch (Throwable t) {
            return null;
        }
    }

    static String str(JSONObject o, String key) {
        if (o == null || o.isNull(key)) return "";
        return o.optString(key, "");
    }

    /** `queue` zo servera; starší server ho nemá, vtedy `frog` + `tasks`. */
    static List<Item> queue(JSONObject o) {
        List<Item> out = new ArrayList<Item>();
        try {
            JSONArray q = o.optJSONArray("queue");
            if (q != null) {
                for (int i = 0; i < q.length(); i++) {
                    JSONObject t = q.optJSONObject(i);
                    if (t != null) out.add(item(t, t.optBoolean("frog", false)));
                }
                return out;
            }
            JSONObject frog = o.optJSONObject("frog");
            if (frog != null) out.add(item(frog, true));
            JSONArray tasks = o.optJSONArray("tasks");
            if (tasks != null) {
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject t = tasks.optJSONObject(i);
                    if (t == null) continue;
                    Item it = item(t, false);
                    boolean dup = false;
                    for (Item e : out) {
                        if (!it.id.isEmpty() && it.id.equals(e.id)) dup = true;
                    }
                    if (!dup) out.add(it);
                }
            }
        } catch (Throwable ignored) {
        }
        return out;
    }

    private static Item item(JSONObject t, boolean frog) {
        Item it = new Item();
        it.id = str(t, "id");
        it.title = str(t, "title");
        it.estimate = str(t, "estimate");
        it.frog = frog;
        String col = str(t, "color");
        if (!col.isEmpty()) {
            try {
                it.color = Color.parseColor(col) | 0xFF000000;
                it.hasColor = true;
            } catch (IllegalArgumentException ignored) {
            }
        }
        return it;
    }

    /** Farba karty: žaba jantárová, inak farba oblasti, inak `w_accent`. */
    static int cardColor(Context c, Item it) {
        if (it.frog) return AMBER;
        if (it.hasColor) return it.color;
        return c.getColor(R.color.w_accent);
    }

    /** Čitateľný text na pozadí: tmavý na svetlom, biely na tmavom. */
    static int textOn(int bg) {
        double lum = 0.299 * Color.red(bg) + 0.587 * Color.green(bg) + 0.114 * Color.blue(bg);
        return lum > 150 ? ON_AMBER : 0xFFFFFFFF;
    }

    static int flags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }

    /** Vysielanie vlastnému poskytovateľovi (odškrtnutie, ďalšia). */
    static PendingIntent self(Context c, int code, Class<?> cls, String action, String taskId) {
        Intent i = new Intent(c, cls);
        i.setAction(action);
        if (taskId != null) {
            i.putExtra(TodayWidget.EXTRA_TASK_ID, taskId);
            i.setData(Uri.parse("tmwidget://" + cls.getSimpleName() + "/" + Uri.encode(taskId)));
        }
        return PendingIntent.getBroadcast(c, code, i, flags());
    }

    /** Minúty ako „3 h 55", „45 min", „2 h". */
    static String fmtMin(Context c, int min) {
        if (min < 0) min = -min;
        int h = min / 60;
        int m = min % 60;
        if (h == 0) return c.getString(R.string.wa_min, m);
        if (m == 0) return c.getString(R.string.wa_h, h);
        return c.getString(R.string.wa_hm, h, m);
    }
}
