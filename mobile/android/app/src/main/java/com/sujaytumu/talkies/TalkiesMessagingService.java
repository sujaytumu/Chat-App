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
        final String oldToken = p.getString("token", "");
        p.edit().putString("token", token).putBoolean("dirty", true).apply();
        // Tell the server straight away (the old token proves who this phone is), so calls and messages
        // keep reaching it even if the app is not opened for days.
        reportTokenChange(oldToken, token);
    }

    private void reportTokenChange(final String oldToken, final String newToken) {
        if (oldToken == null || oldToken.isEmpty() || newToken == null || newToken.isEmpty() || oldToken.equals(newToken)) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL("https://chat-app-jjcg.onrender.com/api/push/device-token").openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(30000);
                    c.setReadTimeout(30000);
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    byte[] body = ("{\"oldToken\":\"" + oldToken + "\",\"newToken\":\"" + newToken + "\"}").getBytes("UTF-8");
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

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> d = message.getData();
        if (d == null || d.isEmpty()) return;

        String tag = nz(d.get("tag"));
        String callId = nz(d.get("callId"));
        if ("1".equals(d.get("clear"))) {
            // that chat was read somewhere: the notification only ever shows what is still unread
            NotificationHelper.clearChat(this, nz(d.get("chatId")));
            return;
        }
        if ("1".equals(d.get("cancel"))) {
            // caller hung up / it was answered or declined elsewhere / nobody picked up in time
            NotificationHelper.cancel(this, tag, callId);
            return;
        }

        // The message reached this phone: tell the server right away so the sender gets the
        // double tick, even when the app is closed (WhatsApp-style).
        String messageId = nz(d.get("messageId"));
        if (!messageId.isEmpty()) confirmDelivered(messageId);

        boolean isCall = "1".equals(d.get("isCall"));

        // The app is on screen: the page already beeps for messages by itself. A CALL still rings
        // from here: the page can only play sound at media volume, this ring uses the phone's real
        // ringtone volume (and keeps going, unbroken, when the app is opened).
        if (MainActivity.visible && !isCall) return;

        String title = nz(d.get("title"));
        String body = nz(d.get("body"));
        String chatId = nz(d.get("chatId"));
        String chatType = nz(d.get("chatType"));

        if (isCall) {
            String callerKey = nz(d.get("callerId")).isEmpty() ? chatId : nz(d.get("callerId"));
            NotificationHelper.showIncomingCall(this, title, body, tag, callerKey, nz(d.get("icon")), callId);
            // The phone is ringing even though the app may be closed: tell the server so the caller's
            // screen changes from "Calling…" to "Ringing…".
            reportRinging(callerKey, callId);
        } else {
            boolean missed = body.toLowerCase().startsWith("missed");
            NotificationHelper.showMessage(this, title, body, tag, chatId, chatType, missed, nz(d.get("icon")), nz(d.get("myIcon")));
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

    private void reportRinging(final String callerId, final String callId) {
        final String token = getSharedPreferences("talkies_push", Context.MODE_PRIVATE).getString("token", "");
        if (token == null || token.isEmpty() || callerId == null || callerId.isEmpty()) return;
        final String safeCaller = callerId.replaceAll("[^A-Za-z0-9]", "");
        final String safeCall = callId == null ? "" : callId.replaceAll("[^A-Za-z0-9-]", "");
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL("https://chat-app-jjcg.onrender.com/api/push/device-ringing").openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    byte[] body = ("{\"token\":\"" + token + "\",\"callerId\":\"" + safeCaller + "\",\"callId\":\"" + safeCall + "\"}").getBytes("UTF-8");
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
