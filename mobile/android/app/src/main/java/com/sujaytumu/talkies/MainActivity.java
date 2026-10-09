package com.sujaytumu.talkies;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugins must be registered before super.onCreate
        registerPlugin(ScreenSharePlugin.class);
        registerPlugin(AppChromePlugin.class);
        super.onCreate(savedInstanceState);

        // Make the page render exactly as it does in Chrome: ignore the system
        // font-size scaling, no forced dark mode, no overscroll glow/scrollbars.
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web != null) {
            web.getSettings().setTextZoom(100);
            if (Build.VERSION.SDK_INT >= 29 && Build.VERSION.SDK_INT < 33) {
                web.getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
            }
            web.setOverScrollMode(View.OVER_SCROLL_NEVER);
            web.setVerticalScrollBarEnabled(false);
            web.setHorizontalScrollBarEnabled(false);
        }
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
