window.FanoronaConfig = {
  appName: "Fanorona",
  version: "1.0.8",
  build: 9,
  shareBaseUrl: "https://alid67-git.github.io/DNCR-Games/fanorona/",
  changelog: [
    {
      version: "1.0.8",
      build: 9,
      date: "2026-11-01",
      items: {
        tr: [
          "Zincir sırasında yanlış “Rakip oynuyor” ve kilitlenme düzeltildi",
          "Devam edilecek taş parlıyor; hedef noktalar işaretleniyor",
        ],
        en: [
          "Fixed false “Opponent playing” lock during chains",
          "Chain piece glows; legal targets are marked",
        ],
      },
    },
    {
      version: "1.0.7",
      build: 8,
      date: "2026-10-30",
      items: {
        tr: [
          "Tahta dikey zıplamıyor; durum yazısı tahtanın üstünde",
          "Sıradaki oyuncunun isim kutusu güçlü vurgulu (“Sırada”)",
        ],
        en: [
          "Board no longer jumps vertically; status sits above the board",
          "Active player name chip strongly highlighted (“On turn”)",
        ],
      },
    },
    {
      version: "1.0.6",
      build: 7,
      date: "2026-10-30",
      items: {
        tr: [
          "Sıra geçişi daha yavaş ve okunaklı: banner + kart ~2,5 sn tutuluyor",
          "Rakip / bilgisayar sırasında kilitli bekle kartı net kalıyor",
        ],
        en: [
          "Turn change slower to read: banner + card held ~2.5s",
          "Opponent / CPU wait card stays clear while locked",
        ],
      },
    },
    {
      version: "1.0.5",
      build: 6,
      date: "2026-10-30",
      items: {
        tr: [
          "Alınan taş kaybolup geri gelmiyor — uçuş orb’u taşın yerinde park ediyor",
          "Sıra sende değilken büyük “bekle” kartı + tahta kilidi",
          "Geri / ileri (undo · redo); yeniden başlat yok",
        ],
        en: [
          "Captured piece no longer blinks back — fly-off orb parks in place",
          "Clear wait card + board lock when it isn’t your turn",
          "Undo · redo; no restart",
        ],
      },
    },
    {
      version: "1.0.4",
      build: 5,
      date: "2026-10-30",
      items: {
        tr: [
          "Soğuk palet: mavi / gri / beyaz / yeşil (kahverengi kalktı)",
          "Alınan taş uçuştan sonra yerine geri gelmiyor",
          "Sıra sende değilken tahta üzerinde net “bekle” katmanı",
          "Yeniden başlat yerine geri / ileri (undo · redo)",
        ],
        en: [
          "Cool palette: blue / gray / white / green (no brown)",
          "Captured pieces no longer snap back after the fly-off",
          "Clear on-board wait overlay when it isn’t your turn",
          "Restart replaced with undo · redo",
        ],
      },
    },
    {
      version: "1.0.2",
      build: 3,
      date: "2026-10-30",
      items: {
        tr: [
          "Sıra değişince üstte uyarı + skor kutusu parlaması",
          "Taşlar hedefe kayarak gidiyor; alınan taşlar uçuyor",
          "Yardımda sıra geçişi vurgulandı; varsayılan zorluk Normal",
        ],
        en: [
          "Turn-change banner + score-chip pulse",
          "Pieces slide to target; captures fly off",
          "Help stresses when the turn passes; default difficulty Normal",
        ],
      },
    },
    {
      version: "1.0.1",
      build: 2,
      date: "2026-10-29",
      items: {
        tr: [
          "Dikey ekranda tahta 90° çevrilip büyütüldü (uzun kenar yüksekliği kullanır)",
          "Yatay (landscape) düzen: tahta daha büyük, skorlar yana",
        ],
        en: [
          "Portrait: board rotates 90° to use screen height",
          "Landscape layout: larger board, scores on the side",
        ],
      },
    },
    {
      version: "1.0.0",
      build: 1,
      date: "2026-10-29",
      items: {
        tr: [
          "İlk sürüm: klasik Fanorona (5×9 Madagaskar stratejisi)",
          "Yaklaşma / uzaklaşma ile alma + zorunlu zincir",
          "Hamle vurgusu: 1 sn parlama + alma uçuş animasyonu + SFX",
          "Puan: alma ve zincir bonusları (DNCR skor)",
          "Bilgisayara karşı · Aynı cihaz · Sunucusuz P2P",
          "Türkçe / English, yardım, skorlar, DNCR hub çıkışı",
        ],
        en: [
          "Initial release: classic Fanorona (5×9 Madagascar strategy)",
          "Approach / withdrawal captures + mandatory chains",
          "Move highlight: 1s flash + capture eject FX + SFX",
          "Scoring: capture and chain bonuses (DNCR score)",
          "Vs computer · Same device · Serverless P2P",
          "Turkish / English, help, scores, DNCR hub exit",
        ],
      },
    },
  ],
};
