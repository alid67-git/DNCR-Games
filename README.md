# DNCR Games

Üç oyun · aynı menü kabuğu · iPhone Safari · Android APK.

| | iPhone / web |
|--|--|
| **Hub — DNCR Games** | https://alid67-git.github.io/DNCR-Games/ |
| **Kati** | https://alid67-git.github.io/DNCR-Games/kati/ |
| **Noktalar ve Kutular** | https://alid67-git.github.io/DNCR-Games/noktalar/ |
| **Dokuztaş** | https://alid67-git.github.io/DNCR-Games/dokuztas/ |

Safari → **Paylaş → Ana Ekrana Ekle**.

## Ortak oynanış (her oyunda)

1. **Bilgisayara karşı** — internet gerekmez  
2. **Aynı cihazda iki kişi** — ağ gerekmez  
3. **İki telefonda / uzaktan** — oda kodu, oyun sunucusu yok (P2P)

Menü: **Oyna · Ayarlar · Yardım · Güncellemeler** · TR/EN

## Android APK

```bash
# Kati
npm run android:sync && npm run android:apk

# Noktalar
cd dots-and-boxes && npm run android:sync && npm run android:apk

# Dokuztaş
cd dokuztas && npx cap add android   # ilk kez
npm run android:sync && npm run android:apk
```

APK çıktıları: `*/android/app/build/outputs/apk/debug/app-debug.apk`

## Ortak kabuk

```bash
npm run sync-shared
npm run build:pages
```

Sözleşme: [shared/SHELL.md](./shared/SHELL.md)

## Yerel

```bash
npm start                      # Kati :3847
cd dots-and-boxes && npm start # :3857
cd dokuztas && npm start       # :3867
```
