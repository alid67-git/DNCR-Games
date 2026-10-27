/**
 * Kuşatma — adım adım tutorial (Türkçe altyazı + İleri/Geri)
 * window.SiegeTutorial
 */
(function (root) {
  "use strict";

  const STEPS = [
    {
      id: "welcome",
      title: "Tutorial I · PC anlatsın",
      caption:
        "Kuralları slayt slayt anlatıyorum. Tahta, taş, çizgi, skor ve sigorta — her adımda İleri’ye bas.",
      visual: "welcome",
    },
    {
      id: "board",
      title: "Oyun tahtası",
      caption:
        "6×6 nokta (taşların durduğu yer) ve aralarında 5×5 kare var. Hedef: kareleri kapatıp puan toplamak.",
      visual: "board",
    },
    {
      id: "deploy",
      title: "1. Aşama: Konuşlandırma",
      caption:
        "Sırayla 5’er taş koyarsın. Boş bir noktaya dokun → Onayla. Toplam 10 taş dolmadan savaş başlamaz.",
      visual: "deploy",
    },
    {
      id: "symbols",
      title: "Renk + şekil",
      caption:
        "Oyuncu 1 mavi daire ○, Oyuncu 2 kırmızı üçgen △. Sadece renge güvenme — şekiller renk körlüğü için de var.",
      visual: "symbols",
    },
    {
      id: "battle",
      title: "2. Aşama: Savaş",
      caption:
        "Turunda yalnız bir şey yaparsın: ya bir çizgi çizersin ya da bir taşını hareket ettirirsin. İkisi birden olmaz.",
      visual: "battle",
    },
    {
      id: "move",
      title: "Taş nasıl yürür?",
      caption:
        "Sadece yatay veya dikey komşu boş noktaya. Çizilmiş bir çizginin üzerinden atlayamazsın. Çapraz yasak.",
      visual: "move",
    },
    {
      id: "clean",
      title: "Temiz kare = +10",
      caption:
        "Bir karenin 4 kenarı da çizilince kare senin olur. İçinde rakip taş yoksa +10 puan ve +1 Kalkan kazanırsın.",
      visual: "clean",
    },
    {
      id: "siege",
      title: "Esir alma = +50",
      caption:
        "Kapattığın karenin köşesinde rakip taş varsa taş silinir ve +50 puan alırsın. Buna Esir Alma (Siege Hit) denir.",
      visual: "siege",
    },
    {
      id: "extra",
      title: "Ekstra hamle + kombo",
      caption:
        "Kare kapatınca sıra sende kalır. Zincirde 2. kare ×1.5, 3. ve sonrası ×2 (aşağı yuvarlanır). Yeni kare yoksa sıra rakibe geçer.",
      visual: "combo",
    },
    {
      id: "insurance",
      title: "Sigorta protokolü",
      caption:
        "2 taşın kalınca kritik kenarlar altın sarısıyla kilitlenir. Rakip bunları normal çizemez — erken yok oluş engellenir.",
      visual: "insurance",
    },
    {
      id: "shield",
      title: "Kalkan ile kırma",
      caption:
        "Temiz karelerden Kalkan birikir. 2 Kalkan harcayarak altın kenara tıklayıp korumayı kırar ve çizgiyi aynı hamlede çekersin.",
      visual: "shield",
    },
    {
      id: "win",
      title: "Nasıl kazanılır?",
      caption:
        "Rakibin tüm taşları biterse anında galip. 25 kare dolunca: Skor + (kalan taş × 10). Hamle kalmazsa aynı formül. Teslim Ol da var.",
      visual: "win",
    },
    {
      id: "modes",
      title: "Nasıl oynarsın?",
      caption:
        "Bilgisayara karşı (çevrimdışı), aynı cihazda iki kişi, veya iki telefonda oda koduyla (P2P). Hepsi DNCR Games hub’dan.",
      visual: "modes",
    },
    {
      id: "done",
      title: "Hazırsın!",
      caption:
        "İleri bitti. Ana menüden Oyna’ya bas ve ilk konuşlandırmanı yap. Bol şans — çizgi çek, kuşat, esir al!",
      visual: "done",
    },
  ];

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function visualSvg(kind) {
    const ns = "http://www.w3.org/2000/svg";
    // Return HTML string for mini board demos
    const commonGrid = `
      <g stroke="#4A4E69" stroke-width="1.2" fill="none" opacity="0.85">
        <path d="M20 24h72M20 48h72M20 72h72M32 12v72M56 12v72M80 12v72"/>
      </g>`;
    switch (kind) {
      case "welcome":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          ${commonGrid}
          <circle cx="32" cy="24" r="6" fill="#00B4D8"/>
          <path d="M80 18l7 12h-14z" fill="#E63946"/>
          <rect x="44" y="36" width="24" height="24" fill="#00B4D8" opacity=".28" stroke="#FFB703" stroke-width="2"/>
          <text x="56" y="52" text-anchor="middle" fill="#00B4D8" font-size="10">○</text>
        </svg>`;
      case "board":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          ${commonGrid}
          <g fill="#4A4E69">${[0,1,2,3].flatMap((r)=>[0,1,2,3].map((c)=>`<circle cx="${32+c*24}" cy="${24+r*24}" r="2.2"/>`)).join("")}</g>
          <text x="56" y="90" text-anchor="middle" fill="#9A8C98" font-size="7">6×6 nokta · 5×5 kare</text>
        </svg>`;
      case "deploy":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          ${commonGrid}
          <circle cx="32" cy="24" r="6" fill="#00B4D8"/><circle cx="56" cy="48" r="6" fill="#00B4D8" opacity=".55" stroke="#FFB703" stroke-width="1.5"/>
          <path d="M80 66l7 12h-14z" fill="#E63946"/>
          <text x="56" y="90" text-anchor="middle" fill="#9A8C98" font-size="7">Dokun → Onayla</text>
        </svg>`;
      case "symbols":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          <circle cx="36" cy="44" r="14" fill="#00B4D8"/>
          <text x="36" y="49" text-anchor="middle" fill="#041018" font-size="14" font-weight="700">○</text>
          <path d="M76 30l16 28H60z" fill="#E63946"/>
          <text x="76" y="52" text-anchor="middle" fill="#041018" font-size="12" font-weight="700">△</text>
        </svg>`;
      case "battle":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          ${commonGrid}
          <line x1="32" y1="24" x2="56" y2="24" stroke="#00B4D8" stroke-width="3" stroke-linecap="round"/>
          <circle cx="32" cy="48" r="6" fill="#00B4D8"/>
          <path d="M56 42 L68 48 L56 54" fill="none" stroke="#FFB703" stroke-width="2"/>
          <text x="28" y="90" fill="#9A8C98" font-size="6.5">Çizgi</text>
          <text x="62" y="90" fill="#9A8C98" font-size="6.5">veya taş</text>
        </svg>`;
      case "move":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          ${commonGrid}
          <line x1="32" y1="48" x2="56" y2="48" stroke="#c4b7c5" stroke-width="2.5"/>
          <circle cx="32" cy="48" r="6" fill="#00B4D8"/>
          <circle cx="56" cy="24" r="5" fill="none" stroke="#00B4D8" stroke-width="1.5" stroke-dasharray="2 1.5"/>
          <text x="56" y="90" text-anchor="middle" fill="#9A8C98" font-size="7">Çizili kenar = engel</text>
        </svg>`;
      case "clean":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          <rect x="32" y="24" width="48" height="48" fill="#00B4D8" opacity=".3"/>
          <rect x="32" y="24" width="48" height="48" fill="none" stroke="#00B4D8" stroke-width="3"/>
          <text x="56" y="52" text-anchor="middle" fill="#00B4D8" font-size="14" font-weight="700">+10</text>
          <text x="56" y="90" text-anchor="middle" fill="#9A8C98" font-size="7">+1 Kalkan</text>
        </svg>`;
      case "siege":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          <rect x="32" y="24" width="48" height="48" fill="#E63946" opacity=".28"/>
          <rect x="32" y="24" width="48" height="48" fill="none" stroke="#00B4D8" stroke-width="3"/>
          <path d="M40 30l6 10h-12z" fill="#E63946" opacity=".35"/>
          <text x="56" y="52" text-anchor="middle" fill="#FFB703" font-size="14" font-weight="700">+50</text>
          <text x="56" y="90" text-anchor="middle" fill="#9A8C98" font-size="7">Rakip taş silinir</text>
        </svg>`;
      case "combo":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          <text x="56" y="28" text-anchor="middle" fill="#00B4D8" font-size="9" font-weight="700">1. kare ×1.0</text>
          <text x="56" y="48" text-anchor="middle" fill="#FFB703" font-size="9" font-weight="700">2. kare ×1.5</text>
          <text x="56" y="68" text-anchor="middle" fill="#E63946" font-size="9" font-weight="700">3.+ kare ×2.0</text>
          <text x="56" y="88" text-anchor="middle" fill="#9A8C98" font-size="7">Math.floor</text>
        </svg>`;
      case "insurance":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          ${commonGrid}
          <circle cx="56" cy="48" r="6" fill="#00B4D8"/>
          <line x1="32" y1="48" x2="56" y2="48" stroke="#FFB703" stroke-width="3" stroke-dasharray="4 2"/>
          <line x1="56" y1="24" x2="56" y2="48" stroke="#FFB703" stroke-width="3" stroke-dasharray="4 2"/>
          <text x="56" y="90" text-anchor="middle" fill="#FFB703" font-size="7">Altın = sigortalı</text>
        </svg>`;
      case "shield":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          <text x="56" y="36" text-anchor="middle" fill="#FFB703" font-size="16" font-weight="700">2</text>
          <text x="56" y="52" text-anchor="middle" fill="#e8e6ef" font-size="8">Kalkan harca</text>
          <text x="56" y="70" text-anchor="middle" fill="#9A8C98" font-size="7">altın kenarı çiz</text>
        </svg>`;
      case "win":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          <text x="56" y="30" text-anchor="middle" fill="#e8e6ef" font-size="8">0 tas - aninda yenilgi</text>
          <text x="56" y="50" text-anchor="middle" fill="#00B4D8" font-size="8">25 kare - hibrit skor</text>
          <text x="56" y="70" text-anchor="middle" fill="#9A8C98" font-size="7">skor + tas x10</text>
        </svg>`;
      case "modes":
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          <text x="56" y="28" text-anchor="middle" fill="#00B4D8" font-size="8">Bilgisayar</text>
          <text x="56" y="48" text-anchor="middle" fill="#FFB703" font-size="8">Ayni cihaz</text>
          <text x="56" y="68" text-anchor="middle" fill="#E63946" font-size="8">Iki telefon P2P</text>
        </svg>`;
      case "done":
      default:
        return `<svg viewBox="0 0 112 96" class="tut-svg" aria-hidden="true">
          <rect width="112" height="96" rx="14" fill="#16161c"/>
          <circle cx="56" cy="40" r="18" fill="none" stroke="#00B4D8" stroke-width="3"/>
          <path d="M46 40l7 7 14-14" fill="none" stroke="#00B4D8" stroke-width="3" stroke-linecap="round"/>
          <text x="56" y="78" text-anchor="middle" fill="#e8e6ef" font-size="9" font-weight="700">Oynamaya hazır</text>
        </svg>`;
    }
  }

  function createController(opts) {
    const rootEl = opts.root;
    const onClose = opts.onClose || (() => {});
    let index = 0;

    function render() {
      const step = STEPS[index];
      const isFirst = index === 0;
      const isLast = index === STEPS.length - 1;
      rootEl.innerHTML = `
        <div class="tut-sheet" role="dialog" aria-modal="true" aria-labelledby="tut-title">
          <div class="tut-progress" aria-hidden="true">
            ${STEPS.map((_, i) => `<span class="tut-dot${i === index ? " is-on" : ""}${i < index ? " is-done" : ""}"></span>`).join("")}
          </div>
          <p class="tut-stepnum">Adım ${index + 1} / ${STEPS.length}</p>
          <div class="tut-visual">${visualSvg(step.visual)}</div>
          <h2 id="tut-title" class="tut-title">${esc(step.title)}</h2>
          <div class="tut-caption" aria-live="polite">
            <span class="tut-caption-label">Altyazı</span>
            <p class="tut-caption-text">${esc(step.caption)}</p>
          </div>
          <div class="tut-nav">
            <button type="button" class="btn btn-ghost" id="tut-back" ${isFirst ? "disabled" : ""}>Geri</button>
            <button type="button" class="btn btn-ghost" id="tut-skip">Atla</button>
            <button type="button" class="btn btn-primary" id="tut-next">${isLast ? "Bitir" : "İleri"}</button>
          </div>
        </div>`;

      rootEl.querySelector("#tut-back").addEventListener("click", () => {
        if (index > 0) {
          index -= 1;
          render();
        }
      });
      rootEl.querySelector("#tut-skip").addEventListener("click", () => onClose());
      rootEl.querySelector("#tut-next").addEventListener("click", () => {
        if (isLast) onClose();
        else {
          index += 1;
          render();
        }
      });
    }

    return {
      open(startAt) {
        index = Math.max(0, Math.min(STEPS.length - 1, startAt || 0));
        rootEl.classList.remove("hidden");
        render();
      },
      close() {
        rootEl.classList.add("hidden");
        rootEl.innerHTML = "";
      },
      steps: STEPS,
      get index() {
        return index;
      },
    };
  }

  root.SiegeTutorial = { STEPS, createController, visualSvg };
})(typeof window !== "undefined" ? window : globalThis);
