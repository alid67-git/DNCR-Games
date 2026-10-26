# Kati Arena

Kırmızı takım vs Yeşil takım. Klasik Kati tahtası.

- **Bilgisayara karşı** (çevrimdışı)
- **Çevrimiçi** — telefon ↔ başka ülkedeki PC (aynı public sunucu)
- **TR / EN**, ayarlar, yardım, sürüm takibi
- **Android** (Capacitor)

## Çalıştır

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

Detay: [ANDROID.md](./ANDROID.md)

## Test

```bash
npm test
```

Bu repo, CudyTurkiye içindeki `sebze-oyunu/` klasöründen ayrılmıştır.

## İkinci oyun: Noktalar ve Kutular

Klasik Dots and Boxes — tek/iki kişilik, 4 zorluk, 10 tahta, Android + Safari:

```bash
cd dots-and-boxes
npm install
npm start
```

Ayrıntı: [dots-and-boxes/README.md](./dots-and-boxes/README.md)
