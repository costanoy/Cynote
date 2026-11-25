/* Cynote site script. Built into docs/assets/site.js with esbuild from the
   desktop app's node_modules, so the page runs the app's own editor
   extensions (desktop/src/editor/extensions.ts) and keymap:

     cd desktop
     NODE_PATH=node_modules npx esbuild ../docs/src/site.ts --bundle --format=esm \
       --minify --target=es2020 --outfile=../docs/assets/site.js

   (PowerShell: $env:NODE_PATH="node_modules"; npx esbuild ...)
   Everything here is progressive: without it the page reads complete. */

import { EditorView, keymap, lineNumbers, placeholder, type Panel } from "@codemirror/view";
import { EditorSelection, EditorState, Prec, type Extension } from "@codemirror/state";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";
import {
  buildExtensions,
  configEffects,
  newCompartments,
  selectionInfo,
  type EditorConfig,
  type SelectionInfo,
} from "../../desktop/src/editor/extensions";

const root = document.documentElement;
const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) => from.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) =>
  Array.from(from.querySelectorAll<T>(sel));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const fmt = new Intl.NumberFormat("pt-BR");

/* ----------------------------------------------------------------- theme */

const THEME_KEY = "cynote-tema";
const darkListeners = new Set<(dark: boolean) => void>();
const isDark = () => root.dataset.theme === "dark";

function applyTheme(dark: boolean) {
  root.dataset.theme = dark ? "dark" : "light";
  for (const b of $$("[data-theme-toggle]")) {
    b.setAttribute("aria-pressed", String(dark));
  }
  darkListeners.forEach((f) => f(dark));
}
applyTheme(isDark());
for (const b of $$("[data-theme-toggle]")) {
  b.addEventListener("click", () => {
    const dark = !isDark();
    applyTheme(dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* private mode: the choice lasts this visit */
    }
  });
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    /* ignore */
  }
  if (saved !== "light" && saved !== "dark") applyTheme(e.matches);
});

/* ------------------------------------------------- tabs follow the reader */

const tabs = $$<HTMLAnchorElement>(".tabs .tab");
const tabSections = tabs
  .map((t) => ({ tab: t, section: document.getElementById(t.hash.slice(1)) }))
  .filter((x): x is { tab: HTMLAnchorElement; section: HTMLElement } => !!x.section);
let spyQueued = false;
function spy() {
  spyQueued = false;
  const line = window.innerHeight * 0.35;
  let current: HTMLAnchorElement | null = null;
  for (const { tab, section } of tabSections) {
    if (section.getBoundingClientRect().top <= line) current = tab;
  }
  // Baixar sits between Recursos and Perguntas without a tab of its own.
  const get = document.getElementById("baixar");
  const faq = document.getElementById("perguntas");
  if (get && faq && get.getBoundingClientRect().top <= line && faq.getBoundingClientRect().top > line) current = null;
  for (const t of tabs) {
    if (t === current) t.setAttribute("aria-current", "location");
    else t.removeAttribute("aria-current");
  }
}
addEventListener(
  "scroll",
  () => {
    if (!spyQueued) {
      spyQueued = true;
      requestAnimationFrame(spy);
    }
  },
  { passive: true },
);
addEventListener("resize", spy);
spy();

/* One primary action per view: the strip's Baixar steps aside while a
   cover-green download button is on screen. */
const stripCta = $(".strip-cta");
const coverDownloads = $$(".actions .btn");
if (stripCta && coverDownloads.length && "IntersectionObserver" in window) {
  const seen = new Set<Element>();
  // The cover download: Windows on a wide screen, Android on a phone (site.css).
  const phone = matchMedia("(max-width: 899px)");
  const isCover = (el: Element) => el.matches(phone.matches ? ".dl-android" : ".btn-primary");
  phone.addEventListener("change", () => sync());
  const sync = () => {
    const aside = [...seen].some(isCover);
    stripCta.classList.toggle("aside", aside);
    if (aside) stripCta.setAttribute("tabindex", "-1");
    else stripCta.removeAttribute("tabindex");
    stripCta.setAttribute("aria-hidden", String(aside));
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target);
        else seen.delete(e.target);
      }
      sync();
    },
    { rootMargin: "-48px 0px -28px 0px" },
  );
  coverDownloads.forEach((b) => io.observe(b));
  darkListeners.add(sync);
  addEventListener("resize", sync);
}

