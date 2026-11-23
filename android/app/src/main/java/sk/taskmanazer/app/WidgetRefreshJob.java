package sk.taskmanazer.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.PersistableBundle;

/**
 * Sťahovanie dát pre widget.
 *
 * Prvá verzia sťahovala priamo v prijímači vysielania (goAsync + vlákno).
 * Samsung však appke na pozadí sieť ticho zakáže a požiadavka nikdy nedošla
 * na server („zatiaľ nepoužité" pri tokene). Úloha cez JobScheduler s
 * podmienkou siete dostane prístup k sieti aj vtedy, keď appka nie je otvorená.
 */
public class WidgetRefreshJob extends JobService {
    private static final int JOB_REFRESH = 7101;
    private static final int JOB_DONE_BASE = 7200;
    private static final String EXTRA_TASK = "taskId";

    /** Naplánuje obnovenie; s `taskId` najprv úlohu odškrtne. */
    static void schedule(Context context, String taskId) {
        JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        boolean done = taskId != null && !taskId.isEmpty();
        int id = done ? JOB_DONE_BASE + (taskId.hashCode() & 0x3ff) : JOB_REFRESH;

        PersistableBundle extras = new PersistableBundle();
        if (done) extras.putString(EXTRA_TASK, taskId);

        try {
            JobInfo job = new JobInfo.Builder(id, new ComponentName(context, WidgetRefreshJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setExtras(extras)
                    .build();
            if (js.schedule(job) == JobScheduler.RESULT_SUCCESS) return;
        } catch (RuntimeException e) {
            // Napr. SecurityException bez ACCESS_NETWORK_STATE (Android 14+) —
            // vo verzii 1.2 práve toto nechalo widget navždy na „obnovujem…".
            context.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("error", "plánovač: " + e.getClass().getSimpleName()).apply();
        }
        runNow(context.getApplicationContext(), done ? taskId : null);
    }

    /** Záloha, keď plánovač odmietne: stiahne hneď vo vlákne. */
    private static void runNow(final Context app, final String taskId) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (taskId != null) TodayWidget.postDone(app, taskId);
                    TodayWidget.refresh(app);
                } catch (Throwable ignored) {
                } finally {
                    try {
                        TodayWidget.updateAll(app);
                    } catch (Throwable ignored) {
                    }
                }
            }
        }).start();
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String taskId = params.getExtras().getString(EXTRA_TASK);
                    if (taskId != null && !taskId.isEmpty()) TodayWidget.postDone(app, taskId);
                    TodayWidget.refresh(app);
                } catch (Throwable ignored) {
                    // widget nesmie spadnúť
                } finally {
                    try {
                        TodayWidget.updateAll(app);
                    } catch (Throwable ignored) {
                    }
                    jobFinished(params, false);
                }
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // Systém úlohu prerušil (stratila sa sieť) — skúsi ju znova.
        return true;
    }
}
