import { useEffect, useRef } from "react";

export const DRAW_COLORS = [
  { name: "Verde-folha", hex: "#4E8A4A" },
  { name: "Azul-petróleo", hex: "#2E6F7C" },
  { name: "Terracota", hex: "#A65A3A" },
  { name: "Âmbar", hex: "#C98A2E" },
];

const MAX_WIDTH = 3.2;
const MIN_WIDTH = 1.1;
const WIDTH_SMOOTHING = 0.35;
const INK_ALPHA = 0.86;
const TAPER_STEPS = 6;
const TAPER_LENGTH = 9;
const TAPER_SHRINK = 0.7;

// The inserted image is cropped to what was actually drawn, plus this margin.
const CROP_PADDING = 8;
// Where an existing sketch is placed on the canvas when reopened for editing.
const EDIT_ORIGIN = { x: 24, y: 20 };

type Point = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

type Props = {
  open: boolean;
  drawColor: string;
  onSetColor: (c: string) => void;
  onCancel: () => void;
  /** Receives the drawing cropped to its bounding box, and that crop's width in CSS pixels. */
  onInsert: (canvas: HTMLCanvasElement, width: number) => void;
  /** When set, the canvas opens pre-loaded with this sketch instead of blank, for editing. */
  initialImage?: string;
  /** Display width of `initialImage` in the note, so it reopens at the same size. */
  initialWidth?: number;
};

