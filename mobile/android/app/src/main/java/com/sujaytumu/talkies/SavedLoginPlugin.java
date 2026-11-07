package com.sujaytumu.talkies;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * "Save password?" storage for the app. The email and password are encrypted with a key that
 * lives in the phone's Android Keystore (EncryptedSharedPreferences), so they never sit in the
 * web page's storage. If the store can't be opened (e.g. after a restore onto another phone,
 * where the key doesn't exist) it is wiped and the person is simply asked to sign in again.
 */
@CapacitorPlugin(name = "SavedLogin")
public class SavedLoginPlugin extends Plugin {
    private static final String FILE = "talkies_saved_login";

    private SharedPreferences prefs() throws Exception {
        Context c = getContext();
        try {
            return open(c);
        } catch (Exception first) {
            // unreadable store: start clean rather than crash
            c.deleteSharedPreferences(FILE);
            return open(c);
        }
    }

    private static SharedPreferences open(Context c) throws Exception {
        MasterKey key = new MasterKey.Builder(c).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
        return EncryptedSharedPreferences.create(
                c,
                FILE,
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String email = call.getString("email");
        String password = call.getString("password");
        if (email == null || email.isEmpty() || password == null || password.isEmpty()) {
            call.reject("email and password are required");
            return;
        }
        try {
            prefs().edit().putString("email", email).putString("password", password).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("could not save");
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject out = new JSObject();
        try {
            SharedPreferences p = prefs();
            String email = p.getString("email", null);
            String password = p.getString("password", null);
            if (email != null && password != null) {
                out.put("email", email);
                out.put("password", password);
            }
        } catch (Exception ignored) {
            // nothing saved / unreadable: behave as "no saved login"
        }
        call.resolve(out);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            prefs().edit().clear().apply();
        } catch (Exception ignored) {
            // nothing to clear
        }
        call.resolve();
    }
}
