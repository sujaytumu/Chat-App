package com.sujaytumu.talkies;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Full-screen incoming call, like the "calling card" of a normal phone call: the caller's
 * photo fills the whole screen, with their name and big Answer / Decline buttons. It is
 * launched by the call notification's full-screen intent, so it appears over the lock screen
 * and wakes the display. Answer opens the app and picks the call up straight away.
 */
public class IncomingCallActivity extends Activity {
    static final String EXTRA_NAME = "name";
    static final String EXTRA_BODY = "body";
    static final String EXTRA_TAG = "tag";
    static final String EXTRA_CALLER = "callerId";
    static final String EXTRA_PHOTO = "photoUrl";
    static final String EXTRA_CALL_ID = "callId";
    static final String EXTRA_STARTED = "startedAt";

    private static volatile IncomingCallActivity current;

    private final Handler main = new Handler(Looper.getMainLooper());
    private ImageView photoView;
    private TextView initialView;
    private String tag = "";
    private String callerId = "";
    private String callId = "";
    private boolean done = false;

    /** Closes the screen when the caller hangs up / the call is answered elsewhere. */
    static void dismiss(String tag) {
        final IncomingCallActivity a = current;
        if (a == null) return;
        if (tag != null && !tag.isEmpty() && !tag.equals(a.tag)) return;
        a.main.post(new Runnable() {
            @Override
            public void run() {
                a.finishCall();
            }
        });
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;

        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        Intent in = getIntent();
        String name = nz(in.getStringExtra(EXTRA_NAME));
        String body = nz(in.getStringExtra(EXTRA_BODY));
        tag = nz(in.getStringExtra(EXTRA_TAG));
        callerId = nz(in.getStringExtra(EXTRA_CALLER));
        callId = nz(in.getStringExtra(EXTRA_CALL_ID));
        final String photoUrl = nz(in.getStringExtra(EXTRA_PHOTO));
        if (name.isEmpty()) name = "Talkies";
        if (name.endsWith("is calling…")) name = name.substring(0, name.length() - "is calling…".length()).trim();

        setContentView(buildUi(name, body));
        hideSystemBars();
        loadPhoto(photoUrl);

        // stop showing the screen once the call itself would have timed out (counted from when it
        // started ringing, so re-opening it from the notification doesn't extend the call)
        long startedAt = in.getLongExtra(EXTRA_STARTED, 0L);
        long left = startedAt > 0 ? 45_000 - (System.currentTimeMillis() - startedAt) : 45_000;
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                finishCall();
            }
        }, Math.max(1_000L, left));
    }

    private View buildUi(String name, String body) {
        FrameLayout root = new FrameLayout(this);
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.parseColor("#0B141A"), Color.parseColor("#1F2C34")}));

        // big wallpaper photo
        photoView = new ImageView(this);
        photoView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        root.addView(photoView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // initial circle shown until / unless a photo is available
        initialView = new TextView(this);
        initialView.setText(initialOf(name));
        initialView.setTextColor(Color.WHITE);
        initialView.setTypeface(Typeface.DEFAULT_BOLD);
        initialView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 64);
        initialView.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(Color.parseColor("#00A884"));
        initialView.setBackground(circle);
        FrameLayout.LayoutParams ip = new FrameLayout.LayoutParams(dp(140), dp(140), Gravity.CENTER_HORIZONTAL | Gravity.TOP);
        ip.topMargin = dp(150);
        root.addView(initialView, ip);

        // dark gradient so the text stays readable on any photo
        View shade = new View(this);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.parseColor("#99000000"), Color.parseColor("#14000000"), Color.parseColor("#E6000000")}));
        root.addView(shade, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // top: name + call type
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setGravity(Gravity.CENTER_HORIZONTAL);
        top.setPadding(dp(24), dp(72), dp(24), 0);
        TextView app = text("Talkies", 14, "#CCFFFFFF", false);
        TextView nameV = text(name, 34, "#FFFFFF", true);
        nameV.setMaxLines(2);
        nameV.setPadding(0, dp(8), 0, dp(6));
        TextView sub = text(body.isEmpty() ? "Incoming call" : body, 17, "#E6FFFFFF", false);
        top.addView(app);
        top.addView(nameV);
        top.addView(sub);
        root.addView(top, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        // bottom: Decline / Answer
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        row.setPadding(dp(24), 0, dp(24), dp(72));
        row.addView(actionButton("Decline", "#E5383B", R.drawable.ic_call_decline, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                decline();
            }
        }), weighted());
        row.addView(actionButton("Answer", "#25D366", R.drawable.ic_call_answer, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                answer();
            }
        }), weighted());
        root.addView(row, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));
        return root;
    }

    private View actionButton(String label, String color, int icon, View.OnClickListener click) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        ImageView btn = new ImageView(this);
        btn.setImageResource(icon);
        btn.setScaleType(ImageView.ScaleType.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.parseColor(color));
        btn.setBackground(bg);
        btn.setOnClickListener(click);
        btn.setContentDescription(label);
        col.addView(btn, new LinearLayout.LayoutParams(dp(76), dp(76)));
        TextView t = text(label, 14, "#FFFFFF", false);
        t.setPadding(0, dp(10), 0, 0);
        col.addView(t);
        return col;
    }

    private LinearLayout.LayoutParams weighted() {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    }

    private TextView text(String s, int sp, String color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(Color.parseColor(color));
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setShadowLayer(8f, 0f, 2f, Color.parseColor("#66000000"));
        return t;
    }

    private void loadPhoto(final String photoUrl) {
        if (photoUrl.isEmpty() && callerId.isEmpty()) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final Bitmap bmp = NotificationHelper.loadPhoto(IncomingCallActivity.this, photoUrl, callerId, 1080);
                if (bmp == null) return;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (done || isFinishing()) return;
                        photoView.setImageBitmap(bmp);
                        initialView.setVisibility(View.GONE);
                    }
                });
            }
        }).start();
    }

    private void answer() {
        if (done) return;
        // The app opens on top of the lock screen and picks the call up by itself.
        Intent i = NotificationHelper.mainIntent(this, "answer", callerId, "direct", callerId, true);
        NotificationHelper.cancel(this, tag);
        startActivity(i);
        finishCall();
    }

    private void decline() {
        if (done) return;
        Intent d = new Intent(this, CallActionReceiver.class);
        d.setAction(NotificationHelper.ACTION_DECLINE);
        d.putExtra("callerId", callerId);
        d.putExtra("notifId", NotificationHelper.idFor(tag));
        d.putExtra("callId", callId);
        sendBroadcast(d);
        NotificationHelper.cancel(this, tag);
        finishCall();
    }

    private void finishCall() {
        if (done) return;
        done = true;
        main.removeCallbacksAndMessages(null);
        if (current == this) current = null;
        finish();
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // back must not silently drop the ringing call screen; it behaves like a quick dismiss only
        // of the screen — the notification keeps ringing until answered / declined / timed out.
        finishCall();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private static String initialOf(String name) {
        String n = name == null ? "" : name.trim();
        return n.isEmpty() ? "T" : n.substring(0, n.offsetByCodePoints(0, 1)).toUpperCase();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
