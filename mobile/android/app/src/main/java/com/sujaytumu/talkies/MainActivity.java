package com.sujaytumu.talkies;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugins must be registered before super.onCreate
        registerPlugin(ScreenSharePlugin.class);
        super.onCreate(savedInstanceState);

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