export function DrawingOverlay({
  open,
  drawColor,
  onSetColor,
  onCancel,
  onInsert,
  initialImage,
  initialWidth,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cssSize = useRef({ w: 0, h: 0 });
  const points = useRef<Point[]>([]);
  const currentWidth = useRef(MAX_WIDTH * 0.6);
  // Bounding box of everything on the canvas, in CSS pixels - null while blank.
  const bbox = useRef<Box | null>(null);

  const grow = (x0: number, y0: number, x1: number, y1: number) => {
    const b = bbox.current;
    bbox.current = b
      ? { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) }
      : { x0, y0, x1, y1 };
  };
  const growAround = (p: Point, r: number) => grow(p.x - r, p.y - r, p.x + r, p.y + r);

  // Keep the canvas's real pixel buffer matching its displayed CSS size (at
  // device pixel ratio) instead of the fixed 360x200 it used to render at -
  // that mismatch (stretched via CSS) was the actual source of the
  // "pixelated" look, not the icon.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      if (points.current.length > 0) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.width === cssSize.current.w && rect.height === cssSize.current.h) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      cssSize.current = { w: rect.width, h: rect.height };
      bbox.current = null; // resizing the pixel buffer wipes the canvas
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Each time the overlay opens, start from a clean canvas - editing an
  // existing sketch loads its image at the size it has in the note; a
  // brand-new sketch stays blank instead of showing whatever was left over
  // from a prior session.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, cssSize.current.w, cssSize.current.h);
    bbox.current = null;
    if (!initialImage) return;
    const img = new Image();
    img.onload = () => {
      const cw = cssSize.current.w - EDIT_ORIGIN.x;
      const ch = cssSize.current.h - EDIT_ORIGIN.y;
      const wanted = initialWidth ?? img.width;
      const scale = Math.min(wanted / img.width, cw / img.width, ch / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.globalAlpha = 1;
      ctx.drawImage(img, EDIT_ORIGIN.x, EDIT_ORIGIN.y, w, h);
      grow(EDIT_ORIGIN.x, EDIT_ORIGIN.y, EDIT_ORIGIN.x + w, EDIT_ORIGIN.y + h);
    };
    img.src = initialImage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialImage]);

  const posFromEvent = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const dot = (p: Point) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalAlpha = INK_ALPHA;
    ctx.fillStyle = drawColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, currentWidth.current / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  // Smooths freehand input into a soft, continuous stroke - like a signature
  // pad, every new point curves through a rolling window of the last three
  // samples (midpoint -> real point -> midpoint) instead of connecting raw
  // points with straight (faceted) segments, and the line width eases toward
  // a speed-based target so fast strokes taper thin and slow ones stay
  // fuller - closer to a real pen's feel than a flat, straight-edged line.
  const drawSegment = () => {
    const ctx = canvasRef.current?.getContext("2d");
    const pts = points.current;
    const n = pts.length;
    if (!ctx || n < 3) return;
    const p0 = pts[n - 3];
    const p1 = pts[n - 2];
    const p2 = pts[n - 1];
    const start = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const end = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const targetWidth = Math.max(MIN_WIDTH, MAX_WIDTH - dist * 0.25);
    currentWidth.current += (targetWidth - currentWidth.current) * WIDTH_SMOOTHING;

    ctx.globalAlpha = INK_ALPHA;
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = currentWidth.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(p1.x, p1.y, end.x, end.y);
    ctx.stroke();
  };

  // Tapers the last bit of the stroke down to a point instead of ending
  // abruptly at whatever width was last drawn - like lifting a real pen off
  // the page, and softens fast strokes that end thin-but-square.
  const taperEnd = () => {
    const ctx = canvasRef.current?.getContext("2d");
    const pts = points.current;
    if (!ctx || pts.length < 2) return;
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const dirX = (p2.x - p1.x) / len;
    const dirY = (p2.y - p1.y) / len;
    const stepLen = TAPER_LENGTH / TAPER_STEPS;

    let x = p2.x;
    let y = p2.y;
    let width = currentWidth.current;
    ctx.globalAlpha = INK_ALPHA;
    ctx.strokeStyle = drawColor;
    ctx.lineCap = "round";
    for (let i = 0; i < TAPER_STEPS; i++) {
      const nx = x + dirX * stepLen;
      const ny = y + dirY * stepLen;
      width *= TAPER_SHRINK;
      ctx.lineWidth = Math.max(width, 0.4);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      x = nx;
      y = ny;
    }
  };

  // Mouse listeners live on the window (not just the canvas) for the
  // duration of a stroke, so a fast drag that briefly leaves the canvas
  // bounds keeps drawing instead of the stroke silently cutting off.
  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = posFromEvent(e);
    points.current = [pos];
    currentWidth.current = MAX_WIDTH * 0.6;
    growAround(pos, MAX_WIDTH);

    const onMove = (ev: MouseEvent) => {
      const p = posFromEvent(ev);
      points.current.push(p);
      growAround(p, MAX_WIDTH);
      drawSegment();
    };
    const endStroke = () => {
      const last = points.current[points.current.length - 1];
      if (points.current.length > 2) {
        taperEnd();
        growAround(last, TAPER_LENGTH);
      } else if (points.current.length > 0) dot(points.current[0]);
      points.current = [];
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", endStroke);
      window.removeEventListener("blur", endStroke);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", endStroke);
    // If the mouse button is released outside this window entirely (e.g. the
    // drag ends over another app), we'll never see that mouseup - losing
    // focus is the fallback signal to stop the stroke instead of leaving it
    // stuck "drawing" until the next click.
    window.addEventListener("blur", endStroke);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, cssSize.current.w, cssSize.current.h);
    bbox.current = null;
  };

  // Hands over only the part of the canvas that was drawn on (plus a small
  // margin), so the sketch lands in the note as a tight image instead of a
  // canvas-sized sheet that's mostly empty.
  const insert = () => {
    const canvas = canvasRef.current;
    const b = bbox.current;
    if (!canvas || !b) {
      onCancel();
      return;
    }
    const dpr = canvas.width / cssSize.current.w || 1;
    const sx = Math.max(0, b.x0 - CROP_PADDING);
    const sy = Math.max(0, b.y0 - CROP_PADDING);
    const w = Math.min(cssSize.current.w, b.x1 + CROP_PADDING) - sx;
    const h = Math.min(cssSize.current.h, b.y1 + CROP_PADDING) - sy;
    if (w < 1 || h < 1) {
      onCancel();
      return;
    }
    const crop = document.createElement("canvas");
    crop.width = Math.round(w * dpr);
    crop.height = Math.round(h * dpr);
    crop.getContext("2d")?.drawImage(canvas, sx * dpr, sy * dpr, w * dpr, h * dpr, 0, 0, crop.width, crop.height);
    onInsert(crop, w);
    clearCanvas();
  };

  return (
    <div className={"overlay" + (open ? " open" : "")}>
      <div className="overlay-header">
        <span className="overlay-title">Note Styling</span>
        <span className="overlay-subtitle">caderno de botânica</span>
      </div>
      <canvas ref={canvasRef} className="draw-canvas" onMouseDown={onDown} />
      <div className="overlay-footer">
        <div className="swatches">
          {DRAW_COLORS.map((c) => (
            <button
              key={c.hex}
              title={c.name}
              className={"swatch" + (drawColor === c.hex ? " selected" : "")}
              style={{ background: c.hex }}
              onClick={() => onSetColor(c.hex)}
            />
          ))}
        </div>
        <div className="cy-spacer" />
        <button className="pill ghost" onClick={clearCanvas}>
          Limpar
        </button>
        <button className="pill" onClick={onCancel}>
          Cancelar
        </button>
        <button className="pill primary" onClick={insert}>
          Inserir no texto
        </button>
      </div>
    </div>
  );
}
