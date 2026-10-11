package com.sujaytumu.talkies;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

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
        if ("1".equals(d.get("cancel"))) {
            NotificationHelper.cancel(this, tag);
            return;
        }

        // The app is on screen: the page already rings / beeps by itself.
        if (MainActivity.visible) return;

        String title = nz(d.get("title"));
        String body = nz(d.get("body"));
        String chatId = nz(d.get("chatId"));
        String chatType = nz(d.get("chatType"));
        boolean isCall = "1".equals(d.get("isCall"));

        if (isCall) {
            NotificationHelper.showIncomingCall(this, title, body, tag, nz(d.get("callerId")).isEmpty() ? chatId : nz(d.get("callerId")));
        } else {
            boolean missed = body.toLowerCase().startsWith("missed");
            NotificationHelper.showMessage(this, title, body, tag, chatId, chatType, missed);
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
