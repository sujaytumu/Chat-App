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
        // At least once: park it for getLaunchIntent() AND tell a live listener. If the page was just
        // reloaded its old listener may be gone, so a single delivery could be lost and the person
        // would have to answer a second time. The page ignores repeats (same timestamp) and stale ones.
        o.put("ts", System.currentTimeMillis());
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

    /**
     * The call tone chosen inside Talkies: { mode: "talkies" | "custom" | "silent", data?: base64 file, ext? }.
     * The ringing notification then plays exactly that tone, even when the app is closed.
     */
    @PluginMethod
    public void setCallTone(PluginCall call) {
        String mode = call.getString("mode", "talkies");
        String data = call.getString("data", "");
        String ext = call.getString("ext", "mp3");
        boolean ok = NotificationHelper.setCallTone(getContext(), mode, data, ext);
        JSObject res = new JSObject();
        res.put("ok", ok);
        call.resolve(res);
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

    /** Microphone (+ camera) permission up front, so tapping Answer never stops at a permission prompt. */
    @PluginMethod
    public void requestCallPermissions(PluginCall call) {
        Activity a = getActivity();
        boolean mic = a != null && ContextCompat.checkSelfPermission(a, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        boolean cam = a != null && ContextCompat.checkSelfPermission(a, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        // Android 12+: Bluetooth headsets need their own "nearby devices" permission to carry a call
        boolean bt = Build.VERSION.SDK_INT < 31 || (a != null && ContextCompat.checkSelfPermission(a, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED);
        if (a != null && (!mic || !cam || !bt)) {
            java.util.List<String> need = new java.util.ArrayList<>();
            if (!mic) need.add(Manifest.permission.RECORD_AUDIO);
            if (!cam) need.add(Manifest.permission.CAMERA);
            if (!bt) need.add(Manifest.permission.BLUETOOTH_CONNECT);
            ActivityCompat.requestPermissions(a, need.toArray(new String[0]), 7002);
        }
        JSObject res = new JSObject();
        res.put("mic", mic);
        res.put("camera", cam);
        call.resolve(res);
    }

    /**
     * Xiaomi / Oppo / Vivo / Samsung etc. kill closed apps unless "Autostart" (or similar) is
     * allowed. Tries the maker's own screen, falls back to this app's settings page.
     */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        Context c = getContext();
        String[][] targets = {
                {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
                {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
                {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
                {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
                {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
                {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                {"com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"},
                {"com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity"},
        };
        boolean opened = false;
        for (String[] t : targets) {
            try {
                Intent i = new Intent().setComponent(new android.content.ComponentName(t[0], t[1]));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
                opened = true;
                break;
            } catch (Exception ignored) {
            }
        }
        if (!opened) {
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
            } catch (Exception ignored) {
            }
        }
        JSObject res = new JSObject();
        res.put("vendorScreen", opened);
        call.resolve(res);
    }

    /** The call was answered / declined / ended inside the app: stop the notification's ring and buzz at once. */
    @PluginMethod
    public void stopCallRing(PluginCall call) {
        try {
            NotificationHelper.stopAllRinging(getContext());
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    /** Is this phone's own ring (notification) going right now? */
    @PluginMethod
    public void isCallRinging(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ringing", NotificationHelper.isAnyRinging());
        call.resolve(r);
    }

    /** Opens this app's system settings page (Permissions: Microphone / Camera). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context c = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception ignored) {
        }
        call.resolve();
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
