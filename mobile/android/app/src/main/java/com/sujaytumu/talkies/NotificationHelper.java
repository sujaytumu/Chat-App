package com.sujaytumu.talkies;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/**
 * Builds the system notifications for pushes that arrive while the app is
 * closed: a WhatsApp-style full-screen incoming call (ringtone, vibration,
 * Answer / Decline) and per-chat message notifications.
 */
final class NotificationHelper {
    static final String CH_CALLS = "talkies_calls_v1";
    static final String CH_MESSAGES = "talkies_messages_v1";
    static final String CH_MISSED = "talkies_missed_v1";
    static final String SITE = "https://chat-app-jjcg.onrender.com";
    static final String ACTION_DECLINE = "com.sujaytumu.talkies.DECLINE_CALL";
    private static final long CALL_RING_MS = 45_000;

    // last few lines per chat so a burst of messages stacks like WhatsApp
    private static final Map<String, ArrayDeque<String>> RECENT = new HashMap<>();

    private NotificationHelper() {}

    static int idFor(String tag) {
        return (tag == null || tag.isEmpty() ? "talkies" : tag).hashCode();
    }

    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Uri ringtone = Settings.System.DEFAULT_RINGTONE_URI;
        AudioAttributes ring = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        NotificationChannel calls = new NotificationChannel(CH_CALLS, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("Rings when someone calls you on Talkies");
        calls.setSound(ringtone, ring);
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[]{0, 900, 600, 900, 600, 900, 600, 900});
        calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        calls.setBypassDnd(false);
        nm.createNotificationChannel(calls);

        AudioAttributes note = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        NotificationChannel msgs = new NotificationChannel(CH_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH);
        msgs.setDescription("New message notifications");
        msgs.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, note);
        msgs.enableVibration(true);
        msgs.setVibrationPattern(new long[]{0, 220, 120, 220});
        msgs.setLightColor(Color.parseColor("#25D366"));
        msgs.enableLights(true);
        msgs.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        nm.createNotificationChannel(msgs);

        NotificationChannel missed = new NotificationChannel(CH_MISSED, "Missed calls", NotificationManager.IMPORTANCE_DEFAULT);
        missed.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, note);
        nm.createNotificationChannel(missed);
    }

    private static PendingIntent openIntent(Context ctx, int requestCode, String action, String chatId, String chatType,
                                             String callerId, boolean isCall) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("tk_action", action);
        i.putExtra("tk_chatId", chatId == null ? "" : chatId);
        i.putExtra("tk_chatType", chatType == null ? "direct" : chatType);
        i.putExtra("tk_callerId", callerId == null ? "" : callerId);
        i.putExtra("tk_isCall", isCall);
        // unique data so PendingIntents for different actions never collapse into one
        i.setData(Uri.parse("talkies://n/" + requestCode + "/" + action));
        return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Full-screen incoming call with ringtone + Answer / Decline. */
    static void showIncomingCall(Context ctx, String name, String body, String tag, String callerId) {
        ensureChannels(ctx);
        int id = idFor(tag);
        PendingIntent full = openIntent(ctx, id, "open", callerId, "direct", callerId, true);
        PendingIntent answer = openIntent(ctx, id + 1, "answer", callerId, "direct", callerId, true);

        Intent decline = new Intent(ctx, CallActionReceiver.class);
        decline.setAction(ACTION_DECLINE);
        decline.putExtra("callerId", callerId);
        decline.putExtra("notifId", id);
        PendingIntent declinePi = PendingIntent.getBroadcast(ctx, id + 2, decline, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Person caller = new Person.Builder().setName(name == null || name.isEmpty() ? "Talkies" : name).setImportant(true).build();
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_CALLS)
                .setSmallIcon(R.drawable.ic_stat_talkies)
                .setColor(Color.parseColor("#00A884"))
                .setContentTitle(name)
                .setContentText(body)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(false)
                .setTimeoutAfter(CALL_RING_MS)
                .setContentIntent(full)
                .setFullScreenIntent(full, true)
                .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, answer));
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT; // keep ringing until answered / declined / cancelled
        notifySafe(ctx, id, n);
    }

    /** Replaces / removes whatever is shown for this tag (stops a ring). */
    static void cancel(Context ctx, String tag) {
        try {
            NotificationManagerCompat.from(ctx).cancel(idFor(tag));
        } catch (Exception ignored) {
        }
    }

    static void showMessage(Context ctx, String title, String body, String tag, String chatId, String chatType, boolean missedCall) {
        ensureChannels(ctx);
        int id = idFor(tag.isEmpty() ? (chatId.isEmpty() ? title : chatId) : tag);
        String key = chatId.isEmpty() ? title : chatId;
        String text = body == null ? "" : body;

        NotificationCompat.Style style;
        synchronized (RECENT) {
            ArrayDeque<String> q = RECENT.get(key);
            if (q == null) {
                q = new ArrayDeque<>();
                RECENT.put(key, q);
            }
            if (missedCall) q.clear();
            q.addLast(text);
            while (q.size() > 6) q.removeFirst();
            NotificationCompat.InboxStyle inbox = new NotificationCompat.InboxStyle().setBigContentTitle(title);
            for (String line : q) inbox.addLine(line);
            style = q.size() > 1 ? inbox : new NotificationCompat.BigTextStyle().bigText(text);
        }

        PendingIntent tap = openIntent(ctx, id, "open", chatId, chatType, "", false);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, missedCall ? CH_MISSED : CH_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_talkies)
                .setColor(Color.parseColor("#00A884"))
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(style)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setContentIntent(tap);
        notifySafe(ctx, id, b.build());
    }

    static void clearRecent(String key) {
        synchronized (RECENT) {
            RECENT.remove(key);
        }
    }

    private static void notifySafe(Context ctx, int id, Notification n) {
        try {
            NotificationManagerCompat.from(ctx).notify(id, n);
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted
        }
    }
}
