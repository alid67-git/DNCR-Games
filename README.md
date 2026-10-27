# DNCR Games

Üç oyun · ortak menü · iPhone kısayol · Android APK.

## Hub (çıkış noktası)

| | |
|--|--|
| **Web / iPhone** | https://alid67-git.github.io/DNCR-Games/ |
| **Kati** | …/kati/ |
| **Noktalar ve Kutular** | …/noktalar/ |
| **Dokuztaş** | …/dokuztas/ |

**iPhone kısayol:** Safari’de hub’ı aç → **Paylaş → Ana Ekrana Ekle** (DNCR ikonu).

**Android APK (hub):** `hub/` içinden derlenir — üç oyunu da içerir.

```bash
cd hub && npm install && npm run android:sync && npm run android:apk
# → hub/android/app/build/outputs/apk/debug/app-debug.apk
```

Ayrı oyun APK’leri (isteğe bağlı):

```bash
npm run android:sync && npm run android:apk                    # Kati
cd dots-and-boxes && npm run android:sync && npm run android:apk
cd dokuztas && npm run android:sync && npm run android:apk
```

Detaylı kurallar ve ipuçları **her oyunun Yardım** ekranındadır. Hub sade tutulur; oyunlardan **DNCR Games** düğmesiyle hub’a dönülür.

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