/* ------------------------------------------------------------ small menu */

const menuBtn = $<HTMLButtonElement>(".menu-btn");
const menu = $("#menu");
if (menuBtn && menu) {
  const close = (focusBack: boolean) => {
    menu.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    if (focusBack) menuBtn.focus();
  };
  menuBtn.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) $("a", menu)?.focus();
  });
  menu.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a")) close(false);
  });
  menu.addEventListener("keydown", (e) => {
    const items = $$<HTMLAnchorElement>("a", menu);
    const i = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && !menuBtn.contains(e.target as Node)) close(false);
  });
}

/* ------------------------------------------------------------------ band */

type SyncState = "syncing" | "synced";
function showSync(state: SyncState) {
  for (const el of $$("[data-sync]")) {
    $("use", el)?.setAttribute("href", state === "synced" ? "#i-cloud-ok" : "#i-cloud-sync");
    const text = $("[data-sync-text]", el);
    if (text) text.textContent = state === "synced" ? "Sincronizado" : "Sincronizando…";
  }
}
function chars(n: number) {
  return fmt.format(n) + (n === 1 ? " caractere" : " caracteres");
}
function posText(info: SelectionInfo, lineOffset: number) {
  if (info.selections > 1) return `${info.selections} cursores`;
  const sel = info.selectedChars;
  return (
    `Ln ${info.line + lineOffset}, Col ${info.col}` + (sel > 0 ? ` (${fmt.format(sel)} selecionado${sel === 1 ? "" : "s"})` : "")
  );
}
const bandPos = $("[data-band-pos]");
const bandCount = $("[data-band-count]");

/* ------------------------------------------------------------ find widget */

type FindMode = "find" | "replace" | "goto";
interface FindCtl {
  setMode(mode: FindMode): void;
}
const finds = new WeakMap<EditorView, FindCtl>();

function icon(name: string) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "ico");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", "#" + name);
  svg.append(use);
  return svg;
}
function button(cls: string, label: string, content: Node | string) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "find-btn " + cls;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.append(content);
  return b;
}

function matchCount(state: EditorState, query: SearchQuery) {
  if (!query.valid) return { total: 0, current: 0 };
  const sel = state.selection.main;
  const cursor = query.getCursor(state) as Iterator<{ from: number; to: number }>;
  let total = 0;
  let current = 0;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    total++;
    if (r.value.from === sel.from && r.value.to === sel.to) current = total;
    if (total >= 9999) break;
  }
  return { total, current };
}

