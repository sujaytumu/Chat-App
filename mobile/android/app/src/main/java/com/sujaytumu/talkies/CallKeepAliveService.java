package com.sujaytumu.talkies;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps a call alive while the app is in the background.
 *
 * Android silences the microphone (and may throttle the web page) of an app
 * that isn't on screen, unless it is running a foreground service of type
 * "microphone". This service does nothing but hold that status for the length
 * of a call and show the ongoing-call notification (with a timer and Hang up).
 */
public class CallKeepAliveService extends Service {
    static final String ACTION_HANGUP = "com.sujaytumu.talkies.CALL_HANGUP";
    private static final String CHANNEL_ID = "ongoing_call";
    private static final int NOTIFICATION_ID = 4712;

    private PowerManager.WakeLock wakeLock;
    private AudioFocusRequest focusRequest;
    private int prevAudioMode = AudioManager.MODE_NORMAL;
    private boolean audioHeld = false;

    /** Tell Android this is a voice call so the other person stays audible with the app in the background. */
    private void holdCallAudio() {
        if (audioHeld) return;
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            prevAudioMode = am.getMode();
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= 26) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build())
                        .setOnAudioFocusChangeListener(change -> { })
                        .build();
                am.requestAudioFocus(focusRequest);
            }
            audioHeld = true;
        } catch (Exception ignored) {
        }
    }

    private void releaseCallAudio() {
        if (!audioHeld) return;
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        try {
            if (am != null) {
                if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) am.abandonAudioFocusRequest(focusRequest);
                if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice();
                else am.setSpeakerphoneOn(false);
                am.setMode(prevAudioMode);
            }
        } catch (Exception ignored) {
        }
        focusRequest = null;
        audioHeld = false;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_HANGUP.equals(intent.getAction())) {
            CallKeepAlivePlugin.hangup();
            MainActivity.callActive = false;
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra("title");
        String text = intent.getStringExtra("text");
        boolean video = intent.getBooleanExtra("video", false);
        long startedAt = intent.getLongExtra("startedAt", 0L);

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Ongoing call", NotificationManager.IMPORTANCE_LOW));
        }

        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openIntent = PendingIntent.getActivity(
                this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent hang = new Intent(this, CallKeepAliveService.class).setAction(ACTION_HANGUP);
        PendingIntent hangIntent = PendingIntent.getService(
                this, 2, hang, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setContentTitle(title == null ? "Talkies call" : title)
                .setContentText(text == null ? "Call in progress" : text)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setCategory(Notification.CATEGORY_CALL)
                .setOngoing(true)
                .setContentIntent(openIntent);
        // A live mm:ss timer once the call has connected (not while it's still ringing).
        if (startedAt > 0) {
            b.setUsesChronometer(true).setShowWhen(true).setWhen(startedAt);
        } else {
            b.setShowWhen(false);
        }
        Notification n;
        if (Build.VERSION.SDK_INT >= 31) {
            // Android's own call notification: contact name, timer and a red Hang up button.
            try {
                android.app.Person person = new android.app.Person.Builder()
                        .setName(title == null ? "Talkies call" : title).setImportant(true).build();
                b.setStyle(Notification.CallStyle.forOngoingCall(person, hangIntent));
                n = b.build();
            } catch (Exception e) {
                b.setStyle(null);
                b.addAction(new Notification.Action.Builder(null, "Hang up", hangIntent).build());
                n = b.build();
            }
        } else {
            b.addAction(new Notification.Action.Builder(null, "Hang up", hangIntent).build());
            n = b.build();
        }

        try {
            if (Build.VERSION.SDK_INT >= 30) {
                int type = 0;
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                }
                if (video && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
                }
                if (type != 0) startForeground(NOTIFICATION_ID, n, type);
                else startForeground(NOTIFICATION_ID, n);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Exception e) {
            // Couldn't become a foreground service (e.g. started too late) — the
            // call still works while the app is open.
            stopSelf();
            return START_NOT_STICKY;
        }

        holdCallAudio();

        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "talkies:call");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(4 * 60 * 60 * 1000L); // safety cap: 4 hours
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        releaseCallAudio();
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
        MainActivity.callActive = false;
        super.onDestroy();
    }
}
