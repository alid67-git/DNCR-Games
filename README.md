# DNCR Games

Dört oyun · ortak menü · iPhone kısayol · Android APK.

## Hub (çıkış noktası)

| | |
|--|--|
| **Web / iPhone** | https://alid67-git.github.io/DNCR-Games/ |
| **Kati** | …/kati/ |
| **Noktalar ve Kutular** | …/noktalar/ |
| **Dokuztaş** | …/dokuztas/ |
| **Kuşatma** | …/kusatma/ |

**iPhone kısayol:** Safari’de hub’ı aç → **Paylaş → Ana Ekrana Ekle** (DNCR ikonu).

**Tek platform:** Hepsi **DNCR Games hub** altında. Ayrı mağaza / ayrı launcher gerekmez.

| Cihaz | Nasıl |
|-------|--------|
| **iPhone / iPad** | Safari → hub → Paylaş → Ana Ekrana Ekle |
| **Android** | Hub APK (aşağıda) veya Chrome → hub → Ana ekrana ekle |
| **Web** | https://alid67-git.github.io/DNCR-Games/ |

**Android APK (hub):** `hub/` tek paket — dört oyunu da içerir.

- **İndir:** https://github.com/alid67-git/DNCR-Games/releases/download/hub-v1.0.0/DNCR-Games-hub-1.0.0.apk
- Release: https://github.com/alid67-git/DNCR-Games/releases/tag/hub-v1.0.0

```bash
cd hub && npm install && npm run android:sync && npm run android:apk
# → hub/android/app/build/outputs/apk/debug/app-debug.apk
```

Ayrı oyun APK’leri isteğe bağlıdır; günlük kullanım için **sadece hub yeter**.

Detaylı kurallar **her oyunun Yardım** ekranındadır. Oyunlardan **DNCR Games** düğmesiyle hub’a dönülür.

## Ortak oynanış

1. Bilgisayara karşı — internet yok  
2. Aynı cihazda iki kişi — ağ yok  
3. İki telefonda / uzaktan — oda kodu, sunucusuz P2P  

## Ortak kabuk

```bash
npm run sync-shared
npm run build:pages
```

Sözleşme: [shared/SHELL.md](./shared/SHELL.md)
