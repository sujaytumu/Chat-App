package com.sujaytumu.talkies;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * Safety-net ringer. The call notification's channel normally rings by itself, but on some phones it
 * silently doesn't (channel importance lowered by the system / battery manager, channel sound dropped,
 * a stale notification turning the new call into a quiet update ...). When we detect that, the app
 * rings itself on the ring stream — respecting silent / vibrate mode and Do Not Disturb.
 */
final class CallRinger {
    private static final long MAX_MS = 45_000;
    private static final Object LOCK = new Object();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static MediaPlayer player;
    private static PowerManager.WakeLock wake;
    private static String activeTag;
    private static Runnable stopper;

    private CallRinger() {}

    static void start(final Context appCtx, String tag) {
        final Context ctx = appCtx.getApplicationContext();
        stop();
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            int mode = am.getRingerMode();
            if (mode == AudioManager.RINGER_MODE_SILENT) return;

            synchronized (LOCK) {
                activeTag = tag;
                try {
                    PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "talkies:ring");
                        wake.acquire(MAX_MS + 2_000);
                    }
                } catch (Exception ignored) {
                }
            }

            vibrate(ctx);
            if (mode != AudioManager.RINGER_MODE_NORMAL) {
                schedule();
                return; // vibrate mode: vibration only
            }

            Uri uri = NotificationHelper.ringToneUri(ctx);
            if (uri == null) {
                schedule();
                return; // person picked "silent" inside Talkies
            }
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mp.setDataSource(ctx, uri);
            mp.setLooping(true);
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer m, int what, int extra) {
                    stop();
                    return true;
                }
            });
            mp.prepare();
            mp.start();
            synchronized (LOCK) {
                player = mp;
            }
            schedule();
        } catch (Exception e) {
            // never let the safety net break the call itself
            stopPlayerOnly();
        }
    }

    private static void schedule() {
        stopper = new Runnable() {
            @Override
            public void run() {
                stop();
            }
        };
        MAIN.postDelayed(stopper, MAX_MS);
    }

    @SuppressWarnings("deprecation")
    private static void vibrate(Context ctx) {
        try {
            Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            long[] pattern = NotificationHelper.RING_VIBRATION;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, 0));
            else v.vibrate(pattern, 0);
        } catch (Exception ignored) {
        }
    }

    private static void stopPlayerOnly() {
        synchronized (LOCK) {
            if (player != null) {
                try {
                    player.stop();
                } catch (Exception ignored) {
                }
                try {
                    player.release();
                } catch (Exception ignored) {
                }
                player = null;
            }
        }
    }

    static void stop() {
        if (stopper != null) {
            MAIN.removeCallbacks(stopper);
            stopper = null;
        }
        stopPlayerOnly();
        synchronized (LOCK) {
            activeTag = null;
            try {
                if (wake != null && wake.isHeld()) wake.release();
            } catch (Exception ignored) {
            }
            wake = null;
        }
    }

    /** Stops only if it is ringing for this tag (or for any, when tag is empty). */
    static void stopFor(String tag) {
        synchronized (LOCK) {
            if (tag != null && !tag.isEmpty() && activeTag != null && !tag.equals(activeTag)) return;
        }
        stop();
        try {
            // vibration started without a service handle: cancel through the app context
            Context c = NotificationHelper.appContext();
            if (c != null) {
                Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.cancel();
            }
        } catch (Exception ignored) {
        }
    }
}
