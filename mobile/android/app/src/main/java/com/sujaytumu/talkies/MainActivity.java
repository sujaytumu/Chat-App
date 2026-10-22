package com.sujaytumu.talkies;

import android.content.Intent;
import android.graphics.Bitmap;
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
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    /** True while the app is on screen (pushes then leave the ringing / beeping to the page). */
    static volatile boolean visible = false;
    /** True while a call is connected: the page must keep running when the app is in the background. */
    static volatile boolean callActive = false;

    /**
     * Older site builds call plugin.addListener(...).then(...), but on this Capacitor version
     * the call returns a plain handle, which crashed the page right after login. Make it
     * always return a promise so any version of the site works.
     */
    private static final String ADD_LISTENER_PATCH =
            "(function(){if(window.__tkAddListenerPatch)return;window.__tkAddListenerPatch=1;var names=['TalkiesCall','TalkiesPush','ScreenShare'];var n=0;function patch(){try{var P=window.Capacitor&&window.Capacitor.Plugins;if(!P)return;names.forEach(function(k){var p=P[k];if(!p||typeof p.addListener!=='function'||p.__tkp)return;var orig=p.addListener;try{Object.defineProperty(p,'__tkp',{value:1,enumerable:false,configurable:true});}catch(e){return;}try{p.addListener=function(){var r=orig.apply(this,arguments);if(r&&typeof r.then==='function')return r;return Promise.resolve(r||{remove:function(){}});};}catch(e){}});}catch(e){}}patch();var t=setInterval(function(){patch();if(++n>1000)clearInterval(t);},10);})();";

    private final Handler retryHandler = new Handler(Looper.getMainLooper());
    private boolean retryPending = false;

    /**
     * The app loads the live website. If that can't be reached (server waking up,
     * no signal, 5xx), the WebView would otherwise stay on a blank white page.
     * Show a visible "connecting" screen instead and keep retrying until it loads.
     */
    /**
     * Clean splash shown while the site can't be reached. The page retries by itself every
     * few seconds (no flicker from reloading) and opens the app as soon as the site answers.
     */
    private static final String CONNECTING_HTML =
            "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>html,body{margin:0;height:100%}body{display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FFFFFF;color:#54656F;font-family:sans-serif}.l{width:84px;height:84px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center}.t{margin-top:20px;font-size:26px;font-weight:600;color:#111B21;letter-spacing:.3px}.s{margin-top:30px;width:26px;height:26px;border:3px solid #D1D7DB;border-top-color:#25D366;border-radius:50%;animation:r .9s linear infinite}.m{margin-top:14px;font-size:14px}@keyframes r{to{transform:rotate(360deg)}}@media (prefers-color-scheme:dark){body{background:#0B141A;color:#8696A0}.t{color:#E9EDEF}.s{border-color:#2A3942;border-top-color:#25D366}}</style></head><body><div class='l'><svg width='44' height='44' viewBox='0 0 24 24' fill='#FFFFFF'><path d='M12 3C6.5 3 2 6.9 2 11.7c0 2.6 1.3 4.9 3.4 6.5L4.5 21l3.7-1.8c1.2.4 2.4.5 3.8.5 5.5 0 10-3.9 10-8.7S17.5 3 12 3z'/></svg></div><div class='t'>Talkies</div><div class='s'></div><div class='m'>Connecting&hellip;</div><script>(function(){function go(){fetch('/',{cache:'no-store'}).then(function(r){if(r&&r.ok)location.replace('/');}).catch(function(){});}setInterval(go,3000);})();</script></body></html>";

    private void showConnectingAndRetry(final WebView view, final String url) {
        if (view == null || url == null) return;
        view.loadDataWithBaseURL(url, CONNECTING_HTML, "text/html", "utf-8", url);
        if (retryPending) return;
        retryPending = true;
        // Backup only: the splash page above already retries on its own.
        retryHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                retryPending = false;
                if (!isFinishing() && !isDestroyed()) view.loadUrl(url);
            }
        }, 20000);
    }

    /** No big grey play-circle while a video is still buffering: use a clear 1x1 poster instead. */
    private void installClearVideoPoster() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
    }

    private void installLoadFailureHandler() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                view.evaluateJavascript(ADD_LISTENER_PATCH, null);
            }

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
        NotificationHelper.stopAllRinging(this);
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
            // A call answered from the lock screen has had no tap inside the page: the other
            // person's voice must still play by itself (no "tap to enable audio").
            web.getSettings().setMediaPlaybackRequiresUserGesture(false);
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
        installClearVideoPoster();
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
