import { useEffect, useRef } from "react";

const COLORS_DARK = ["#ff8c3a", "#ffb02e", "#c1530a", "#f5eee6"];
const COLORS_LIGHT = ["#ff8c3a", "#ffb02e", "#c1530a", "#2a1a10"];

const MAX_WIDTH = 3.2;
const MIN_WIDTH = 1.1;
const WIDTH_SMOOTHING = 0.35;
const INK_ALPHA = 0.86;
const TAPER_STEPS = 6;
const TAPER_LENGTH = 9;
const TAPER_SHRINK = 0.7;

type Point = { x: number; y: number };

type Props = {
  open: boolean;
  darkMode: boolean;
  drawColor: string;
  onSetColor: (c: string) => void;
  onCancel: () => void;
  onInsert: (canvas: HTMLCanvasElement) => void;
};

export function DrawingOverlay({ open, darkMode, drawColor, onSetColor, onCancel, onInsert }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cssSize = useRef({ w: 0, h: 0 });
  const points = useRef<Point[]>([]);
  const currentWidth = useRef(MAX_WIDTH * 0.6);

  const colors = darkMode ? COLORS_DARK : COLORS_LIGHT;

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
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      cssSize.current = { w: rect.width, h: rect.height };
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

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

    const onMove = (ev: MouseEvent) => {
      points.current.push(posFromEvent(ev));
      drawSegment();
    };
    const endStroke = () => {
      if (points.current.length > 2) taperEnd();
      else if (points.current.length > 0) dot(points.current[0]);
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
  };

  return (
    <div className={"overlay" + (open ? " open" : "")}>
      <div className="overlay-header">
        <span className="overlay-title heading-font">Note Styling</span>
        <div style={{ flex: 1 }} />
        {colors.map((c) => (
          <button
            key={c}
            className={"swatch" + (drawColor === c ? " selected" : "")}
            style={{ background: c }}
            onClick={() => onSetColor(c)}
          />
        ))}
        <button className="clear-btn" onClick={clearCanvas}>
          Limpar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        style={{
          background: `repeating-linear-gradient(0deg, var(--canvas-bg), var(--canvas-bg) 27px, var(--canvas-line) 28px)`,
        }}
        onMouseDown={onDown}
      />
      <div className="overlay-footer">
        <button className="cancel-btn" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="insert-btn"
          onClick={() => {
            if (canvasRef.current) onInsert(canvasRef.current);
            clearCanvas();
          }}
        >
          Inserir no texto
        </button>
      </div>
    </div>
  );
}
