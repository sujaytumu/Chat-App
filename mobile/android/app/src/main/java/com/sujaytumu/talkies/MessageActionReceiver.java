package com.sujaytumu.talkies;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** The Reply / Mark as read / Mute buttons on a message notification — they work without opening the app. */
public class MessageActionReceiver extends BroadcastReceiver {
    static final String ACTION_REPLY = "com.sujaytumu.talkies.MSG_REPLY";
    static final String ACTION_READ = "com.sujaytumu.talkies.MSG_READ";
    static final String ACTION_MUTE = "com.sujaytumu.talkies.MSG_MUTE";
    static final String KEY_REPLY = "tk_reply_text";

    @Override
    public void onReceive(final Context context, final Intent intent) {
        final String action = intent.getAction();
        final String chatId = clean(intent.getStringExtra("chatId"));
        final String chatType = "group".equals(intent.getStringExtra("chatType")) ? "group" : "direct";
        final int notifId = intent.getIntExtra("notifId", 0);
        final String key = intent.getStringExtra("key");
        if (action == null || chatId.isEmpty()) return;

        String typed = null;
        if (ACTION_REPLY.equals(action)) {
            Bundle r = RemoteInput.getResultsFromIntent(intent);
            CharSequence cs = r == null ? null : r.getCharSequence(KEY_REPLY);
            typed = cs == null ? "" : cs.toString().trim();
            if (typed.isEmpty()) return;
        }
        final String replyText = typed;

        final PendingResult pending = goAsync();
        new Thread(() -> {
            boolean ok = false;
            try {
                if (ACTION_REPLY.equals(action)) {
                    String path = "group".equals(chatType) ? "/api/groups/" + chatId + "/messages" : "/api/messages/send/" + chatId;
                    ok = send("POST", path, new JSONObject().put("text", replyText).toString());
                } else if (ACTION_READ.equals(action)) {
                    ok = "group".equals(chatType) ? send("GET", "/api/groups/" + chatId + "/messages?limit=1", null) : send("PUT", "/api/messages/seen/" + chatId, "{}");
                } else if (ACTION_MUTE.equals(action)) {
                    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                    f.setTimeZone(TimeZone.getTimeZone("UTC"));
                    String until = f.format(new Date(System.currentTimeMillis() + 8L * 3600 * 1000)); // 8 hours
                    ok = send("PUT", "/api/messages/mute-chat", new JSONObject().put("chatType", chatType).put("chatId", chatId).put("value", true).put("until", until).toString());
                }
            } catch (Exception ignored) {
            } finally {
                try {
                    if (ok) {
                        NotificationManagerCompat.from(context).cancel(notifId);
                        if (key != null) NotificationHelper.clearRecent(key);
                    }
                } catch (Exception ignored) {
                }
                pending.finish();
            }
        }).start();
    }

    private static String clean(String s) {
        return s == null ? "" : s.replaceAll("[^A-Za-z0-9]", "");
    }

    private static boolean send(String method, String path, String json) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(NotificationHelper.SITE + path).openConnection();
            c.setRequestMethod(method);
            c.setConnectTimeout(6000);
            c.setReadTimeout(8000);
            String cookie = CookieManager.getInstance().getCookie(NotificationHelper.SITE);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            if (json != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream os = c.getOutputStream()) {
                    os.write(json.getBytes(StandardCharsets.UTF_8));
                }
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
