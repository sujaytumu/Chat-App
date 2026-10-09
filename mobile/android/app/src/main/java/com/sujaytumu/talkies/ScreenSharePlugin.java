package com.sujaytumu.talkies;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native screen capture for the web app. Phone browsers can't capture the
 * screen (no getDisplayMedia), so this asks Android for permission
 * (MediaProjection), runs a foreground service, and streams JPEG frames to the
 * page, which turns them into a video track for the call.
 *
 * JS: Capacitor.Plugins.ScreenShare.start() / stop() and the events
 * "frame" {data, width, height} and "stopped" {reason}.
 */
@CapacitorPlugin(name = "ScreenShare")
public class ScreenSharePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        MediaProjectionManager manager =
                (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("Screen capture isn't available on this device");
            return;
        }
        startActivityForResult(call, manager.createScreenCaptureIntent(), "onCaptureResult");
    }

    @ActivityCallback
    private void onCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }

        ScreenShareService.listener = new ScreenShareService.Listener() {
            @Override
            public void onStarted(int width, int height) {
                JSObject ret = new JSObject();
                ret.put("width", width);
                ret.put("height", height);
                call.resolve(ret);
            }

            @Override
            public void onFrame(String base64Jpeg, int width, int height) {
                JSObject frame = new JSObject();
                frame.put("data", base64Jpeg);
                frame.put("width", width);
                frame.put("height", height);
                notifyListeners("frame", frame);
            }

            @Override
            public void onStopped(String reason) {
                JSObject ev = new JSObject();
                ev.put("reason", reason);
                notifyListeners("stopped", ev);
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        };

        Intent service = new Intent(getContext(), ScreenShareService.class);
        service.putExtra(ScreenShareService.EXTRA_RESULT_CODE, result.getResultCode());
        service.putExtra(ScreenShareService.EXTRA_DATA, result.getData());
        ContextCompat.startForegroundService(getContext(), service);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent service = new Intent(getContext(), ScreenShareService.class);
        service.setAction(ScreenShareService.ACTION_STOP);
        getContext().startService(service);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        ScreenShareService.listener = null;
        super.handleOnDestroy();
    }
}
