# Kati Arena — ülkeler arası (online)

Telefon (TR) ile başka ülkedeki bilgisayar aynı **herkese açık sunucuya** bağlanır.

## 1) Sunucuyu yayınla

Bir VPS / Render / Railway / Fly.io üzerinde:

```bash
npm install
PORT=3847 npm start
```

HTTPS URL alın (örn. `https://kati-arena.onrender.com`).

Yerel test için [ngrok](https://ngrok.com): `ngrok http 3847`

## 2) İki oyuncu

1. **Ayarlar** → Çevrimiçi sunucu adresine URL’yi yaz → Kaydet  
2. **Oyna → Çevrimiçi oyna → Oda kur**  
3. **Davet linkini kopyala** → WhatsApp / e-posta  
4. Diğer kişi linki açar (veya kodu yazar) → **Katıl** → ikisi de **Hazırım**

Aynı Wi‑Fi gerekmez. Önemli olan ikisinin de **aynı sunucu URL’sine** bağlanmasıdır.

## 3) Android

Uygulamada Ayarlar’daki sunucu alanı zorunlu (localhost yok).
