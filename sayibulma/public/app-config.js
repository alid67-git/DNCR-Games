window.SayibulmaConfig = {
  appName: "Sayı Bulma",
  version: "1.0.11",
  build: 12,
  shareBaseUrl: "https://alid67-git.github.io/DNCR-Games/sayi/",
  changelog: [
    {
      version: "1.0.11",
      build: 12,
      date: "2026-10-28",
      items: {
        tr: [
          "Sonuç penceresi parmakla sürüklenebilir — altındaki tahta görünür",
          "Aynı cihazda iki kişi modu kapatıldı — gizli sayı tek ekranda saklanamaz",
        ],
        en: [
          "Result window is draggable so you can see the board underneath",
          "Same-device two-player removed — a secret cannot stay hidden on one screen",
        ],
      },
    },
    {
      version: "1.0.10",
      build: 11,
      date: "2026-10-28",
      items: {
        tr: [
          "Kutulara istediğin sırada rakam yazılabilir (kutuya dokun)",
          "Karışık düğmesi ile rastgele sayı kutulara yüklenir",
        ],
        en: [
          "Fill digit boxes in any order (tap a box)",
          "Shuffle button loads a random number into the boxes",
        ],
      },
    },
    {
      version: "1.0.9",
      build: 10,
      date: "2026-10-28",
      items: {
        tr: [
          "0–9 not: 1. dokunuş × (yok), 2. dokunuş sarı halka (var)",
          "Zorluk seçenekleri kaldırıldı — bilgisayar düşük performansta",
          "Geçmiş panelleri yan yana 2 kutu; bitişte pad gizlenir, geçmiş büyür",
        ],
        en: [
          "0–9 notes: 1st tap × (absent), 2nd tap yellow ring (present)",
          "Difficulty options removed — computer plays at low performance",
          "History as two side-by-side panels; pad hides at game over",
        ],
      },
    },
    {
      version: "1.0.8",
      build: 9,
      date: "2026-10-28",
      items: {
        tr: [
          "Sil yalnızca son basamağı siler",
          "Oyun ekranı küçültüldü; geçmiş yan yana ve daha fazla tahmin görünür",
        ],
        en: [
          "Delete removes only the last digit",
          "Game screen compacted; side-by-side history shows more guesses",
        ],
      },
    },
    {
      version: "1.0.7",
      build: 8,
      date: "2026-10-28",
      items: {
        tr: [
          "Android dar ekranda tahmin geçmişleri yan yana kalır (artık alt alta düşmez)",
          "Geçmiş, tahmin padinin üstünde; pad ve skorlar daha kompakt",
        ],
        en: [
          "Guess histories stay side-by-side on narrow Android screens",
          "History sits above the pad; pad and scores are more compact",
        ],
      },
    },
    {
      version: "1.0.6",
      build: 7,
      date: "2026-10-28",
      items: {
        tr: [
          "Oyun sonu paneli kapatılıp tahta / geçmiş incelenebilir; Sonuç ile yeniden açılır",
          "Başlıkta Yeniden solda, Geri sağ üstte",
          "Solo zorluk: Kolay · Normal · Zor · Çok Zor",
          "Üstte 0–9 not çubuğu — elemek için rakama çizgi",
          "Zorluk yalnızca bilgisayara karşı; iki kişi / P2P’de yok",
        ],
        en: [
          "End panel can be dismissed to inspect the board/history; reopen via Result",
          "Header: Restart on the left, Back on the top-right",
          "Solo difficulty: Easy · Normal · Hard · Very Hard",
          "Top 0–9 scratch bar — cross out eliminated digits",
          "Difficulty is solo-only; no difficulty in local 2P / P2P",
        ],
      },
    },
    {
      version: "1.0.5",
      build: 6,
      date: "2026-10-28",
      items: {
        tr: [
          "Tahmin listeleri ekran dolunca yukarı/aşağı kaydırılabilir",
        ],
        en: [
          "Guess history scrolls when the screen fills up",
        ],
      },
    },
    {
      version: "1.0.4",
      build: 5,
      date: "2026-10-28",
      items: {
        tr: [
          "Bilgisayar turu takılma (timer yarışı) düzeltildi",
          "Düşünürken pad gizlenir, bekleyiş paneli gösterilir",
          "Oyun içinde Geri / Yeniden için onay",
        ],
        en: [
          "Fixed AI turn stall (timer race)",
          "While thinking: hide pad, show wait panel",
          "Confirm before Back / Restart during a match",
        ],
      },
    },
    {
      version: "1.0.3",
      build: 4,
      date: "2026-10-28",
      items: {
        tr: [
          "Bilgisayar düşünürken rakam girişi ve Tahmin et kilitli",
          "AI turu takılırsa güvenli yeniden deneme",
        ],
        en: [
          "Digit pad and Try locked while the computer thinks",
          "Safer AI retry if a turn stalls",
        ],
      },
    },
    {
      version: "1.0.2",
      build: 3,
      date: "2026-10-28",
      items: {
        tr: [
          "İlk hane 0 olamaz (klasik Bulls and Cows)",
          "Tekerlek benzeri rakam yuvaları + büyük «Tahmin et»",
          "Deneme sayacı ve belirgin +/− geri bildirim bandı",
        ],
        en: [
          "No leading zero (classic Bulls and Cows)",
          "Wheel-like digit slots + large Try button",
          "Attempts counter and strong +/− feedback banner",
        ],
      },
    },
    {
      version: "1.0.1",
      build: 2,
      date: "2026-10-28",
      items: {
        tr: [
          "Klasik 4 haneli artı/eksi kurallarına geçiş",
          "Tahmin geçmişinde +/− skor etiketleri daha belirgin",
        ],
        en: [
          "Switched to classic 4-digit plus/minus (bulls & cows) rules",
          "Clearer +/− score chips on guess history",
        ],
      },
    },
    {
      version: "1.0.0",
      build: 1,
      date: "2026-10-28",
      items: {
        tr: [
          "İlk sürüm: artı/eksi düello",
          "Bilgisayara karşı: Kolay / Zor / Çok Zor",
          "Aynı cihazda iki kişi (gizli sayı elden ele)",
          "İki telefonda — sunucusuz P2P (oda kodu)",
          "Türkçe / English, ayarlar, yardım, skorlar",
        ],
        en: [
          "Initial release: plus/minus duel",
          "Vs computer: Easy / Hard / Very Hard",
          "Two players on the same device (pass-the-phone secrets)",
          "Two phones — serverless P2P (room code)",
          "Turkish / English, settings, help, scores",
        ],
      },
    },
  ],
};