function createFind(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "cy-find-host";
  const bar = document.createElement("div");
  bar.className = "find-bar";
  bar.setAttribute("role", "search");
  dom.append(bar);

  const findRow = document.createElement("div");
  findRow.className = "find-row";
  const toggle = button("toggle", "Mostrar substituir", icon("i-chevron"));
  const input = document.createElement("input");
  input.className = "find-input";
  input.placeholder = "Localizar";
  input.setAttribute("aria-label", "Localizar");
  input.setAttribute("main-field", "true");
  input.spellcheck = false;
  const caseBtn = button("case", "Diferenciar maiúsculas", "Aa");
  caseBtn.setAttribute("aria-pressed", "false");
  const status = document.createElement("span");
  status.className = "find-status";
  status.setAttribute("aria-live", "polite");
  const prev = button("", "Anterior (Shift+Enter)", icon("i-chevron-down"));
  (prev.firstChild as SVGElement).style.transform = "rotate(180deg)";
  const next = button("", "Próximo (Enter)", icon("i-chevron-down"));
  const close = button("", "Fechar (Esc)", closeIcon());
  findRow.append(toggle, input, caseBtn, status, prev, next, close);

  const replaceRow = document.createElement("div");
  replaceRow.className = "find-row replace";
  const replInput = document.createElement("input");
  replInput.className = "find-input";
  replInput.placeholder = "Substituir por";
  replInput.setAttribute("aria-label", "Substituir por");
  replInput.spellcheck = false;
  const replOne = button("text", "Substituir", "Substituir");
  const replAll = button("text", "Substituir todas", "Tudo");
  replaceRow.append(replInput, replOne, replAll);

  const gotoRow = document.createElement("div");
  gotoRow.className = "find-row goto";
  const gotoInput = document.createElement("input");
  gotoInput.className = "find-input";
  gotoInput.inputMode = "numeric";
  gotoInput.setAttribute("aria-label", "Ir para a linha");
  const gotoClose = button("", "Fechar (Esc)", closeIcon());
  gotoRow.append(gotoInput, gotoClose);

  bar.append(findRow, replaceRow, gotoRow);

  let mode: FindMode = "find";
  let caseSensitive = false;

  const query = () => new SearchQuery({ search: input.value, caseSensitive, replace: replInput.value });
  const refresh = () => {
    if (mode === "goto") return;
    const q = getSearchQuery(view.state);
    if (!q.search) {
      status.textContent = "";
      status.classList.remove("none");
      return;
    }
    const { total, current } = matchCount(view.state, q);
    status.classList.toggle("none", total === 0);
    status.textContent =
      total === 0 ? "Nenhum resultado" : current ? `${current} de ${total}` : `${total} ${total === 1 ? "resultado" : "resultados"}`;
  };
  const apply = (selectNearest: boolean) => {
    const q = query();
    view.dispatch({ effects: setSearchQuery.of(q) });
    if (selectNearest && q.valid) {
      const from = view.state.selection.main.from;
      let hit = (q.getCursor(view.state, from) as Iterator<{ from: number; to: number }>).next();
      if (hit.done) hit = (q.getCursor(view.state) as Iterator<{ from: number; to: number }>).next();
      if (!hit.done) {
        view.dispatch({ selection: EditorSelection.single(hit.value.from, hit.value.to), scrollIntoView: true });
      }
    }
    refresh();
  };
  const shut = () => {
    closeSearchPanel(view);
    view.focus();
  };
  const render = () => {
    findRow.hidden = mode === "goto";
    replaceRow.hidden = mode !== "replace";
    gotoRow.hidden = mode !== "goto";
    toggle.setAttribute("aria-expanded", String(mode === "replace"));
    gotoInput.placeholder = `Ir para a linha (1 a ${view.state.doc.lines})`;
  };
  const ctl: FindCtl = {
    setMode(m) {
      mode = m;
      render();
      if (m === "goto") {
        gotoInput.value = "";
        gotoInput.focus();
      } else {
        const q = getSearchQuery(view.state);
        if (q.search && q.search !== input.value) input.value = q.search;
        (m === "replace" && input.value ? replInput : input).focus();
        input.select();
        refresh();
      }
    },
  };
  finds.set(view, ctl);

  input.addEventListener("input", () => apply(true));
  replInput.addEventListener("input", () => apply(false));
  caseBtn.addEventListener("click", () => {
    caseSensitive = !caseSensitive;
    caseBtn.setAttribute("aria-pressed", String(caseSensitive));
    apply(true);
  });
  toggle.addEventListener("click", () => ctl.setMode(mode === "replace" ? "find" : "replace"));
  prev.addEventListener("click", () => {
    findPrevious(view);
    refresh();
  });
  next.addEventListener("click", () => {
    findNext(view);
    refresh();
  });
  close.addEventListener("click", shut);
  gotoClose.addEventListener("click", shut);
  replOne.addEventListener("click", () => {
    apply(false);
    replaceNext(view);
    refresh();
  });
  replAll.addEventListener("click", () => {
    apply(false);
    replaceAll(view);
    refresh();
  });
  const keys = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === "Escape") {
      e.preventDefault();
      shut();
    } else if (ctrl && !e.altKey && (k === "f" || k === "h" || k === "g")) {
      e.preventDefault();
      ctl.setMode(k === "f" ? "find" : k === "h" ? "replace" : "goto");
    }
  };
  bar.addEventListener("keydown", keys);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) findPrevious(view);
      else findNext(view);
      refresh();
    }
  });
  replInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) replaceAll(view);
      else replaceNext(view);
      refresh();
    }
  });
  gotoInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const n = parseInt(gotoInput.value, 10);
    if (!Number.isFinite(n)) return;
    const line = view.state.doc.line(Math.min(Math.max(n, 1), view.state.doc.lines));
    closeSearchPanel(view);
    view.dispatch({ selection: EditorSelection.cursor(line.from), scrollIntoView: true });
    view.focus();
  });

  return {
    dom,
    top: true,
    mount() {
      render();
      if (mode !== "goto") {
        input.value = getSearchQuery(view.state).search;
        input.focus();
        input.select();
        refresh();
      }
    },
    update(u) {
      if (u.docChanged || u.selectionSet || u.transactions.some((t) => t.effects.some((ef) => ef.is(setSearchQuery)))) refresh();
    },
    destroy() {
      finds.delete(view);
    },
  };
}
function closeIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "ico");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", "M4 4l8 8M12 4l-8 8");
  svg.append(p);
  return svg;
}

