package app.jeecbt.focus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** Phone reboot ke baad daily reminder ko dobara arm karta hai. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences p = context.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        int h = p.getInt("remHour", -1), m = p.getInt("remMin", 0);
        if (h >= 0) MainActivity.scheduleReminder(context, h, m);
    }
}
