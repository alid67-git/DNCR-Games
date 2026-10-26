# Noktalar ve Kutular — Android

APK kurulunca **internet gerekmeden** tek kişilik ve iki kişilik oynarsın.

## APK üretmek (Android Studio)

1. [Android Studio](https://developer.android.com/studio) kur.
2. Bu klasörde:
   ```bash
   npm install
   npx cap sync android
   npx cap open android
   ```
3. Android Studio → **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. `app-debug.apk` dosyasını telefona kopyala / USB ile kur.

Telefonda **Bilinmeyen kaynaklardan kurulum**a izin ver.

## Komut satırı (SDK kuruluysa)

```bash
npm run android:sync
npm run android:apk
```

APK yolu: `android/app/build/outputs/apk/debug/app-debug.apk`

## Web güncellemesi sonrası

`public/` değişince:

```bash
npx cap sync android
```
