/**
 * Tutorial II · PC oynadı — karşılıklı 2 taraf demo senaryosu
 * window.SiegeDemoMatch
 */
(function (root) {
  "use strict";

  /**
   * Her adım: başlık + altyazı + isteğe bağlı motor aksiyonu.
   * action: engine applyAction formatında (player ayrı alanda)
   */
  const STEPS = [
    {
      title: "Tutorial II · PC oynadı",
      caption:
        "Bilgisayar iki tarafı da oynayarak kısa bir maç gösterecek. Mavi ○ Oyuncu 1, kırmızı △ Oyuncu 2. İleri ile devam et.",
      action: null,
    },
    {
      title: "Konuşlandırma başlar",
      caption:
        "Önce taşlar yerleştirilir. Sıra maviye: sol üst köşeye ilk taşını koyuyor.",
      action: { player: 1, type: "PLACE_SELECT", r: 0, c: 0 },
      follow: { player: 1, type: "PLACE_CONFIRM" },
    },
    {
      title: "Kırmızı yanıtlar",
      caption: "Şimdi kırmızı, karşı köşeye (sağ alt) taşını koyuyor. İki taraf da tahtaya yerleşiyor.",
      action: { player: 2, type: "PLACE_SELECT", r: 5, c: 5 },
      follow: { player: 2, type: "PLACE_CONFIRM" },
    },
    {
      title: "Mavi ikinci taş",
      caption: "Mavi üst sırada ilerliyor — (0,2) noktası.",
      action: { player: 1, type: "PLACE_SELECT", r: 0, c: 2 },
      follow: { player: 1, type: "PLACE_CONFIRM" },
    },
    {
      title: "Kırmızı ikinci taş",
      caption: "Kırmızı alt sırada simetri kuruyor — (5,3).",
      action: { player: 2, type: "PLACE_SELECT", r: 5, c: 3 },
      follow: { player: 2, type: "PLACE_CONFIRM" },
    },
    {
      title: "Hızlı yerleşim",
      caption: "Kalan taşlar da sırayla konur. Toplam 5+5 olmadan savaş başlamaz.",
      batch: [
        { player: 1, type: "PLACE_SELECT", r: 0, c: 4 },
        { player: 1, type: "PLACE_CONFIRM" },
        { player: 2, type: "PLACE_SELECT", r: 5, c: 1 },
        { player: 2, type: "PLACE_CONFIRM" },
        { player: 1, type: "PLACE_SELECT", r: 2, c: 0 },
        { player: 1, type: "PLACE_CONFIRM" },
        { player: 2, type: "PLACE_SELECT", r: 3, c: 5 },
        { player: 2, type: "PLACE_CONFIRM" },
        { player: 1, type: "PLACE_SELECT", r: 4, c: 1 },
        { player: 1, type: "PLACE_CONFIRM" },
        { player: 2, type: "PLACE_SELECT", r: 1, c: 5 },
        { player: 2, type: "PLACE_CONFIRM" },
      ],
    },
    {
      title: "Savaş aşaması",
      caption:
        "Taşlar tamam. Artık her turda ya çizgi çizilir ya taş yürür. Mavi ilk çizgiyi çekiyor — üst kenar.",
      action: { player: 1, type: "DRAW_LINE", edgeId: "H_0_0" },
    },
    {
      title: "Kırmızı çizgi çeker",
      caption: "Kırmızı başka bir alanda çizgi açıyor. Rakibe serbest kare bırakmamaya dikkat!",
      action: { player: 2, type: "DRAW_LINE", edgeId: "H_5_3" },
    },
    {
      title: "Mavi çerçeveyi kuruyor",
      caption: "Sol üst kare için ikinci kenar. Üç kenar dolunca dördüncüyü çeken kareyi alır.",
      action: { player: 1, type: "DRAW_LINE", edgeId: "V_0_0" },
    },
    {
      title: "Kırmızı uzak oynuyor",
      caption: "Kırmızı hâlâ kendi bölgesinde. Bazen rakibe 3. kenarı vermemek daha önemlidir.",
      action: { player: 2, type: "DRAW_LINE", edgeId: "V_4_5" },
    },
    {
      title: "Mavi üçüncü kenar",
      caption: "Kare neredeyse kapandı. Bir sonraki hamlede mavi +10 puanlık temiz kare alabilir.",
      action: { player: 1, type: "DRAW_LINE", edgeId: "H_1_0" },
    },
    {
      title: "Kırmızı taşını oynatır",
      caption: "Çizgi yerine taş hareketi: kırmızı taşı komşu boş noktaya kaydırıyor (vurgulu animasyon).",
      action: {
        player: 2,
        type: "MOVE_PIECE",
        from: { r: 5, c: 3 },
        to: { r: 5, c: 2 },
      },
    },
    {
      title: "Temiz kare · +10",
      caption:
        "Mavi son kenarı çekiyor. Kare boyanır, +10 puan ve +1 Kalkan. Ekstra hamle hakkı doğar!",
      action: { player: 1, type: "DRAW_LINE", edgeId: "V_0_1" },
      highlightScore: true,
    },
    {
      title: "Ekstra hamle",
      caption:
        "Kare kapanınca sıra mavide kalır. Mavi komşu kenarı da deniyor — kombo zinciri böyle kurulur.",
      action: { player: 1, type: "DRAW_LINE", edgeId: "H_0_1" },
    },
    {
      title: "Kırmızı savunmada",
      caption: "Kırmızı kendi taşının yanına çizgi çekerek alanı sıkılaştırıyor.",
      action: { player: 2, type: "DRAW_LINE", edgeId: "H_5_2" },
    },
    {
      title: "Esire hazırlık",
      caption:
        "Mavi, kırmızının taşının olduğu bölgeye baskı kuruyor. Köşede rakip taş varsa kare kapanınca Esir Alma (+50) olur.",
      action: { player: 1, type: "DRAW_LINE", edgeId: "V_0_2" },
    },
    {
      title: "Kırmızı kaçamıyor",
      caption: "Kısa bir mola — kuralları hatırla: taş yalnızca boş komşuya, çizili kenarın üzerinden atlayamaz.",
      action: { player: 2, type: "DRAW_LINE", edgeId: "V_4_4" },
    },
    {
      title: "Özet",
      caption:
        "Gördün: konuşlandırma → çizgi veya taş → kare kapat (+10 / +50) → ekstra hamle. Şimdi gerçek maça geçebilirsin. Bitir ile menüye dön.",
      action: null,
      finale: true,
    },
  ];

  root.SiegeDemoMatch = {
    STEPS,
    title: "Tutorial II · PC oynadı",
    subtitle: "Karşılıklı iki taraf — bilgisayar gösterir",
  };
})(typeof window !== "undefined" ? window : globalThis);
