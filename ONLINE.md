# Kati Arena — ülkeler arası (online)

**Sunucu kurmana gerek yok.** Oyun cihazlar arasında doğrudan bağlanır (WebRTC).  
iPhone Safari, Android APK ve bilgisayar tarayıcısı aynı şekilde oynar.

Canlı link: **https://alid67-git.github.io/KatiArena/**

## Nasıl oynanır

1. Bir kişi **Oyna → Çevrimiçi oyna → Oda kur**
2. **Davet linkini kopyala** → WhatsApp / e-posta / SMS
3. Diğer kişi linki açar (veya oda kodunu yazar) → **Katıl**
4. İkisi de **Hazırım** der → oyun başlar

Aynı Wi‑Fi şart değil. Aynı ülkede olmanız da şart değil.

## Gelişmiş (isteğe bağlı)

Kendi Node/socket.io sunucunu kullanmak istersen Ayarlar → **Gelişmiş: kendi sunucun** alanına URL yaz.  
Boş bırakıldığında varsayılan sunucusuz (P2P) yol kullanılır.

Eski yol (kendi sunucu):

```bash
npm install
PORT=3847 npm start
```

HTTPS için VPS / Render / Railway / Fly.io veya yerel test için `ngrok http 3847`.
