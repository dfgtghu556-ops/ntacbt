package app.jeecbt.focus;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Fires the daily study-reminder notification — even when the app is closed.
 * Rotating desi-motivation lines so it never gets stale.
 */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String[] LINES = {
            "📚 Aaj ka Daily 10 baaki hai — 15 minute, bas!",
            "🔥 Streak zinda rakhni hai? Ek question hi kaafi hai shuru karne ko.",
            "🎯 Sapna yaad hai na? Aaj ka hissa aaj hi.",
            "⏰ Padhai time! Toppers roz aate hain — tum bhi aao.",
            "💪 Kal wala promise nibhane ka time aa gaya.",
            "🧠 5 formula flashcards se hi shuru kar lo — momentum khud banega.",
    };

    @Override
    public void onReceive(Context context, Intent intent) {
        MainActivity.makeChannel(context);
        String line = LINES[(int) (System.currentTimeMillis() / 86400000L % LINES.length)];

        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(context, 101, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new Notification.Builder(context, MainActivity.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("JEE CBT")
                .setContentText(line)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(2001, n);
    }
}
