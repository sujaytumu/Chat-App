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
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
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

    // Which call is ringing under each notification tag, and which calls were already cancelled.
    // A cancel that arrives before its ring (or twice) must never ring / re-ring a finished call, and a
    // cancel for an OLD call must never silence a newer one.
    private static final Map<String, String> RINGING = new HashMap<>();
    private static final Map<String, Long> CANCELLED = new HashMap<>();

    static boolean wasCancelled(String callId) {
        if (callId == null || callId.isEmpty()) return false;
        synchronized (CANCELLED) {
            Long t = CANCELLED.get(callId);
            return t != null && System.currentTimeMillis() - t < 5 * 60_000L;
        }
    }

    private static void markCancelled(String callId) {
        if (callId == null || callId.isEmpty()) return;
        synchronized (CANCELLED) {
            long now = System.currentTimeMillis();
            CANCELLED.put(callId, now);
            java.util.Iterator<Map.Entry<String, Long>> it = CANCELLED.entrySet().iterator();
            while (it.hasNext()) {
                if (now - it.next().getValue() > 5 * 60_000L) it.remove();
            }
        }
    }

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

        // The phone's own ringtone is never used. Calls ring with the tone the person picked inside
        // Talkies (their own file), or the Talkies tune shipped in the app when they picked none.
        // A channel's sound can't be changed once created, so every change gets a fresh channel id.
        String chId = callChannelId(ctx);
        for (NotificationChannel old : nm.getNotificationChannels()) {
            String oid = old.getId();
            if (oid.startsWith("talkies_calls") && !oid.equals(chId)) nm.deleteNotificationChannel(oid);
        }
        if (nm.getNotificationChannel(chId) == null) {
            AudioAttributes ring = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            NotificationChannel calls = new NotificationChannel(chId, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
            calls.setDescription("Rings when someone calls you on Talkies");
            String mode = toneMode(ctx);
            if ("silent".equals(mode)) {
                calls.setSound(null, null);
            } else if ("custom".equals(mode)) {
                Uri custom = customToneUri(ctx);
                calls.setSound(custom != null ? custom : Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.talkies_ring), ring);
            } else {
                calls.setSound(Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.talkies_ring), ring);
            }
            calls.enableVibration(true);
            calls.setVibrationPattern(new long[]{0, 900, 600, 900, 600, 900, 600, 900});
            calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            calls.setBypassDnd(false);
            nm.createNotificationChannel(calls);
        }

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

    // ---- the call tone the person chose inside Talkies ----

    private static android.content.SharedPreferences tonePrefs(Context ctx) {
        return ctx.getSharedPreferences("talkies_call_tone", Context.MODE_PRIVATE);
    }

    /** "talkies" (bundled tune) | "custom" (their own file) | "silent". Falls back to the bundled tune if the file is gone. */
    private static String toneMode(Context ctx) {
        String mode = tonePrefs(ctx).getString("mode", "talkies");
        if ("custom".equals(mode) && customToneFile(ctx) == null) return "talkies";
        return mode;
    }

    private static File customToneFile(Context ctx) {
        String name = tonePrefs(ctx).getString("file", "");
        if (name.isEmpty()) return null;
        File f = new File(new File(ctx.getFilesDir(), "tones"), name);
        return f.exists() && f.length() > 0 ? f : null;
    }

    private static Uri customToneUri(Context ctx) {
        try {
            File f = customToneFile(ctx);
            if (f == null) return null;
            Uri uri = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
            // the system's notification service plays the sound, so it must be allowed to read the file
            ctx.grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            ctx.grantUriPermission("android", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return uri;
        } catch (Exception e) {
            return null;
        }
    }

    /** Id of the notification channel that carries the currently chosen call tone. */
    static String callChannelId(Context ctx) {
        String mode = toneMode(ctx);
        int ver = tonePrefs(ctx).getInt("ver", 0);
        if ("custom".equals(mode)) return "talkies_calls_c" + ver;
        if ("silent".equals(mode)) return "talkies_calls_silent_v1";
        return CH_CALLS;
    }

    /** Saves the tone the person picked in the app (called from the web page via the plugin). */
    static boolean setCallTone(Context ctx, String mode, String base64, String ext) {
        try {
            android.content.SharedPreferences.Editor e = tonePrefs(ctx).edit();
            if ("custom".equals(mode) && base64 != null && !base64.isEmpty()) {
                byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                File dir = new File(ctx.getFilesDir(), "tones");
                dir.mkdirs();
                String safeExt = ext == null ? "" : ext.replaceAll("[^A-Za-z0-9]", "");
                if (safeExt.isEmpty() || safeExt.length() > 5) safeExt = "mp3";
                String fileName = "call_tone_" + System.currentTimeMillis() + "." + safeExt;
                try (FileOutputStream out = new FileOutputStream(new File(dir, fileName))) {
                    out.write(bytes);
                }
                File[] olds = dir.listFiles();
                if (olds != null) for (File o : olds) if (!o.getName().equals(fileName)) o.delete();
                e.putString("mode", "custom").putString("file", fileName);
            } else if ("silent".equals(mode)) {
                e.putString("mode", "silent");
            } else {
                e.putString("mode", "talkies");
            }
            e.putInt("ver", tonePrefs(ctx).getInt("ver", 0) + 1).apply();
            ensureChannels(ctx);
            return true;
        } catch (Exception ex) {
            return false;
        }
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
        return resolvePhotoUrl(url, width, width * 16 / 9);
    }

    private static String resolvePhotoUrl(String url, int width, int height) {
        if (url == null || url.isEmpty()) return "";
        if (url.startsWith("/")) return SITE + url;
        if (url.contains("res.cloudinary.com") && url.contains("/upload/") && !url.contains("/upload/c_")) {
            return url.replace("/upload/", "/upload/c_fill,g_auto,w_" + width + ",h_" + height + ",f_jpg,q_auto/");
        }
        return url;
    }

    /** True when the push carries a real profile photo (not the Talkies logo / the generic avatar it falls back to). */
    private static boolean isRealPhoto(String url) {
        if (url == null || url.isEmpty()) return false;
        String u = url.toLowerCase();
        return !(u.endsWith("/icon-v2-192.png") || u.endsWith("/icon-v2-512.png") || u.endsWith("/avatar.png") || u.endsWith("/icon.jpg"));
    }

    /** WhatsApp's stand-in for a contact with no photo: a round grey avatar with a person silhouette. */
    private static Bitmap defaultAvatar(int size) {
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        android.graphics.Path clip = new android.graphics.Path();
        clip.addCircle(size / 2f, size / 2f, size / 2f, android.graphics.Path.Direction.CW);
        c.clipPath(clip);
        p.setColor(Color.parseColor("#6B7C85"));
        c.drawRect(0, 0, size, size, p);
        p.setColor(Color.parseColor("#E4E9EB"));
        c.drawCircle(size * 0.5f, size * 0.38f, size * 0.18f, p); // head
        c.drawCircle(size * 0.5f, size * 1.02f, size * 0.36f, p); // shoulders
        return out;
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
            String resolved = callerId != null && callerId.startsWith("msg_") ? resolvePhotoUrl(url, width, width) : resolvePhotoUrl(url, width);
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
    static void showIncomingCall(Context ctx, String name, String body, String tag, String callerId, String photoUrl, String callId) {
        // This call was already cancelled / ended before its ring reached the phone (it was offline,
        // then came back): stay silent, exactly like a real call that was hung up.
        if (wasCancelled(callId)) return;
        synchronized (RINGING) {
            RINGING.put(tag == null ? "" : tag, callId == null ? "" : callId);
        }
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
        screen.putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId == null ? "" : callId);
        screen.putExtra(IncomingCallActivity.EXTRA_STARTED, System.currentTimeMillis());
        screen.setData(Uri.parse("talkies://call/" + id));
        PendingIntent fullScreen = PendingIntent.getActivity(ctx, id + 3, screen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Tapping the notification itself brings back the big call screen (same ringtone still going),
        // exactly like WhatsApp — it does NOT open the chat list. Answer / Decline act directly.
        Intent reopen = new Intent(ctx, IncomingCallActivity.class);
        reopen.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        reopen.putExtras(screen);
        reopen.setData(Uri.parse("talkies://callopen/" + id));
        PendingIntent full = PendingIntent.getActivity(ctx, id + 4, reopen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Answer opens the app and the page picks the call up by itself (no second tap).
        PendingIntent answer = openIntent(ctx, id + 1, "answer", callerId, "direct", callerId, true);

        Intent decline = new Intent(ctx, CallActionReceiver.class);
        decline.setAction(ACTION_DECLINE);
        decline.putExtra("callerId", callerId);
        decline.putExtra("notifId", id);
        decline.putExtra("callId", callId == null ? "" : callId);
        PendingIntent declinePi = PendingIntent.getBroadcast(ctx, id + 2, decline, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Person.Builder pb = new Person.Builder().setName(name == null || name.isEmpty() ? "Talkies" : name).setImportant(true);
        Bitmap avatar = null;
        if (photo != null) {
            avatar = roundAvatar(photo, 256);
            pb.setIcon(IconCompat.createWithBitmap(avatar));
        }
        Person caller = pb.build();
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, callChannelId(ctx))
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
        cancel(ctx, tag, "");
    }

    /** Stops the ring of one specific call. A cancel naming an older call than the one ringing is ignored. */
    static void cancel(Context ctx, String tag, String callId) {
        String key = tag == null ? "" : tag;
        if (callId != null && !callId.isEmpty()) {
            markCancelled(callId);
            synchronized (RINGING) {
                String ringing = RINGING.get(key);
                if (ringing != null && !ringing.isEmpty() && !ringing.equals(callId)) return;
            }
        }
        synchronized (RINGING) {
            RINGING.remove(key);
        }
        // A cancel names a specific call. If what is on screen under this tag is no longer that ringing
        // call (e.g. the "Missed call" notification already replaced it), leave it alone.
        if (callId != null && !callId.isEmpty() && !callNotificationShown(ctx, idFor(tag))) return;
        try {
            NotificationManagerCompat.from(ctx).cancel(idFor(tag));
        } catch (Exception ignored) {
        }
        IncomingCallActivity.dismiss(tag); // also closes the full-screen call screen
    }

    /** True when the notification with this id is currently the ringing-call one (not a message / missed call). */
    private static boolean callNotificationShown(Context ctx, int id) {
        try {
            if (Build.VERSION.SDK_INT < 23) return true;
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return true;
            for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (sbn.getId() != id) continue;
                if (Build.VERSION.SDK_INT >= 26) {
                    String chan = sbn.getNotification().getChannelId();
                    return chan != null && chan.startsWith("talkies_calls");
                }
                return true;
            }
            return false;
        } catch (Exception e) {
            return true; // when unsure, stop the ring
        }
    }

    static void showMessage(Context ctx, String title, String body, String tag, String chatId, String chatType, boolean missedCall, String photoUrl) {
        if (missedCall) {
            // "Missed call" replaces the ringing notification: the full-screen call screen must go too.
            synchronized (RINGING) {
                RINGING.remove(tag == null ? "" : tag);
            }
            IncomingCallActivity.dismiss(tag);
        }
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

        // WhatsApp-style: the sender's round photo, their messages as a conversation, and Reply / Mark as read / Mute.
        // Their photo as a round avatar; with no photo, the same grey person avatar WhatsApp uses (never the app logo).
        Bitmap avatar = null;
        if (isRealPhoto(photoUrl)) {
            try {
                Bitmap raw = loadPhoto(ctx, photoUrl, "msg_" + (chatId.isEmpty() ? title : chatId), 192);
                if (raw != null) avatar = roundAvatar(raw, 192);
            } catch (Exception ignored) {
            }
        }
        if (avatar == null) avatar = defaultAvatar(192);
        Person sender = new Person.Builder()
                .setName(title == null || title.isEmpty() ? "Talkies" : title)
                .setKey(key)
                .setIcon(IconCompat.createWithBitmap(avatar))
                .build();
        // "You" (your own replies shown in the conversation) gets an avatar too, instead of the system's blank one
        Person me = new Person.Builder().setName("You").setKey("talkies_me").setIcon(IconCompat.createWithBitmap(defaultAvatar(192))).build();
        NotificationCompat.MessagingStyle conv = new NotificationCompat.MessagingStyle(me);
        synchronized (RECENT) {
            ArrayDeque<String> q = RECENT.get(key);
            if (q != null) for (String line : q) conv.addMessage(line, System.currentTimeMillis(), sender);
        }
        boolean canAct = !missedCall && !chatId.isEmpty();

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, missedCall ? CH_MISSED : CH_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_talkies)
                .setColor(Color.parseColor("#00A884"))
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(missedCall ? style : conv)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setContentIntent(tap);
        b.setLargeIcon(avatar);
        // Android 11+: a conversation notification (long-lived shortcut + person) is what shows the sender's photo
        // with the small app badge on its corner and puts it in the Conversations section, like WhatsApp.
        if (!missedCall && !chatId.isEmpty()) {
            try {
                String shortcutId = "talkies_chat_" + key;
                Intent open = mainIntent(ctx, "open", chatId, chatType, "", false);
                open.setAction(Intent.ACTION_VIEW);
                ShortcutInfoCompat sc = new ShortcutInfoCompat.Builder(ctx, shortcutId)
                        .setShortLabel(title == null || title.isEmpty() ? "Talkies" : title)
                        .setLongLived(true)
                        .setPerson(sender)
                        .setIcon(IconCompat.createWithBitmap(avatar))
                        .setIntent(open)
                        .build();
                ShortcutManagerCompat.pushDynamicShortcut(ctx, sc);
                b.setShortcutId(shortcutId);
            } catch (Exception ignored) {
                // no shortcut: it still shows as a normal message notification
            }
        }
        if (canAct) {
            androidx.core.app.RemoteInput remote = new androidx.core.app.RemoteInput.Builder(MessageActionReceiver.KEY_REPLY).setLabel("Reply").build();
            b.addAction(new NotificationCompat.Action.Builder(0, "Reply", actionIntent(ctx, id, id, MessageActionReceiver.ACTION_REPLY, chatId, chatType, key, true))
                    .addRemoteInput(remote).setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY).setShowsUserInterface(false).build());
            b.addAction(new NotificationCompat.Action.Builder(0, "Mark as read", actionIntent(ctx, id + 1, id, MessageActionReceiver.ACTION_READ, chatId, chatType, key, false))
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ).setShowsUserInterface(false).build());
            b.addAction(new NotificationCompat.Action.Builder(0, "Mute", actionIntent(ctx, id + 2, id, MessageActionReceiver.ACTION_MUTE, chatId, chatType, key, false))
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MUTE).setShowsUserInterface(false).build());
        }
        notifySafe(ctx, id, b.build());
    }

    private static PendingIntent actionIntent(Context ctx, int requestCode, int notifId, String action, String chatId, String chatType, String key, boolean mutable) {
        Intent i = new Intent(ctx, MessageActionReceiver.class);
        i.setAction(action);
        i.setData(Uri.parse("talkies://act/" + requestCode + "/" + action));
        i.putExtra("chatId", chatId);
        i.putExtra("chatType", chatType == null || chatType.isEmpty() ? "direct" : chatType);
        i.putExtra("key", key);
        i.putExtra("notifId", notifId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (mutable ? (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0) : PendingIntent.FLAG_IMMUTABLE);
        return PendingIntent.getBroadcast(ctx, requestCode, i, flags);
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
