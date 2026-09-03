package app.jeecbt.focus;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.role.RoleManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Base64;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * JEE CBT — native shell v3.1 (study launcher).
 *
 * v3.1 — STUDY LAUNCHER MODE (PW LearnOS-style):
 *  - Optional HOME-screen mode: press Home → padhai, not reels. Enabled by
 *    the student inside the app (activity-alias flipped on, Android asks to
 *    pick default home). Fully reversible from the same switch.
 *  - App dock: launcher JS bridge lists installed apps; the site renders a
 *    minimal drawer so zaroori apps (Phone/WhatsApp/Camera) khul sakein.
 *  - During Focus Lock the drawer respects the guard — blocked apps bounce.
 *
 * v3.0:
 *  - NO URL prompt: the site is baked in and opens instantly (URL dialog
 *    only appears as a fallback if the page fails to load)
 *  - Native SPLASH screen while the site loads — opens like a real app
 *  - First-launch SETUP WIZARD: welcome → notifications → Focus Guard,
 *    so the app blocker is configured BEFORE the first lock, not after
 *  - everything from v2.0: real app blocker, daily reminders (closed-app),
 *    keep-awake exams, haptics, native share, reboot survival
 */
public class MainActivity extends Activity {

    static final String PREFS = "jeecbt";
    static final String CHANNEL_ID = "study_reminders";
    static final String DEFAULT_URL = "https://ntacbt.lovable.app/jee-cbt.html";

    private WebView web;
    private View splash;
    private FrameLayout rootLayout;
    private boolean pageLoaded = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        makeChannel(this);

        rootLayout = new FrameLayout(this);
        web = new WebView(this);
        rootLayout.addView(web);
        splash = buildSplash();
        rootLayout.addView(splash);
        setContentView(rootLayout);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // cache → faster next opens

