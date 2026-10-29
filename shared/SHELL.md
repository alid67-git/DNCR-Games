# Ortak oyun kabuğu (Arena Shell)

Bu repodaki **her oyun** aynı yapısal sözleşmeyi izler. Yapısal değişiklikler önce burada yapılır, sonra `npm run sync-shared` ile oyunlara kopyalanır.

## Zorunlu menü

Ana ekran sırası (değiştirme):

1. **Oyna**
2. **Skorlar**
3. **Ayarlar** (dil + güncelleme buraya)
4. **Yardım**
5. **DNCR Games** (hub çıkışı)

Sürüm numarası ana menü altında ve ayarların dibinde görünür.

## Zorunlu oyun modları (Oyna ekranı)

| id | TR | Ağ |
|----|----|-----|
| `solo` | Bilgisayara karşı | Gerekmez |
| `local2p` | Aynı cihazda iki kişi | Gerekmez |
| `remote` | İki telefonda / uzaktan (P2P) | İnternet P2P: eş bulmak için kısa net. **Android hub:** Bluetooth / yakında (~5 m) internetsiz. **Oyun sunucusu yok** |

## Zorunlu ayarlar

- Dil: Türkçe / English
- Varsayılan bilgisayar zorluğu (oyuna göre seçenekler)
- (APK) Güncelleme kontrolü — `shared/update-check.js`

## Zorunlu yardım bölümleri

1. Kurallar (oyuna özel)
2. Oyun modları (ortak metin + offline/P2P notu)
3. Zorluk
4. Uzaktan (sunucusuz) adımlar
5. iPhone Safari → Ana Ekrana Ekle

## Ortak dosyalar (`shared/js/` → her oyunun `public/shared/`)

| Dosya | Görev |
|-------|--------|
| `p2p-session.js` | PeerJS oda kur / katıl (+ transport UI) |
| `nearby-session.js` | Android Nearby (Bluetooth / Wi‑Fi Direct) oda |
| `update-check.js` | GitHub Releases sürüm kontrolü |
| `register-sw.js` | Service worker kaydı |
| `mode-i18n.js` | Ortak mod / menü çeviri anahtarları |
| `hub-back.js` | DNCR Games hub’a onaylı dönüş |
| `score.js` | Yerel kariyer puanı / skor tablosu |
| `move-sfx.js` | Ortak hamle vurgusu SFX (Web Audio) |
| `shell-ui.css` | Menü ikonları, mod görselleri, skor UI |

## iPhone / web linkleri (GitHub Pages)

- Hub (çıkış noktası): https://alid67-git.github.io/DNCR-Games/
- Kati: …/kati/
- Noktalar: …/noktalar/
- Dokuztaş: …/dokuztas/
- Kuşatma: …/kusatma/
- Sayı Bulma: …/sayi/
- Fanorona: …/fanorona/

Hub sade kalır (ikon + ikişer grid oyun listesi). Kurallar / internet / Safari / P2P her oyunun **Yardım** sayfasındadır.
Ana menüdeki **DNCR Games** düğmesi onay sonrası hub’a döner.

## Sync

```bash
npm run sync-shared   # shared/js → public/shared, dots…, dokuztas…, kusatma…, sayibulma…, fanorona…
npm run build:pages   # _site hub + 6 oyun
```

**Tek dağıtım yüzeyi:** GitHub Pages hub + hub Capacitor APK. Oyunlar ayrı platformlara bölünmez; hepsi aynı kabukta (solo / local2p / P2P).

Yeni yapısal özellik: **önce `shared/`**, sonra sync, sonra gerekirse oyuna özel kanca.

## Vurgu & puan (ortak kurgu)

- **Hamle SFX:** `shared/js/move-sfx.js` — `select` / `place` / `move` / `capture` / `mill` / `box`
- **Görsel vurgu:** oyuna özel; tipik olarak 0.5–1 sn parlama, alınan taş uçuşu, zincir/değirmen bandı
- **Skor:** `shared/js/score.js` — win/draw/loss tabanı × zorluk × mod; bonuslar `captures`, `chains`, `mills`, `boxes`, `guesses` vb.
