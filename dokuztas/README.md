# Dokuztaş

Klasik **Nine Men's Morris** (dokuz taş) oyunu.

- **Bilgisayara karşı** — Kolay / Zor / Çok Zor (çevrimdışı)
- **Aynı cihazda iki kişi** — telefon veya tablet, ağ gerekmez
- **İki telefonda / uzaktan** — oda kodu ile sunucusuz P2P (ülkeler arası)
- **TR / EN**, ayarlar, yardım, sürüm geçmişi
- **Android APK** (Capacitor)

Ahşap tahta görünümü, fotoğraftaki klasik 3 kare + orta bağlantılı dokuztaş düzeni.

## Çalıştır

```bash
npm install
npm start
```

Tarayıcı: `http://localhost:3867`

Ana menü: **Oyna · Ayarlar · Yardım · Güncellemeler**

## Modlar

| Mod | Ağ |
|-----|-----|
| Bilgisayara karşı | Gerekmez |
| Aynı cihazda iki kişi | Gerekmez |
| İki telefonda / uzaktan (P2P) | Eş bulmak için kısa internet; oyun sunucusu yok |

P2P ayrıntısı: [ONLINE.md](./ONLINE.md)

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