        web.addJavascriptInterface(new FocusBridge(this), "AndroidFocus");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (!pageLoaded) {
                    pageLoaded = true;
                    hideSplash();
                    maybeRunSetupWizard();
                }
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                // main page failed (wrong URL / no net) → fallback dialog
                if (req != null && req.isForMainFrame()) {
                    hideSplash();
                    askUrl("Site load nahi hui — internet check karo ya address badlo.");
                }
            }
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

        web.loadUrl(getUrl(this)); // opens instantly — no prompt
    }

    /* ---------- splash: brand screen while the site boots ---------- */
    private View buildSplash() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0xFF141232, 0xFF1B1B4B, 0xFF2A1E5C});
        box.setBackground(bg);

        TextView logo = new TextView(this);
        logo.setText("🎯");
        logo.setTextSize(64);
        logo.setGravity(Gravity.CENTER);
        box.addView(logo);

        TextView title = new TextView(this);
        title.setText("JEE CBT");
        title.setTextColor(Color.WHITE);
        title.setTextSize(30);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Padhai ka poora system — tests, AI planner, Focus Lock");
        sub.setTextColor(0xB3FFFFFF);
        sub.setTextSize(13);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(60, 12, 60, 30);
        box.addView(sub);

        ProgressBar pb = new ProgressBar(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER;
        box.addView(pb, lp);
        return box;
    }

    private void hideSplash() {
        if (splash != null) {
            splash.animate().alpha(0f).setDuration(300)
                    .withEndAction(() -> { rootLayout.removeView(splash); splash = null; })
                    .start();
        }
    }

    /* ---------- first-launch setup wizard ---------- */
    private void maybeRunSetupWizard() {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (p.getBoolean("onboarded", false)) {
            // already set up — but if guard got turned off later, remind gently once per launch
            if (!guardEnabled(this) && !p.getBoolean("guardNagged", false)) {
                p.edit().putBoolean("guardNagged", true).apply();
            }
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("👋 Welcome — 1 minute ka setup")
                .setMessage("Yeh app website se 2 kadam aage hai:\n\n"
                        + "🔒 REAL Focus Lock — reels/games सचमुच block honge\n"
                        + "⏰ Pakka daily reminder — app band ho tab bhi\n"
                        + "🔆 Exam mein screen kabhi off nahi\n\n"
                        + "In sab ke liye 2 chhoti permissions chahiye. Abhi set karein?")
                .setCancelable(false)
                .setPositiveButton("Haan, set karo", (d, w) -> {
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("onboarded", true).apply();
                    maybeAskNotifPermission();
                    if (!guardEnabled(this)) showGuardOnboarding();
                })
                .setNegativeButton("Baad mein", (d, w) ->
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("onboarded", true).apply())
                .show();
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

    private void askUrl(String why) {
        final EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        in.setText(getUrl(this));
        new AlertDialog.Builder(this)
                .setTitle("Website address")
                .setMessage(why)
                .setView(in)
                .setPositiveButton("Kholo", (d, w) -> {
                    String u = in.getText().toString().trim();
                    if (!u.startsWith("http")) u = "https://" + u;
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("url", u).apply();
                    pageLoaded = false;
                    web.loadUrl(u);
                })
                .setNegativeButton("Retry", (d, w) -> { pageLoaded = false; web.reload(); })
                .show();
    }

    static String getUrl(Context c) {
        return c.getSharedPreferences(PREFS, MODE_PRIVATE).getString("url", DEFAULT_URL);
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
                .setMessage("Focus Guard abhi OFF hai — jab tak yeh ON nahi hoga, doosre apps block NAHI honge (Android ka rule hai, har blocker app ko yeh chahiye).\n\n"
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

    /* ═══════════════ STUDY LAUNCHER MODE (v3.1) ═══════════════ */

    /** The HOME-role alias declared in the manifest (disabled by default). */
    static ComponentName homeAlias(Context c) {
        return new ComponentName(c, "app.jeecbt.focus.HomeActivity");
    }

    static boolean launcherModeEnabled(Context c) {
        try {
            int st = c.getPackageManager().getComponentEnabledSetting(homeAlias(c));
            return st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
        } catch (Exception e) { return false; }
    }

    /** Are we ACTUALLY the current default home app? */
    static boolean isDefaultHome(Context c) {
        try {
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = c.getPackageManager().resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
            return ri != null && ri.activityInfo != null
                    && "app.jeecbt.focus".equals(ri.activityInfo.packageName);
        } catch (Exception e) { return false; }
    }

    void setLauncherMode(boolean on) {
        try {
            getPackageManager().setComponentEnabledSetting(homeAlias(this),
                    on ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                       : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP);
        } catch (Exception ignored) {}
        if (on) {
            // ask Android to make us the default home (student always confirms)
            openHomeChooser();
        } else {
            Toast.makeText(this, "🏠 Launcher mode OFF — phone wapas normal", Toast.LENGTH_LONG).show();
        }
    }

    void openHomeChooser() {
        boolean asked = false;
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                RoleManager rm = (RoleManager) getSystemService(Context.ROLE_SERVICE);
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)
                        && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                    startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), 7001);
                    asked = true;
                }
            } catch (Exception ignored) {}
        }
        if (!asked) {
            try { startActivity(new Intent(Settings.ACTION_HOME_SETTINGS)); }
            catch (Exception e) {
                // last resort: fire a HOME intent so the picker appears
                try {
                    Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception ignored) {}
            }
        }
    }

    /** Small base64 PNG data URI of a real app icon (72x72), or null. */
    private String iconDataUri(Drawable d) {
        if (d == null) return null;
        try {
            int size = 72;
            Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, size, size);
            d.draw(c);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
            bmp.recycle();
            return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable t) { return null; }
    }

    /** All launchable apps (for the dock/drawer), sorted by label.
     *  Each row: pkg, label, activity (component) and — for the first ~120
     *  apps — a base64 PNG of the REAL launcher icon. */
    String listLaunchableApps() {
        JSONArray arr = new JSONArray();
        riCache.clear();
        try {
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            PackageManager pm = getPackageManager();
            List<ResolveInfo> apps = pm.queryIntentActivities(main, 0);
            List<JSONObject> rows = new ArrayList<>();
            for (ResolveInfo ri : apps) {
                if (ri.activityInfo == null) continue;
                String pkg = ri.activityInfo.packageName;
                if ("app.jeecbt.focus".equals(pkg)) continue;
                JSONObject o = new JSONObject();
                o.put("pkg", pkg);
                o.put("activity", ri.activityInfo.name);
                o.put("label", String.valueOf(ri.loadLabel(pm)));
                o.put("_ri", rows.size());
                rows.add(o);
                // keep a parallel handle so we can load icons after sorting
                riCache.add(ri);
            }
            Collections.sort(rows, (a, b) ->
                    a.optString("label").compareToIgnoreCase(b.optString("label")));
            int withIcons = 0;
            for (JSONObject o : rows) {
                if (withIcons < 120) {
                    try {
                        ResolveInfo ri = riCache.get(o.optInt("_ri", -1));
                        String uri = iconDataUri(ri.loadIcon(pm));
                        if (uri != null) { o.put("icon", uri); withIcons++; }
                    } catch (Throwable ignored) {}
                }
                o.remove("_ri");
                arr.put(o);
            }
            riCache.clear();
        } catch (Exception ignored) {}
        return arr.toString();
    }

    private final List<ResolveInfo> riCache = new ArrayList<>();

    /** During Focus Lock only essential apps may open. */
    private boolean allowedDuringLock(String pkg) {
        if (!FocusGuardService.isLocked(this)) return true;
        String low = pkg.toLowerCase();
        return low.contains("dialer") || low.contains("phone")
                || low.contains("emergency") || low.contains("telecom")
                || low.contains("camera") || low.contains("settings");
    }

    /** Open another app from the dock/drawer. The JS bridge calls this on a
     *  background thread, so the actual startActivity() is hopped onto the
     *  main thread and we wait for the result before answering JS. */
    boolean openApp(String pkg) { return openAppComponent(pkg, null); }

    boolean openAppComponent(String pkg, String activity) {
        if (pkg == null || pkg.isEmpty()) return false;
        if (!allowedDuringLock(pkg)) {
            new Handler(Looper.getMainLooper()).post(() ->
                    Toast.makeText(this, "🔒 Focus Lock: pehle padhai — app baad mein", Toast.LENGTH_SHORT).show());
            return false;
        }
        final AtomicBoolean ok = new AtomicBoolean(false);
        final CountDownLatch latch = new CountDownLatch(1);
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Intent i = null;
                if (activity != null && !activity.isEmpty()) {
                    i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
                    i.setComponent(new ComponentName(pkg, activity));
                }
                if (i == null) i = getPackageManager().getLaunchIntentForPackage(pkg);
                if (i != null) {
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                    startActivity(i);
                    ok.set(true);
                }
            } catch (Exception e) {
                // explicit component can fail (renamed activity) — retry generic
                try {
                    Intent f = getPackageManager().getLaunchIntentForPackage(pkg);
                    if (f != null) {
                        f.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                        startActivity(f);
                        ok.set(true);
                    }
                } catch (Exception ignored) {}
            } finally { latch.countDown(); }
        });
        try { latch.await(3, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        return ok.get();
    }

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
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY, pi);
    }

    static void cancelReminder(Context c) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("remHour", -1).apply();
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
            // LAUNCHER MODE: a home screen never "exits" on Back
            if (isDefaultHome(this)) return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /* ═══════════════ JS BRIDGE ═══════════════ */
    public static class FocusBridge {
        private final MainActivity act;
        FocusBridge(MainActivity a) { act = a; }

        @JavascriptInterface public boolean isApp() { return true; }
        @JavascriptInterface public String appVersion() { return "3.2"; }
        @JavascriptInterface public boolean isGuardEnabled() { return guardEnabled(act); }

        /* ---- STUDY LAUNCHER bridge (v3.1) ---- */
        @JavascriptInterface public boolean isLauncherMode() { return launcherModeEnabled(act); }
        @JavascriptInterface public boolean isDefaultLauncher() { return isDefaultHome(act); }
        @JavascriptInterface public void setLauncherMode(boolean on) {
            act.runOnUiThread(() -> act.setLauncherMode(on));
        }
        @JavascriptInterface public void openHomeSettings() {
            act.runOnUiThread(act::openHomeChooser);
        }
        @JavascriptInterface public String listApps() { return act.listLaunchableApps(); }
        @JavascriptInterface public boolean openApp(String pkg) { return act.openApp(pkg); }
        @JavascriptInterface public boolean openAppComponent(String pkg, String activity) {
            return act.openAppComponent(pkg, activity);
        }

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

        @JavascriptInterface
        public void keepAwake(boolean on) {
            act.runOnUiThread(() -> {
                if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

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
