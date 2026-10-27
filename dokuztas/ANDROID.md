# Dokuztaş — Android

APK kurulunca **bilgisayara karşı** ve **aynı cihazda iki kişi** internet olmadan oynanır.  
**İki telefonda / uzaktan** için eş bulma anında internet gerekir (oyun sunucusu yok).

## APK üretmek

1. [Android Studio](https://developer.android.com/studio) kur.
2. Bu klasörde:
   ```bash
   npm install
   npx cap add android
   npx cap sync android
   npx cap open android
   ```
3. Android Studio → **Build → Build Bundle(s) / APK(s) → Build APK(s)**

veya SDK varsa:

```bash
npm run android:sync
npm run android:apk
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Web güncellemesi sonrası

```bash
npx cap sync android
```
