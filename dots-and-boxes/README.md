# Noktalar ve Kutular

Klasik **Noktalar ve Kutular** (Dots and Boxes) oyunu.

- **Tek kişilik** — yapay zekaya karşı (Kolay / Orta / Zor / Çok Zor)
- **İki kişilik** — aynı cihazda sırayla
- **7 oyun alanı** — klasik 6×6, 6×8, 8×10, 10×10 + Yıldız, Elmas, Artı şekilleri
- **TR / EN**, ayarlar, yardım, sürüm geçmişi
- **Android APK** (Capacitor) + **iPhone Safari** (web)
- **İnternet gerekmez** — tek kişilik ve iki kişilik tamamen çevrimdışı (APK veya yerel sunucu)

## Çalıştır

```bash
npm install
npm start
```

Tarayıcı: `http://localhost:3857`

### iPhone Safari

1. `npm start` sonrası terminaldeki **Safari:** satırındaki adresi kopyala  
   (örn. `http://192.168.1.42:3857`)
2. iPhone’da **Safari** ile aç (aynı Wi‑Fi)
3. İsteğe bağlı: **Paylaş → Ana Ekrana Ekle** (tam ekran)

Ayrıntı: [SAFARI.md](./SAFARI.md)

Ana menü: **Oyna · Ayarlar · Yardım · Güncellemeler**

## Zorluk → tahta

| Zorluk | Önerilen tahtalar |
|--------|-------------------|
| Kolay | 6×6, 6×8, Yıldız |
| Orta | 8×10, Yıldız, Elmas |
| Zor | 8×10, Elmas, Artı |
| Çok Zor | 10×10, Artı, Elmas |

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
