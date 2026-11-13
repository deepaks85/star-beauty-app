# Publishing Star Beauty Make-Up Studio to Google Play Store

This application is now configured as an installable **Progressive Web App (PWA)** with full manifest metadata, compliant 192x192 / 512x512 / maskable PNG icons, a Workbox service worker, and Android **Digital Asset Links** (`public/.well-known/assetlinks.json`) + **Bubblewrap TWA** configuration (`twa-manifest.json`).

You can generate a Google Play Store `.aab` (Android App Bundle) using **Trusted Web Activity (TWA)** (recommended by Google for web/React apps) or **Capacitor**.

---

## Option A: Trusted Web Activity (TWA) via Bubblewrap (Recommended)

A Trusted Web Activity wraps your live HTTPS deployment into a signed Android `.aab` package for Google Play Store while keeping instant updates whenever you update the web app.

### 1. Prerequisites
- A Google Play Developer account (`$25` one-time registration at [play.google.com/console](https://play.google.com/console)).
- Node.js 18+, Java JDK 17, and Android SDK command-line tools (Bubblewrap can auto-download JDK/Android SDK on first run).
- Your deployed HTTPS app URL (for example, your AI Studio Shared App URL or custom domain).

### 2. Initialize & Build the Signed Android App Bundle (`.aab`)
Run these commands locally in your project root:

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://ais-pre-vzs2oruqomdwc7pzip3xbc-865254209443.asia-northeast1.run.app/manifest.webmanifest
bubblewrap build
```

> `twa-manifest.json` is already pre-configured with package ID `in.starbeautystudio.app`, theme color `#8E3B46`, and maskable icons.

`bubblewrap build` generates:
- `app-release-bundle.aab` (upload this directly to Google Play Console!)
- `android.keystore` (keep this file safe and backed up—you need it for every future app update)

### 3. Verify Digital Asset Links (Removes Chrome URL Bar)
1. Upload `app-release-bundle.aab` to an **Internal Testing** track in Google Play Console.
2. In Play Console, go to **Setup → App Integrity → App signing** and copy the **SHA-256 certificate fingerprint**.
3. Paste that SHA-256 fingerprint into `public/.well-known/assetlinks.json`:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "in.starbeautystudio.app",
         "sha256_cert_fingerprints": ["AA:BB:CC:..."]
       }
     }
   ]
   ```
4. Re-build & deploy your web app so `https://<your-domain>/.well-known/assetlinks.json` serves the updated fingerprint.

### 4. Submit on Google Play Console
- Create Store Listing for **Star Beauty Make-Up Studio** (app icon `public/pwa-512x512.png`, feature graphic 1024x500, phone/tablet screenshots).
- Complete **App Content** declarations (Privacy Policy URL, Data Safety for phone number, name, email, and payment transaction references).
- Roll out from Internal Testing → Production.

---

## Option B: Bundled Native Android Project via Capacitor

If you prefer compiling a standalone Android Studio project with bundled local web assets instead of a TWA:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Star Beauty Make-Up Studio" "in.starbeautystudio.app" --web-dir=dist
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Then in Android Studio, select **Build → Generate Signed Bundle / APK → Android App Bundle** to export `.aab` for Google Play Console.
