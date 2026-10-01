// Cynote launch video. Every frame is a pure function of the time: render.js
// calls window.seek(t) and takes a screenshot, 30 times per second of video.
// Open index.html?t=17.5 to look at a single moment, or ?play to watch it.
(() => {
  const DURATION = 45;

  // ------------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  function bez(x1, y1, x2, y2) {
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0;
      let hi = 1;
      let u = x;
      for (let i = 0; i < 26; i++) {
        u = (lo + hi) / 2;
        const bx = 3 * u * (1 - u) * (1 - u) * x1 + 3 * u * u * (1 - u) * x2 + u * u * u;
        if (bx < x) lo = u;
        else hi = u;
      }
      return 3 * u * (1 - u) * (1 - u) * y1 + 3 * u * u * (1 - u) * y2 + u * u * u;
    };
  }
  // The app's own curves (theme.css).
  const grow = bez(0.3, 0.7, 0.2, 1);
  const rise = bez(0.2, 0.8, 0.2, 1);
  const io = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const in2 = (x) => x * x;
  const EASE = { io, grow, rise, lin: (x) => x };
  // cyBloom: scale .15 -> 1.12 -> 1, rotate -60 -> 6 -> 0.
  function bloom(k) {
    const e = grow(clamp(k));
    if (e < 0.7) {
      const u = e / 0.7;
      return { s: lerp(0.15, 1.12, u), r: lerp(-60, 6, u), o: u };
    }
    const u = (e - 0.7) / 0.3;
    return { s: lerp(1.12, 1, u), r: lerp(6, 0, u), o: 1 };
  }
  const blink = (t, t0) => (((t - t0) % 1.06) + 1.06) % 1.06 < 0.53;
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // --------------------------------------------------------------- theme
  // Day and night tokens from theme.css; the video blends between them.
  const DAY = {
    wall: "#E4DECB", frame: "#37604f", "frame-2": "#274a3c", "frame-ink": "#f3ebd3", "frame-ink-soft": "#c3d3bc",
    gold: "#c9a04e", "gold-line": "rgba(226,190,110,0.55)", "gold-soft": "rgba(226,190,110,0.22)",
    glow: "rgba(240,200,110,0.45)", paper: "#fbf6e9", "paper-2": "#f2ead5", rule: "#dccda6", ink: "#2a2a22",
    "ink-soft": "#645f4c", "ink-faint": "#9c957c", accent: "#3d7a4c", "accent-ink": "#fffdf4", petrol: "#2e6470",
    selection: "rgba(214,170,76,0.34)", "extra-sel": "rgba(46,100,112,0.2)", match: "rgba(143,184,120,0.4)",
    "match-cur": "#ebc46c", "match-cur-ring": "#b8893a", cursor: "#2a2a22", danger: "#a8483a", alert: "#f5b9a8",
    lead: "#1c3027", shadow: "rgba(38,52,32,0.3)", scrim: "rgba(28,44,34,0.38)", field: "#fffdf6",
    "field-border": "#cfbf97", "field-ink": "#2a2a22", "glass-0": "#a9cb8f", "glass-1": "#e3b45a",
    "glass-2": "#7fb2b8", "glass-3": "#9aaad0", "cap-ink": "#37604f",
  };
  const NIGHT = {
    wall: "#070F0C", frame: "#10211a", "frame-2": "#0a1712", "frame-ink": "#eadfc2", "frame-ink-soft": "#91a58e",
    gold: "#e2b85c", "gold-line": "rgba(226,184,92,0.55)", "gold-soft": "rgba(226,184,92,0.18)",
    glow: "rgba(236,190,90,0.55)", paper: "#15251e", "paper-2": "#1b2e26", rule: "#2f4a3d", ink: "#e9e2cc",
    "ink-soft": "#aeb49e", "ink-faint": "#6f7f6d", accent: "#86b96f", "accent-ink": "#0e1c16", petrol: "#7fc2ca",
    selection: "rgba(226,184,92,0.28)", "extra-sel": "rgba(127,194,202,0.24)", match: "rgba(134,185,111,0.3)",
    "match-cur": "rgba(226,184,92,0.72)", "match-cur-ring": "#e2b85c", cursor: "#f2e7c8", danger: "#e58a74",
    alert: "#f2a08c", lead: "#040a08", shadow: "rgba(0,0,0,0.55)", scrim: "rgba(2,8,6,0.55)", field: "#0e1d17",
    "field-border": "#39584a", "field-ink": "#e9e2cc", "glass-0": "#8cc474", "glass-1": "#e5a945",
    "glass-2": "#62a7b0", "glass-3": "#8397c9", "cap-ink": "#eadfc2",
  };
  function parseColor(c) {
    if (c[0] === "#") return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(1);
    return c.match(/[\d.]+/g).map(Number);
  }
  const THEME = Object.keys(DAY).map((k) => [k, parseColor(DAY[k]), parseColor(NIGHT[k])]);
  let lastNight = -1;
  function setTheme(n) {
    if (n === lastNight) return;
    lastNight = n;
    for (const [k, a, b] of THEME) {
      const c = a.map((v, i) => lerp(v, b[i], n));
      stage.style.setProperty("--" + k, `rgba(${c[0].toFixed(1)},${c[1].toFixed(1)},${c[2].toFixed(1)},${c[3].toFixed(3)})`);
    }
  }

  // --------------------------------------------------------------- icons
  // Same paths as desktop/src/icons.tsx.
  const ic = (inner, size, w, join) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round"${join ? ' stroke-linejoin="round"' : ""}>${inner}</svg>`;
  const I = {
    menu: (s = 14) => ic('<path d="M3 5h10M3 8h10M3 11h6"/>', s, 1.5),
    draw: (s = 14) => ic('<path d="M13.5 2.5C8 2.5 4.5 6.5 3 13.5"/><path d="M13.5 2.5C13.5 7 10.5 10 6 10.5"/>', s, 1.5, 1),
    settings: (s = 15) =>
      ic('<path d="M2 4h6.2M11.8 4H14M2 8h1.2M6.8 8H14M2 12h7.2M12.8 12H14"/><circle cx="10" cy="4" r="1.8"/><circle cx="5" cy="8" r="1.8"/><circle cx="11" cy="12" r="1.8"/>', s, 1.4),
    pin: (s = 14) => ic('<path d="M6 2h4l-.8 4 2.8 3H4l2.8-3z"/><path d="M8 9v5"/>', s, 1.5, 1),
    min: (s = 10) => ic('<path d="M4 8.5h8"/>', s, 1.8),
    max: (s = 10) => ic('<path d="M4 13.5V7.5a4 4 0 0 1 8 0v6z"/>', s, 1.6, 1),
    close: (s = 10, w = 1.8) => ic('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>', s, w),
    plus: (s = 11) => ic('<path d="M8 3v10M3 8h10"/>', s, 2),
    chevDown: (s = 10) => ic('<path d="M3.5 6l4.5 4.5L12.5 6"/>', s, 2, 1),
    chevRight: (s = 10) => ic('<path d="M6 3.5l4.5 4.5L6 12.5"/>', s, 2, 1),
    up: (s = 11) => ic('<path d="M8 13V3M4 7l4-4 4 4"/>', s, 1.8, 1),
    down: (s = 11) => ic('<path d="M8 3v10M4 9l4 4 4-4"/>', s, 1.8, 1),
    back: (s = 12, w = 1.8) => ic('<path d="M13 8H3M7 4L3 8l4 4"/>', s, w, 1),
    undo: (s = 18) => ic('<path d="M3.5 6.5h6a3.5 3.5 0 0 1 0 7H6"/><path d="M6 4L3.5 6.5 6 9"/>', s, 1.5, 1),
    redo: (s = 18) => ic('<path d="M12.5 6.5h-6a3.5 3.5 0 0 0 0 7H10"/><path d="M10 4l2.5 2.5L10 9"/>', s, 1.5, 1),
    edit: (s = 11) => ic('<path d="M10.5 2.5l3 3-8 8H2.5v-3z"/>', s, 1.6, 1),
    trash: (s = 11) => ic('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/>', s, 1.6, 1),
    refresh: (s = 13) => ic('<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5v2.8h-2.8"/>', s, 1.6, 1),
    reading: (s = 14) =>
      `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M1.5 3.8c2.3-1 4.5-.8 6.5 1 2-1.8 4.2-2 6.5-1v8.4c-2.3-1-4.5-.8-6.5 1-2-1.8-4.2-2-6.5-1z"/><path d="M8 4.8v8.4"/></svg>`,
  };
  const OPEN_LEAVES =
    "M0 4 C-1.5 -1.5 -6 -4 -9.5 -3 C-8 2 -4 4.5 0 4 Z M0 4 C1.5 -1.5 6 -4 9.5 -3 C8 2 4 4.5 0 4 Z M0 4 C-2 -1 -1.4 -6 0 -9 C1.4 -6 2 -1 0 4 Z";
  const leaf = (size, color, rotate = 0) =>
    `<svg width="${size}" height="${size}" viewBox="-6 -6 12 12"><path d="M0 -5 C2.6 -2.4 2.6 2.4 0 5 C-2.6 2.4 -2.6 -2.4 0 -5 Z" transform="rotate(${rotate})" fill="${color}"/></svg>`;
  const leafDivider = (scale = 1) =>
    `<svg width="${30 * scale}" height="${10 * scale}" viewBox="0 0 30 10"><path d="M15 1 C19 3.5 19 6.5 15 9 C11 6.5 11 3.5 15 1 Z" fill="var(--gold)"/><path d="M2 5 C6 2 9 8 12 5 M28 5 C24 2 21 8 18 5" fill="none" stroke="var(--gold)" stroke-width="1" stroke-linecap="round"/></svg>`;
  const logoMedallion = () =>
    `<div class="cy-logo"><span>C</span><svg width="8" height="8" viewBox="-4 -4 8 8"><path d="M0 -3.5 C2.6 -1.8 2.6 1.8 0 3.5 C-2.6 1.8 -2.6 -1.8 0 -3.5 Z" fill="var(--accent)" transform="rotate(35)"/></svg></div>`;
  const archShape = () =>
    `<svg class="cy-arch-shape" viewBox="0 0 600 56" preserveAspectRatio="none"><path class="iron" d="M0 56 V22 Q0 11 14 11 H190 C245 11 262 1 300 1 C338 1 355 11 410 11 H586 Q600 11 600 22 V56 Z"/><path class="fillet" d="M14 14.5 H190 C245 14.5 262 4.5 300 4.5 C338 4.5 355 14.5 410 14.5 H586" vector-effect="non-scaling-stroke"/></svg>`;
  const archVines = () =>
    `<svg class="cy-arch-vines" width="132" height="16" viewBox="0 0 132 16"><path d="M58 8 C50 2 40 13 30 8 C24 5 21 10 25 11.5 M74 8 C82 2 92 13 102 8 C108 5 111 10 107 11.5" fill="none" stroke="var(--gold)" stroke-width="1" stroke-linecap="round" opacity=".85"/><path d="M40 9.5 C37 6.5 33 7 32 9 C35 10.5 38 10.5 40 9.5 Z M92 9.5 C95 6.5 99 7 100 9 C97 10.5 94 10.5 92 9.5 Z" fill="var(--gold)" opacity=".7"/></svg>`;
  const vignette = (c) =>
    `<svg class="cy-vignette ${c}" width="22" height="22" viewBox="0 0 22 22"><path d="M3 21 V11 C3 6.5 6.5 3 11 3 H21 M3 14 C6.5 14 8.5 11 7.5 8.8 C6.8 7.4 5 7.8 5.4 9.3"/></svg>`;
  // The sync flower with both of its states; setSync() shows one.
  const syncFlower = (id, size = 18) =>
    `<svg id="${id}" width="${size}" height="${size}" viewBox="-10 -10 20 20" style="overflow:visible"><g class="sf-open"><path d="${OPEN_LEAVES}" fill="var(--gold)"/><path d="M0 4 V9.5" stroke="var(--gold)" stroke-width="1.3" stroke-linecap="round"/></g><g class="sf-bud"><path d="M0 -8 C4.5 -3.5 4.5 2.5 0 5 C-4.5 2.5 -4.5 -3.5 0 -8 Z" fill="var(--gold)"/><path d="M0 5 C-2.5 3 -5 4.5 -5.5 7 M0 5 C2.5 3 5 4.5 5.5 7 M0 5 V9.5" fill="none" stroke="var(--frame-ink-soft)" stroke-width="1.2" stroke-linecap="round"/></g></svg>`;
  // The full logo, redrawn as vector: double gold ring, gold C, green leaf.
  const bigMedallion = (id, size) =>
    `<svg id="${id}" class="bigmed" width="${size}" height="${size}" viewBox="-100 -100 200 200" style="overflow:visible"><defs><radialGradient id="${id}G" cx="42%" cy="34%" r="80%"><stop offset="0" stop-color="#3b6a57"/><stop offset="1" stop-color="#244538"/></radialGradient></defs><circle r="97" fill="url(#${id}G)"/><circle r="96" fill="none" stroke="#d9aa42" stroke-width="3.2"/><circle r="86.5" fill="none" stroke="#d9aa42" stroke-width="2"/><text x="-5" y="41" text-anchor="middle" font-family="Marcellus" font-size="122" fill="#dcae45">C</text><g id="${id}Leaf"><path d="M0 0 C13 -8 17 -25 9 -38 C-6 -31 -11 -13 0 0 Z" fill="#62a03e"/><path d="M0 0 C3 -12 5 -22 8 -34" fill="none" stroke="#3f7a2c" stroke-width="1.4" stroke-linecap="round"/></g></svg>`;

  // ------------------------------------------------------------ the note
  const TABS = ["Horta", "Lista de compras", "Reunião de terça", "Rascunho"];
  const LINES = ["Ideias para a horta", "", "— plantar mudas de manjericão", "— regar as mudas às terças", "— trocar o vaso das mudas"];
  const SUFFIX = " (esta semana)";
  const QUERY = "mudas";
  const MULTI = [2, 3, 4];

  // When each character is typed: an uneven rhythm, a breath at line ends.
  const TYPE_START = 17.0;
  const TYPE_END = 19.65;
  const typeTimes = (() => {
    const r = rng(7);
    const times = [];
    let at = 0;
    LINES.forEach((line, li) => {
      for (let i = 0; i < line.length; i++) {
        at += 0.5 + r();
        times.push({ li, n: i + 1, at });
      }
      if (li < LINES.length - 1) {
        at += 2.4;
        times.push({ li: li + 1, n: 0, at });
      }
    });
    times.forEach((x) => (x.at = TYPE_START + (x.at / at) * (TYPE_END - TYPE_START)));
    return times;
  })();
  function typedState(t) {
    let li = 0;
    let n = 0;
    for (const x of typeTimes) {
      if (x.at > t) break;
      li = x.li;
      n = x.n;
    }
    return { li, n };
  }
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // ---------------------------------------------------------------- markup
  const stage = $("stage");

  const LANTERNS = [
    [120, 150, 12], [310, 72, 9], [540, 118, 10], [1390, 96, 10], [1630, 64, 9], [1806, 160, 12], [66, 430, 9],
    [1858, 446, 10], [92, 770, 11], [1846, 748, 9], [236, 968, 10], [474, 1016, 8], [1452, 1012, 9], [1694, 952, 11],
    [770, 44, 8], [1166, 50, 9],
  ];

  const folders = [
    ["Casa", "3 notas"], ["Estudos", "14 notas"], ["Jardim", "9 notas · 1 pasta"], ["Receitas", "8 notas"],
    ["Trabalho", "12 notas · 2 pastas"], ["Viagens", "5 notas"],
  ];
  const notes = [
    [".cyte", "var(--accent)", "Hoje, 08:12", "Horta", "Ideias para a horta — plantar mudas de manjericão, regar as mudas às terças, trocar o vaso."],
    [".md", "var(--petrol)", "Ontem, 21:40", "Roteiro de viagem", "Dia 1: chegada e mercado municipal. Dia 2: trilha da cachoeira e café na praça."],
    [".txt", "var(--gold)", "28/09", "Lista de compras", "Terra adubada, vasos de barro, sementes de hortelã, regador pequeno."],
    [".cyte", "var(--accent)", "27/09", "Reunião de terça", "Pauta: lançamento, revisão do site e próximos passos."],
    [".md", "var(--petrol)", "25/09", "Livros para ler", "Botânica para curiosos, um romance curto, o guia de pássaros."],
    [".txt", "var(--gold)", "21/09", "Receita de pão", "500 g de farinha, 10 g de sal, 350 ml de água, uma noite de descanso."],
  ];

  const PLANT = `
    <g id="plant">
      <path class="sk vp" data-ease="lin" data-t0="26.85" data-t1="27.35" pathLength="1" style="stroke:#4E8A4A" d="M120 250 C117 205 125 150 120 100"/>
      <path class="sk vp" data-ease="lin" data-t0="27.45" data-t1="27.95" pathLength="1" style="stroke:#4E8A4A" d="M120 196 C82 194 54 166 50 132 C88 134 116 158 120 196 C104 172 80 152 62 142"/>
      <path class="sk vp" data-ease="lin" data-t0="28.02" data-t1="28.48" pathLength="1" style="stroke:#4E8A4A" d="M121 164 C158 162 186 134 190 102 C152 104 124 130 121 164 C138 142 160 122 178 112"/>
      ${[0, 1, 2, 3, 4]
        .map(
          (i) =>
            `<path class="sk vp" data-ease="lin" data-t0="${(28.62 + i * 0.1).toFixed(2)}" data-t1="${(28.74 + i * 0.1).toFixed(2)}" pathLength="1" style="stroke:#C98A2E" transform="rotate(${i * 72} 120 76)" d="M120 76 C104 62 106 36 120 26 C134 36 136 62 120 76"/>`,
        )
        .join("")}
      <circle id="plantDot" cx="120" cy="76" r="7" fill="#A65A3A"/>
    </g>`;

  stage.innerHTML = `
    <div id="dots" class="full"></div>
    <div id="sun" class="full"></div>
    <div id="nightGlow" class="full"></div>
    <div id="lanterns" class="full">${LANTERNS.map(([x, y, s]) => `<div class="lantern" style="left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px"></div>`).join("")}</div>

    <div id="opening" class="full">
      <div id="lampGlow"></div>
      <svg class="full" viewBox="0 0 1920 1080" style="position:absolute;overflow:visible">
        <g id="archL">
          <path class="vp" data-t0="0.15" data-t1="2.5" data-leaves="0.3,0.52,0.74" pathLength="1" stroke-width="6" d="M580 1100 C580 860 560 700 590 560 C625 395 770 262 960 262"/>
          <path class="vp" data-t0="0.5" data-t1="2.7" pathLength="1" stroke-width="2.2" opacity=".65" d="M622 1100 C622 872 604 716 631 582 C663 432 790 306 960 306"/>
          <path class="vp" data-t0="1.25" data-t1="2.3" data-leaves="0.34,0.62" pathLength="1" stroke-width="3" d="M585 650 C520 606 448 624 438 684 C430 734 480 754 500 718 C512 694 488 678 476 694"/>
          <path class="vp" data-t0="1.75" data-t1="2.75" data-leaves="0.4" pathLength="1" stroke-width="3" d="M662 400 C600 338 520 350 500 402 C484 448 530 472 552 442 C564 424 546 410 534 422"/>
          <path class="vp" data-t0="2.2" data-t1="2.95" data-leaves="0.5" pathLength="1" stroke-width="3" d="M960 262 C900 198 818 190 790 232 C770 264 800 292 826 272 C838 262 828 246 816 252"/>
          <path class="vp" data-t0="0.9" data-t1="2.0" data-leaves="0.45" pathLength="1" stroke-width="3" d="M581 900 C520 870 470 900 474 946 C478 984 520 990 530 960 C536 942 518 934 510 946"/>
        </g>
        <use href="#archL" transform="translate(1920 0) scale(-1 1)"/>
        <path class="vp" data-t0="2.55" data-t1="2.95" pathLength="1" stroke-width="2.5" d="M960 262 V330"/>
        <g id="lampBud" transform="translate(960 356)">
          <path d="M0 -30 C19 -13 19 13 0 24 C-19 13 -19 -13 0 -30 Z" fill="#c9a04e" stroke="#8f6c2a" stroke-width="2"/>
          <path id="lampCore" d="M0 -20 C11 -9 11 8 0 15 C-11 8 -11 -9 0 -20 Z" fill="#fff3c4"/>
        </g>
      </svg>
      ${bigMedallion("med1", 340)}
    </div>

    <div id="idea" class="full">
      <svg id="ideaSprout" width="230" height="230" viewBox="0 0 40 40" style="position:absolute;left:845px;top:238px;overflow:visible">
        <path class="vp" data-t0="5.25" data-t1="5.65" pathLength="1" stroke-width="1.2" d="M9 35.5 C15 33 25 33 31 35.5"/>
        <path class="vp" data-t0="5.4" data-t1="6.1" pathLength="1" stroke-width="1.4" style="stroke:#3d7a4c" d="M20 35 C20 28 20 22 20 15"/>
        <path id="sprL" d="M20 23 C13 23 8.5 18 8.5 13 C14.5 13 20 17 20 23 Z" fill="#3d7a4c" opacity=".8"/>
        <path id="sprR" d="M20 18.5 C26 18.5 31.5 13.5 31.5 8.5 C25 8.5 20 12.5 20 18.5 Z" fill="#3d7a4c" opacity=".8"/>
        <g id="spark"><circle cx="20" cy="9" r="9" fill="rgba(246,204,110,.35)"/><circle cx="20" cy="9" r="2.6" fill="#e2b85c"/></g>
      </svg>
      <div id="ideaText"></div>
      <svg width="620" height="40" viewBox="0 0 620 40" style="position:absolute;left:650px;top:668px;overflow:visible">
        <path class="vp" data-t0="6.7" data-t1="7.7" data-leaves="0.5" pathLength="1" stroke-width="3" d="M10 20 C110 -6 200 46 310 20 C420 -6 510 46 610 20"/>
      </svg>
    </div>

    <div id="dark" class="full"></div>
    <div id="keys">
      <div class="key" id="k0">Ctrl</div><div class="plus">+</div>
      <div class="key" id="k1">Shift</div><div class="plus">+</div>
      <div class="key wide" id="k2">Space</div>
    </div>
    <div id="keysCap">Um atalho, de qualquer lugar.</div>

    <div id="winGlow"></div>
    <div id="winWrap">
      <div class="cy-window" id="win">
        <div class="cy-arch" id="winArch">
          ${archShape()}${archVines()}
          <div class="cy-lamp" id="winLamp"></div>
          <div class="cy-arch-strip">
            <div class="cy-brand">${logoMedallion()}<span class="cy-brand-name">Cynote</span></div>
            <button class="medallion">${I.menu()}</button>
            <div class="cy-spacer"></div>
            <button class="medallion" id="btnDraw">${I.draw()}</button>
            <button class="medallion">${I.settings()}</button>
            <button class="medallion">${I.pin()}</button>
            <div class="cy-arch-divider"></div>
            <button class="medallion win">${I.min()}</button>
            <button class="medallion win">${I.max()}</button>
            <button class="medallion win close">${I.close()}</button>
          </div>
        </div>
        <div class="cy-body">
          <div class="tab-bar">
            <div class="tab-row">
              ${TABS.map(
                (title, i) =>
                  `<div class="tab${i === 0 ? " active" : ""}" style="--glass:var(--glass-${i})"><span class="tab-lit"></span><span class="tab-came"></span>${i === 0 ? '<span class="tab-bloom"></span>' : ""}<span class="tab-label">${title}</span></div>`,
              ).join("")}
            </div>
            <div class="tab-bar-actions">
              <button class="medallion small">${I.chevDown()}</button>
              <button class="medallion small">${I.plus()}</button>
            </div>
          </div>
          <div class="cy-page">
            <div class="cy-page-rule"></div>
            ${["tl", "tr", "bl", "br"].map(vignette).join("")}
            <div class="content-shell">
              <div class="content-wrap" style="font-size:19.5px;line-height:1.65">
                <div class="find-anchor">
                  <div class="find-bar" id="findBar">
                    <div class="find-row">
                      <button class="find-btn find-toggle-replace">${I.chevRight()}</button>
                      <div class="find-input fake" id="findInput"></div>
                      <button class="find-case">Aa</button>
                      <span class="find-status" id="findStatus"></span>
                      <button class="find-btn">${I.up()}</button>
                      <button class="find-btn">${I.down()}</button>
                      <button class="find-btn">${I.close(10, 2)}</button>
                    </div>
                  </div>
                </div>
                <div class="note-body-row">
                  <div class="line-gutter"></div>
                  <div class="note-body" id="noteBody"></div>
                  <div class="note-sketch-wrap" id="sketch" style="left:540px;top:30px;width:150px;height:163px">
                    <svg class="note-sketch" id="sketchImg" viewBox="30 10 180 250" style="overflow:visible"><use href="#plant"/></svg>
                    <div class="sketch-toolbar" id="sketchTools"><button class="sketch-tool-btn">${I.edit()}</button><button class="sketch-tool-btn delete">${I.trash()}</button></div>
                    <div class="sketch-resize-handle" id="sketchHandle"></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="overlay" id="overlay">
              <div class="overlay-header"><span class="overlay-title">Note Styling</span><span class="overlay-subtitle">caderno de botânica</span></div>
              <svg class="draw-canvas" id="drawCanvas" viewBox="-283 -18 806 300" preserveAspectRatio="xMidYMid meet">
                ${PLANT}
                <circle id="penTip" r="4.5" fill="none" stroke="#2a2a22" stroke-width="1.4"/>
              </svg>
              <div class="overlay-footer">
                <div class="swatches">${["#4E8A4A", "#2E6F7C", "#A65A3A", "#C98A2E"].map((c) => `<button class="swatch" style="background:${c}"></button>`).join("")}</div>
                <div class="cy-spacer"></div>
                <button class="pill ghost">Limpar</button>
                <button class="pill">Cancelar</button>
                <button class="pill primary" id="btnInsert">Inserir no texto</button>
              </div>
            </div>
          </div>
          <div class="status-bar">
            <span id="lnCol">Ln 1, Col 1</span>
            <span class="status-chars" id="chars">0 caracteres</span>
            <div class="cy-spacer"></div>
            <div class="status-zoom"><button class="zoom-btn">−</button><span class="zoom-value">130%</span><button class="zoom-btn">+</button></div>
            <button class="reading-btn">${I.reading()}</button>
            <button class="sync-btn">${syncFlower("syncD")}<span class="sync-label" id="syncDLabel">Sincronizado</span></button>
          </div>
        </div>
      </div>
    </div>

    <svg id="link" class="full" viewBox="0 0 1920 1080" style="overflow:visible">
      <path class="vp" data-t0="30.9" data-t1="32.35" data-leaves="0.2,0.44,0.7,0.9" pathLength="1" stroke-width="4" d="M1128 470 C1180 410 1226 540 1264 478 C1300 420 1340 530 1400 474"/>
      <g id="linkFlower" transform="translate(1264 452)">
        <circle id="linkHalo" r="90" fill="url(#haloG)"/>
        <g id="linkBloom"><path d="${OPEN_LEAVES}" fill="var(--gold)" transform="scale(6)"/></g>
      </g>
      <defs><radialGradient id="haloG"><stop offset="0" stop-color="rgba(246,210,120,.75)"/><stop offset="1" stop-color="rgba(246,210,120,0)"/></radialGradient></defs>
    </svg>

    <div id="phoneWrap">
      <div class="ph-frame">
        <div class="ph-screen">
          <div class="ph-head">
            <svg width="390" height="112" viewBox="0 0 390 112">
              <path d="M0 0 H390 V94 C300 94 265 108 195 108 C125 108 90 94 0 94 Z" fill="var(--frame)"/>
              <path d="M0 90.5 C90 90.5 125 104.5 195 104.5 C265 104.5 300 90.5 390 90.5" fill="none" stroke="var(--gold-line)"/>
            </svg>
            <div class="ph-status"><span>08:12</span><span style="display:flex;gap:6px;align-items:center">
              <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.3" y="5.5" width="3" height="6.5" rx="1"/><rect x="8.6" y="3" width="3" height="9" rx="1"/><rect x="13" y="0" width="3" height="12" rx="1"/></svg>
              <svg width="24" height="12" viewBox="0 0 24 12"><rect x=".6" y=".6" width="20" height="10.8" rx="3" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2.4" y="2.4" width="14" height="7.2" rx="1.6" fill="currentColor"/><rect x="21.6" y="4" width="2" height="4" rx="1" fill="currentColor"/></svg>
            </span></div>
            <div class="ph-bar">
              <button class="medallion">${I.back(16, 1.7)}</button>
              <span class="ph-title">Horta</span>
              <button class="medallion">${I.undo()}</button>
              <button class="medallion" style="opacity:.4">${I.redo()}</button>
              <button class="medallion ph-aa">Aa</button>
            </div>
            <div class="ph-lamp" id="phLamp"></div>
          </div>
          <div class="ph-body" id="phBody"></div>
          <div class="ph-foot">
            <div class="ph-pill">${syncFlower("syncP", 20)}<span id="syncPLabel">Sincronizado</span></div>
            <span id="phChars"></span>
          </div>
        </div>
      </div>
    </div>

    <div id="dashWrap">
      <div class="cy-window dash-window">
        <div class="cy-arch">
          ${archShape()}
          <div class="cy-lamp" id="dashLamp"></div>
          <div class="cy-arch-strip">
            <div class="cy-brand">${logoMedallion()}<span class="cy-brand-name">Dashnotes</span></div>
            <div class="cy-spacer"></div>
            <button class="medallion win">${I.min()}</button>
            <button class="medallion win">${I.max()}</button>
            <button class="medallion win close">${I.close()}</button>
          </div>
        </div>
        <div class="cy-body">
          <div class="dash-nav">
            <button class="medallion dash-back" disabled>${I.back(14, 1.7)}</button>
            <nav class="dash-crumbs"><div class="dash-crumb-group"><button class="dash-crumb current">Início</button></div></nav>
            <button class="dash-rescan">${I.refresh()}Procurar de novo</button>
          </div>
          <div class="cy-page">
            <div class="cy-page-rule"></div>
            ${vignette("tl")}${vignette("tr")}
            <div class="dash-scroll" style="overflow:hidden">
              <div class="dash-section"><span>Pastas</span><div></div></div>
              <div class="dash-folder-grid">
                ${folders
                  .map(
                    ([name, meta], i) =>
                      `<button class="dash-folder" style="--glass:var(--glass-${i % 4});--bead:var(--glass-${(i + 1) % 4})"><span class="dash-folder-shine"></span><span class="dash-folder-mullion v"></span><span class="dash-folder-mullion h"></span><span class="dash-folder-bead"></span><span class="dash-folder-plate"><span class="dash-folder-name">${name}</span><span class="dash-folder-meta">${meta}</span></span></button>`,
                  )
                  .join("")}
              </div>
              <div class="dash-section"><span>Notas</span><div></div></div>
              <div class="dash-note-grid">
                ${notes
                  .map(
                    ([ext, color, date, title, preview]) =>
                      `<button class="dash-note"><span class="dash-note-rule"></span><span class="dash-note-top">${leaf(14, color, 40)}<span class="dash-note-ext">${ext}</span><span class="cy-spacer"></span><span class="dash-note-date">${date}</span></span><span class="dash-note-title">${title}</span><span class="dash-note-preview">${preview}</span></button>`,
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <div class="dash-footer"><span class="dash-footer-path">Área de Trabalho · Documentos</span><span>12 itens</span></div>
        </div>
      </div>
    </div>

    <div id="glassWall" class="full"></div>

    <div id="final" class="full">
      <div id="finalGlow"></div>
      ${bigMedallion("med2", 330)}
      <div id="finalTitle"><span style="color:#e2b85c;margin-right:.45em">Cynote</span>notas que crescem.</div>
      <svg width="520" height="40" viewBox="0 0 520 40" style="position:absolute;left:700px;top:776px;overflow:visible">
        <path class="vp" data-t0="41.7" data-t1="42.5" data-leaves="0.5" pathLength="1" stroke-width="3" style="stroke:#e2b85c" d="M10 20 C90 -4 170 44 260 20 C350 -4 430 44 510 20"/>
      </svg>
      <div id="finalSub">Windows e Android · grátis</div>
    </div>

    <div id="caption">${leafDivider(2.6)}<span id="capText"></span>${leafDivider(2.6)}</div>
    <div id="flash" class="full"></div>
  `;

  // The wall of stained glass: 8 x 3 arched panes.
  const GW = [];
  {
    const wall = $("glassWall");
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        const el = document.createElement("div");
        const hue = (c + r * 3) % 4;
        el.className = "gw";
        el.style.cssText = `--glass:var(--glass-${hue});--bead:var(--glass-${(hue + 1) % 4})`;
        el.innerHTML = '<i class="shine"></i><i class="mv"></i><i class="mh"></i><i class="mh2"></i><i class="bead"></i>';
        wall.appendChild(el);
        const x = 55 + c * 230;
        const y = 60 + r * 330;
        const d = Math.hypot(x + 100 - 960, y + 150 - 540) / 900;
        GW.push({ el, x, y, d });
      }
    }
  }

  // "Uma ideia aparece.", one span per letter.
  const ideaLetters = [..."Uma ideia aparece."].map((ch) => {
    const s = document.createElement("span");
    s.textContent = ch;
    $("ideaText").appendChild(s);
    return s;
  });

  // Drawn paths (.vp): a dash that grows with time, plus leaves that open as
  // the line passes them.
  const VP = [...stage.querySelectorAll(".vp")].map((el) => {
    const t0 = +el.dataset.t0;
    const t1 = +el.dataset.t1;
    const ease = EASE[el.dataset.ease || "io"];
    const leaves = [];
    if (el.dataset.leaves) {
      const len = el.getTotalLength();
      const sw = parseFloat(el.getAttribute("stroke-width"));
      el.dataset.leaves.split(",").forEach((f, i) => {
        const a = el.getPointAtLength(len * f);
        const b = el.getPointAtLength(Math.min(len, len * f + 2));
        const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90 + (i % 2 ? 58 : -58);
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("class", "vleaf");
        p.setAttribute("d", "M0 0 C3.2 -3 3.2 -8.5 0 -12 C-3.2 -8.5 -3.2 -3 0 0 Z");
        el.parentNode.insertBefore(p, el);
        leaves.push({ p, x: a.x, y: a.y, ang, at: t0 + (t1 - t0) * f, size: 1.2 + sw * 0.5 });
      });
    }
    return { el, t0, t1, ease, leaves };
  });
  function drawPaths(t) {
    for (const v of VP) {
      const k = v.ease(seg(t, v.t0, v.t1));
      v.el.style.visibility = k <= 0 ? "hidden" : "visible";
      v.el.style.strokeDasharray = `${k} 1.2`;
      for (const l of v.leaves) {
        const s = grow(seg(t, l.at, l.at + 0.5)) * l.size;
        l.p.setAttribute("transform", `translate(${l.x} ${l.y}) rotate(${l.ang}) scale(${s})`);
      }
    }
  }

  // --------------------------------------------------------------- pieces
  const show = (el, on) => (el.style.display = on ? "" : "none");

  function setSync(svg, label, t) {
    const open = svg.querySelector(".sf-open");
    const bud = svg.querySelector(".sf-bud");
    const syncing = t >= 30.9 && t < 32.5;
    open.style.display = syncing ? "none" : "";
    bud.style.display = syncing ? "" : "none";
    if (syncing) {
      const u = (1 - Math.cos(((t - 30.9) / 1.2) * 2 * Math.PI)) / 2;
      bud.setAttribute("transform", `translate(0 6) scale(${lerp(0.88, 1.04, u)}) translate(0 -6)`);
      bud.style.opacity = lerp(0.75, 1, u);
    } else {
      const b = t >= 32.5 ? bloom(seg(t, 32.5, 33.1)) : { s: 1, r: 0, o: 1 };
      open.setAttribute("transform", `rotate(${b.r}) scale(${b.s})`);
      open.style.opacity = b.o;
    }
    label.textContent = syncing ? "Sincronizando…" : "Sincronizado";
  }

  function lineHTML(text, li, t, carets) {
    let html = "";
    const finding = t >= 25 && t < 26.2;
    if (finding && text.includes(QUERY)) {
      const idx = MULTI.indexOf(li);
      const cur = (t < 25.65 ? 0 : 1) === idx;
      const pop = 1 + 0.22 * (1 - seg(t, cur && idx === 1 ? 25.65 : 25, (cur && idx === 1 ? 25.65 : 25) + 0.28));
      const at = text.indexOf(QUERY);
      html = `${esc(text.slice(0, at))}<span class="m${cur ? " cur" : ""}" style="box-shadow:0 0 0 ${((pop - 1) * 22).toFixed(2)}px var(--match)${cur ? ", 0 0 0 1px var(--match-cur-ring)" : ""}">${QUERY}</span>${esc(text.slice(at + QUERY.length))}`;
    } else html = esc(text);
    return `<div class="ln">${html || "&#8203;"}${carets}</div>`;
  }

  function renderNote(t) {
    const typed = typedState(t);
    const suffixN = Math.round(seg(t, 21.3, 22.55) * SUFFIX.length);
    const done = t >= TYPE_END;
    const multi = t >= 20.25 && t < 23.1;
    let html = "";
    let chars = 0;
    for (let li = 0; li < LINES.length; li++) {
      if (!done && li > typed.li) break;
      let text = done || li < typed.li ? LINES[li] : LINES[li].slice(0, typed.n);
      if (MULTI.includes(li)) text += SUFFIX.slice(0, suffixN);
      chars += text.length + (li > 0 ? 1 : 0);

      let caret = "";
      const last = li === LINES.length - 1;
      if (t >= 16.5 && t < TYPE_START) {
        if (li === 0) caret = `<span class="cr${blink(t, 16.5) ? "" : " off"}"></span>`;
      } else if (!done && t >= TYPE_START) {
        if (li === typed.li) caret = '<span class="cr"></span>';
      } else if (t < 23.2 || t >= 29.6) {
        const typing = t >= 21.3 && t < 22.6;
        const on = typing || blink(t, t < 21.3 ? TYPE_END : t < 29 ? 22.6 : 29.6);
        if (last) caret = `<span class="cr${on ? "" : " off"}"></span>`;
        else if (multi && ((li === 3 && t >= 20.25) || (li === 2 && t >= 20.7)))
          caret = `<span class="cr x${on ? "" : " off"}"></span>`;
      }
      html += lineHTML(text, li, t, caret);
    }
    $("noteBody").innerHTML = html;
    const ln = done ? LINES.length : typed.li + 1;
    const col = (done ? LINES[LINES.length - 1].length + suffixN : typed.n) + 1;
    $("lnCol").textContent = `Ln ${ln}, Col ${col}`;
    $("chars").textContent = `${chars} caracteres`;
    return chars;
  }

  const CAPTIONS = [
    [16.3, 19.75, "Anote na hora"],
    [20.1, 22.95, "Múltiplos cursores"],
    [23.2, 26.1, "Busca que destaca cada resultado"],
    [26.4, 29.75, "Desenho à mão no Note Styling"],
    [30.5, 34.7, "Sincroniza com o celular"],
    [35.3, 37.25, "Dia e noite"],
    [37.9, 39.2, "Dashnotes: todas as suas notas"],
  ];

  // ---------------------------------------------------------------- render
  function render(t) {
    // Day -> night at the 35 s hit; the keys scene is only an overlay.
    const night = io(seg(t, 35, 36));
    setTheme(night);
    $("sun").style.opacity = 1 - night;
    $("dots").style.opacity = 0.55 * (1 - night * 0.7);
    $("nightGlow").style.opacity = night;
    drawPaths(t);

    // Lanterns light one by one once it is night, then twinkle.
    [...$("lanterns").children].forEach((el, i) => {
      const on = grow(seg(t, 35.3 + i * 0.11, 35.3 + i * 0.11 + 0.5));
      const tw = 0.82 + 0.18 * Math.sin(t * 2.1 + i * 1.7);
      const out = t > 39 && t < 40.6 ? 1 - 0.75 * seg(t, 39.1, 39.6) : 1;
      el.style.opacity = on * tw * (t >= 40.6 ? lerp(0.25, 1, seg(t, 40.6, 41.6)) : out);
      el.style.transform = `scale(${0.4 + 0.6 * on})`;
    });

    // ---- 0-5 s: the vine draws the arch, the lantern lights, the medallion blooms.
    const op = $("opening");
    show(op, t < 5.4);
    if (t < 5.4) {
      const out = io(seg(t, 4.75, 5.3));
      op.style.opacity = 1 - out;
      op.style.transform = `scale(${1 + 0.05 * out + 0.02 * seg(t, 0, 5)})`;
      const lampIn = grow(seg(t, 2.75, 3.0));
      const lit = grow(seg(t, 3.0, 3.35));
      const breath = 0.85 + 0.15 * Math.sin((t - 3) * 2.2);
      $("lampBud").setAttribute("transform", `translate(960 366) scale(${lampIn * 1.5})`);
      $("lampCore").style.opacity = lit;
      $("lampGlow").style.opacity = lit * breath;
      $("lampGlow").style.transform = `scale(${0.3 + 0.7 * lit * breath})`;
      const b = bloom(seg(t, 3.6, 4.4));
      const med = $("med1");
      med.style.left = "790px";
      med.style.top = "470px";
      med.style.opacity = t < 3.6 ? 0 : b.o;
      med.style.transform = `scale(${b.s}) rotate(${b.r}deg)`;
      const lf = grow(seg(t, 4.1, 4.6));
      $("med1Leaf").setAttribute("transform", `translate(31 -27) rotate(${32 + (1 - lf) * 50}) scale(${lf})`);
    }

    // ---- 5-10 s: "Uma ideia aparece."
    const idea = $("idea");
    show(idea, t >= 5.1 && t < 10);
    if (t >= 5.1 && t < 10) {
      const out = io(seg(t, 9.35, 9.9));
      idea.style.opacity = 1 - out;
      idea.style.transform = `translateY(${-24 * out}px) scale(${1 + 0.035 * seg(t, 5, 10)})`;
      ideaLetters.forEach((s, i) => {
        const k = rise(seg(t, 5.55 + i * 0.05, 5.55 + i * 0.05 + 0.45));
        s.style.opacity = k;
        s.style.transform = `translateY(${(1 - k) * 30}px)`;
      });
      const sway = Math.sin((t - 5) * 1.05) * 3;
      $("ideaSprout").style.transform = `rotate(${sway}deg)`;
      $("ideaSprout").style.transformOrigin = "50% 88%";
      const l = grow(seg(t, 5.85, 6.4));
      const r = grow(seg(t, 6.1, 6.65));
      $("sprL").setAttribute("transform", `translate(20 23) scale(${l}) translate(-20 -23)`);
      $("sprR").setAttribute("transform", `translate(20 18.5) scale(${r}) translate(-20 -18.5)`);
      const sp = bloom(seg(t, 6.55, 7.2));
      const pulse = 1 + 0.12 * Math.sin((t - 7) * 3);
      $("spark").setAttribute("transform", `translate(20 9) scale(${t < 6.55 ? 0 : sp.s * pulse}) translate(-20 -9)`);
    }

    // ---- 10-15 s: the screen darkens, the brass keys are pressed in the hush.
    const darkK = t < 12 ? io(seg(t, 9.6, 10.3)) : 1 - io(seg(t, 14.92, 15.3));
    $("dark").style.opacity = darkK;
    const keysOn = t >= 10.2 && t < 15.1;
    show($("keys"), keysOn);
    show($("keysCap"), keysOn);
    if (keysOn) {
      const out = io(seg(t, 14.8, 15.05));
      $("keys").style.opacity = 1 - out;
      $("keys").style.transform = `scale(${1 + 0.14 * out})`;
      const press = [13.98, 14.25, 14.45];
      const kids = [...$("keys").children];
      kids.forEach((el, i) => {
        const k = rise(seg(t, 10.35 + i * 0.3, 10.35 + i * 0.3 + 0.55));
        el.style.opacity = k;
        if (i % 2) {
          el.style.transform = `translateY(${(1 - k) * 30}px)`;
          return;
        }
        const p = press[i / 2];
        // Down fast, back up a little, and it stays lit.
        const down = t < p ? 0 : t < p + 0.07 ? (t - p) / 0.07 : lerp(1, 0.55, seg(t, p + 0.07, p + 0.3));
        const lit = t < p ? 0 : 1;
        const flare = t < p ? 0 : 1 - seg(t, p, p + 0.5);
        el.style.transform = `translateY(${(1 - k) * 30 + down * 12}px)`;
        el.style.filter = `brightness(${1 + 0.1 * lit + 0.3 * flare})`;
        el.style.boxShadow =
          `inset 0 3px 0 rgba(255,255,255,.55), inset 0 -6px 0 rgba(90,60,10,.25), 0 ${14 - down * 12}px 0 #6e521d, ` +
          `0 ${28 - down * 14}px 44px rgba(0,0,0,.55), 0 0 ${lit * (46 + flare * 60)}px ${lit * (4 + flare * 14)}px rgba(246,206,116,${0.55 * lit + 0.3 * flare})`;
      });
      const c = rise(seg(t, 12.1, 12.8));
      $("keysCap").style.opacity = c * (1 - out);
      $("keysCap").style.transform = `translateY(${(1 - c) * 14}px)`;
    }
    $("flash").style.opacity = t < 15 ? 0.9 * in2(seg(t, 14.86, 15)) : 0.9 * (1 - io(seg(t, 15, 15.55)));

    // ---- 15-37.9 s: the main window.
    const winOn = t >= 14.9 && t < 37.9;
    show($("winWrap"), winOn);
    show($("winGlow"), winOn);
    if (winOn) {
      const toSide = grow(seg(t, 30, 30.85));
      const inK = grow(seg(t, 14.95, 15.75));
      const outK = io(seg(t, 37.3, 37.85));
      const x = lerp(960, 640, toSide);
      const y = 488 + 30 * outK;
      const s = lerp(1.62, 1.2, toSide) * lerp(0.93, 1, inK) * (1 - 0.06 * outK);
      const wrap = $("winWrap");
      wrap.style.transform = `translate(${x - 410}px, ${y - 270}px) scale(${s})`;
      wrap.style.opacity = 1 - outK;
      const glow = $("winGlow");
      glow.style.cssText = `position:absolute;left:${x - 760 * s}px;top:${y - 520 * s}px;width:${1520 * s}px;height:${1040 * s}px;opacity:${night * 0.75 * (1 - outK)}`;

      // It grows out of the arch: the arch first, then the body unrolls.
      const archK = grow(seg(t, 14.95, 15.4));
      $("winArch").style.transform = `scaleX(${lerp(0.12, 1, archK)})`;
      $("winArch").style.opacity = seg(t, 14.95, 15.12);
      const bodyK = grow(seg(t, 15.22, 16));
      $("win").style.clipPath = bodyK >= 1 ? "none" : `inset(-20px -20px ${(1 - bodyK) * 484}px -20px)`;

      const lampB = 0.5 + 0.5 * Math.sin(((t - 15) / 4) * 2 * Math.PI);
      const lampShadow = `0 0 ${lerp(6, 14, lampB) + night * 8}px ${night * 2}px var(--glow)`;
      $("winLamp").style.boxShadow = lampShadow;

      // The stained-glass tabs light up one by one, on the chimes.
      [...$("win").querySelectorAll(".tab")].forEach((el, i) => {
        const at = 16.0 + i * 0.12;
        const k = grow(seg(t, at, at + 0.3));
        const flare = t < at ? 0 : 1 - io(seg(t, at + 0.1, at + 0.75));
        el.style.opacity = k;
        el.style.transform = `translateY(${(1 - k) * 8}px)`;
        el.querySelector(".tab-lit").style.opacity = i === 0 ? 0 : flare;
        el.style.color = i > 0 && flare > 0.5 ? "#1b261f" : "";
        if (i > 0) el.style.boxShadow = `0 0 ${16 * flare + 10 * night}px rgba(240,200,110,${0.45 * flare + 0.12 * night})`;
        else {
          const b = bloom(seg(t, at + 0.15, at + 0.6));
          const bl = el.querySelector(".tab-bloom");
          bl.style.transform = `scale(${t < at + 0.15 ? 0 : b.s}) rotate(${b.r}deg)`;
        }
      });

      const chars = renderNote(t);

      // Find bar.
      const fb = $("findBar");
      const fIn = rise(seg(t, 23.2, 23.48));
      const fOut = seg(t, 26.1, 26.3);
      fb.style.opacity = fIn * (1 - fOut);
      fb.style.transform = `translateY(${(1 - fIn) * 6}px)`;
      show(fb, t >= 23.2 && t < 26.3);
      const qn = Math.round(seg(t, 23.95, 24.8) * QUERY.length);
      const fcaret = `<span class="cr${blink(t, 23.2) || (t > 23.9 && t < 24.9) ? "" : " off"}"></span>`;
      $("findInput").innerHTML = qn ? esc(QUERY.slice(0, qn)) + fcaret : `${fcaret}<span class="ph">Localizar</span>`;
      $("findStatus").textContent = t >= 25 ? (t < 25.65 ? "1 de 3" : "2 de 3") : "";

      // Note Styling: the overlay opens, a plant is drawn, it lands in the note.
      const ovK = t < 28 ? io(seg(t, 26.3, 26.6)) : 1 - io(seg(t, 29.42, 29.72));
      const ov = $("overlay");
      ov.style.opacity = ovK;
      ov.style.visibility = ovK > 0 ? "visible" : "hidden";
      $("btnDraw").classList.toggle("active", t >= 26.3 && t < 29.6);
      const amber = t >= 28.55;
      [...ov.querySelectorAll(".swatch")].forEach((el, i) => el.classList.toggle("selected", i === (amber ? 3 : 0)));
      const dotK = bloom(seg(t, 29.12, 29.4));
      $("plantDot").setAttribute("r", t < 29.12 ? 0 : 7 * dotK.s);
      const pressK = t >= 29.28 && t < 29.46 ? 1 : 0;
      $("btnInsert").style.transform = `scale(${1 - 0.06 * pressK})`;
      $("btnInsert").style.filter = `brightness(${1 - 0.08 * pressK})`;
      // The pen tip rides the stroke being drawn.
      const tip = $("penTip");
      const active = VP.find((v) => v.el.classList.contains("sk") && t > v.t0 && t < v.t1);
      if (active) {
        const len = active.el.getTotalLength();
        const p = active.el.getPointAtLength(len * seg(t, active.t0, active.t1));
        const m = active.el.transform.baseVal.consolidate();
        const q = m ? new DOMPoint(p.x, p.y).matrixTransform(m.matrix) : p;
        tip.setAttribute("cx", q.x);
        tip.setAttribute("cy", q.y);
        tip.style.display = "";
      } else tip.style.display = "none";

      const sk = $("sketch");
      show(sk, t >= 29.42);
      const hover = 1 - seg(t, 30.1, 30.5);
      $("sketchImg").style.outlineColor = `rgba(201,160,78,${hover})`;
      $("sketchTools").style.opacity = hover;
      $("sketchHandle").style.opacity = hover;
      const land = grow(seg(t, 29.42, 29.85));
      sk.style.opacity = land;
      sk.style.transform = `scale(${lerp(1.18, 1, land)})`;

      setSync($("syncD"), $("syncDLabel"), t);

      // ---- 30-35 s: the phone, the vine between the two, the flower.
      const phOn = t >= 30;
      show($("phoneWrap"), phOn);
      show($("link"), phOn);
      if (phOn) {
        const k = grow(seg(t, 30, 30.95));
        const ph = $("phoneWrap");
        ph.style.transform = `translate(${1590 - 207 + (1 - k) * 780}px, ${490 - 434 + 30 * outK}px) rotate(${(1 - k) * 7}deg) scale(${0.94 * (1 - 0.06 * outK)})`;
        ph.style.opacity = 1 - outK;
        $("phLamp").style.boxShadow = lampShadow;
        let html = "";
        LINES.forEach((line, li) => {
          const text = line + (MULTI.includes(li) ? SUFFIX : "");
          const at = 32.55 + (li - 2) * 0.16;
          const a = li < 2 ? 1 : rise(seg(t, at, at + 0.5));
          html += `<div class="ln" style="opacity:${a};transform:translateY(${(1 - a) * 10}px)">${esc(text) || "&#8203;"}</div>`;
        });
        $("phBody").innerHTML = html;
        $("phChars").textContent = `${t < 32.6 ? LINES[0].length : chars} caracteres`;
        setSync($("syncP"), $("syncPLabel"), t);

        $("link").style.opacity = 1 - outK;
        const b = bloom(seg(t, 32.5, 33.15));
        $("linkBloom").setAttribute("transform", `rotate(${b.r}) scale(${t < 32.5 ? 0 : b.s})`);
        const halo = t < 32.5 ? 0 : lerp(1, 0.45 + 0.1 * Math.sin((t - 33) * 2.4), seg(t, 32.9, 33.8)) * seg(t, 32.5, 32.75);
        $("linkHalo").style.opacity = halo;
        $("linkHalo").setAttribute("r", 60 + 60 * grow(seg(t, 32.5, 33.2)));
      }
    } else {
      show($("phoneWrap"), false);
      show($("link"), false);
    }

    // ---- 37.5-40 s: Dashnotes, then a whole wall of stained glass.
    const dashOn = t >= 37.5 && t < 39.85;
    show($("dashWrap"), dashOn);
    if (dashOn) {
      const k = grow(seg(t, 37.5, 38.1));
      const z = io(seg(t, 39.0, 39.85));
      const s = 1.4 * lerp(0.94, 1, k) * (1 + 1.5 * z);
      const d = $("dashWrap");
      d.style.transform = `translate(${960 - 440}px, ${480 - 300 + (1 - k) * 34 + z * 300}px) scale(${s})`;
      d.style.opacity = k * (1 - seg(t, 39.25, 39.8));
      $("dashLamp").style.boxShadow = "0 0 16px 2px var(--glow)";
      [...d.querySelectorAll(".dash-folder")].forEach((el, i) => {
        const at = 37.82 + i * 0.085;
        const a = rise(seg(t, at, at + 0.4));
        const lit = Math.max(0, 1 - Math.abs(t - (38.55 + i * 0.09)) / 0.45);
        el.style.opacity = a;
        el.style.transform = `translateY(${(1 - a) * 16 - lit * 3}px)`;
        el.style.boxShadow = `0 0 ${8 + 16 * lit}px rgba(236,190,90,${0.18 + 0.45 * lit})`;
        el.style.filter = `brightness(${1 + 0.1 * lit})`;
      });
      [...d.querySelectorAll(".dash-note")].forEach((el, i) => {
        const at = 38.2 + i * 0.07;
        const a = rise(seg(t, at, at + 0.4));
        el.style.opacity = a;
        el.style.transform = `translateY(${(1 - a) * 16}px)`;
      });
    }

    const wallOn = t >= 39.05 && t < 40.85;
    show($("glassWall"), wallOn);
    if (wallOn) {
      for (const g of GW) {
        const at = 39.1 + g.d * 0.42;
        const a = grow(seg(t, at, at + 0.42));
        // On the last chord every pane folds back into the medallion.
        const c = in2(seg(t, 40.0 + (1 - g.d) * 0.1, 40.62 + (1 - g.d) * 0.1));
        const x = lerp(g.x, 960 - 100, c);
        const y = lerp(g.y, 385 - 150, c);
        const glow = 0.75 + 0.25 * Math.sin(t * 3 + g.d * 9);
        g.el.style.transform = `translate(${x}px, ${y}px) scale(${lerp(0.7, 1, a) * (1 - 0.92 * c)})`;
        g.el.style.opacity = a * (1 - seg(c, 0.75, 1));
        g.el.style.boxShadow = `0 0 ${34 * glow}px rgba(236,190,90,${0.42 * glow})`;
        g.el.style.filter = `brightness(${1 + 0.5 * c})`;
      }
    }

    // ---- 40-45 s: the medallion, the name, the last line.
    const fin = $("final");
    show(fin, t >= 40.2);
    if (t >= 40.2) {
      fin.style.transform = `scale(${1 + 0.03 * seg(t, 40.2, 45)})`;
      const b = bloom(seg(t, 40.35, 41.1));
      const med = $("med2");
      med.style.left = "795px";
      med.style.top = "220px";
      med.style.opacity = t < 40.35 ? 0 : b.o;
      med.style.transform = `scale(${b.s}) rotate(${b.r}deg)`;
      const lf = grow(seg(t, 40.85, 41.35));
      $("med2Leaf").setAttribute("transform", `translate(31 -27) rotate(${32 + (1 - lf) * 50}) scale(${lf})`);
      const g = grow(seg(t, 40.45, 41.2));
      $("finalGlow").style.opacity = g * (0.8 + 0.2 * Math.sin((t - 41) * 1.6));
      $("finalGlow").style.transform = `scale(${0.4 + 0.6 * g})`;
      const a = rise(seg(t, 41.1, 41.85));
      $("finalTitle").style.opacity = a;
      $("finalTitle").style.transform = `translateY(${(1 - a) * 22}px)`;
      const c = rise(seg(t, 42.1, 42.8));
      $("finalSub").style.opacity = c;
      $("finalSub").style.transform = `translateY(${(1 - c) * 16}px)`;
    }

    // Captions.
    const cap = CAPTIONS.find(([a, b]) => t >= a && t < b);
    const capEl = $("caption");
    show(capEl, !!cap);
    if (cap) {
      const a = rise(seg(t, cap[0], cap[0] + 0.4));
      const o = seg(t, cap[1] - 0.25, cap[1]);
      $("capText").textContent = cap[2];
      capEl.style.opacity = a * (1 - o);
      capEl.style.transform = `translateY(${(1 - a) * 12}px)`;
    }
  }

  window.DURATION = DURATION;
  window.seek = (t) => render(Math.max(0, Math.min(DURATION, t)));
  window.ready = document.fonts.ready
    .then(() =>
      Promise.all(
        ['400 20px Marcellus', '400 20px Jost', '500 20px Jost', '600 20px Jost', '400 20px "JetBrains Mono"', '400 20px "Literata Variable"', 'italic 400 20px "Literata Variable"'].map(
          (f) => document.fonts.load(f, "Aaçã—"),
        ),
      ),
    )
    .then(() => {
      const q = new URLSearchParams(location.search);
      if (q.has("play")) {
        const start = performance.now() - (+q.get("play") || 0) * 1000;
        const tick = () => {
          const t = (performance.now() - start) / 1000;
          window.seek(t);
          if (t < DURATION) requestAnimationFrame(tick);
        };
        tick();
      } else window.seek(+q.get("t") || 0);
      return true;
    });
})();
