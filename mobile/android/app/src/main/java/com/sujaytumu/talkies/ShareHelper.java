package com.sujaytumu.talkies;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.List;

/**
 * "Share to Talkies": photos, videos, files and text that other apps (Google Photos, Gallery, Files, Chrome ...)
 * hand over from their share sheet. The files are copied into the app's cache, then the page picks a chat and sends them.
 */
final class ShareHelper {
    private static final int MAX_ITEMS = 30;
    private static final long MAX_BYTES = 64L * 1024 * 1024;

    private static final Object LOCK = new Object();
    private static JSObject current; // { text, items: [{ id, name, mime, size }] }

    private ShareHelper() {}

    static JSObject get() {
        synchronized (LOCK) {
            return current;
        }
    }

    static void clear(Context ctx) {
        synchronized (LOCK) {
            current = null;
        }
        deleteDir(dir(ctx));
    }

    private static File dir(Context ctx) {
        return new File(ctx.getCacheDir(), "shared");
    }

    private static void deleteDir(File d) {
        try {
            File[] list = d.listFiles();
            if (list != null) for (File f : list) f.delete();
        } catch (Exception ignored) {
        }
    }

    /** Looks at an incoming intent; if it is a share, copies the files in the background and tells the page. */
    static void handle(final Context ctx, final Intent intent) {
        try {
            if (intent == null) return;
            String action = intent.getAction();
            if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
            final String text = firstNonEmpty(intent.getStringExtra(Intent.EXTRA_TEXT), intent.getStringExtra(Intent.EXTRA_SUBJECT));
            final List<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND.equals(action)) {
                Uri u = streamOf(intent);
                if (u != null) uris.add(u);
            } else {
                ArrayList<Uri> many = Build.VERSION.SDK_INT >= 33
                        ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class)
                        : intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (many != null) uris.addAll(many);
            }
            // the same share must not be handled twice (rotation, coming back to the app)
            intent.setAction(Intent.ACTION_MAIN);
            final ClipData clip = intent.getClipData();
            if (uris.isEmpty() && clip != null) {
                for (int i = 0; i < clip.getItemCount() && uris.size() < MAX_ITEMS; i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null) uris.add(u);
                }
            }
            final Context app = ctx.getApplicationContext();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    build(app, text, uris);
                }
            }, "talkies-share").start();
        } catch (Exception ignored) {
        }
    }

    @SuppressWarnings("deprecation")
    private static Uri streamOf(Intent intent) {
        return Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class) : (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a;
        return b != null && !b.trim().isEmpty() ? b : "";
    }

    private static void build(Context app, String text, List<Uri> uris) {
        try {
            File d = dir(app);
            d.mkdirs();
            deleteDir(d);
            ContentResolver cr = app.getContentResolver();
            JSArray items = new JSArray();
            int n = 0;
            for (Uri u : uris) {
                if (n >= MAX_ITEMS) break;
                try {
                    String name = null;
                    long size = -1;
                    try (Cursor c = cr.query(u, null, null, null, null)) {
                        if (c != null && c.moveToFirst()) {
                            int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                            int si = c.getColumnIndex(OpenableColumns.SIZE);
                            if (ni >= 0) name = c.getString(ni);
                            if (si >= 0 && !c.isNull(si)) size = c.getLong(si);
                        }
                    } catch (Exception ignored) {
                    }
                    String mime = cr.getType(u);
                    if (mime == null) mime = "application/octet-stream";
                    if (name == null || name.isEmpty()) name = "shared_" + System.currentTimeMillis() + "_" + n;
                    String safe = name.replaceAll("[^A-Za-z0-9._ -]", "_");
                    File out = new File(d, n + "_" + safe);
                    long copied = 0;
                    try (InputStream in = cr.openInputStream(u); OutputStream os = new FileOutputStream(out)) {
                        if (in == null) continue;
                        byte[] buf = new byte[64 * 1024];
                        int r;
                        while ((r = in.read(buf)) > 0) {
                            os.write(buf, 0, r);
                            copied += r;
                            if (copied > MAX_BYTES) break;
                        }
                    }
                    if (copied > MAX_BYTES || copied == 0) {
                        out.delete();
                        continue;
                    }
                    JSObject it = new JSObject();
                    it.put("id", out.getName());
                    it.put("name", name);
                    it.put("mime", mime);
                    it.put("size", copied);
                    items.put(it);
                    n++;
                } catch (Exception ignored) {
                }
            }
            JSObject res = new JSObject();
            res.put("text", text == null ? "" : text);
            res.put("items", items);
            if (items.length() == 0 && (text == null || text.isEmpty())) return;
            synchronized (LOCK) {
                current = res;
            }
            TalkiesPushPlugin.notifyShared(res);
        } catch (Exception ignored) {
        }
    }

    /** A slice of a copied file as base64 (the page asks piece by piece so big videos don't overload the bridge). */
    static JSObject readChunk(Context ctx, String id, long offset, int length) throws Exception {
        String safe = id == null ? "" : new File(id).getName();
        File f = new File(dir(ctx), safe);
        if (!f.isFile()) throw new Exception("gone");
        int want = Math.max(1, Math.min(length, 1024 * 1024));
        byte[] buf = new byte[want];
        int got;
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            raf.seek(offset);
            got = raf.read(buf);
        }
        if (got < 0) got = 0;
        byte[] part = got == want ? buf : java.util.Arrays.copyOf(buf, got);
        JSObject res = new JSObject();
        res.put("data", android.util.Base64.encodeToString(part, android.util.Base64.NO_WRAP));
        res.put("read", got);
        res.put("done", offset + got >= f.length());
        return res;
    }
}
