package com.sujaytumu.talkies;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.webkit.CookieManager;

import androidx.core.app.NotificationManagerCompat;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** "Decline" on the incoming-call notification: reject the call without opening the app. */
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context context, Intent intent) {
        if (!NotificationHelper.ACTION_DECLINE.equals(intent.getAction())) return;
        final String callerId = intent.getStringExtra("callerId");
        final String callId = intent.getStringExtra("callId");
        int notifId = intent.getIntExtra("notifId", 0);
        try {
            NotificationManagerCompat.from(context).cancel(notifId);
        } catch (Exception ignored) {
        }
        CallRinger.stop();
        IncomingCallActivity.dismiss(null); // close the full-screen call screen if it is open
        if (callerId == null || callerId.isEmpty()) return;

        final PendingResult pending = goAsync();
        new Thread(() -> {
            // The Decline must really reach the server — otherwise the caller keeps ringing and the call
            // "comes back" when the app is opened. Try up to 3 times if the first request fails.
            try {
                for (int attempt = 0; attempt < 3; attempt++) {
                    if (sendDeviceDecline(context, callerId, callId) || sendDecline(callerId, callId)) break;
                    try {
                        Thread.sleep(1200);
                    } catch (InterruptedException ignored) {
                        break;
                    }
                }
            } finally {
                pending.finish();
            }
        }).start();
    }

    /** Decline proven by this phone's push token: works with no login cookie, even long after the app was used. */
    private static boolean sendDeviceDecline(Context ctx, String callerId, String callId) {
        HttpURLConnection c = null;
        try {
            String token = ctx.getSharedPreferences("talkies_push", Context.MODE_PRIVATE).getString("token", "");
            if (token == null || token.isEmpty()) return false;
            c = (HttpURLConnection) new URL(NotificationHelper.SITE + "/api/push/device-decline").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(5000);
            c.setReadTimeout(5000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            String safeCaller = callerId.replaceAll("[^A-Za-z0-9]", "");
            String safeCall = callId == null ? "" : callId.replaceAll("[^A-Za-z0-9-]", "");
            byte[] body = ("{\"token\":\"" + token + "\",\"callerId\":\"" + safeCaller + "\",\"callId\":\"" + safeCall + "\"}").getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body);
            }
            int code = c.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static boolean sendDecline(String callerId, String callId) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(NotificationHelper.SITE + "/api/calls/decline").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(4000);
            c.setReadTimeout(4000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            String cookie = CookieManager.getInstance().getCookie(NotificationHelper.SITE);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            String safeCaller = callerId.replaceAll("[^A-Za-z0-9]", "");
            String safeCall = callId == null ? "" : callId.replaceAll("[^A-Za-z0-9-]", "");
            byte[] body = ("{\"callerId\":\"" + safeCaller + "\",\"callId\":\"" + safeCall + "\"}").getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body);
            }
            int code = c.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
