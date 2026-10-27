# DNCR Games — Android (Kati)

APK’yı telefona kurunca **bilgisayara karşı** çevrimdışı oynarsın.

**Ülkeler arası / çevrimiçi:** Ayarlar’da herkese açık sunucu URL’sini yaz (bkz. [ONLINE.md](./ONLINE.md)). Aynı Wi‑Fi şart değil.

LAN (eski yol): aynı Wi‑Fi’de PC’de `npm start`, uygulamada sunucu alanına `http://192.168.x.x:3847`.

## Uygulama içi güncelleme kontrolü

Uygulama **her açılışta** (kısa bir gecikmeyle) GitHub Releases üzerinden yeni bir sürüm olup olmadığını kontrol eder. Yeni sürüm varsa bir onay penceresi çıkar:

- **Şimdi güncelle** → yeni APK’yı indirmek için sistem tarayıcısını açar (indirme bitince dokunup kurman gerekir — Android'de "bilinmeyen kaynaklara izin ver" ilk seferde sorulabilir).
- **Daha sonra** → pencereyi kapatır, bir sonraki açılışta tekrar sorar.

Ayarlar’daki **Güncellemeler** ekranında da elle **“Güncellemeyi kontrol et”** butonu var.

### Yeni sürüm nasıl yayınlanır (bakımcılar için)

1. Sürümü üç yerde birlikte güncelle: `package.json` (`version`), `public/app-config.js` (`version`, `build`, yeni `changelog` girdisi), `android/app/build.gradle` (`versionCode`, `versionName`).
2. Commit’le, sonra sürüme eşit bir tag at ve gönder:
   ```bash
   git tag v1.4.1
   git push origin v1.4.1
   ```
3. `.github/workflows/release-apk.yml` otomatik olarak imzalı bir release APK’sı derler ve GitHub Release’e ekler. Uygulamadaki güncelleme kontrolü bu Release’i bulur.

**Not — imzalama:** Tüm Release APK’leri `android/kati-release.keystore` ile imzalanır (repoya dahil), böylece sürümler arası güncelleme Android’de kurulu uygulamanın üzerine (kaldırmadan) kurulabilir. Bu anahtar bir Play Store / production sırrı **değildir** — sadece sideload edilen bu hobi oyunun sürümler arasında aynı imzayı taşımasını sağlar. Resmi mağaza dağıtımı planlanırsa ayrı, gizli tutulan bir anahtarla yeniden imzalanmalı.

## APK üretmek (Android Studio — önerilen)

1. [Android Studio](https://developer.android.com/studio) kur.
2. Bu klasörde:
   ```bash
   npm install
   npx cap sync android
   npx cap open android
   ```
3. Android Studio → **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. Çıkan `app-debug.apk` (veya release imzalıysan `app-release.apk`) dosyasını telefona kopyala / USB ile kur.

Telefonda **Bilinmeyen kaynaklardan kurulum**a izin ver.

## Komut satırı (SDK kuruluysa)

```bash
npm run android:sync
npm run android:apk        # imzalı release APK (güncelleme akışıyla uyumlu)
npm run android:apk:debug  # hızlı debug build (kendi debug keystore’unla imzalanır)
```

APK yolu: `android/app/build/outputs/apk/release/app-release.apk` (debug için `.../apk/debug/app-debug.apk`).

> `android:apk:debug` ile ürettiğin APK, Release APK’lerden **farklı** bir sertifikayla imzalanır; aralarında uygulama-içi güncelleme çalışmaz (Android “uygulama kurulamadı” der). Günlük geliştirmede debug yeterli; cihaza kalıcı kurup güncelleme akışını denemek için `android:apk` (release) kullan.

## Web güncellemesi sonrası

`public/` değişince:

```bash
npx cap sync android
```