function openFind(view: EditorView, mode: FindMode) {
  if (!searchPanelOpen(view.state)) openSearchPanel(view);
  finds.get(view)?.setMode(mode);
  return true;
}
const findKeys = Prec.highest(
  keymap.of([
    { key: "Mod-f", run: (v) => openFind(v, "find"), preventDefault: true },
    { key: "Mod-h", run: (v) => openFind(v, "replace"), preventDefault: true },
    { key: "Mod-g", run: (v) => openFind(v, "goto"), preventDefault: true },
    {
      key: "F3",
      run: (v) => (searchPanelOpen(v.state) ? findNext(v) : false),
      shift: (v) => (searchPanelOpen(v.state) ? findPrevious(v) : false),
      preventDefault: true,
    },
    {
      key: "Escape",
      run: (v) => {
        if (!searchPanelOpen(v.state)) return false;
        closeSearchPanel(v);
        return true;
      },
    },
  ]),
);

/* --------------------------------------------------------- note editors */

interface NoteOptions {
  host: HTMLElement;
  doc: string;
  label: string;
  numbersFrom: number;
  placeholder?: string;
  wrap?: boolean;
  onText?: (text: string) => void;
  onInfo?: (info: SelectionInfo, view: EditorView) => void;
  onWrap?: (wrap: boolean) => void;
}

let activeView: EditorView | null = null;
const reporters = new WeakMap<EditorView, () => void>();

function mountNote(o: NoteOptions) {
  const comps = newCompartments();
  let cfg: EditorConfig = { lineNumbers: true, wordWrap: o.wrap ?? true, spellCheck: false, darkMode: isDark() };
  let view!: EditorView;
  const host = {
    textChanged: (text: string) => o.onText?.(text),
    selectionChanged: (info: SelectionInfo) => o.onInfo?.(info, view),
    layoutChanged: () => {},
    toggleWordWrap: () => {
      cfg = { ...cfg, wordWrap: !cfg.wordWrap };
      view.dispatch({ effects: configEffects(comps, cfg) });
      o.onWrap?.(cfg.wordWrap);
    },
    createFindPanel: createFind,
  };
  const ext: Extension[] = [
    buildExtensions(host, cfg, comps),
    findKeys,
    Prec.highest(EditorView.contentAttributes.of({ "aria-label": o.label })),
    EditorView.domEventHandlers({
      focus: () => {
        activeView = view;
        reporters.get(view)?.();
      },
    }),
  ];
  if (o.numbersFrom > 1) ext.push(lineNumbers({ formatNumber: (n) => String(n + o.numbersFrom - 1) }));
  if (o.placeholder) ext.push(placeholder(o.placeholder));
  o.host.textContent = "";
  view = new EditorView({ state: EditorState.create({ doc: o.doc, extensions: ext }), parent: o.host });
  darkListeners.add((dark) => {
    cfg = { ...cfg, darkMode: dark };
    view.dispatch({ effects: configEffects(comps, cfg) });
  });
  return {
    view,
    toggleWrap: host.toggleWordWrap,
  };
}

