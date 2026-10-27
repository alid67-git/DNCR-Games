window.KatiConfig = {
  appName: "Kati",
  version: "1.5.2",
  build: 20,
  /** tomato = red, gourd = green (engine keys) */
  teams: { tomato: "red", gourd: "green" },
  /** Public web URL used in invite links (works from APK too). */
  shareBaseUrl: "https://alid67-git.github.io/DNCR-Games/kati/",
  changelog: [
    {
      version: "1.5.2",
      build: 20,
      date: "2026-10-27",
      items: {
        tr: ["İnsan ve bilgisayar hamle sesleri ayrı (yüksek / alçak ton)"],
        en: ["Distinct human vs computer move SFX (high / low tone)"],
      },
    },
    {
      version: "1.5.1",
      build: 19,
      date: "2026-10-27",
      items: {
        tr: [
          "Hamle vurgusu: 0.5 sn parlama + renk değişimi + ses",
          "Taş hareketi daha belirgin (glow + büyüme)",
        ],
        en: [
          "Move highlight: 0.5s flash + color shift + SFX",
          "Piece motion more visible (glow + scale)",
        ],
      },
    },
    {
      version: "1.5.0",
      build: 18,
      date: "2026-10-26",
      items: {
        tr: [
          "Ülkeler arası oyun: sunucu kurmaya gerek yok (doğrudan cihazlar arası)",
          "Oda kur → davet linkini gönder → rakip katılır",
          "iPhone Safari ve Android aynı şekilde oynar",
        ],
        en: [
          "Cross-country play with no server setup (direct device-to-device)",
          "Create a room → send the invite link → opponent joins",
          "Works the same on iPhone Safari and Android",
        ],
      },
    },
    {
      version: "1.4.0",
      build: 17,
      date: "2026-10-26",
      items: {
        tr: [
          "Uygulama açılışında otomatik güncelleme kontrolü",
          "Güncellemeler ekranında elle 'Güncellemeyi kontrol et' butonu",
          "Yeni sürüm bulununca onay penceresi — onaylarsan APK indirip kurulumu açar",
        ],
        en: [
          "Automatic update check on app startup",
          "Manual 'Check for updates' button on the Updates screen",
          "Confirmation dialog when a new version is found — approving downloads the APK and opens the installer",
        ],
      },
    },
    {
      version: "1.3.2",
      build: 16,
      date: "2026-10-26",
      items: {
        tr: [
          "Yeni Kati Arena logosu (ana menü + Android ikon)",
        ],
        en: [
          "New Kati Arena logo (home screen + Android icon)",
        ],
      },
    },
    {
      version: "1.3.1",
      build: 15,
      date: "2026-10-26",
      items: {
        tr: [
          "Bilgisayar zorluğu: Kolay / Normal / Zor (Ayarlar)",
          "Aynı partiyi ezberleyen AI düzeltildi — yakın hamle çeşitliliği",
        ],
        en: [
          "Computer difficulty: Easy / Normal / Hard (Settings)",
          "Fixed scripted AI — variety among near-best moves",
        ],
      },
    },
    {
      version: "1.3.0",
      build: 14,
      date: "2026-10-26",
      items: {
        tr: [
          "Ana menü: Oyna, Ayarlar, Yardım, Güncellemeler",
          "Kırmızı / Yeşil takım isimleri",
          "Türkçe / English dil seçeneği",
          "Çevrimiçi (ülkeler arası) oda + davet linki",
          "Bildirimler (sıra / rakip katıldı)",
          "Sürüm takip ekranı",
        ],
        en: [
          "Home menu: Play, Settings, Help, Updates",
          "Red / Green team names",
          "Turkish / English language",
          "Online (cross-country) rooms + invite link",
          "Notifications (turn / opponent joined)",
          "Version tracking screen",
        ],
      },
    },
    {
      version: "1.2.1",
      build: 13,
      date: "2026-10-25",
      items: {
        tr: ["Animasyon çift kayma düzeltmesi", "Sıra dönüşü", "Yeme animasyonu"],
        en: ["Animation overshoot fix", "Alternating starter", "Capture animation"],
      },
    },
    {
      version: "1.1.0",
      build: 1,
      date: "2026-10-25",
      items: {
        tr: ["Bilgisayara karşı (çevrimdışı)", "LAN çok oyunculu", "Android APK"],
        en: ["Vs computer (offline)", "LAN multiplayer", "Android APK"],
      },
    },
  ],
};
