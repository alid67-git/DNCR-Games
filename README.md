# Kati Arena

Kırmızı takım vs Yeşil takım. Klasik Kati tahtası.

- **Bilgisayara karşı** (çevrimdışı)
- **Çevrimiçi** — ülkeler arası, **sunucu kurmaya gerek yok** (davet linki)
- **TR / EN**, ayarlar, yardım, sürüm takibi
- **Android** (Capacitor)

## iPhone / Safari (canlı)

**https://alid67-git.github.io/KatiArena/**

Solo ve çevrimiçi (davet linkiyle) tarayıcıda çalışır. Ana Ekrana Ekle ile uygulama gibi açabilirsin.

## Çalıştır (yerel)

```bash
npm install
npm start
```

Tarayıcı: `http://localhost:3847`

Ana menü: **Oyna · Ayarlar · Yardım · Güncellemeler**

## Ülkeler arası

Bkz. [ONLINE.md](./ONLINE.md)

## Android

```bash
npm run android:sync
npm run android:apk
```

Uygulama açılışta otomatik güncelleme kontrolü yapar ve onayınla yeni APK’yı indirip kurulumu açar. Detay ve sürüm yayınlama adımları: [ANDROID.md](./ANDROID.md)

## Test

```bash
npm test
```

Bu repo, CudyTurkiye içindeki `sebze-oyunu/` klasöründen ayrılmıştır.