/* The hero: the page's own note. What you write reaches the device beside
   it after a beat, the way a sync cycle would. Nothing leaves the browser. */
const HEAD = "Suas notas,\na um atalho de distância.\n\n";
const heroHost = $("[data-note='hero']");
const mirrors = $$("[data-mirror]");
const mirrorCounts = $$("[data-mirror-count]");
let heroText = "";
let syncTimer = 0;

function paintMirror() {
  const text = HEAD + heroText;
  for (const m of mirrors) m.textContent = text;
  for (const c of mirrorCounts) c.textContent = chars(text.length);
  showSync("synced");
}
paintMirror();

if (heroHost) {
  const hero = mountNote({
    host: heroHost,
    doc: "",
    label: heroHost.dataset.label ?? "Nota",
    numbersFrom: Number(heroHost.dataset.from ?? 1),
    placeholder: heroHost.dataset.placeholder,
    onText: (text) => {
      heroText = text;
      showSync("syncing");
      if (bandCount && activeView === hero.view) bandCount.textContent = chars(HEAD.length + text.length);
      clearTimeout(syncTimer);
      syncTimer = window.setTimeout(paintMirror, reduceMotion.matches ? 250 : 900);
    },
    onInfo: (info, view) => {
      if (view !== activeView) return;
      report(view);
    },
  });
  const report = (view: EditorView) => {
    const info = selectionInfo(view.state);
    if (bandPos) bandPos.textContent = posText(info, 3);
    if (bandCount) bandCount.textContent = chars(HEAD.length + view.state.doc.length);
  };
  reporters.set(hero.view, () => report(hero.view));
  activeView = hero.view;
  report(hero.view);
}

/* Edição: a page from the app, at the app's own scale, to try the keys on. */
const editHost = $("[data-note='edit']");
if (editHost) {
  const fallback = $("pre", editHost);
  const sample = fallback?.textContent?.replace(/^\n/, "") ?? "";
  const wrapBtn = $<HTMLButtonElement>("[data-wrap-toggle]");
  const pos = $("[data-pos='edit']");
  const count = $("[data-count='edit']");
  const edit = mountNote({
    host: editHost,
    doc: sample,
    label: editHost.dataset.label ?? "Nota",
    numbersFrom: 1,
    onText: () => report(edit.view),
    onInfo: (_info, view) => report(view),
    onWrap: (wrap) => wrapBtn?.setAttribute("aria-pressed", String(wrap)),
  });
  const report = (view: EditorView) => {
    const info = selectionInfo(view.state);
    const p = posText(info, 0);
    const c = chars(view.state.doc.length);
    if (pos) pos.textContent = p;
    if (count) count.textContent = c;
    if (activeView === view) {
      if (bandPos) bandPos.textContent = p;
      if (bandCount) bandCount.textContent = c;
    }
  };
  reporters.set(edit.view, () => report(edit.view));
  report(edit.view);
  wrapBtn?.addEventListener("click", () => {
    edit.toggleWrap();
    edit.view.focus();
  });
}

/* ------------------------------------------------------------ the drawing */

const INKS: Record<string, [string, string]> = {
  ink: ["#2b2a22", "#efe7cf"],
  leaf: ["#3f7f45", "#93cc7d"],
  petrol: ["#28697a", "#80c6ce"],
  terracotta: ["#a7502e", "#ec926e"],
  amber: ["#c4861c", "#edbd58"],
};
type Tool = "pen" | "marker" | "eraser";
const SIZES: Record<Tool, number> = { pen: 3.2, marker: 16, eraser: 22 };
interface Stroke {
  tool: Tool;
  ink: string;
  pts: [number, number][];
}

