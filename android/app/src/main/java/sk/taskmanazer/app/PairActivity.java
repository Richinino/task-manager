package sk.taskmanazer.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

/** Párovanie widgetu: ulohy://pair?token=tm_dt_... */
public class PairActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri data = getIntent() == null ? null : getIntent().getData();
        String token = data == null ? null : data.getQueryParameter("token");
        if (token != null && token.startsWith("tm_dt_") && token.length() > 12 && token.length() < 200) {
            getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("token", token).remove("json").putBoolean("offline", false).apply();
            Toast.makeText(this, "Widget je pripojený", Toast.LENGTH_SHORT).show();
            Intent refresh = new Intent(this, TodayWidget.class);
            refresh.setAction(TodayWidget.ACTION_REFRESH);
            sendBroadcast(refresh);
            TodayWidget.updateAll(this);
        } else {
            Toast.makeText(this, "Neplatný odkaz na pripojenie", Toast.LENGTH_SHORT).show();
        }
        finish();
    }
}
