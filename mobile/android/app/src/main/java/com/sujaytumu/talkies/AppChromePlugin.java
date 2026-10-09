package com.sujaytumu.talkies;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Makes the phone's status/navigation bars (and the strip behind the page)
 * follow the web app's theme, so the Android app looks exactly like the site:
 * white bars on the light theme, dark bars on dark themes. The last theme is
 * remembered so the next launch starts with the right colours.
 */
@CapacitorPlugin(name = "AppChrome")
public class AppChromePlugin extends Plugin {
    private static final String PREFS = "talkies_chrome";

    @PluginMethod
    public void setTheme(PluginCall call) {
        final String color = call.getString("color", "#FFFFFF");
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        final Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString("color", color).putBoolean("dark", dark).apply();
        activity.runOnUiThread(() -> {
            apply(activity, color, dark);
            call.resolve();
        });
    }

    /** Called at launch, before the page has loaded. */
    static void applySaved(Activity activity) {
        SharedPreferences p = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        apply(activity, p.getString("color", "#FFFFFF"), p.getBoolean("dark", false));
    }

    @SuppressWarnings("deprecation")
    static void apply(Activity activity, String color, boolean dark) {
        try {
            int c = Color.parseColor(color);
            Window window = activity.getWindow();
            window.getDecorView().setBackgroundColor(c);
            View content = activity.findViewById(android.R.id.content);
            if (content != null) content.setBackgroundColor(c);
            window.setStatusBarColor(c);
            window.setNavigationBarColor(c);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
            if (activity instanceof MainActivity) {
                WebView web = ((MainActivity) activity).getBridge().getWebView();
                if (web != null) web.setBackgroundColor(c);
            }
        } catch (Exception ignored) {
            // bad colour string — keep the current bars
        }
    }
}
