/**
 * Arena shared — ortak menü / mod çevirileri.
 * Her oyun kendi i18n pack'ine bunları merge eder: Object.assign(pack, ArenaModeI18n.tr)
 */
(function (root) {
  "use strict";

  const tr = {
    homePlay: "Oyna",
    homeSettings: "Ayarlar",
    homeHelp: "Yardım",
    homeUpdates: "Güncellemeler",
    hubBack: "DNCR Games",
    hubBackTitle: "Hub’a dön?",
    hubBackConfirm: "DNCR Games ana sayfasına dönmek istediğine emin misin?",
    hubBackYes: "Evet, dön",
    hubBackNo: "Vazgeç",
    back: "Geri",
    playTitle: "Oyun modu",
    playSolo: "Bilgisayara karşı",
    playSoloHint: "Tek kişi — internet gerekmez",
    play2p: "Aynı cihazda iki kişi",
    play2pHint: "Telefon/tablet elden ele — ağ gerekmez",
    playP2p: "İki telefonda / uzaktan",
    playP2pHint: "Oda kodu — sunucu gerekmez (P2P)",
    helpModesTitle: "Oyun modları",
    helpModes:
      "Bilgisayara karşı ve aynı cihazda iki kişi tamamen çevrimdışıdır. Uzaktan mod eş bulmak için kısa internet ister; oyun sunucusu yoktur (P2P).",
    helpP2pTitle: "Uzaktan (sunucusuz)",
    helpP2p1: "Oyna → İki telefonda / uzaktan → Oda kur.",
    helpP2p2: "Kodu veya davet linkini gönder.",
    helpP2p3: "Rakip katılır → ikiniz de Hazırım.",
    helpP2p4: "Kendi sunucunuz gerekmez.",
    helpSafariTitle: "iPhone Safari",
    helpSafari1: "Aşağıdaki GitHub Pages linkini Safari’de aç.",
    helpSafari2: "Paylaş → Ana Ekrana Ekle.",
    helpSafari3: "İlk açıktan sonra solo ve aynı-cihaz çevrimdışı çalışır.",
    offlineYes: "Evet — solo ve aynı cihazda internet gerekmez.",
    offlineP2pNote: "Uzaktan P2P için yalnızca eşleşme anında internet gerekir.",
  };

  const en = {
    homePlay: "Play",
    homeSettings: "Settings",
    homeHelp: "Help",
    homeUpdates: "Updates",
    hubBack: "DNCR Games",
    hubBackTitle: "Back to hub?",
    hubBackConfirm: "Return to the DNCR Games home page?",
    hubBackYes: "Yes, go back",
    hubBackNo: "Cancel",
    back: "Back",
    playTitle: "Game mode",
    playSolo: "Vs computer",
    playSoloHint: "Solo — no internet needed",
    play2p: "Two players, same device",
    play2pHint: "Pass the phone/tablet — no network needed",
    playP2p: "Two phones / remote",
    playP2pHint: "Room code — no game server (P2P)",
    helpModesTitle: "Game modes",
    helpModes:
      "Vs computer and same-device two-player work fully offline. Remote mode needs brief internet to find each other; there is no game server (P2P).",
    helpP2pTitle: "Remote (serverless)",
    helpP2p1: "Play → Two phones / remote → Create room.",
    helpP2p2: "Send the code or invite link.",
    helpP2p3: "Opponent joins → both tap Ready.",
    helpP2p4: "No server of yours is required.",
    helpSafariTitle: "iPhone Safari",
    helpSafari1: "Open the GitHub Pages link in Safari.",
    helpSafari2: "Share → Add to Home Screen.",
    helpSafari3: "After first open, solo and same-device work offline.",
    offlineYes: "Yes — solo and same-device need no internet.",
    offlineP2pNote: "Remote P2P only needs internet for matchmaking.",
  };

  root.ArenaModeI18n = { tr, en };
})(typeof self !== "undefined" ? self : this);
