package com.sujaytumu.talkies;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Receives Firebase pushes from the Talkies server (data-only, high priority) —
 * even when the app is closed — and turns them into a ringing call screen or a
 * message notification.
 */
public class TalkiesMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(@NonNull String token) {
        // The web app re-registers the token with the server the next time it opens.
        SharedPreferences p = getSharedPreferences("talkies_push", Context.MODE_PRIVATE);
        p.edit().putString("token", token).putBoolean("dirty", true).apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> d = message.getData();
        if (d == null || d.isEmpty()) return;

        String tag = nz(d.get("tag"));
        String callId = nz(d.get("callId"));
        if ("1".equals(d.get("cancel"))) {
            // caller hung up / it was answered or declined elsewhere / nobody picked up in time
            NotificationHelper.cancel(this, tag, callId);
            return;
        }

        // The message reached this phone: tell the server right away so the sender gets the
        // double tick, even when the app is closed (WhatsApp-style).
        String messageId = nz(d.get("messageId"));
        if (!messageId.isEmpty()) confirmDelivered(messageId);

        // The app is on screen: the page already rings / beeps by itself.
        if (MainActivity.visible) return;

        String title = nz(d.get("title"));
        String body = nz(d.get("body"));
        String chatId = nz(d.get("chatId"));
        String chatType = nz(d.get("chatType"));
        boolean isCall = "1".equals(d.get("isCall"));

        if (isCall) {
            NotificationHelper.showIncomingCall(this, title, body, tag, nz(d.get("callerId")).isEmpty() ? chatId : nz(d.get("callerId")), nz(d.get("icon")), callId);
        } else {
            boolean missed = body.toLowerCase().startsWith("missed");
            NotificationHelper.showMessage(this, title, body, tag, chatId, chatType, missed, nz(d.get("icon")));
        }
    }

    private void confirmDelivered(final String messageId) {
        final String token = getSharedPreferences("talkies_push", Context.MODE_PRIVATE).getString("token", "");
        if (token == null || token.isEmpty()) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL("https://chat-app-jjcg.onrender.com/api/push/device-delivered").openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    byte[] body = ("{\"token\":\"" + token + "\",\"messageId\":\"" + messageId + "\"}").getBytes("UTF-8");
                    OutputStream os = c.getOutputStream();
                    os.write(body);
                    os.close();
                    c.getResponseCode();
                } catch (Exception ignored) {
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
