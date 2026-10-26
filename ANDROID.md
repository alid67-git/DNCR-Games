# Kati Arena — Android

APK’yı telefona kurunca **bilgisayara karşı** çevrimdışı oynarsın.

**Ülkeler arası / çevrimiçi:** Ayarlar’da herkese açık sunucu URL’sini yaz (bkz. [ONLINE.md](./ONLINE.md)). Aynı Wi‑Fi şart değil.

LAN (eski yol): aynı Wi‑Fi’de PC’de `npm start`, uygulamada sunucu alanına `http://192.168.x.x:3847`.

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
