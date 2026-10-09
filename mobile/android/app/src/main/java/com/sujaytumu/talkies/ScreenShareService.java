package com.sujaytumu.talkies;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Base64;
import android.util.DisplayMetrics;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/**
 * Foreground service that owns the MediaProjection (Android requires one for
 * screen capture) and turns the screen into JPEG frames.
 */
public class ScreenShareService extends Service {
    public interface Listener {
        void onStarted(int width, int height);
        void onFrame(String base64Jpeg, int width, int height);
        void onStopped(String reason);
        void onError(String message);
    }

    static final String EXTRA_RESULT_CODE = "resultCode";
    static final String EXTRA_DATA = "data";
    static final String ACTION_STOP = "com.sujaytumu.talkies.STOP_SCREEN_SHARE";
    static volatile Listener listener;

    private static final String CHANNEL_ID = "screen_share";
    private static final int NOTIFICATION_ID = 4711;
    private static final int MAX_SIDE = 960;       // long edge of the shared picture, in px
    private static final int JPEG_QUALITY = 55;
    private static final long MIN_FRAME_GAP_MS = 120; // ~8 frames per second

    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private HandlerThread thread;
    private Handler handler;
    private long lastFrameAt = 0;
    private int outWidth;
    private int outHeight;
    private boolean running = false;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopCapture("stopped");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null || running) return START_NOT_STICKY;

        // Android 14+: the foreground service must be up (with the mediaProjection
        // type) before the projection is created.
        startAsForeground();

        try {
            int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
            Intent data = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra(EXTRA_DATA, Intent.class)
                    : intent.getParcelableExtra(EXTRA_DATA);
            if (data == null) throw new IllegalStateException("No screen-capture permission");

            MediaProjectionManager manager =
                    (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = manager.getMediaProjection(resultCode, data);
            if (projection == null) throw new IllegalStateException("Couldn't start screen capture");

            thread = new HandlerThread("talkies-screen-share");
            thread.start();
            handler = new Handler(thread.getLooper());

            // Required on Android 14+, and tells us when the system stops the capture
            projection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    stopCapture("system");
                    stopSelf();
                }
            }, handler);

            DisplayMetrics metrics = getResources().getDisplayMetrics();
            float scale = Math.min(1f, (float) MAX_SIDE / Math.max(metrics.widthPixels, metrics.heightPixels));
            outWidth = Math.max(2, ((int) (metrics.widthPixels * scale)) & ~1);
            outHeight = Math.max(2, ((int) (metrics.heightPixels * scale)) & ~1);

            reader = ImageReader.newInstance(outWidth, outHeight, PixelFormat.RGBA_8888, 2);
            reader.setOnImageAvailableListener(this::onImage, handler);
            display = projection.createVirtualDisplay(
                    "talkies-share", outWidth, outHeight, metrics.densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    reader.getSurface(), null, handler);

            running = true;
            Listener l = listener;
            if (l != null) l.onStarted(outWidth, outHeight);
        } catch (Exception e) {
            Listener l = listener;
            if (l != null) l.onError(e.getMessage() == null ? "Screen share failed" : e.getMessage());
            stopCapture("error");
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void onImage(ImageReader r) {
        Image image = null;
        try {
            image = r.acquireLatestImage();
            if (image == null) return;
            long now = System.currentTimeMillis();
            if (now - lastFrameAt < MIN_FRAME_GAP_MS) return; // too soon — drop this one
            lastFrameAt = now;

            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowPadding = plane.getRowStride() - pixelStride * outWidth;
            Bitmap padded = Bitmap.createBitmap(outWidth + rowPadding / pixelStride, outHeight, Bitmap.Config.ARGB_8888);
            padded.copyPixelsFromBuffer(buffer);
            Bitmap frame = Bitmap.createBitmap(padded, 0, 0, outWidth, outHeight);
            if (frame != padded) padded.recycle();

            ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
            frame.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out);
            frame.recycle();

            Listener l = listener;
            if (l != null) l.onFrame(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP), outWidth, outHeight);
        } catch (Exception ignored) {
            // a bad frame is skipped; the next one will do
        } finally {
            if (image != null) image.close();
        }
    }

    private void startAsForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(
                    CHANNEL_ID, "Screen sharing", NotificationManager.IMPORTANCE_LOW));
        }
        Intent stop = new Intent(this, ScreenShareService.class).setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getService(
                this, 0, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        Notification notification = builder
                .setContentTitle("Talkies")
                .setContentText("You're sharing your screen")
                .setSmallIcon(android.R.drawable.ic_menu_share)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Stop sharing", stopIntent).build())
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void stopCapture(String reason) {
        boolean wasRunning = running;
        running = false;
        try {
            if (reader != null) reader.setOnImageAvailableListener(null, null);
            if (display != null) display.release();
            if (reader != null) reader.close();
            if (projection != null) projection.stop();
        } catch (Exception ignored) {
            // already torn down
        }
        display = null;
        reader = null;
        projection = null;
        if (thread != null) {
            thread.quitSafely();
            thread = null;
        }
        if (wasRunning) {
            Listener l = listener;
            if (l != null) l.onStopped(reason);
        }
    }

    @Override
    public void onDestroy() {
        stopCapture("stopped");
        super.onDestroy();
    }
}
