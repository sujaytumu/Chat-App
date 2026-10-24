package com.sujaytumu.talkies;

import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.List;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS: Capacitor.Plugins.TalkiesCall.start({ title, text, video }) when a call
 * connects, .stop() when it ends, and the "hangup" event when the user taps
 * Hang up on the ongoing-call notification.
 */
@CapacitorPlugin(name = "TalkiesCall")
public class CallKeepAlivePlugin extends Plugin {
    private static CallKeepAlivePlugin instance;

    private final Handler main = new Handler(Looper.getMainLooper());
    private AudioDeviceCallback deviceCallback;

    @Override
    public void load() {
        instance = this;
        // Headphones / Bluetooth plugged in or out: refresh the picker, and (like WhatsApp) move a
        // running call to a newly connected headset.
        try {
            final AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null && Build.VERSION.SDK_INT >= 23) {
                deviceCallback = new AudioDeviceCallback() {
                    @Override
                    public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
                        if (MainActivity.callActive) {
                            for (AudioDeviceInfo d : added) {
                                final String kind = kindOf(d);
                                if ("bluetooth".equals(kind) || "wired".equals(kind)) {
                                    final String id = "wired".equals(kind) ? "wired" : "bt:" + d.getId();
                                    main.postDelayed(new Runnable() {
                                        @Override
                                        public void run() {
                                            applyRoute(am, id);
                                            emitRoutes(am);
                                        }
                                    }, 700);
                                    return;
                                }
                            }
                        }
                        emitRoutes(am);
                    }

                    @Override
                    public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
                        main.postDelayed(new Runnable() {
                            @Override
                            public void run() {
                                emitRoutes(am);
                            }
                        }, 400);
                    }
                };
                am.registerAudioDeviceCallback(deviceCallback, main);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null && deviceCallback != null && Build.VERSION.SDK_INT >= 23) am.unregisterAudioDeviceCallback(deviceCallback);
        } catch (Exception ignored) {
        }
        super.handleOnDestroy();
    }

    // ---- audio output routing: phone (earpiece) / speaker / Bluetooth / wired headset ----

    /** "earpiece" | "speaker" | "bluetooth" | "wired" | "" (not a call output). */
    private static String kindOf(AudioDeviceInfo d) {
        switch (d.getType()) {
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE:
                return "earpiece";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                return "speaker";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
                return "wired";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case AudioDeviceInfo.TYPE_HEARING_AID:
                return "bluetooth";
            default:
                return (Build.VERSION.SDK_INT >= 31 && d.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET) ? "bluetooth" : "";
        }
    }

    private static List<AudioDeviceInfo> callDevices(AudioManager am) {
        List<AudioDeviceInfo> out = new ArrayList<>();
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                out.addAll(am.getAvailableCommunicationDevices());
            } else if (Build.VERSION.SDK_INT >= 23) {
                for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) out.add(d);
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static String routeId(AudioDeviceInfo d) {
        String k = kindOf(d);
        if ("bluetooth".equals(k)) return "bt:" + d.getId();
        return k;
    }

    private JSObject routeJson(String id, String kind, String name) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("kind", kind);
        o.put("name", name);
        return o;
    }

    /** { routes: [...], current: "<id>" } for the picker. Order: Bluetooth, headset, phone, speaker. */
    @SuppressWarnings("deprecation")
    private JSObject buildRoutes(AudioManager am) {
        List<JSObject> bt = new ArrayList<>();
        JSObject wired = null, earpiece = null;
        boolean hasEarpiece = false;
        for (AudioDeviceInfo d : callDevices(am)) {
            String k = kindOf(d);
            if ("bluetooth".equals(k)) {
                CharSequence n = d.getProductName();
                bt.add(routeJson("bt:" + d.getId(), "bluetooth", n == null || n.length() == 0 ? "Bluetooth" : n.toString()));
            } else if ("wired".equals(k) && wired == null) {
                wired = routeJson("wired", "wired", "Headphones");
            } else if ("earpiece".equals(k)) {
                hasEarpiece = true;
            }
        }
        // phones always have an earpiece; the list API just doesn't report it on older versions
        if (hasEarpiece || Build.VERSION.SDK_INT < 31) earpiece = routeJson("earpiece", "earpiece", "Phone");

        com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
        for (JSObject o : bt) arr.put(o);
        if (wired != null) arr.put(wired);
        if (earpiece != null) arr.put(earpiece);
        arr.put(routeJson("speaker", "speaker", "Speaker"));

        String current = "earpiece";
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                AudioDeviceInfo cur = am.getCommunicationDevice();
                if (cur != null && !kindOf(cur).isEmpty()) current = routeId(cur);
                else if (am.isSpeakerphoneOn()) current = "speaker";
                else if (!bt.isEmpty()) current = bt.get(0).getString("id");
                else if (wired != null) current = "wired";
            } else {
                if (am.isBluetoothScoOn() && !bt.isEmpty()) current = bt.get(0).getString("id");
                else if (am.isSpeakerphoneOn()) current = "speaker";
                else if (wired != null) current = "wired";
            }
        } catch (Exception ignored) {
        }
        if (earpiece == null && "earpiece".equals(current)) current = "speaker";

        JSObject res = new JSObject();
        res.put("routes", arr);
        res.put("current", current);
        return res;
    }

    /** Sends the audio output to the chosen route. Returns whether Android accepted it. */
    @SuppressWarnings("deprecation")
    private boolean applyRoute(AudioManager am, String id) {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                String want = id.startsWith("bt:") ? "bluetooth" : id;
                AudioDeviceInfo pick = null;
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    if (kindOf(d).equals(want) && (!want.equals("bluetooth") || ("bt:" + d.getId()).equals(id))) {
                        pick = d;
                        break;
                    }
                }
                if (pick == null) {
                    if ("earpiece".equals(id)) {
                        am.clearCommunicationDevice();
                        return true;
                    }
                    return false;
                }
                return am.setCommunicationDevice(pick);
            }
            // Android 11 and older
            if ("speaker".equals(id)) {
                am.stopBluetoothSco();
                am.setBluetoothScoOn(false);
                am.setSpeakerphoneOn(true);
            } else if (id.startsWith("bt:")) {
                am.setSpeakerphoneOn(false);
                am.startBluetoothSco();
                am.setBluetoothScoOn(true);
            } else { // earpiece or wired: the system picks the headset when one is plugged in
                am.stopBluetoothSco();
                am.setBluetoothScoOn(false);
                am.setSpeakerphoneOn(false);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void emitRoutes(AudioManager am) {
        try {
            notifyListeners("audioRoutes", buildRoutes(am), true);
        } catch (Exception ignored) {
        }
    }

    /** JS: TalkiesCall.getAudioRoutes() -> { routes: [{id, kind, name}], current } */
    @PluginMethod
    public void getAudioRoutes(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) {
            call.reject("No audio service");
            return;
        }
        call.resolve(buildRoutes(am));
    }

    /** JS: TalkiesCall.setAudioRoute({ id }) -> { ok, current } */
    @PluginMethod
    public void setAudioRoute(PluginCall call) {
        final AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        String id = call.getString("id", "");
        if (am == null || id == null || id.isEmpty()) {
            call.reject("No route");
            return;
        }
        boolean ok = applyRoute(am, id);
        JSObject res = buildRoutes(am);
        res.put("ok", ok);
        call.resolve(res);
    }

    /**
     * JS: TalkiesCall.initCallAudio({ video }) once a call starts. A connected headset wins;
     * otherwise video calls start on the speaker and voice calls on the phone (like WhatsApp).
     * Runs a moment later so the call service has already switched Android into call mode.
     */
    @PluginMethod
    public void initCallAudio(PluginCall call) {
        final boolean video = Boolean.TRUE.equals(call.getBoolean("video", false));
        final AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am == null) {
            call.resolve();
            return;
        }
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                String target = video ? "speaker" : "earpiece";
                for (AudioDeviceInfo d : callDevices(am)) {
                    String k = kindOf(d);
                    if ("bluetooth".equals(k)) {
                        target = "bt:" + d.getId();
                        break;
                    }
                    if ("wired".equals(k)) target = "wired";
                }
                applyRoute(am, target);
                emitRoutes(am);
            }
        }, 600);
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context c = getContext();
        Intent i = new Intent(c, CallKeepAliveService.class);
        i.putExtra("title", call.getString("title", "Talkies call"));
        i.putExtra("text", call.getString("text", "Call in progress"));
        i.putExtra("video", Boolean.TRUE.equals(call.getBoolean("video", false)));
        Double started = call.getDouble("startedAt", 0.0);
        i.putExtra("startedAt", started == null ? 0L : started.longValue());
        MainActivity.callActive = true;
        try {
            ContextCompat.startForegroundService(c, i);
            call.resolve();
        } catch (Exception e) {
            MainActivity.callActive = false;
            call.reject(e.getMessage() == null ? "Couldn't keep the call running" : e.getMessage());
        }
    }

    /** JS: TalkiesCall.setSpeaker({ on: true|false }) — loudspeaker or earpiece/headset for the call. */
    @PluginMethod
    public void setSpeaker(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                if (Build.VERSION.SDK_INT >= 31) {
                    if (on) {
                        for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                            if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                                am.setCommunicationDevice(d);
                                break;
                            }
                        }
                    } else {
                        am.clearCommunicationDevice();
                    }
                } else {
                    am.setSpeakerphoneOn(on);
                }
            }
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    /** JS: TalkiesCall.batteryStatus() -> { unrestricted } — can the app run in the background freely? */
    @PluginMethod
    public void batteryStatus(PluginCall call) {
        boolean ok = true;
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null && Build.VERSION.SDK_INT >= 23) ok = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception ignored) {
        }
        JSObject r = new JSObject();
        r.put("unrestricted", ok);
        call.resolve(r);
    }

    /** JS: TalkiesCall.requestBatteryUnrestricted() — opens Android's "allow background" prompt. */
    @PluginMethod
    public void requestBatteryUnrestricted(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        MainActivity.callActive = false;
        getContext().stopService(new Intent(getContext(), CallKeepAliveService.class));
        call.resolve();
    }

    static void hangup() {
        if (instance != null) instance.notifyListeners("hangup", new JSObject(), true);
    }
}
