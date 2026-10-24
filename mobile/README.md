# Talkies Android app

A thin Android shell (Capacitor) around the deployed web app. It looks and
feels like a normal app (own icon, splash screen, no browser bar) and adds one
thing browsers can't do on phones: **native screen sharing** in 1:1 and group
calls (Android MediaProjection → `ScreenShare` plugin → video track).

The web UI is loaded live from the deployed site (`server.url` in
`capacitor.config.json`), so web updates reach the app without a new APK.

## Build the APK (GitHub Actions)

1. One-time: copy `mobile/ci/android-apk.yml` to `.github/workflows/android-apk.yml`
   (GitHub → Add file → Create new file, paste, commit).
2. It runs on every push that touches `mobile/`, or manually from the Actions tab.
3. Download link (always the latest build):
   https://github.com/sujaytumu/Chat-App/releases/download/android-latest/talkies.apk

## Build locally

```
cd mobile && npm install && npx cap sync android
cd android && ./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
```

## Notes

  installed PWA (Chrome → Install app) for background notifications, or add
  Firebase Cloud Messaging to this app.
- Screen sharing streams ~8 fps JPEG frames to the page; portrait works best.

## Calls & notifications when the app is closed (Firebase)

Web Push doesn't work inside an Android WebView, so the app uses Firebase
Cloud Messaging: the server sends a high-priority push, and the app itself
rings (system ringtone, full-screen call screen over the lock screen with
Answer / Decline) or shows the message notification.

One-time setup (free):
1. https://console.firebase.google.com → create a project → **Add app → Android**
   with package name `com.sujaytumu.talkies` → download `google-services.json`.
2. Put that file at `mobile/android/app/google-services.json` and commit it
   (or add its contents as a GitHub secret named `GOOGLE_SERVICES_JSON`).
3. Firebase → Project settings → **Service accounts → Generate new private key**.
   On Render, add an environment variable `FCM_SERVICE_ACCOUNT` with the JSON
   file's contents (or its base64).
4. Rebuild the APK, install it, open it once and log in (allow notifications).

On Android 14+ also allow **full-screen notifications** for Talkies when asked
(App settings → Notifications), so calls can take over a locked screen.

The app loads the live website, so web features (live location, video messages) need no new APK; reinstall from the link above only to refresh the shell.
