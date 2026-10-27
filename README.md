# Kati Arena

Üç oyun · aynı menü kabuğu · iPhone Safari.

| Oyun | iPhone / web linki |
|------|---------------------|
| **Hub** | https://alid67-git.github.io/KatiArena/ |
| **Kati Arena** | https://alid67-git.github.io/KatiArena/kati/ |
| **Noktalar ve Kutular** | https://alid67-git.github.io/KatiArena/noktalar/ |
| **Dokuztaş** | https://alid67-git.github.io/KatiArena/dokuztas/ |

## Ortak oynanış (her oyunda)

1. **Bilgisayara karşı** — internet gerekmez  
2. **Aynı cihazda iki kişi** — ağ gerekmez  
3. **İki telefonda / uzaktan** — oda kodu, **oyun sunucusu yok** (P2P; eşleşme için kısa internet)

Menü her yerde aynı: **Oyna · Ayarlar · Yardım · Güncellemeler** · TR/EN · sürüm geçmişi.

### İnternet olmadan?

**Evet** — solo ve aynı-cihaz tamamen çevrimdışı (ilk indirmeden / Ana Ekrana Ekle sonrası).  
Uzaktan P2P yalnızca eş bulurken internet ister.

## Ortak kabuk (`shared/`)

Yapısal değişiklikler **önce** `shared/` içinde yapılır, sonra tüm oyunlara kopyalanır:

```bash
npm run sync-shared
```

Sözleşme: [shared/SHELL.md](./shared/SHELL.md)

## Yerel çalıştırma

```bash
# Kati
npm install && npm start          # :3847

# Noktalar
cd dots-and-boxes && npm install && npm start   # :3857

# Dokuztaş
cd dokuztas && npm install && npm start         # :3867
```

## GitHub Pages derlemesi

```bash
npm run build:pages   # → _site/ (hub + 3 oyun)
```

Push to `main` tetikler: `.github/workflows/pages.yml`

## Android

Her oyunun kendi `ANDROID.md` dosyasına bakın. Kati release APK örneği:  
https://github.com/alid67-git/KatiArena/releases
