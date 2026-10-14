package com.sujaytumu.talkies;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    /** True while the app is on screen (pushes then leave the ringing / beeping to the page). */
    static volatile boolean visible = false;
    /** True while a call is connected: the page must keep running when the app is in the background. */
    static volatile boolean callActive = false;

    private final Handler retryHandler = new Handler(Looper.getMainLooper());
    private boolean retryPending = false;

    /**
     * The app loads the live website. If that can't be reached (server waking up,
     * no signal, 5xx), the WebView would otherwise stay on a blank white page.
     * Show a visible "connecting" screen instead and keep retrying until it loads.
     */
    private void showConnectingAndRetry(final WebView view, final String url) {
        if (view == null || url == null) return;
        String html = "<!doctype html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;"
                + "justify-content:center;background:#FFFFFF;color:#54656F;font-family:sans-serif;text-align:center'>"
                + "<div style='font-size:22px;font-weight:600;color:#111B21'>Talkies</div>"
                + "<div style='margin-top:10px;font-size:15px'>Connecting&hellip;<br>this can take up to a minute "
                + "if the server was asleep. Retrying automatically.</div></body></html>";
        view.loadDataWithBaseURL(url, html, "text/html", "utf-8", url);
        if (retryPending) return;
        retryPending = true;
        retryHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                retryPending = false;
                if (!isFinishing() && !isDestroyed()) view.loadUrl(url);
            }
        }, 4000);
    }

    private void installLoadFailureHandler() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    showConnecting(view, request.getUrl().toString());
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                // The page's process was killed (low memory etc.): reload it instead of leaving a blank screen.
                retryHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (!isFinishing() && !isDestroyed()) recreate();
                    }
                });
                return true;
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (request != null && request.isForMainFrame() && response != null && response.getStatusCode() >= 500) {
                    showConnecting(view, request.getUrl().toString());
                }
            }

            private void showConnecting(WebView view, String url) {
                showConnectingAndRetry(view, url);
            }
        });
    }

    private void keepPageAliveForCall() {
        if (!callActive || getBridge() == null) return;
        WebView w = getBridge().getWebView();
        if (w != null) {
            w.onResume();
            w.resumeTimers();
        }
    }

    private void showOverLockScreenIfCall(Intent intent) {
        if (intent != null && intent.getBooleanExtra("tk_isCall", false)) {
            // The app takes over from the notification: stop its ringtone / vibration.
            String caller = intent.getStringExtra("tk_callerId");
            if (caller != null && !caller.isEmpty()) NotificationHelper.cancel(this, "incoming-call-" + caller);
            // Incoming-call full-screen intent: show over the lock screen and wake the display
            if (Build.VERSION.SDK_INT >= 27) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        showOverLockScreenIfCall(intent);
        TalkiesPushPlugin.handleIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        visible = true;
    }

    @Override
    public void onPause() {
        visible = false;
        super.onPause();
        keepPageAliveForCall();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepPageAliveForCall();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugins must be registered before super.onCreate
        registerPlugin(ScreenSharePlugin.class);
        registerPlugin(AppChromePlugin.class);
        registerPlugin(TalkiesPushPlugin.class);
        registerPlugin(CallKeepAlivePlugin.class);
        showOverLockScreenIfCall(getIntent());
        super.onCreate(savedInstanceState);
        TalkiesPushPlugin.handleIntent(getIntent());

        // Make the page render exactly as it does in Chrome: ignore the system
        // font-size scaling, no forced dark mode, no overscroll glow/scrollbars.
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) {
            web.getSettings().setTextZoom(100);
            if (Build.VERSION.SDK_INT >= 29 && Build.VERSION.SDK_INT < 33) {
                web.getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
            }
            // Keep the page's renderer at foreground priority so call audio isn't cut
            // when the app goes to the background.
            if (Build.VERSION.SDK_INT >= 26) {
                web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }
            web.setOverScrollMode(View.OVER_SCROLL_NEVER);
            web.setVerticalScrollBarEnabled(false);
            web.setHorizontalScrollBarEnabled(false);
        }
        installLoadFailureHandler();
        AppChromePlugin.applySaved(this);

        // Back button = go back inside the web app (close the open chat, search,
        // image viewer, settings page...), exactly like the browser. Only when
        // there is nothing left to go back to does the app move to the
        // background (like WhatsApp), instead of closing from inside a chat.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null && web.canGoBack()) {
                    web.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }
}
