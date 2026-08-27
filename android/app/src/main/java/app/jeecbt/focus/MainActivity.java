package app.jeecbt.focus;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import java.util.Calendar;

/**
 * JEE CBT — native shell v2.0 (full production app).
 *
 * Native superpowers exposed to the site via the "AndroidFocus" JS bridge:
 *  - REAL Focus Lock (accessibility app blocker, survives process death)
 *  - Daily study reminder notifications (work with the app CLOSED, re-armed
 *    after reboot) — browsers can't do this without a push server
 *  - Keep-screen-on during exams (no more screen-off mid mock)
 *  - Haptic feedback (submit, streak, block bounces)
 *  - Native share (scorecards/streaks straight to WhatsApp etc.)
 *  - Reliable guard detection + full onboarding incl. Android 13+
 *    "Restricted settings" path
 */
public class MainActivity extends Activity {

    static final String PREFS = "jeecbt";
    static final String CHANNEL_ID = "study_reminders";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        makeChannel(this);
        maybeAskNotifPermission();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        web.addJavascriptInterface(new FocusBridge(this), "AndroidFocus");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                String home = host(getUrl(MainActivity.this));
                if (url.contains(home) || url.contains("youtube.com/embed")
                        || url.contains("youtube-nocookie.com")) return false;
                if (FocusGuardService.isLocked(MainActivity.this)) return true; // no escape mid-lock
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
                return true;
            }
        });

        String url = getUrl(this);
        if (url.isEmpty()) askUrl(); else web.loadUrl(url);
    }

    static void makeChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                    "Study reminders", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Daily padhai reminder + streak alerts");
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void maybeAskNotifPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7);
        }
    }

    private void askUrl() {
        final EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        in.setText("https://ntacbt.lovable.app/jee-cbt.html");
        new AlertDialog.Builder(this)
                .setTitle("Apni website ka address")
                .setMessage("Apni JEE CBT website ka poora address daalo (bas ek baar).")
                .setView(in)
                .setCancelable(false)
                .setPositiveButton("Kholo", (d, w) -> {
                    String u = in.getText().toString().trim();
                    if (!u.startsWith("http")) u = "https://" + u;
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("url", u).apply();
                    web.loadUrl(u);
                }).show();
    }

    static String getUrl(Context c) {
        return c.getSharedPreferences(PREFS, MODE_PRIVATE).getString("url", "");
    }

    static String host(String url) {
        try { String h = Uri.parse(url).getHost(); return h == null ? "" : h; } catch (Exception e) { return ""; }
    }

    static boolean guardEnabled(Context c) {
        try {
            String enabled = Settings.Secure.getString(c.getContentResolver(),
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            return enabled != null && enabled.toLowerCase().contains("app.jeecbt.focus");
        } catch (Exception e) { return FocusGuardService.serviceConnected; }
    }

    void showGuardOnboarding() {
        new AlertDialog.Builder(this)
                .setTitle("🔒 REAL blocking ke liye 1 setting")
                .setMessage("Focus Guard abhi OFF hai — isliye doosre apps block NAHI ho rahe.\n\n"
                        + "① Neeche 'Accessibility kholo' dabao\n"
                        + "② 'Downloaded apps' mein JEE CBT Focus Guard → ON → Allow\n\n"
                        + "⚠️ Agar 'Restricted setting' bolke rok de (Android 13+):\n"
                        + "① 'App Info kholo' dabao\n"
                        + "② Upar-right ⋮ (3 dots) → 'Allow restricted settings' → phone ka PIN\n"
                        + "③ Phir wapas Accessibility mein ON karo\n\n"
                        + "Privacy: sirf app ka NAAM dekha jata hai — koi content nahi, kuch upload nahi hota.")
                .setPositiveButton("Accessibility kholo", (d, w) -> {
                    try { startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); } catch (Exception ignored) {}
                })
                .setNeutralButton("App Info kholo", (d, w) -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.parse("package:app.jeecbt.focus")));
                    } catch (Exception ignored) {}
                })
                .setNegativeButton("Baad mein", null)
                .show();
    }

    /** Schedule (or reschedule) the daily reminder at hour:minute. */
    static void scheduleReminder(Context c, int hour, int minute) {
        SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
        p.edit().putInt("remHour", hour).putInt("remMin", minute).apply();
        AlarmManager am = (AlarmManager) c.getSystemService(ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, ReminderReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 100, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis())
            cal.add(Calendar.DAY_OF_YEAR, 1);
        // inexact repeating is battery-friendly and survives Doze well enough
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY, pi);
    }

    static void cancelReminder(Context c) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putInt("remHour", -1).apply();
        AlarmManager am = (AlarmManager) c.getSystemService(ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, ReminderReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 100, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript(
                "try{if(typeof render==='function'&&route==='dash')render(0);}catch(e){}", null);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (web.canGoBack()) { web.goBack(); return true; }
            if (FocusGuardService.isLocked(this)) {
                Toast.makeText(this, "🔒 Focus Lock chal raha hai — padhai khatam karke hi niklo", Toast.LENGTH_SHORT).show();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    /* ═══════════════ JS BRIDGE — the site's native superpowers ═══════════════ */
    public static class FocusBridge {
        private final MainActivity act;
        FocusBridge(MainActivity a) { act = a; }

        @JavascriptInterface public boolean isApp() { return true; }
        @JavascriptInterface public String appVersion() { return "2.0"; }
        @JavascriptInterface public boolean isGuardEnabled() { return guardEnabled(act); }

        /* ---- Focus Lock ---- */
        @JavascriptInterface
        public void startLock(int minutes) {
            long until = System.currentTimeMillis() + minutes * 60000L;
            SharedPreferences p = act.getSharedPreferences(PREFS, MODE_PRIVATE);
            p.edit().putLong("lockUntil", until).putInt("blocks", 0).apply();
            FocusGuardService.lockUntil = until;
            FocusGuardService.lockActive = true;
            act.runOnUiThread(() -> {
                if (guardEnabled(act))
                    Toast.makeText(act, "🔒 " + minutes + " min ka REAL lock ON — doosre apps block!", Toast.LENGTH_LONG).show();
                else act.showGuardOnboarding();
            });
        }

        @JavascriptInterface
        public void stopLock() {
            act.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putLong("lockUntil", 0).apply();
            FocusGuardService.lockActive = false;
            FocusGuardService.lockUntil = 0;
        }

        @JavascriptInterface
        public int getBlockCount() {
            return act.getSharedPreferences(PREFS, MODE_PRIVATE).getInt("blocks", 0);
        }

        @JavascriptInterface
        public void openGuardSettings() { act.runOnUiThread(act::showGuardOnboarding); }

        /* ---- Daily reminder (works with app closed) ---- */
        @JavascriptInterface
        public void setDailyReminder(int hour, int minute) {
            scheduleReminder(act, hour, minute);
            act.runOnUiThread(() ->
                Toast.makeText(act, "⏰ Roz " + String.format("%02d:%02d", hour, minute)
                        + " par yaad dilayenge — app band ho tab bhi!", Toast.LENGTH_LONG).show());
        }

        @JavascriptInterface
        public void cancelDailyReminder() { cancelReminder(act); }

        @JavascriptInterface
        public int getReminderHour() {
            return act.getSharedPreferences(PREFS, MODE_PRIVATE).getInt("remHour", -1);
        }

        /* ---- Keep screen on (exam mode) ---- */
        @JavascriptInterface
        public void keepAwake(boolean on) {
            act.runOnUiThread(() -> {
                if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /* ---- Haptics ---- */
        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) act.getSystemService(VIBRATOR_SERVICE);
                if (v == null) return;
                if (Build.VERSION.SDK_INT >= 26)
                    v.vibrate(VibrationEffect.createOneShot(Math.min(ms, 400),
                            VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(Math.min(ms, 400));
            } catch (Exception ignored) {}
        }

        /* ---- Native share ---- */
        @JavascriptInterface
        public void share(String text) {
            try {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                act.startActivity(Intent.createChooser(i, "Share karo"));
            } catch (Exception ignored) {}
        }
    }
}
