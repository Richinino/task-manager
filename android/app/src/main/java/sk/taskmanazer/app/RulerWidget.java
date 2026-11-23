package sk.taskmanazer.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget „Pravítko" 4×2: celý deň na jednom páse, rezerva a dve najbližšie úlohy. */
public class RulerWidget extends AppWidgetProvider {
    private static final int AMBER = 0xFFD9971C;
    private static final int[] HOURS = {R.id.h1, R.id.h2, R.id.h3, R.id.h4, R.id.h5, R.id.h6};
    private static final int[] CHIPS = {R.id.chip1, R.id.chip2};
    private static final int[] CHIP_DOTS = {R.id.chipdot1, R.id.chipdot2};
    private static final int[] CHIP_TITLES = {R.id.chiptitle1, R.id.chiptitle2};

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

    static void updateAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, RulerWidget.class));
        if (ids == null) return;
        for (int id : ids) {
            try {
                mgr.updateAppWidget(id, build(c, mgr, id));
            } catch (Throwable ignored) {
            }
        }
    }

    private static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    private static int widthPx(Context c, AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        boolean land = c.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int wdp = o == null ? 0 : o.getInt(land
                ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
                : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        if (wdp <= 0) wdp = 320;
        wdp -= 28; // vodorovné odsadenie widgetu
        if (wdp < 120) wdp = 120;
        return dp(c, wdp);
    }

    private static RemoteViews build(Context c, AppWidgetManager mgr, int id) {
        SharedPreferences prefs = c.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_ruler);
        PendingIntent openToday = TodayWidget.openUrl(c, 31, TodayWidget.BASE + "/dnes");
        v.setOnClickPendingIntent(R.id.widget_root, openToday);

        String token = prefs.getString("token", null);
        String json = prefs.getString("json", null);
        if (token == null) {
            showMessage(v, "Pripoj widget v appke: Knižnica → Nastavenia → Telefón");
            v.setOnClickPendingIntent(R.id.widget_root,
                    TodayWidget.openUrl(c, 32, TodayWidget.BASE + "/nastavenia#telefon"));
            return v;
        }
        if (json == null) {
            showMessage(v, "Načítavam…");
            setReserve(v, c, TodayWidget.status(prefs), R.color.w_muted);
            return v;
        }

        try {
            JSONObject o = new JSONObject(json);
            boolean over = o.optBoolean("over", false);
            boolean dayOver = o.optBoolean("dayOver", false);
            String status = TodayWidget.status(prefs);

            String reserve = o.isNull("summary") ? "" : o.optString("summary", "");
            int reserveColor = dayOver ? R.color.w_muted : R.color.w_ok;
            if (over && !dayOver) {
                // Preplnený deň sa hovorí pokojne, bez červenej (docs/TELEFON.md, časť 3).
                setReserve(v, c, reserve, R.color.w_muted);
            } else {
                if (dayOver) reserve = "Deň sa skončil";
                setReserve(v, c, reserve, reserveColor);
            }
            if (!status.isEmpty()) setReserve(v, c, status, R.color.w_muted);

            v.setViewVisibility(R.id.message, View.GONE);

            JSONObject tl = o.isNull("timeline") ? null : o.optJSONObject("timeline");
            if (tl != null) {
                int startMin = tl.optInt("startMin", 420);
                int endMin = tl.optInt("endMin", 1320);
                if (endMin <= startMin) {
                    startMin = 420;
                    endMin = 1320;
                }
                v.setViewVisibility(R.id.ruler, View.VISIBLE);
                v.setViewVisibility(R.id.hours, View.VISIBLE);
                v.setImageViewBitmap(R.id.ruler, drawRuler(c, widthPx(c, mgr, id), tl, startMin, endMin, dayOver));
                for (int i = 0; i < HOURS.length; i++) {
                    int minute = startMin + Math.round((endMin - startMin) * i / 5f);
                    v.setTextViewText(HOURS[i], String.valueOf(Math.round(minute / 60f)));
                }
            } else {
                // Starší server bez osi: ukáž aspoň súhrn a úlohy.
                v.setViewVisibility(R.id.ruler, View.GONE);
                v.setViewVisibility(R.id.hours, View.GONE);
            }

            JSONArray next = o.optJSONArray("next");
            if (next == null || next.length() == 0) next = o.optJSONArray("tasks");
            int n = next == null ? 0 : Math.min(2, next.length());
            v.setViewVisibility(R.id.chips, n == 0 ? View.GONE : View.VISIBLE);
            for (int i = 0; i < 2; i++) {
                if (i >= n) {
                    v.setViewVisibility(CHIPS[i], View.GONE);
                    continue;
                }
                JSONObject t = next.getJSONObject(i);
                v.setViewVisibility(CHIPS[i], View.VISIBLE);
                v.setTextViewText(CHIP_TITLES[i], t.optString("title", ""));
                int col = parseColor(t.isNull("color") ? null : t.optString("color", null));
                if (col != 0) {
                    v.setInt(CHIP_DOTS[i], "setColorFilter", col);
                    v.setViewVisibility(CHIP_DOTS[i], View.VISIBLE);
                } else {
                    v.setViewVisibility(CHIP_DOTS[i], View.INVISIBLE);
                }
                v.setOnClickPendingIntent(CHIPS[i], openToday);
            }
        } catch (Throwable e) {
            showMessage(v, "Dáta sa nepodarilo prečítať");
        }
        return v;
    }

    private static void setReserve(RemoteViews v, Context c, String text, int colorRes) {
        v.setTextViewText(R.id.reserve, text);
        v.setTextColor(R.id.reserve, c.getColor(colorRes));
    }

    private static void showMessage(RemoteViews v, String message) {
        v.setTextViewText(R.id.reserve, "");
        v.setTextViewText(R.id.message, message);
        v.setViewVisibility(R.id.message, View.VISIBLE);
        v.setViewVisibility(R.id.ruler, View.GONE);
        v.setViewVisibility(R.id.hours, View.GONE);
        v.setViewVisibility(R.id.chips, View.GONE);
    }

    /** 0 = bez farby (alfa je vždy nastavená, takže platná farba nie je 0). */
    private static int parseColor(String s) {
        if (s == null || s.isEmpty() || "null".equals(s)) return 0;
        try {
            return Color.parseColor(s);
        } catch (IllegalArgumentException e) {
            return 0;
        }
    }

    private static int withAlpha(int color, float a) {
        return (color & 0x00FFFFFF) | (Math.round(255 * a) << 24);
    }

    /** Pravítko dňa: výška 40 dp = 12 dp na pilulku času + 28 dp stopa. */
    static Bitmap drawRuler(Context c, int w, JSONObject tl, int startMin, int endMin, boolean dayOver) {
        int pillArea = dp(c, 12);
        int trackH = dp(c, 28);
        int h = pillArea + trackH;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);

        int cTrack = c.getColor(R.color.w_track);
        int cSchool = c.getColor(R.color.w_school);
        int cFg = c.getColor(R.color.w_fg);
        int cMuted = c.getColor(R.color.w_muted);
        int cBg = c.getColor(R.color.w_bg);
        int cAccent = c.getColor(R.color.w_accent);
        int cOnAccent = c.getColor(R.color.w_on_accent);

        float span = endMin - startMin;
        RectF track = new RectF(0, pillArea, w, h);
        float radius = trackH / 2f;
        float blockR = dp(c, 4);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(cTrack);
        cv.drawRoundRect(track, radius, radius, p);

        cv.save();
        Path clip = new Path();
        clip.addRoundRect(track, radius, radius, Path.Direction.CW);
        cv.clipPath(clip);

        JSONArray blocks = tl.optJSONArray("blocks");
        float inset = dp(c, 3);
        if (blocks != null) {
            for (int i = 0; i < blocks.length(); i++) {
                JSONObject b = blocks.optJSONObject(i);
                if (b == null) continue;
                float s = Math.max(startMin, b.optInt("startMin", 0));
                float e = Math.min(endMin, b.optInt("endMin", 0));
                if (e <= s) continue;
                float x0 = w * (s - startMin) / span;
                float x1 = w * (e - startMin) / span;
                if (x1 - x0 < dp(c, 3)) x1 = x0 + dp(c, 3);
                RectF r = new RectF(x0, track.top + inset, x1, track.bottom - inset);
                String kind = b.optString("kind", "task");
                boolean frog = b.optBoolean("frog", false);
                int color = parseColor(b.isNull("color") ? null : b.optString("color", null));
                if ("lesson".equals(kind)) {
                    p.setStyle(Paint.Style.FILL);
                    p.setColor(cSchool);
                    cv.drawRoundRect(r, blockR, blockR, p);
                } else if ("meeting".equals(kind) || "event".equals(kind)) {
                    float sw = dp(c, 2);
                    RectF ri = new RectF(r.left + sw / 2, r.top + sw / 2, r.right - sw / 2, r.bottom - sw / 2);
                    p.setStyle(Paint.Style.STROKE);
                    p.setStrokeWidth(sw);
                    p.setColor(cFg);
                    cv.drawRoundRect(ri, blockR, blockR, p);
                    p.setStyle(Paint.Style.FILL);
                } else {
                    p.setStyle(Paint.Style.FILL);
                    p.setColor(frog ? AMBER : (color != 0 ? color : cMuted));
                    cv.drawRoundRect(r, blockR, blockR, p);
                }
            }
        }

        // Minulosť (alebo celý skončený deň) stlmená plochou widgetu.
        int nowMin = tl.optInt("nowMin", -1);
        float pastX = dayOver ? w : (nowMin >= 0 ? w * (Math.min(Math.max(nowMin, startMin), endMin) - startMin) / span : 0);
        if (pastX > 0) {
            p.setStyle(Paint.Style.FILL);
            p.setColor(withAlpha(cBg, 0.55f));
            cv.drawRect(0, track.top, pastX, track.bottom, p);
        }
        cv.restore();

        // Čiara „teraz" s pilulkou času.
        if (!dayOver && nowMin >= startMin && nowMin <= endMin) {
            float x = w * (nowMin - startMin) / span;
            float lw = dp(c, 2);
            float lx = Math.min(Math.max(x, lw / 2), w - lw / 2);
            p.setStyle(Paint.Style.FILL);
            p.setColor(cAccent);
            cv.drawRoundRect(new RectF(lx - lw / 2, pillArea - dp(c, 2), lx + lw / 2, h), lw / 2, lw / 2, p);

            String label = (nowMin / 60) + ":" + (nowMin % 60 < 10 ? "0" : "") + (nowMin % 60);
            Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
            tp.setTypeface(Typeface.DEFAULT_BOLD);
            tp.setTextSize(dp(c, 9));
            tp.setColor(cOnAccent);
            float tw = tp.measureText(label);
            float pw = tw + dp(c, 8);
            float ph = dp(c, 12);
            float px = Math.min(Math.max(lx - pw / 2, 0), w - pw);
            p.setColor(cAccent);
            cv.drawRoundRect(new RectF(px, 0, px + pw, ph), ph / 2, ph / 2, p);
            Paint.FontMetrics fm = tp.getFontMetrics();
            cv.drawText(label, px + (pw - tw) / 2, ph / 2 - (fm.ascent + fm.descent) / 2, tp);
        }
        return bmp;
    }
}
