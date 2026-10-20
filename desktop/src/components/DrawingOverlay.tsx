import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { DrawIcon, EraserIcon, MarkerIcon, RedoIcon, UndoIcon } from "../icons";
import {
  compactOps,
  drawOp,
  drawOps,
  eraserBounds,
  groupsApart,
  INKS,
  inkColor,
  isInkKey,
  mapOps,
  markerAlpha,
  nextPressure,
  opsBounds,
  overlaps,
  START_PRESSURE,
  TOOL_SIZES,
  type Box,
  type InkView,
} from "../ink";
import { placeAt, readNoteLayout, sketchRect, type NoteLayout } from "../noteLayout";
import { imagesFor } from "../sketchImages";
import type { InkKey, InkStroke, InkTool, NoteSketch, SketchOp } from "../types";

export interface DrawingOverlayHandle {
  /** Closes right away if nothing would be lost, otherwise asks first; `then`
   * runs once it has actually closed. */
  requestClose: (then?: () => void) => void;
}

/** A finished drawing, ready to be stored in the note. */
export type DrawingResult = Omit<NoteSketch, "id">;

type Props = {
  ref?: Ref<DrawingOverlayHandle>;
  open: boolean;
  /** The drawing being reopened, or null for a new one. */
  editing: NoteSketch | null;
  darkMode: boolean;
  onClose: () => void;
  /** Receives the drawings to keep - strokes far apart become separate ones,
   * so an empty list means everything in a reopened drawing was erased. */
  onInsert: (results: DrawingResult[]) => void;
};

const TOOLS: { tool: InkTool; name: string; key: string }[] = [
  { tool: "pen", name: "Pena", key: "P" },
  { tool: "marker", name: "Marca-texto", key: "M" },
  { tool: "eraser", name: "Borracha", key: "E" },
];
const SIZE_NAMES = ["Fino", "Médio", "Grosso"];

const PREFS_KEY = "cynote-ink";

interface InkPrefs {
  tool: InkTool;
  color: InkKey;
  /** 0, 1 or 2: thin, medium, thick. */
  size: number;
}

function loadPrefs(): InkPrefs {
  const fallback: InkPrefs = { tool: "pen", color: "ink", size: 1 };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<InkPrefs> | null;
    if (!saved) return fallback;
    return {
      // Opening straight into the eraser would just be confusing.
      tool: saved.tool === "marker" ? "marker" : "pen",
      color: isInkKey(saved.color) ? saved.color : fallback.color,
      size: saved.size === 0 || saved.size === 2 ? saved.size : 1,
    };
  } catch {
    return fallback;
  }
}

interface LiveStroke {
  stroke: InkStroke;
  pointerId: number;
  lastTime: number;
  lastPressure: number;
}

const PAD = 3;
const MAX_EDGE = 8192;
// Strokes closer than this (at the base text size) belong to the same drawing.
// Underlines on neighbouring lines stay apart; the letters of a word don't.
const GROUP_GAP = 16;

