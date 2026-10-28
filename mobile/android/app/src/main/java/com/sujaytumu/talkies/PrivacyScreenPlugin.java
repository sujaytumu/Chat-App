package com.sujaytumu.talkies;

import android.app.Activity;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Marks the app window as secure while a "view once" photo is on screen. With FLAG_SECURE the
 * system itself blocks screenshots and screen recording / casting (they come out black or are
 * refused) and hides the window in the recent-apps preview. The page turns it on when the photo
 * opens and off when it closes.
 */
@CapacitorPlugin(name = "PrivacyScreen")
public class PrivacyScreenPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            activity.getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            clear(activity);
            call.resolve();
        });
    }

    /** Back to normal (also used when the page reloads, so a crash while viewing can't leave the app locked down). */
    static void clear(Activity activity) {
        try {
            Window w = activity.getWindow();
            w.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } catch (Exception ignored) {
        }
    }
}
