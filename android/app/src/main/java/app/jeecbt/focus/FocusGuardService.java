package app.jeecbt.focus;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Toast;

/**
 * FOCUS GUARD v1.1 — the real app blocker.
 *
 * Production hardening vs v1.0:
 *  - lock state read from SharedPreferences, not just statics: Android kills
 *    and restarts service processes at will; statics silently reset to
 *    "unlocked" (THE bug that made v1.0 look dead). Now a lock survives
 *    process death, reboots, everything — until its end time.
 *  - block counter persisted too, so the site can show it after restarts.
 *
 * Privacy unchanged: only the foreground package NAME is read
 * (canRetrieveWindowContent=false), nothing stored beyond a counter,
 * nothing ever uploaded.
 */
public class FocusGuardService extends AccessibilityService {

    static volatile boolean lockActive = false;   // fast path cache
    static volatile long lockUntil = 0;
    static volatile boolean serviceConnected = false;

    private long lastBounce = 0;

    private static final String[] ALLOW = {
            "app.jeecbt.focus",
            "com.android.systemui",
            "com.android.phone", "com.android.dialer", "com.google.android.dialer",
            "com.android.emergency", "com.android.server.telecom",
            "com.android.settings",            // safety hatch stays open
            "inputmethod", ".ime", "keyboard", "com.google.android.inputmethod",
            "packageinstaller", "permissioncontroller" // system dialogs
    };

    /** Single source of truth — prefs first, statics as cache. */
    static boolean isLocked(Context c) {
        long until = lockUntil;
        if (until <= 0) {
            try {
                SharedPreferences p = c.getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
                until = p.getLong("lockUntil", 0);
                lockUntil = until;
            } catch (Exception ignored) {}
        }
        boolean active = until > System.currentTimeMillis();
        lockActive = active;
        return active;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        serviceConnected = true;
        // process may be fresh — restore any running lock from prefs
        isLocked(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        if (!isLocked(this)) return;

        CharSequence pkgCs = event.getPackageName();
        if (pkgCs == null) return;
        String pkg = pkgCs.toString().toLowerCase();

        for (String ok : ALLOW) if (pkg.contains(ok)) return;

        long now = System.currentTimeMillis();
        if (now - lastBounce < 700) return;
        lastBounce = now;

        // persist the counter (site reads it via the bridge)
        int blocks = 0;
        try {
            SharedPreferences p = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
            blocks = p.getInt("blocks", 0) + 1;
            p.edit().putInt("blocks", blocks).apply();
        } catch (Exception ignored) {}

        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { startActivity(i); } catch (Exception ignored) {}
        try {
            Toast.makeText(this, "🔒 Focus Lock: pehle padhai! (" + blocks + " baar roka)", Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {}
    }

    @Override
    public void onInterrupt() { }

    @Override
    public boolean onUnbind(Intent intent) {
        serviceConnected = false;
        return super.onUnbind(intent);
    }
}
