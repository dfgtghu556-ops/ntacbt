package app.jeecbt.focus;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

/**
 * JEE CBT — native shell.
 * A full-screen WebView over the student's own website, plus a JS bridge
 * ("AndroidFocus") that the site's Focus Lock uses to enforce REAL app
 * blocking through the FocusGuardService (accessibility).
 */
public class MainActivity extends Activity {

    static final String PREFS = "jeecbt";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
                // keep the study site inside the app; external links (YouTube
                // channel pages etc.) open outside — YouTube EMBEDS stay inside.
                String home = host(getUrl(MainActivity.this));
                if (url.contains(home) || url.contains("youtube.com/embed")
                        || url.contains("youtube-nocookie.com")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
                return true;
            }
        });

        String url = getUrl(this);
        if (url.isEmpty()) askUrl(); else web.loadUrl(url);
    }

    /** First launch: ask for the website address once (prefilled). */
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
        try { return Uri.parse(url).getHost(); } catch (Exception e) { return ""; }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // back button navigates the site; during Focus Lock it never exits the app
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (web.canGoBack()) { web.goBack(); return true; }
            if (FocusGuardService.lockActive) {
                Toast.makeText(this, "🔒 Focus Lock chal raha hai — padhai khatam karke hi niklo", Toast.LENGTH_SHORT).show();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    /** JS bridge — the website's Focus Lock talks to the real guard here. */
    public static class FocusBridge {
        private final Activity act;
        FocusBridge(Activity a) { act = a; }

        /** Is this running inside the APK? (site shows stronger lock UI) */
        @JavascriptInterface
        public boolean isApp() { return true; }

        /** Is the accessibility guard enabled by the user? */
        @JavascriptInterface
        public boolean isGuardEnabled() { return FocusGuardService.serviceConnected; }

        /** Start a REAL focus session for N minutes. */
        @JavascriptInterface
        public void startLock(int minutes) {
            FocusGuardService.lockUntil = System.currentTimeMillis() + minutes * 60000L;
            FocusGuardService.lockActive = true;
            act.runOnUiThread(() ->
                Toast.makeText(act, "🔒 " + minutes + " min ka REAL lock ON — doosre apps ab nahi khulenge", Toast.LENGTH_LONG).show());
        }

        /** End the session (site's 5-second-hold quit calls this). */
        @JavascriptInterface
        public void stopLock() {
            FocusGuardService.lockActive = false;
            FocusGuardService.lockUntil = 0;
        }

        /** How many blocked escape attempts this session? (site shows it) */
        @JavascriptInterface
        public int getBlockCount() { return FocusGuardService.blockCount; }

        /** Open Android's accessibility settings so the student can enable the guard. */
        @JavascriptInterface
        public void openGuardSettings() {
            try { act.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); } catch (Exception ignored) {}
        }
    }
}

