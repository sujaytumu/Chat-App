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
- Web Push notifications don't work inside an Android WebView; use the
  installed PWA (Chrome → Install app) for background notifications, or add
  Firebase Cloud Messaging to this app.
- Screen sharing streams ~8 fps JPEG frames to the page; portrait works best.
