package com.sujaytumu.talkies;

import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
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

    @Override
    public void load() {
        instance = this;
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
