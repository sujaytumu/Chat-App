package com.sujaytumu.talkies;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Bridge between the web app and native notifications.
 * JS: Capacitor.Plugins.TalkiesPush.getToken() / requestPermission() /
 * getLaunchIntent() / openCallSettings(), and the "nativeIntent" event
 * (fired when a notification is tapped while the app is already open).
 */
@CapacitorPlugin(name = "TalkiesPush")
public class TalkiesPushPlugin extends Plugin {
    private static TalkiesPushPlugin instance;
    private static JSObject pending;

    @Override
    public void load() {
        instance = this;
        NotificationHelper.ensureChannels(getContext());
    }

    /** Called by MainActivity for every launch / new intent. */
    static void handleIntent(Intent intent) {
        if (intent == null || !intent.hasExtra("tk_action")) return;
        JSObject o = new JSObject();
        o.put("action", intent.getStringExtra("tk_action"));
        o.put("chatId", intent.getStringExtra("tk_chatId"));
        o.put("chatType", intent.getStringExtra("tk_chatType"));
        o.put("callerId", intent.getStringExtra("tk_callerId"));
        o.put("isCall", intent.getBooleanExtra("tk_isCall", false));
        // consume so rotating / re-delivering the same intent can't repeat it
        intent.removeExtra("tk_action");
        NotificationHelper.clearRecent(intent.getStringExtra("tk_chatId") == null ? "" : intent.getStringExtra("tk_chatId"));
        pending = o;
        if (instance != null) instance.notifyListeners("nativeIntent", o, true);
    }

    @PluginMethod
    public void getLaunchIntent(PluginCall call) {
        JSObject res = new JSObject();
        if (pending != null) {
            res.put("intent", pending);
            pending = null;
        }
        call.resolve(res);
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) {
                    call.reject("Firebase is not set up in this build");
                    return;
                }
                getContext().getSharedPreferences("talkies_push", Context.MODE_PRIVATE)
                        .edit().putString("token", task.getResult()).putBoolean("dirty", false).apply();
                JSObject res = new JSObject();
                res.put("token", task.getResult());
                call.resolve(res);
            });
        } catch (Throwable t) {
            // no google-services.json in this build
            call.reject("Firebase is not set up in this build");
        }
    }

    /** Android 13+: ask for the notification permission. Resolves with { granted }. */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        Activity a = getActivity();
        boolean granted = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        if (!granted && Build.VERSION.SDK_INT >= 33 && a != null
                && ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(a, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7001);
        }
        JSObject res = new JSObject();
        res.put("granted", granted);
        call.resolve(res);
    }

    /** Whether incoming calls can take over the lock screen (Android 14+ can switch this off). */
    @PluginMethod
    public void callStatus(PluginCall call) {
        JSObject res = new JSObject();
        res.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        boolean fullScreen = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            fullScreen = nm != null && nm.canUseFullScreenIntent();
        }
        res.put("fullScreen", fullScreen);
        call.resolve(res);
    }

    @PluginMethod
    public void openCallSettings(PluginCall call) {
        Context c = getContext();
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 34) {
                i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + c.getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }
}
