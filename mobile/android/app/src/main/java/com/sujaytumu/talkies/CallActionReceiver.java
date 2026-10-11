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
        int notifId = intent.getIntExtra("notifId", 0);
        try {
            NotificationManagerCompat.from(context).cancel(notifId);
        } catch (Exception ignored) {
        }
        if (callerId == null || callerId.isEmpty()) return;

        final PendingResult pending = goAsync();
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(NotificationHelper.SITE + "/api/calls/decline").openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                String cookie = CookieManager.getInstance().getCookie(NotificationHelper.SITE);
                if (cookie != null) c.setRequestProperty("Cookie", cookie);
                byte[] body = ("{\"callerId\":\"" + callerId.replaceAll("[^A-Za-z0-9]", "") + "\"}").getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = c.getOutputStream()) {
                    os.write(body);
                }
                c.getResponseCode();
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.disconnect();
                pending.finish();
            }
        }).start();
    }
}
