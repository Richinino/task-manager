package sk.taskmanazer.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Widget „Dnes": priorita dňa a až 4 úlohy, odškrtávanie priamo z plochy. */
public class TodayWidget extends AppWidgetProvider {
    static final String HOST = "task-manager-kappa-steel-75.vercel.app";
    static final String BASE = "https://" + HOST;
    static final String ACTION_DONE = "sk.taskmanazer.app.widget.DONE";
    static final String ACTION_REFRESH = "sk.taskmanazer.app.widget.REFRESH";
    static final String EXTRA_TASK_ID = "taskId";
    static final String PREFS = "widget";

    private static final int[] ROWS = {R.id.row1, R.id.row2, R.id.row3, R.id.row4};
    private static final int[] CHECKS = {R.id.check1, R.id.check2, R.id.check3, R.id.check4};
    private static final int[] TITLES = {R.id.title1, R.id.title2, R.id.title3, R.id.title4};
    private static final int[] ESTS = {R.id.est1, R.id.est2, R.id.est3, R.id.est4};
    private static final int[] DOTS = {R.id.dot1, R.id.dot2, R.id.dot3, R.id.dot4};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        // Hneď ukáž poslednú uloženú verziu, potom obnov zo siete.
        updateAll(context);
        runAsync(context, goAsync(), null);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_DONE.equals(action)) {
            String taskId = intent.getStringExtra(EXTRA_TASK_ID);
            runAsync(context, goAsync(), taskId);
        } else if (ACTION_REFRESH.equals(action)) {
            runAsync(context, goAsync(), null);
        } else {
            super.onReceive(context, intent);
        }
    }

    private static void runAsync(final Context context, final PendingResult result, final String doneTaskId) {
        final Context app = context.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (doneTaskId != null && !doneTaskId.isEmpty()) {
                        postDone(app, doneTaskId);
                    }
                    refresh(app);
                } catch (Throwable ignored) {
                    // widget nesmie spadnúť
                } finally {
                    try {
                        updateAll(app);
                    } catch (Throwable ignored) {
                    }
                    result.finish();
                }
            }
        }).start();
    }

    private static String token(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("token", null);
    }

    private static void postDone(Context c, String taskId) {
        String token = token(c);
        if (token == null) return;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(BASE + "/api/widget/hotovo").openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Content-Type", "application/json");
            byte[] body = new JSONObject().put("taskId", taskId).toString().getBytes("UTF-8");
            OutputStream os = conn.getOutputStream();
            os.write(body);
            os.close();
            int code = conn.getResponseCode();
            if (code == 401) clearToken(c);
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void clearToken(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove("token").remove("json").putBoolean("offline", false).apply();
    }

    private static void refresh(Context c) {
        String token = token(c);
        if (token == null) return;
        SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(BASE + "/api/widget").openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Accept", "application/json");
            int code = conn.getResponseCode();
            if (code == 401) {
                clearToken(c);
                return;
            }
            if (code != 200) {
                prefs.edit().putBoolean("offline", true).apply();
                return;
            }
            InputStream in = conn.getInputStream();
            BufferedReader r = new BufferedReader(new InputStreamReader(in, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            String json = sb.toString();
            new JSONObject(json); // overenie, že je to platný JSON
            prefs.edit().putString("json", json).putBoolean("offline", false).apply();
        } catch (Exception e) {
            prefs.edit().putBoolean("offline", true).apply();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    static void updateAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
        if (ids == null || ids.length == 0) return;
        mgr.updateAppWidget(ids, build(c));
    }

    private static RemoteViews build(Context c) {
        SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);

        v.setOnClickPendingIntent(R.id.add, openUrl(c, 1, BASE + "/dnes?zachytit=1"));
        v.setOnClickPendingIntent(R.id.refresh, broadcast(c, 2, ACTION_REFRESH, null));

        String token = prefs.getString("token", null);
        String json = prefs.getString("json", null);
        if (token == null) {
            showMessage(v, "Pripoj widget v appke: Nastavenia → Telefón", "");
            v.setOnClickPendingIntent(R.id.widget_root, openUrl(c, 3, BASE + "/nastavenia#telefon"));
            v.setViewVisibility(R.id.add, View.GONE);
            return v;
        }
        if (json == null) {
            showMessage(v, "Načítavam…", prefs.getBoolean("offline", false) ? "bez spojenia" : "");
            return v;
        }

        try {
            JSONObject o = new JSONObject(json);
            String summary = o.optString("summary", "");
            if (prefs.getBoolean("offline", false)) summary = "bez spojenia";
            v.setTextViewText(R.id.summary, summary);
            v.setViewVisibility(R.id.message, View.GONE);

            PendingIntent openToday = openUrl(c, 4, BASE + "/dnes");
            JSONObject frog = o.isNull("frog") ? null : o.optJSONObject("frog");
            if (frog != null) {
                v.setViewVisibility(R.id.priority_row, View.VISIBLE);
                v.setTextViewText(R.id.priority_title, frog.optString("title", ""));
                String est = frog.isNull("estimate") ? "" : frog.optString("estimate", "");
                v.setTextViewText(R.id.priority_est, est);
                v.setOnClickPendingIntent(R.id.priority_row, openToday);
            } else {
                v.setViewVisibility(R.id.priority_row, View.GONE);
            }

            JSONArray tasks = o.optJSONArray("tasks");
            int n = tasks == null ? 0 : Math.min(4, tasks.length());
            for (int i = 0; i < 4; i++) {
                if (i >= n) {
                    v.setViewVisibility(ROWS[i], View.GONE);
                    continue;
                }
                JSONObject t = tasks.getJSONObject(i);
                v.setViewVisibility(ROWS[i], View.VISIBLE);
                v.setTextViewText(TITLES[i], t.optString("title", ""));
                String est = t.isNull("estimate") ? "" : t.optString("estimate", "");
                v.setTextViewText(ESTS[i], est);
                String color = t.isNull("color") ? "" : t.optString("color", "");
                if (!color.isEmpty()) {
                    try {
                        v.setInt(DOTS[i], "setColorFilter", Color.parseColor(color));
                        v.setViewVisibility(DOTS[i], View.VISIBLE);
                    } catch (IllegalArgumentException e) {
                        v.setViewVisibility(DOTS[i], View.INVISIBLE);
                    }
                } else {
                    v.setViewVisibility(DOTS[i], View.INVISIBLE);
                }
                v.setOnClickPendingIntent(ROWS[i], openToday);
                v.setOnClickPendingIntent(CHECKS[i],
                        broadcast(c, 20 + i, ACTION_DONE, t.optString("id", "")));
            }
            v.setViewVisibility(R.id.add, View.VISIBLE);
        } catch (Exception e) {
            showMessage(v, "Dáta sa nepodarilo prečítať", "bez spojenia");
        }
        return v;
    }

    private static void showMessage(RemoteViews v, String message, String summary) {
        v.setTextViewText(R.id.summary, summary);
        v.setTextViewText(R.id.message, message);
        v.setViewVisibility(R.id.message, View.VISIBLE);
        v.setViewVisibility(R.id.priority_row, View.GONE);
        for (int i = 0; i < 4; i++) v.setViewVisibility(ROWS[i], View.GONE);
    }

    private static int flags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }

    static Intent viewIntent(Context c, String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.setClass(c, LauncherActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    private static PendingIntent openUrl(Context c, int code, String url) {
        return PendingIntent.getActivity(c, code, viewIntent(c, url), flags());
    }

    private static PendingIntent broadcast(Context c, int code, String action, String taskId) {
        Intent i = new Intent(c, TodayWidget.class);
        i.setAction(action);
        if (taskId != null) {
            i.putExtra(EXTRA_TASK_ID, taskId);
            i.setData(Uri.parse("tmwidget://done/" + Uri.encode(taskId)));
        }
        return PendingIntent.getBroadcast(c, code, i, flags());
    }
}
