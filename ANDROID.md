# Toprak Kati — Android

Evet: APK’yı telefona kurunca **internetsiz / sunucusuz** bilgisayara karşı oynarsın.

İki kişi için hâlâ aynı Wi‑Fi’de bir PC’de `npm start` gerekir; uygulamada **PC sunucu adresi** alanına `http://192.168.x.x:3847` yazılır.

## APK üretmek (Android Studio — önerilen)

1. [Android Studio](https://developer.android.com/studio) kur.
2. Bu klasörde:
   ```bash
   cd sebze-oyunu
   npm install
   npx cap sync android
   npx cap open android
   ```
3. Android Studio → **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. Çıkan `app-debug.apk` dosyasını telefona kopyala / USB ile kur.

Telefonda **Bilinmeyen kaynaklardan kurulum**a izin ver.

## Komut satırı (SDK kuruluysa)

```bash
cd sebze-oyunu
npm run android:sync
npm run android:apk
```

APK yolu: `android/app/build/outputs/apk/debug/app-debug.apk`

## Web güncellemesi sonrası

`public/` değişince:

```bash
npx cap sync android
```