const canvas = $<HTMLCanvasElement>(".sketch-canvas");
if (canvas) {
  const ctx = canvas.getContext("2d")!;
  const strokes: Stroke[] = [];
  const coarse = matchMedia("(pointer: coarse)").matches;
  let tool: Tool | null = coarse ? null : "pen";
  let ink = "ink";
  let current: Stroke | null = null;

  /* A sample drawing, made with the same tools: the decision highlighted,
     the time ringed. The note's text sits 12px down, 40px in, 24px rows,
     14px JetBrains Mono (8.4px a character). */
  const row = (n: number) => 12 + n * 24;
  const col = (n: number) => 40 + n * 8.4;
  const wobble = (i: number) => Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.53) * 0.9;
  const line = (x0: number, x1: number, y: number, step = 6): [number, number][] => {
    const pts: [number, number][] = [];
    for (let x = x0, i = 0; x <= x1; x += step, i++) pts.push([x, y + wobble(i)]);
    return pts;
  };
  const ring = (cx: number, cy: number, rx: number, ry: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 44; i++) {
      const a = -2.2 + (i / 40) * Math.PI * 2;
      const k = 1 + 0.05 * Math.sin(i * 0.9);
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  };
  strokes.push(
    { tool: "marker", ink: "amber", pts: line(col(0) - 2, col(19) + 2, row(7) + 12, 8) },
    { tool: "pen", ink: "terracotta", pts: ring((col(25) + col(29)) / 2, row(6) + 12, 26, 13) },
    { tool: "pen", ink: "terracotta", pts: line(col(4), col(19), row(6) + 22, 5) },
  );

  const color = (key: string) => INKS[key][isDark() ? 1 : 0];
  const paintSwatches = () => {
    for (const s of $$<HTMLButtonElement>(".swatch")) s.style.setProperty("--c", color(s.dataset.ink ?? "ink"));
  };
  const drawStroke = (s: Stroke) => {
    if (s.pts.length === 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = SIZES[s.tool];
    if (s.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000";
    } else {
      ctx.strokeStyle = color(s.ink);
      if (s.tool === "marker") ctx.globalAlpha = isDark() ? 0.3 : 0.34;
    }
    ctx.beginPath();
    const [x0, y0] = s.pts[0];
    ctx.moveTo(x0, y0);
    if (s.pts.length === 1) ctx.lineTo(x0 + 0.01, y0);
    for (let i = 1; i < s.pts.length - 1; i++) {
      const [x, y] = s.pts[i];
      const [nx, ny] = s.pts[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    if (s.pts.length > 1) ctx.lineTo(...s.pts[s.pts.length - 1]);
    ctx.stroke();
    ctx.restore();
  };
  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(s);
    if (current) drawStroke(current);
  };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  new ResizeObserver(resize).observe(canvas);
  darkListeners.add(() => {
    paintSwatches();
    redraw();
  });
  paintSwatches();

  const setTool = (t: Tool | null) => {
    tool = t;
    for (const b of $$<HTMLButtonElement>("[data-tool]")) b.setAttribute("aria-pressed", String(b.dataset.tool === t));
    canvas.classList.toggle("drawing", !!t);
  };
  setTool(tool);
  for (const b of $$<HTMLButtonElement>("[data-tool]")) {
    b.addEventListener("click", () => {
      const t = b.dataset.tool as Tool;
      setTool(coarse && tool === t ? null : t);
    });
  }
  for (const s of $$<HTMLButtonElement>(".swatch")) {
    s.addEventListener("click", () => {
      ink = s.dataset.ink ?? "ink";
      for (const o of $$(".swatch")) o.setAttribute("aria-checked", String(o === s));
      if (tool === "eraser" || tool === null) setTool("pen");
    });
  }
  $("[data-clear]")?.addEventListener("click", () => {
    strokes.length = 0;
    current = null;
    redraw();
  });

  const point = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (!tool || e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    current = { tool, ink, pts: [point(e)] };
    redraw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) current.pts.push(point(ev));
    redraw();
  });
  const end = () => {
    if (!current) return;
    strokes.push(current);
    current = null;
    redraw();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}
