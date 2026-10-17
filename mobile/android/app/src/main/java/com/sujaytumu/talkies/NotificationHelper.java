package com.sujaytumu.talkies;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/**
 * Builds the system notifications for pushes that arrive while the app is
 * closed: a WhatsApp-style full-screen incoming call (ringtone, vibration,
 * Answer / Decline) and per-chat message notifications.
 */
final class NotificationHelper {
    static final String CH_CALLS = "talkies_calls_v2"; // v2: the bundled Talkies ringtone (a channel's sound can't be changed once created)
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

        // The phone's own ringtone is never used: calls ring with Talkies' own tune shipped in the app.
        nm.deleteNotificationChannel("talkies_calls_v1");
        Uri ringtone = Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.talkies_ring);
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

    /** The intent that brings the app to the front and hands it a notification action. */
    static Intent mainIntent(Context ctx, String action, String chatId, String chatType, String callerId, boolean isCall) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("tk_action", action);
        i.putExtra("tk_chatId", chatId == null ? "" : chatId);
        i.putExtra("tk_chatType", chatType == null ? "direct" : chatType);
        i.putExtra("tk_callerId", callerId == null ? "" : callerId);
        i.putExtra("tk_isCall", isCall);
        return i;
    }

    private static PendingIntent openIntent(Context ctx, int requestCode, String action, String chatId, String chatType,
                                             String callerId, boolean isCall) {
        Intent i = mainIntent(ctx, action, chatId, chatType, callerId, isCall);
        // unique data so PendingIntents for different actions never collapse into one
        i.setData(Uri.parse("talkies://n/" + requestCode + "/" + action));
        return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---- caller photo ("calling card") ----

    private static File photoFile(Context ctx, String callerId) {
        String safe = callerId == null ? "" : callerId.replaceAll("[^A-Za-z0-9]", "");
        return new File(ctx.getCacheDir(), "call_photo_" + (safe.isEmpty() ? "x" : safe) + ".jpg");
    }

    /** Asks the image host for a big, screen-sized version of the photo when it supports resizing. */
    private static String resolvePhotoUrl(String url, int width) {
        if (url == null || url.isEmpty()) return "";
        if (url.startsWith("/")) return SITE + url;
        if (url.contains("res.cloudinary.com") && url.contains("/upload/") && !url.contains("/upload/c_")) {
            return url.replace("/upload/", "/upload/c_fill,g_auto,w_" + width + ",h_" + (width * 16 / 9) + ",f_jpg,q_auto/");
        }
        return url;
    }

    /**
     * Returns the caller's photo, from the cache if it was already fetched for this call,
     * otherwise downloaded (blocking — call from a background thread). Null when there is none.
     */
    static Bitmap loadPhoto(Context ctx, String url, String callerId, int width) {
        try {
            File f = photoFile(ctx, callerId);
            if (f.exists() && System.currentTimeMillis() - f.lastModified() < 10 * 60_000L) {
                Bitmap cached = BitmapFactory.decodeFile(f.getAbsolutePath());
                if (cached != null) return cached;
            }
            String resolved = resolvePhotoUrl(url, width);
            if (resolved.isEmpty() || !resolved.startsWith("https://")) return null;
            HttpURLConnection c = (HttpURLConnection) new URL(resolved).openConnection();
            c.setConnectTimeout(5000);
            c.setReadTimeout(7000);
            try (InputStream in = c.getInputStream()) {
                Bitmap bmp = BitmapFactory.decodeStream(in);
                if (bmp == null) return null;
                try (FileOutputStream out = new FileOutputStream(f)) {
                    bmp.compress(Bitmap.CompressFormat.JPEG, 88, out);
                }
                return bmp;
            } finally {
                c.disconnect();
            }
        } catch (Exception e) {
            return null;
        }
    }

    /** Cached caller photo only — never touches the network, so the ring can start instantly. */
    static Bitmap cachedPhoto(Context ctx, String callerId) {
        try {
            File f = photoFile(ctx, callerId);
            if (f.exists() && System.currentTimeMillis() - f.lastModified() < 10 * 60_000L) {
                return BitmapFactory.decodeFile(f.getAbsolutePath());
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /** Square, round avatar for the notification's own caller icon. */
    private static Bitmap roundAvatar(Bitmap src, int size) {
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        int side = Math.min(src.getWidth(), src.getHeight());
        int left = (src.getWidth() - side) / 2;
        int top = (src.getHeight() - side) / 2;
        canvas.drawBitmap(src, new Rect(left, top, left + side, top + side), new Rect(0, 0, size, size), paint);
        return out;
    }

    /** Full-screen incoming call (caller photo, ringtone, Answer / Decline). */
    static void showIncomingCall(Context ctx, String name, String body, String tag, String callerId, String photoUrl) {
        ensureChannels(ctx);
        int id = idFor(tag);
        // Ring FIRST: downloading the photo here used to delay the ring by up to ~12 s on a slow
        // network (FCM only gives the service ~10 s). The call screen loads the photo by itself.
        Bitmap photo = cachedPhoto(ctx, callerId);

        // Full-screen "calling card": over the lock screen it opens our own call screen.
        Intent screen = new Intent(ctx, IncomingCallActivity.class);
        screen.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        screen.putExtra(IncomingCallActivity.EXTRA_NAME, name);
        screen.putExtra(IncomingCallActivity.EXTRA_BODY, body);
        screen.putExtra(IncomingCallActivity.EXTRA_TAG, tag);
        screen.putExtra(IncomingCallActivity.EXTRA_CALLER, callerId);
        screen.putExtra(IncomingCallActivity.EXTRA_PHOTO, photoUrl);
        screen.setData(Uri.parse("talkies://call/" + id));
        PendingIntent fullScreen = PendingIntent.getActivity(ctx, id + 3, screen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent full = openIntent(ctx, id, "open", callerId, "direct", callerId, true);
        // Answer opens the app and the page picks the call up by itself (no second tap).
        PendingIntent answer = openIntent(ctx, id + 1, "answer", callerId, "direct", callerId, true);

        Intent decline = new Intent(ctx, CallActionReceiver.class);
        decline.setAction(ACTION_DECLINE);
        decline.putExtra("callerId", callerId);
        decline.putExtra("notifId", id);
        PendingIntent declinePi = PendingIntent.getBroadcast(ctx, id + 2, decline, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Person.Builder pb = new Person.Builder().setName(name == null || name.isEmpty() ? "Talkies" : name).setImportant(true);
        Bitmap avatar = null;
        if (photo != null) {
            avatar = roundAvatar(photo, 256);
            pb.setIcon(IconCompat.createWithBitmap(avatar));
        }
        Person caller = pb.build();
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
                .setFullScreenIntent(fullScreen, true)
                .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, answer));
        if (avatar != null) b.setLargeIcon(avatar);
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
        IncomingCallActivity.dismiss(tag); // also closes the full-screen call screen
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
