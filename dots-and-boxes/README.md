# Noktalar ve Kutular

Klasik **Dots and Boxes** oyunu.

- **Tek kişilik** — yapay zekaya karşı (Kolay / Orta / Zor / Çok Zor)
- **İki kişilik** — aynı cihazda sırayla
- **10 oyun alanı** — 6 klasik 8–10 noktalı ızgara + yıldız, kedi, balık, tavşan şekilleri
- **TR / EN**, ayarlar, yardım, sürüm geçmişi
- **Android APK** (Capacitor) + **iPhone Safari** (web)

## Çalıştır

```bash
npm install
npm start
```

Tarayıcı: `http://localhost:3857`

iPhone Safari: aynı Wi‑Fi’de bilgisayarın LAN adresini aç (sunucu başlarken yazdırılır).

Ana menü: **Oyna · Ayarlar · Yardım · Güncellemeler**

## Zorluk → tahta

| Zorluk | Önerilen tahtalar |
|--------|-------------------|
| Kolay | 8×8, 8×9, Yıldız |
| Orta | 9×9, 8×10, Kedi, Yıldız |
| Zor | 9×10, Balık, Tavşan |
| Çok Zor | 10×10, Tavşan, Balık |

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