export function DrawingOverlay({ ref, open, editing, darkMode, onClose, onInsert }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const darkRef = useRef(darkMode);
  darkRef.current = darkMode;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // The drawing so far, in the note's own coordinates (px from the top-left
  // of the text column), so scrolling the note carries it along.
  const ops = useRef<SketchOp[]>([]);
  const initialOps = useRef<SketchOp[]>([]);
  const undoStack = useRef<SketchOp[][]>([]);
  const redoStack = useRef<SketchOp[][]>([]);
  const live = useRef<LiveStroke | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const layout = useRef<NoteLayout | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const dpr = useRef(1);
  // Everything but the stroke in progress, painted once per change instead of every frame.
  const committed = useRef<HTMLCanvasElement | null>(null);
  const committedValid = useRef(false);
  const frame = useRef(0);

  const [state, setState] = useState({ canUndo: false, canRedo: false, hasInk: false, imagesReady: true });
  const [drawing, setDrawing] = useState(false);
  const [confirming, setConfirming] = useState<{ then?: () => void } | null>(null);
  const confirmingRef = useRef(confirming);
  confirmingRef.current = confirming;

  const offset = () => {
    const l = layout.current;
    const c = canvasRef.current;
    if (!l || !c) return { x: 0, y: 0 };
    const row = l.row.getBoundingClientRect();
    const box = c.getBoundingClientRect();
    return { x: row.left - box.left, y: row.top - box.top };
  };

  const toNote = (e: { clientX: number; clientY: number }) => {
    const row = layout.current!.row.getBoundingClientRect();
    return { x: e.clientX - row.left, y: e.clientY - row.top };
  };

  const paintCursor = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const { tool, color, size } = prefsRef.current;
    const r = Math.max(TOOL_SIZES[tool][size] / 2, 1.6);
    const dark = darkRef.current;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (tool === "eraser") {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = dark ? "rgba(0, 0, 0, 0.45)" : "rgba(255, 253, 244, 0.8)";
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = dark ? "rgba(239, 231, 207, 0.9)" : "rgba(43, 42, 34, 0.8)";
      ctx.stroke();
    } else {
      ctx.globalAlpha = tool === "marker" ? markerAlpha(dark) : 0.75;
      ctx.fillStyle = inkColor(color, dark);
      ctx.fill();
    }
    ctx.restore();
  };

  const paint = () => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const off = offset();
    const view: InkView = { dark: darkRef.current, offsetX: off.x, offsetY: off.y, images: images.current };

    let layer = committed.current;
    if (!layer || layer.width !== canvas.width || layer.height !== canvas.height) {
      layer = document.createElement("canvas");
      layer.width = canvas.width;
      layer.height = canvas.height;
      committed.current = layer;
      committedValid.current = false;
    }
    if (!committedValid.current) {
      const lctx = layer.getContext("2d")!;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
      lctx.setTransform(dpr.current, 0, 0, dpr.current, 0, 0);
      drawOps(lctx, ops.current, view);
      committedValid.current = true;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(dpr.current, 0, 0, dpr.current, 0, 0);
    // A fresh object each frame: painted paths are cached per stroke object.
    if (live.current) drawOp(ctx, { ...live.current.stroke }, view);
    else if (hover.current) paintCursor(ctx, hover.current.x + off.x, hover.current.y + off.y);
  };

  const schedule = (repaintAll = false) => {
    if (repaintAll) committedValid.current = false;
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };

  const refreshState = () => {
    const { images: found, ready } = imagesFor(ops.current, () => {
      refreshState();
      schedule(true);
    });
    images.current = found;
    setState({
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
      hasInk: opsBounds(ops.current) !== null,
      imagesReady: ready,
    });
  };

  const commit = (next: SketchOp[]) => {
    undoStack.current.push(ops.current);
    redoStack.current = [];
    ops.current = next;
    refreshState();
    schedule(true);
  };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev || live.current) return;
    redoStack.current.push(ops.current);
    ops.current = prev;
    refreshState();
    schedule(true);
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next || live.current) return;
    undoStack.current.push(ops.current);
    ops.current = next;
    refreshState();
    schedule(true);
  };

  const clear = () => {
    if (ops.current.length > 0 && !live.current) commit([]);
  };

  // Each time it opens: a blank sheet over the note, or the drawing being
  // edited laid exactly where it sits in the note.
  useLayoutEffect(() => {
    if (!open) return;
    const l = readNoteLayout();
    layout.current = l;
    let start: SketchOp[] = [];
    if (editing && l) {
      const r = sketchRect(editing, l);
      start = editing.strokes
        ? mapOps(editing.strokes, r.width / (editing.naturalWidth ?? editing.width), r.left, r.top)
        : [{ tool: "image", src: editing.dataUrl, x: r.left, y: r.top, w: r.width, h: r.height }];
    }
    ops.current = start;
    initialOps.current = start;
    undoStack.current = [];
    redoStack.current = [];
    live.current = null;
    hover.current = null;
    setDrawing(false);
    setConfirming(null);
    refreshState();
    schedule(true);
    rootRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  // Keeps the canvas's pixels matching its size, and the drawing glued to the
  // note while it scrolls.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current!;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      dpr.current = ratio;
      layout.current = readNoteLayout() ?? layout.current;
      schedule(true);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const scroller = layout.current?.scroller;
    const onScroll = () => schedule(true);
    scroller?.addEventListener("scroll", onScroll);
    return () => {
      observer.disconnect();
      scroller?.removeEventListener("scroll", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The ink follows the theme; the pointer's preview follows the tool.
  useEffect(() => {
    if (open) schedule(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode]);
  useEffect(() => {
    if (open) schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  const wouldLoseWork = () => (editing ? ops.current !== initialOps.current : opsBounds(ops.current) !== null);

  const requestClose = (then?: () => void) => {
    if (live.current) return;
    if (wouldLoseWork()) {
      setConfirming({ then });
      return;
    }
    onCloseRef.current();
    then?.();
  };

  useImperativeHandle(ref, () => ({ requestClose }));

  const discard = () => {
    const then = confirmingRef.current?.then;
    setConfirming(null);
    onCloseRef.current();
    then?.();
  };

  const keepDrawing = () => {
    setConfirming(null);
    rootRef.current?.focus({ preventScroll: true });
  };

  const updatePrefs = (patch: Partial<InkPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // only a convenience
    }
  };

  // Picking a color while erasing goes back to whatever lays ink down.
  const pickColor = (color: InkKey) => updatePrefs({ color, tool: prefsRef.current.tool === "eraser" ? "pen" : prefsRef.current.tool });

  const insert = () => {
    if (live.current || !state.imagesReady) return;
    if (editing && ops.current === initialOps.current) {
      onCloseRef.current();
      return;
    }
    const l = readNoteLayout() ?? layout.current;
    if (!l) return;
    const results: DrawingResult[] = [];
    for (const group of groupsApart(ops.current, GROUP_GAP * l.factor)) {
      const result = finishDrawing(group, l, darkRef.current, images.current);
      if (result) results.push(result);
    }
    if (results.length === 0 && !editing) {
      onCloseRef.current();
      return;
    }
    onInsert(results);
  };

  // ------------------------------------------------------------- pointer

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (confirming || live.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!layout.current) layout.current = readNoteLayout();
    if (!layout.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rootRef.current?.focus({ preventScroll: true });
    const { tool, color, size } = prefsRef.current;
    const p = toNote(e);
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : START_PRESSURE;
    live.current = {
      stroke: { tool, color, size: TOOL_SIZES[tool][size], points: [p.x, p.y, pressure] },
      pointerId: e.pointerId,
      lastTime: e.timeStamp,
      lastPressure: pressure,
    };
    hover.current = null;
    setDrawing(true);
    schedule();
  };

  const addPoint = (ev: PointerEvent, straight: boolean) => {
    const l = live.current!;
    const pts = l.stroke.points;
    const p = toNote(ev);
    const n = pts.length;
    const moved = Math.hypot(p.x - pts[n - 3], p.y - pts[n - 2]);
    if (moved < 0.4 && !straight) return;
    const pressure =
      ev.pointerType === "pen" && ev.pressure > 0 ? ev.pressure : nextPressure(l.lastPressure, moved, ev.timeStamp - l.lastTime);
    l.lastTime = ev.timeStamp;
    l.lastPressure = pressure;
    if (straight) {
      // Shift draws a straight line from where the stroke started.
      const steady = pts[2];
      l.stroke.points = [pts[0], pts[1], steady, p.x, p.y, ev.pointerType === "pen" ? pressure : steady];
    } else {
      pts.push(p.x, p.y, pressure);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (!l) {
      if (layout.current && !confirming) {
        hover.current = toNote(e);
        schedule();
      }
      return;
    }
    if (e.pointerId !== l.pointerId) return;
    const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of coalesced.length > 0 ? coalesced : [e.nativeEvent]) addPoint(ev, e.shiftKey);
    schedule();
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const l = live.current;
    if (!l || e.pointerId !== l.pointerId) return;
    live.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrawing(false);
    const [stroke] = compactOps([l.stroke]);
    // An eraser pass over empty paper changes nothing - no need to undo it.
    if (stroke.tool === "eraser" && !overlaps(eraserBounds(stroke as InkStroke), opsBounds(ops.current))) {
      schedule();
      return;
    }
    commit([...ops.current, stroke]);
  };

  const onPointerLeave = () => {
    if (live.current) return;
    hover.current = null;
    schedule();
  };

  // The wheel scrolls the note underneath, so a long note can be drawn on
  // from top to bottom without closing.
  const onWheel = (e: React.WheelEvent) => {
    const scroller = layout.current?.scroller;
    if (!scroller || e.ctrlKey) return;
    scroller.scrollTop += e.deltaY;
    if (!live.current && layout.current) hover.current = toNote(e);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (confirming) keepDrawing();
      else requestClose();
      return;
    }
    if (confirming) return;
    const key = e.key.toLowerCase();
    if (mod && !e.altKey && key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && !e.altKey && key === "y") {
      e.preventDefault();
      redo();
    } else if (mod && e.key === "Enter") {
      e.preventDefault();
      insert();
    } else if (!mod && !e.altKey) {
      if (key === "p") updatePrefs({ tool: "pen" });
      else if (key === "m") updatePrefs({ tool: "marker" });
      else if (key === "e") updatePrefs({ tool: "eraser" });
      else if (key >= "1" && key <= "5" && key.length === 1) pickColor(INKS[Number(key) - 1].key);
      else if (key === "[") updatePrefs({ size: Math.max(0, prefsRef.current.size - 1) });
      else if (key === "]") updatePrefs({ size: Math.min(2, prefsRef.current.size + 1) });
      else return;
      e.preventDefault();
    }
  };

  const dark = darkMode;
  const canInsert = state.imagesReady && (editing !== null || state.hasInk);

  return (
    <div
      ref={rootRef}
      className={"overlay" + (open ? " open" : "") + (drawing ? " drawing" : "")}
      tabIndex={-1}
      aria-hidden={!open}
      onKeyDown={onKeyDown}
    >
      <canvas
        ref={canvasRef}
        className={"draw-canvas tool-" + prefs.tool}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      />

      <div className="overlay-header">
        <DrawIcon size={13} />
        <span className="overlay-title">Note Styling</span>
        <span className="overlay-subtitle">{editing ? "editando o desenho" : "caderno de botânica"}</span>
      </div>

      <div className="draw-dock">
        <div className="draw-group" role="radiogroup" aria-label="Ferramenta">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              className={"draw-tool" + (prefs.tool === t.tool ? " active" : "")}
              title={`${t.name} (${t.key})`}
              aria-label={t.name}
              aria-checked={prefs.tool === t.tool}
              role="radio"
              onClick={() => updatePrefs({ tool: t.tool })}
            >
              {t.tool === "pen" ? <DrawIcon size={15} /> : t.tool === "marker" ? <MarkerIcon /> : <EraserIcon />}
            </button>
          ))}
        </div>
        <span className="draw-sep" />
        <div className="draw-group" role="radiogroup" aria-label="Espessura">
          {SIZE_NAMES.map((name, i) => (
            <button
              key={name}
              className={"draw-size size-" + i + (prefs.size === i ? " active" : "")}
              title={`${name} (teclas [ e ])`}
              aria-label={name}
              aria-checked={prefs.size === i}
              role="radio"
              onClick={() => updatePrefs({ size: i })}
            >
              <i />
            </button>
          ))}
        </div>
        <span className="draw-sep" />
        <div className={"draw-group" + (prefs.tool === "eraser" ? " dimmed" : "")} role="radiogroup" aria-label="Cor">
          {INKS.map((ink, i) => (
            <button
              key={ink.key}
              className={"draw-swatch" + (prefs.color === ink.key ? " active" : "")}
              title={`${ink.name} (${i + 1})`}
              aria-label={ink.name}
              aria-checked={prefs.color === ink.key}
              role="radio"
              style={{ background: inkColor(ink.key, dark) }}
              onClick={() => pickColor(ink.key)}
            />
          ))}
        </div>
        <span className="draw-sep" />
        <div className="draw-group">
          <button className="draw-tool" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!state.canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button className="draw-tool" title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled={!state.canRedo} onClick={redo}>
            <RedoIcon />
          </button>
        </div>
        <div className="draw-actions">
          <button className="pill ghost" disabled={!state.hasInk} onClick={clear}>
            Limpar
          </button>
          <button className="pill" onClick={() => requestClose()}>
            Cancelar
          </button>
          <button className="pill primary" disabled={!canInsert} onClick={insert} title="Ctrl+Enter">
            {editing ? "Salvar desenho" : "Inserir na nota"}
          </button>
        </div>
      </div>

      {confirming && (
        <div className="draw-confirm" role="alertdialog" aria-label="Descartar o desenho?">
          <span>{editing ? "Descartar as mudanças no desenho?" : "Descartar este desenho?"}</span>
          <button className="pill" onClick={keepDrawing} autoFocus>
            Continuar desenhando
          </button>
          <button className="pill danger" onClick={discard}>
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}

/** Smallest box around every pixel with ink left in it, in canvas pixels. */
function inkedBox({ data, width, height }: ImageData): Box | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > 3) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

const tenth = (v: number) => Math.round(v * 10) / 10;

/**
 * The drawing as the note stores it: cropped to the ink that's actually left
 * (after erasing), placed where it was drawn, with its strokes measured from
 * that crop at the base text size - plus a picture of it for older versions.
 * Null when nothing is left.
 */
function finishDrawing(
  ops: SketchOp[],
  layout: NoteLayout,
  dark: boolean,
  images: ReadonlyMap<string, CanvasImageSource>
): DrawingResult | null {
  const bounds = opsBounds(ops);
  if (!bounds) return null;
  const w = bounds.x1 - bounds.x0 + PAD * 2;
  const h = bounds.y1 - bounds.y0 + PAD * 2;
  const scale = Math.min(Math.max(2, window.devicePixelRatio || 1), MAX_EDGE / w, MAX_EDGE / h);
  const ox = bounds.x0 - PAD;
  const oy = bounds.y0 - PAD;

  const probe = document.createElement("canvas");
  probe.width = Math.ceil(w * scale);
  probe.height = Math.ceil(h * scale);
  const pctx = probe.getContext("2d", { willReadFrequently: true })!;
  pctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawOps(pctx, ops, { dark, offsetX: -ox, offsetY: -oy, images });
  const ink = inkedBox(pctx.getImageData(0, 0, probe.width, probe.height));
  if (!ink) return null;

  const left = ox + ink.x0 / scale - PAD;
  const top = oy + ink.y0 / scale - PAD;
  const f = layout.factor;
  const width = tenth((ink.x1 - ink.x0) / scale / f + (PAD * 2) / f);
  const height = tenth((ink.y1 - ink.y0) / scale / f + (PAD * 2) / f);

  const picture = document.createElement("canvas");
  picture.width = Math.max(1, Math.round(width * f * scale));
  picture.height = Math.max(1, Math.round(height * f * scale));
  const ctx = picture.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawOps(ctx, ops, { dark, offsetX: -left, offsetY: -top, images });

  return {
    dataUrl: picture.toDataURL("image/png"),
    ...placeAt(layout, { left, top, width: width * f, height: height * f }),
    width,
    height,
    strokes: compactOps(mapOps(ops, 1 / f, -left / f, -top / f)),
    naturalWidth: width,
  };
}
