package app.jeecbt.focus;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Toast;

/**
 * FOCUS GUARD — the real app blocker (reel-scroll-stopper mechanism).
 *
 * While a Focus Lock session is active, every window change is checked:
 * if the foreground app is not this app (or an allowed system surface),
 * the student is bounced straight back to studying and the attempt is
 * counted. Privacy: only the package NAME of the foreground app is read —
 * canRetrieveWindowContent=false in the config means we CANNOT see any
 * screen content, messages or keystrokes. Nothing is stored or uploaded.
 */
public class FocusGuardService extends AccessibilityService {

    /** set by the JS bridge */
    static volatile boolean lockActive = false;
    static volatile long lockUntil = 0;
    static volatile int blockCount = 0;
    static volatile boolean serviceConnected = false;

    private long lastBounce = 0;

    // System surfaces that must never be blocked (calls, launcher itself is
    // blocked-but-bounced, incoming call screen, settings stays reachable for
    // safety, IME/keyboard packages).
    private static final String[] ALLOW = {
            "app.jeecbt.focus",            // ourselves
            "com.android.systemui",        // status bar pulls, volume, etc.
            "com.android.phone",           // incoming calls — never block
            "com.android.dialer", "com.google.android.dialer",
            "com.android.emergency",       // emergency — never block
            "com.android.settings",        // safety hatch: user can always disable the guard
            "inputmethod", ".ime", "keyboard" // soft keyboards
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        serviceConnected = true;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!lockActive) return;
        if (System.currentTimeMillis() > lockUntil) { lockActive = false; return; }
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkgCs = event.getPackageName();
        if (pkgCs == null) return;
        String pkg = pkgCs.toString().toLowerCase();

        for (String ok : ALLOW) if (pkg.contains(ok)) return;

        // Someone tried to escape to another app → bounce back to studying.
        long now = System.currentTimeMillis();
        if (now - lastBounce < 700) return; // debounce rapid events
        lastBounce = now;
        blockCount++;

        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { startActivity(i); } catch (Exception ignored) {}
        try {
            Toast.makeText(this, "🔒 Focus Lock: pehle padhai! (" + blockCount + " baar roka)", Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {}
    }

    @Override
    public void onInterrupt() { /* nothing to clean up */ }

    @Override
    public boolean onUnbind(Intent intent) {
        serviceConnected = false;
        return super.onUnbind(intent);
    }
}

